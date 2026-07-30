import { PDFParse } from 'pdf-parse';
import { PDFDocument } from 'pdf-lib';
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
const CHUNK_SIZE = 200;     // pecah PDF setiap N halaman
const MAX_SYNC_PAGES = 20;  // max halaman relevan per chunk yang dikirim ke Groq
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

// Pecah PDF menjadi chunk buffer @CHUNK_SIZE halaman menggunakan pdf-lib.
// Return: array chunk beserta nomor halaman awal di dokumen asli (1-based).
async function splitPDFIntoChunks(
  buffer: Buffer,
): Promise<{ buffer: Buffer; startPage: number; totalPages: number }[]> {
  const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  if (totalPages <= CHUNK_SIZE) {
    return [{ buffer, startPage: 1, totalPages }];
  }

  const chunks: { buffer: Buffer; startPage: number; totalPages: number }[] = [];

  for (let start = 0; start < totalPages; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, totalPages);
    const chunkDoc = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const copied = await chunkDoc.copyPages(srcDoc, indices);
    copied.forEach((p: import('pdf-lib').PDFPage) => chunkDoc.addPage(p));
    const bytes = await chunkDoc.save();
    chunks.push({ buffer: Buffer.from(bytes), startPage: start + 1, totalPages });
  }

  return chunks;
}

// Ekstrak teks & jalankan Groq untuk satu chunk buffer.
// pageOffset: nomor halaman pertama chunk di dokumen asli (untuk pageNumber yang benar di asset).
async function processChunk(
  buffer: Buffer,
  bankName: string,
  pageOffset: number,
  groq: Groq,
): Promise<{ assets: PDFExtractedAsset[]; relevantPages: number; warnings: string[] }> {
  const warnings: string[] = [];

  // Ekstrak teks dari chunk
  let pdfPages: { text: string; num: number }[] = [];
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    pdfPages = result.pages;
  } catch (e) {
    await parser.destroy().catch(() => {});
    warnings.push(`Gagal membaca PDF: ${e instanceof Error ? e.message : String(e)}`);
    return { assets: [], relevantPages: 0, warnings };
  }
  await parser.destroy().catch(() => {});

  const pages = pdfPages.length > 0 ? pdfPages.map((p) => p.text) : [];

  if (pages.length === 0 || pages.every((p) => !p.trim())) {
    warnings.push('Tidak ada konten teks (mungkin PDF berbasis gambar/scan — gunakan OCR terlebih dahulu).');
    return { assets: [], relevantPages: 0, warnings };
  }

  // Filter halaman yang mengandung kata kunci Jawa Timur
  const relevantPages = pages
    .map((text, i) => ({ text, pageNum: pageOffset + i }))
    .filter(({ text }) => pageContainsJatim(text));

  if (relevantPages.length === 0) {
    warnings.push('Tidak ditemukan konten terkait Jawa Timur di bagian ini.');
    return { assets: [], relevantPages: 0, warnings };
  }

  let toProcess = relevantPages;
  if (toProcess.length > MAX_SYNC_PAGES) {
    warnings.push(
      `${relevantPages.length} halaman relevan ditemukan, hanya ${MAX_SYNC_PAGES} halaman pertama diproses.`,
    );
    toProcess = toProcess.slice(0, MAX_SYNC_PAGES);
  }

  // Groq: jalankan paralel per halaman (lebih cepat dari sequential)
  const results = await Promise.allSettled(
    toProcess.map(({ text, pageNum }) => extractPageWithGroq(text, bankName, pageNum, groq)),
  );

  const assets: PDFExtractedAsset[] = [];
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled') {
      assets.push(...r.value);
    } else {
      warnings.push(`Halaman ${toProcess[idx].pageNum}: gagal diproses (${r.reason instanceof Error ? r.reason.message : 'error tidak diketahui'})`);
    }
  });

  return { assets, relevantPages: relevantPages.length, warnings };
}

export class PDFExtractService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async extractFromBuffer(buffer: Buffer, bankName: string): Promise<PDFExtractResult> {
    const warnings: string[] = [];

    // Pecah PDF menjadi chunk @CHUNK_SIZE halaman
    let chunks: { buffer: Buffer; startPage: number; totalPages: number }[];
    try {
      chunks = await splitPDFIntoChunks(buffer);
    } catch (e) {
      throw new Error(`Gagal membaca PDF: ${e instanceof Error ? e.message : String(e)}`);
    }

    const totalPages = chunks[0].totalPages; // sama untuk semua chunk

    if (chunks.length > 1) {
      warnings.push(
        `PDF ${totalPages} halaman dipecah otomatis menjadi ${chunks.length} bagian (maks. ${CHUNK_SIZE} halaman per bagian).`,
      );
    }

    // Proses setiap chunk secara berurutan
    const allAssets: PDFExtractedAsset[] = [];
    let totalRelevantPages = 0;

    for (let i = 0; i < chunks.length; i++) {
      const { buffer: chunkBuf, startPage } = chunks[i];
      const prefix = chunks.length > 1 ? `[Bagian ${i + 1}/${chunks.length}, hal. ${startPage}] ` : '';

      const result = await processChunk(chunkBuf, bankName, startPage, this.groq);

      allAssets.push(...result.assets);
      totalRelevantPages += result.relevantPages;
      result.warnings.forEach((w) => warnings.push(prefix + w));
    }

    return {
      totalPages,
      relevantPages: totalRelevantPages,
      assets: allAssets,
      warnings,
      method: 'GROQ',
    };
  }
}
