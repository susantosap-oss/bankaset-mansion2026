import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { GoogleGenAI } from '@google/genai';
import type { PDFExtractedAsset } from '@/types/pdf';

export const maxDuration = 120;

const MAX_FILES      = 10;
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per file
const ALLOWED_TYPES  = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const AI_MODEL       = 'gemini-2.0-flash';

const PROMPT = `Lihat semua gambar yang dilampirkan. Setiap gambar adalah dokumen atau foto aset properti dari bank.
Tugas: Ekstrak SEMUA data aset/properti yang terlihat dalam gambar-gambar ini. Ambil setiap entitas yang terdaftar tanpa ada yang terlewat.

Kembalikan HANYA JSON valid dengan format: {"assets": [...]}
Jika tidak ada data properti, kembalikan: {"assets": []}

Setiap objek aset harus memiliki field berikut (gunakan 0 atau "" jika tidak ditemukan di gambar):
- assetType: kategori properti (RUMAH/LAHAN/RUKO/GUDANG/PABRIK/APARTEMEN/KANTOR/OTHER)
- city: nama kota atau kabupaten dalam huruf kecil
- district: nama kecamatan
- area: nama kelurahan atau desa
- address: alamat lengkap properti
- marketValue: nilai pasar atau NJOP dalam rupiah (integer)
- outstanding: baki debet atau total kewajiban dalam rupiah (integer)
- landArea: luas tanah dalam m2 (angka)
- buildingArea: luas bangunan dalam m2 (angka)
- debtorName: nama debitur atau pemilik
- principalOutstanding: pokok kredit dalam rupiah (integer)
- liquidationValue: nilai likuidasi dalam rupiah (integer)
- limitPrice: harga limit atau harga dasar lelang atau nilai jual AYDA dalam rupiah (integer)`;

function calcConfidence(item: Record<string, unknown>): 'HIGH' | 'MEDIUM' | 'LOW' {
  let s = 0;
  if (item.city    && String(item.city).length > 2)     s++;
  if (item.address && String(item.address).length > 10) s++;
  if (Number(item.marketValue) > 0)                     s++;
  if (item.assetType && item.assetType !== 'OTHER')     s++;
  if (Number(item.landArea) > 0 || Number(item.buildingArea) > 0) s++;
  return s >= 4 ? 'HIGH' : s >= 2 ? 'MEDIUM' : 'LOW';
}

export async function POST(req: NextRequest) {
  const { error } = await requirePrivileged();
  if (error) return error;

  try {
    const formData = await req.formData();
    const files    = formData.getAll('files') as File[];
    const bankName = (formData.get('bankName') as string | null)?.trim();

    if (!bankName)           return err('VALIDATION_ERROR', 'Nama bank wajib diisi');
    if (!files.length)       return err('VALIDATION_ERROR', 'Pilih minimal 1 gambar');
    if (files.length > MAX_FILES) return err('VALIDATION_ERROR', `Maksimal ${MAX_FILES} gambar per upload`);

    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type.toLowerCase()))
        return err('INVALID_FILE_TYPE', `File "${file.name}" bukan JPEG/PNG`);
      if (file.size > MAX_SIZE_BYTES)
        return err('FILE_TOO_LARGE', `File "${file.name}" melebihi 10MB`);
    }

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) return err('SERVER_ERROR', 'GEMINI_API_KEY tidak dikonfigurasi', 500);

    const genai = new GoogleGenAI({ apiKey: GEMINI_KEY });

    // Build parts: semua gambar sebagai inline base64 + prompt teks
    type Part = { inlineData: { data: string; mimeType: string } } | { text: string };
    const parts: Part[] = [];

    for (const file of files) {
      const bytes  = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      parts.push({ inlineData: { data: base64, mimeType: file.type } });
    }
    parts.push({ text: PROMPT });

    const response = await genai.models.generateContent({
      model:    AI_MODEL,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contents: parts as any,
      config:   { responseMimeType: 'application/json', maxOutputTokens: 65536, temperature: 0.1 },
    });

    let rawAssets: Record<string, unknown>[] = [];
    try {
      const parsed = JSON.parse(response.text ?? '{}');
      const key    = Object.keys(parsed).find((k) => Array.isArray(parsed[k])) ?? '';
      rawAssets    = key ? (parsed[key] as Record<string, unknown>[]) : [];
    } catch {
      rawAssets = [];
    }

    const assets: PDFExtractedAsset[] = rawAssets
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        assetType:            String(item.assetType ?? 'OTHER'),
        city:                 String(item.city ?? '').toLowerCase().trim(),
        district:             String(item.district ?? ''),
        area:                 String(item.area ?? ''),
        address:              String(item.address ?? ''),
        marketValue:          Number(item.marketValue ?? 0),
        outstanding:          Number(item.outstanding ?? 0),
        landArea:             Number(item.landArea ?? 0),
        buildingArea:         Number(item.buildingArea ?? 0),
        debtorName:           String(item.debtorName ?? ''),
        principalOutstanding: Number(item.principalOutstanding ?? 0),
        liquidationValue:     Number(item.liquidationValue ?? 0),
        limitPrice:           Number(item.limitPrice ?? 0),
        pageNumber:           0,
        rawText:              '',
        bankName,
        confidence:           calcConfidence(item),
        liquidationRatio:     0,
      }));

    return ok({
      fileNames:   files.map((f) => f.name),
      bankName,
      totalImages: files.length,
      assets,
      warnings:    assets.length === 0
        ? ['Tidak ada data aset yang berhasil diekstrak dari gambar']
        : [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/import/images]', msg);
    return err('SERVER_ERROR', `Gagal memproses gambar: ${msg}`, 500);
  }
}
