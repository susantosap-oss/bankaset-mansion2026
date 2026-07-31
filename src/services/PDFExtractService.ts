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
const CHUNK_SIZE = 200;    // jumlah halaman per virtual chunk (untuk UX / warning)
const MAX_GROQ_PER_CHUNK = 20; // max halaman relevan yang dikirim ke Groq per chunk
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
    max_tokens: 512, // 1 properti per halaman cukup; hemat ~75% token vs 2048
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

export class PDFExtractService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
      maxRetries: 0,   // fail fast — retry storms cause Cloud Run timeout
      timeout: 25_000, // 25s per request (default is 60s)
    });
  }

  async extractFromBuffer(buffer: Buffer, bankName: string): Promise<PDFExtractResult> {
    const warnings: string[] = [];

    // Ekstrak teks semua halaman sekaligus — lebih ringan di memori daripada pdf-lib split
    let allPages: { text: string; pageNum: number }[] = [];
    let totalPages = 0;

    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      totalPages = result.total;
      allPages = result.pages.map((p, i) => ({ text: p.text, pageNum: i + 1 }));
    } catch (e) {
      await parser.destroy().catch(() => {});
      throw new Error(`Gagal membaca PDF: ${e instanceof Error ? e.message : String(e)}`);
    }
    await parser.destroy().catch(() => {});

    if (allPages.length === 0 || allPages.every((p) => !p.text.trim())) {
      return {
        totalPages,
        relevantPages: 0,
        assets: [],
        warnings: ['PDF tidak memiliki konten teks. Mungkin PDF berbasis gambar (scan) — gunakan OCR terlebih dahulu.'],
        method: 'GROQ',
      };
    }

    // Pecah halaman menjadi virtual chunk @CHUNK_SIZE untuk diproses bertahap
    const chunks: { pages: { text: string; pageNum: number }[]; label: string }[] = [];
    const totalChunks = Math.ceil(allPages.length / CHUNK_SIZE);

    for (let i = 0; i < allPages.length; i += CHUNK_SIZE) {
      const slice = allPages.slice(i, i + CHUNK_SIZE);
      const from = slice[0].pageNum;
      const to = slice[slice.length - 1].pageNum;
      chunks.push({
        pages: slice,
        label: totalChunks > 1 ? `[Hal. ${from}–${to}] ` : '',
      });
    }

    if (totalChunks > 1) {
      warnings.push(
        `PDF ${totalPages} halaman dibagi otomatis menjadi ${totalChunks} bagian (@${CHUNK_SIZE} halaman) untuk diproses.`,
      );
    }

    // Proses setiap chunk: geo filter → Groq paralel
    const allAssets: PDFExtractedAsset[] = [];
    let totalRelevantPages = 0;

    for (const chunk of chunks) {
      const relevantInChunk = chunk.pages.filter(({ text }) => pageContainsJatim(text));
      totalRelevantPages += relevantInChunk.length;

      if (relevantInChunk.length === 0) {
        warnings.push(`${chunk.label}Tidak ditemukan konten terkait Jawa Timur.`);
        continue;
      }

      let toProcess = relevantInChunk;
      if (toProcess.length > MAX_GROQ_PER_CHUNK) {
        warnings.push(
          `${chunk.label}${relevantInChunk.length} halaman relevan, hanya ${MAX_GROQ_PER_CHUNK} diproses.`,
        );
        toProcess = toProcess.slice(0, MAX_GROQ_PER_CHUNK);
      }

      // Groq paralel untuk semua halaman dalam chunk sekaligus
      const results = await Promise.allSettled(
        toProcess.map(({ text, pageNum }) =>
          extractPageWithGroq(text, bankName, pageNum, this.groq),
        ),
      );

      let tpdHit = false;
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          allAssets.push(...r.value);
        } else {
          const msg = r.reason instanceof Error ? r.reason.message : 'error tidak diketahui';
          // Deteksi Groq daily token quota habis (TPD)
          if (!tpdHit && msg.includes('tokens per day')) {
            tpdHit = true;
            const waitMatch = msg.match(/try again in (.+?)\./i);
            const waitInfo = waitMatch ? ` Coba lagi dalam ${waitMatch[1]}.` : '';
            warnings.push(`Groq daily token limit habis (100k/hari).${waitInfo} Halaman sisanya dilewati.`);
          } else if (!tpdHit) {
            warnings.push(
              `${chunk.label}Halaman ${toProcess[idx].pageNum}: gagal diproses (${msg.slice(0, 120)})`,
            );
          }
        }
      });
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
