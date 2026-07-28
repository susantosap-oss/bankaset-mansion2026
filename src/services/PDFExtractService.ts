import { PDFParse } from 'pdf-parse';
import Groq from 'groq-sdk';
import { JAWA_TIMUR_KEYWORDS } from './GeographicFilterService';
import type { PDFExtractedAsset } from '@/types/pdf';

export type { PDFExtractedAsset };

export interface PDFExtractResult {
  totalPages: number;
  relevantPages: number;
  assets: PDFExtractedAsset[];
  warnings: string[];
  method: 'GROQ';
}

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_SYNC_PAGES = 20;
const PAGE_TEXT_LIMIT = 3500;

function pageContainsJatim(text: string): boolean {
  const lower = text.toLowerCase();
  return JAWA_TIMUR_KEYWORDS.some((kw) => lower.includes(kw));
}


function deriveConfidence(item: Record<string, unknown>): 'HIGH' | 'MEDIUM' | 'LOW' {
  let score = 0;
  if (item.city && String(item.city).length > 2) score++;
  if (item.address && String(item.address).length > 10) score++;
  if (Number(item.marketValue) > 0) score++;
  if (item.assetType && item.assetType !== 'OTHER') score++;
  if (Number(item.landArea) > 0 || Number(item.buildingArea) > 0) score++;
  if (score >= 4) return 'HIGH';
  if (score >= 2) return 'MEDIUM';
  return 'LOW';
}

async function extractPageWithGroq(
  pageText: string,
  bankName: string,
  pageNumber: number,
  groq: Groq,
): Promise<PDFExtractedAsset[]> {
  const prompt = `Kamu adalah extractor data properti lelang bank Indonesia.
Ekstrak semua data aset dari teks dokumen bank berikut.
Kembalikan JSON object dengan key "assets" berisi array objek aset.
Jika tidak ada aset ditemukan, kembalikan { "assets": [] }.

Setiap aset harus memiliki field berikut (gunakan 0 atau "" jika tidak ditemukan):
- assetType: salah satu dari [RUMAH, LAHAN, RUKO, GUDANG, PABRIK, APARTEMEN, KANTOR, OTHER] (LAHAN untuk tanah/kavling/kebun/sawah)
- city: nama kota/kabupaten (huruf kecil), misal "surabaya", "sidoarjo"
- district: kecamatan atau kelurahan (string kosong jika tidak ada)
- area: desa/kelurahan (string kosong jika tidak ada)
- address: alamat lengkap (string kosong jika tidak ada)
- marketValue: integer nilai pasar/NJOP dalam rupiah (0 jika tidak ada)
- outstanding: integer baki debet/kewajiban dalam rupiah (0 jika tidak ada)
- landArea: angka luas tanah dalam m2 (0 jika tidak ada)
- buildingArea: angka luas bangunan dalam m2 (0 jika tidak ada)
- debtorName: nama debitur (string kosong jika tidak ada)
- principalOutstanding: integer pokok kredit dalam rupiah (0 jika tidak ada)
- liquidationValue: integer nilai likuidasi dalam rupiah (0 jika tidak ada)
- limitPrice: integer harga limit/harga dasar lelang dalam rupiah (0 jika tidak ada)

Teks dokumen:
${pageText.slice(0, PAGE_TEXT_LIMIT)}`;

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 2048,
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';

  let parsed: unknown;
  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    return [];
  }

  const obj = parsed as Record<string, unknown>;
  const key = Object.keys(obj).find((k) => Array.isArray(obj[k])) ?? '';
  const arr = key ? (obj[key] as unknown[]) : [];

  return arr
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => {
      const asset: PDFExtractedAsset = {
        bankName,
        assetType: String(item.assetType ?? 'OTHER'),
        city: String(item.city ?? '').toLowerCase().trim(),
        district: String(item.district ?? ''),
        area: String(item.area ?? ''),
        address: String(item.address ?? ''),
        marketValue: Number(item.marketValue ?? 0),
        outstanding: Number(item.outstanding ?? 0),
        landArea: Number(item.landArea ?? 0),
        buildingArea: Number(item.buildingArea ?? 0),
        debtorName: String(item.debtorName ?? ''),
        principalOutstanding: Number(item.principalOutstanding ?? 0),
        liquidationRatio: 0,
        liquidationValue: Number(item.liquidationValue ?? 0),
        limitPrice: Number(item.limitPrice ?? 0),
        pageNumber,
        confidence: deriveConfidence(item),
        rawText: pageText.slice(0, 300),
      };
      if (asset.marketValue > 0 && asset.outstanding > 0) {
        asset.liquidationRatio = Math.round((asset.outstanding / asset.marketValue) * 100) / 100;
      }
      return asset;
    });
}

export class PDFExtractService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async extractFromBuffer(buffer: Buffer, bankName: string): Promise<PDFExtractResult> {
    const warnings: string[] = [];

    let pdfPages: { text: string; num: number }[] = [];
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      pdfPages = result.pages;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Gagal membaca PDF: ${msg}`);
    }

    const pages = pdfPages.length > 0
      ? pdfPages.map((p) => p.text)
      : [''];
    const totalPages = pages.length;

    if (totalPages === 0 || pages.every((p) => !p.trim())) {
      return { totalPages: 0, relevantPages: 0, assets: [], warnings: ['PDF tidak memiliki konten teks. Mungkin PDF berbasis gambar (scan) — gunakan OCR terlebih dahulu.'], method: 'GROQ' };
    }

    // Pass 1: geo pre-filter — skip pages without Jawa Timur keywords
    const relevantPages = pages
      .map((text, i) => ({ text, pageNum: i + 1 }))
      .filter(({ text }) => pageContainsJatim(text));

    if (relevantPages.length === 0) {
      return { totalPages, relevantPages: 0, assets: [], warnings: ['Tidak ditemukan konten terkait Jawa Timur. Pastikan PDF berisi asset di wilayah Jawa Timur.'], method: 'GROQ' };
    }

    let toProcess = relevantPages;
    if (toProcess.length > MAX_SYNC_PAGES) {
      warnings.push(`PDF memiliki ${relevantPages.length} halaman relevan. Hanya ${MAX_SYNC_PAGES} halaman pertama yang diproses secara langsung.`);
      toProcess = toProcess.slice(0, MAX_SYNC_PAGES);
    }

    // Pass 2: Groq extraction per page
    const assets: PDFExtractedAsset[] = [];
    for (const { text, pageNum } of toProcess) {
      try {
        const pageAssets = await extractPageWithGroq(text, bankName, pageNum, this.groq);
        assets.push(...pageAssets);
      } catch (e) {
        warnings.push(`Halaman ${pageNum}: gagal diproses (${e instanceof Error ? e.message : 'error tidak diketahui'})`);
      }
    }

    return {
      totalPages,
      relevantPages: relevantPages.length,
      assets,
      warnings,
      method: 'GROQ',
    };
  }
}
