#!/usr/bin/env node
'use strict';

/**
 * extract-pdf.js — CLI tool untuk ekstrak asset dari PDF besar (bypass Cloud Run upload limit)
 *
 * Usage (mode 1 — pilih file dari folder):
 *   node scripts/extract-pdf.js <bankName> <LELANG|CASSIE> [server-url]
 *
 * Usage (mode 2 — path langsung):
 *   node scripts/extract-pdf.js <pdf-path> <bankName> <LELANG|CASSIE> [server-url]
 *
 * Default folder PDF: PDF_FOLDER di .env.local, atau ~/Downloads
 */

const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const readline = require('readline');

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Args ─────────────────────────────────────────────────────────────────────
// Mode 1: <bankName> <LELANG|CASSIE> [server-url]       → pilih file interaktif
// Mode 2: <pdf-path> <bankName> <LELANG|CASSIE> [url]   → path langsung (backward compat)
const firstArg = process.argv[2];
const isPdfPath = firstArg && (firstArg.toLowerCase().endsWith('.pdf') || firstArg.includes('/') || firstArg.includes('\\'));

let bankName, labelAsset, serverArg, resolvedPdfPath;

if (isPdfPath) {
  [,, , bankName, labelAsset, serverArg] = process.argv;
  resolvedPdfPath = path.resolve(firstArg);
} else {
  [,, bankName, labelAsset, serverArg] = process.argv;
  resolvedPdfPath = null; // akan dipilih secara interaktif
}

if (!bankName || !labelAsset) {
  console.log('\nUsage (pilih file):  node scripts/extract-pdf.js <bankName> <LELANG|CASSIE>');
  console.log('Usage (path langsung): node scripts/extract-pdf.js <pdf-path> <bankName> <LELANG|CASSIE>\n');
  process.exit(1);
}
if (!['LELANG', 'CASSIE'].includes(labelAsset)) {
  console.error('Error: labelAsset harus LELANG atau CASSIE'); process.exit(1);
}

// ── Pilih PDF dari folder ────────────────────────────────────────────────────
async function pickPdfFromFolder() {
  const folder = process.env.PDF_FOLDER || path.join(os.homedir(), 'Downloads');

  if (!fs.existsSync(folder)) {
    console.error(`Error: Folder tidak ditemukan: ${folder}`);
    console.error('Set PDF_FOLDER di .env.local untuk mengubah lokasi default.');
    process.exit(1);
  }

  const files = fs.readdirSync(folder)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort();

  if (files.length === 0) {
    console.error(`Error: Tidak ada file PDF di: ${folder}`);
    process.exit(1);
  }

  if (files.length === 1) {
    log(`  → Auto-pilih: ${files[0]}`);
    return path.join(folder, files[0]);
  }

  log(`\nFile PDF di ${folder}:`);
  files.forEach((f, i) => log(`  [${i + 1}] ${f}`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('\nPilih nomor file: ', (answer) => {
      rl.close();
      const idx = parseInt(answer.trim(), 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= files.length) {
        console.error('Pilihan tidak valid');
        setTimeout(() => process.exit(1), 100);
      return;
      }
      resolve(path.join(folder, files[idx]));
    });
  });
}

const SERVER      = (serverArg || 'https://bankaset-mansion2026-diodfcxltq-et.a.run.app').replace(/\/$/, '');
const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const CLI_AUTH    = process.env.AUTH_SECRET;

if (!GEMINI_KEY) { console.error('Error: GEMINI_API_KEY tidak ada di .env.local'); process.exit(1); }
if (!CLI_AUTH)   { console.error('Error: AUTH_SECRET tidak ada di .env.local'); process.exit(1); }

// ── Config ───────────────────────────────────────────────────────────────────
const AI_MODEL          = 'gemini-flash-latest';
const SAVE_BATCH_SIZE   = 400;
const SPLIT_THRESHOLD_MB = 50;   // split jika PDF > 50 MB
const TARGET_CHUNK_MB    = 40;   // target ukuran per chunk

// ── Init Gemini SDK ──────────────────────────────────────────────────────────
const { GoogleGenAI }  = require('@google/genai');
const { PDFDocument }  = require('pdf-lib');
const genai = new GoogleGenAI({ apiKey: GEMINI_KEY });

// ── Split PDF menjadi beberapa chunk jika terlalu besar ──────────────────────
async function splitPdfIfNeeded(pdfPath) {
  const sizeMB = fs.statSync(pdfPath).size / 1024 / 1024;
  if (sizeMB <= SPLIT_THRESHOLD_MB) return { paths: [pdfPath], isTemp: false };

  log(`[split] File ${sizeMB.toFixed(1)} MB > ${SPLIT_THRESHOLD_MB} MB — memecah PDF...`);

  const pdfBytes = fs.readFileSync(pdfPath);
  const srcDoc   = await PDFDocument.load(pdfBytes);
  const total    = srcDoc.getPageCount();
  const numChunks = Math.ceil(sizeMB / TARGET_CHUNK_MB);
  const perChunk  = Math.ceil(total / numChunks);

  const tmpDir   = os.tmpdir();
  const base     = path.basename(pdfPath, '.pdf');
  const paths    = [];

  for (let i = 0; i < numChunks; i++) {
    const start = i * perChunk;
    const end   = Math.min(start + perChunk, total);
    if (start >= total) break;

    const chunkDoc   = await PDFDocument.create();
    const indices    = Array.from({ length: end - start }, (_, k) => start + k);
    const copied     = await chunkDoc.copyPages(srcDoc, indices);
    copied.forEach(p => chunkDoc.addPage(p));

    const bytes     = await chunkDoc.save();
    const chunkPath = path.join(tmpDir, `${base}_chunk${i + 1}of${numChunks}.pdf`);
    fs.writeFileSync(chunkPath, bytes);
    paths.push(chunkPath);
    log(`  → Chunk ${i + 1}/${numChunks}: hal. ${start + 1}–${end} | ${(bytes.length / 1024 / 1024).toFixed(1)} MB → ${path.basename(chunkPath)}`);
  }

  return { paths, isTemp: true };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function confidence(item) {
  let s = 0;
  if (item.city   && String(item.city).length > 2)    s++;
  if (item.address && String(item.address).length > 10) s++;
  if (Number(item.marketValue) > 0)                   s++;
  if (item.assetType && item.assetType !== 'OTHER')   s++;
  if (Number(item.landArea) > 0 || Number(item.buildingArea) > 0) s++;
  return s >= 4 ? 'HIGH' : s >= 2 ? 'MEDIUM' : 'LOW';
}

function log(msg) { process.stdout.write(msg + '\n'); }
function progress(msg) { process.stdout.write('\r\x1b[K' + msg); }

function mapAsset(item) {
  return {
    bankName,
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
    liquidationRatio: (() => {
      if (labelAsset === 'LELANG') {
        const mv = Number(item.marketValue ?? 0);
        const lp = Number(item.limitPrice ?? 0);
        return mv > 0 && lp > 0 ? Math.round((lp / mv) * 100) / 100 : 0;
      }
      return 0;
    })(),
    liquidationValue:     Number(item.liquidationValue ?? 0),
    limitPrice:           Number(item.limitPrice ?? 0),
    pageNumber:           0,
    confidence:           confidence(item),
    rawText:              '',
  };
}

// ── Upload PDF + ekstrak semua aset dalam 1 request ──────────────────────────
async function extractAllFromPdf(pdfPath) {
  log('[2/4] Upload PDF ke Gemini Files API...');
  const uploadedFile = await genai.files.upload({
    file: pdfPath,
    config: { mimeType: 'application/pdf', displayName: path.basename(pdfPath) },
  });
  log(`  ✓ Upload selesai\n`);

  log('[3/4] Ekstrak semua aset (1 request ke Gemini)...');
  const prompt = `Baca seluruh dokumen PDF ini dari awal sampai akhir.
Tugas: Cari dan ekstrak SEMUA data aset/properti/listing yang ada dalam dokumen ini. Ambil setiap entitas yang terdaftar tanpa ada yang terlewat. Setiap baris tabel = 1 aset.

Kembalikan HANYA JSON valid dengan format: {"assets": [...]}
Jika tidak ada data, kembalikan: {"assets": []}

Setiap objek aset harus memiliki field berikut (gunakan 0 atau "" jika tidak ditemukan di dokumen):
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
- limitPrice: harga limit atau harga dasar lelang dalam rupiah (integer)`;

  const response = await genai.models.generateContent({
    model: AI_MODEL,
    contents: [
      { fileData: { fileUri: uploadedFile.uri, mimeType: 'application/pdf' } },
      { text: prompt },
    ],
    config: { responseMimeType: 'application/json', maxOutputTokens: 65536, temperature: 0.1 },
  });

  let arr = [];
  try {
    const parsed = JSON.parse(response.text ?? '{}');
    const key = Object.keys(parsed).find(k => Array.isArray(parsed[k])) ?? '';
    arr = key ? parsed[key] : [];
  } catch { arr = []; }

  if (arr.length === 0) {
    log(`  [debug] Response Gemini (200 char pertama): ${(response.text ?? '').slice(0, 200)}`);
  }

  return arr.filter(item => item && typeof item === 'object').map(mapAsset);
}

// ── POST ke confirm endpoint ─────────────────────────────────────────────────
async function saveAssets(assets) {
  const res  = await fetch(`${SERVER}/api/import/pdf/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CLI_AUTH}` },
    body: JSON.stringify({ bankName, assets, labelAsset }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Server tidak mengembalikan JSON: ${text.slice(0, 300)}`);
  }
  if (!json.success) throw new Error(json.error?.message ?? 'Gagal simpan');
  return json.data;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Resolve PDF path (interaktif jika belum ditentukan)
  const pdfPath = resolvedPdfPath ?? await pickPdfFromFolder();

  log('');
  log('═══════════════════════════════════════════════════════');
  log('  Bankaset — PDF Extractor CLI');
  log('═══════════════════════════════════════════════════════');
  log(`  File   : ${pdfPath}`);
  log(`  Bank   : ${bankName}`);
  log(`  Label  : ${labelAsset}`);
  log(`  Server : ${SERVER}`);
  log('═══════════════════════════════════════════════════════');
  log('');

  // 0. Test konektivitas Gemini
  log('[0/4] Cek koneksi Gemini API...');
  try {
    await genai.models.generateContent({ model: AI_MODEL, contents: 'ping', config: { maxOutputTokens: 5 } });
    log(`  ✓ Gemini OK (${AI_MODEL})\n`);
  } catch (e) {
    const status = e.status ?? e.code ?? 0;
    if (status === 429) {
      log(`  ✗ Gemini quota habis (429) — coba lagi nanti.`);
    } else {
      log(`  ✗ Gemini error ${status}: ${e.message}`);
    }
    setTimeout(() => process.exit(1), 100);
    return;
  }

  // 1. Cek file
  if (!fs.existsSync(pdfPath)) { console.error(`Error: File tidak ditemukan: ${pdfPath}`); process.exit(1); }
  const sizeMB = (fs.statSync(pdfPath).size / 1024 / 1024).toFixed(1);
  log(`[1/4] File siap: ${sizeMB} MB`);

  // 1b. Split jika perlu
  const { paths: chunkPaths, isTemp } = await splitPdfIfNeeded(pdfPath);
  const totalChunks = chunkPaths.length;
  if (totalChunks > 1) log(`  → Dipecah menjadi ${totalChunks} chunk\n`);

  // 2+3. Upload & ekstrak setiap chunk
  const allAssets = [];
  try {
    for (let ci = 0; ci < totalChunks; ci++) {
      if (totalChunks > 1) log(`\n[2+3/4] Chunk ${ci + 1}/${totalChunks}: ${path.basename(chunkPaths[ci])}`);
      const chunkAssets = await extractAllFromPdf(chunkPaths[ci]);
      log(`  → ${chunkAssets.length} asset ditemukan`);
      allAssets.push(...chunkAssets);
    }
  } finally {
    if (isTemp) {
      for (const p of chunkPaths) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
      }
    }
  }

  log(`\n  → Total: ${allAssets.length} asset dari ${totalChunks} chunk\n`);

  if (allAssets.length === 0) {
    log('\nTidak ada asset yang ditemukan. Selesai.');
    return;
  }

  // 4. Simpan ke server dalam batch
  log(`[4/4] Menyimpan ke ${SERVER}...`);
  let totalSaved = 0, totalFailed = 0, totalRejected = 0;

  const batches = Math.ceil(allAssets.length / SAVE_BATCH_SIZE);
  for (let bi = 0; bi < batches; bi++) {
    const batch = allAssets.slice(bi * SAVE_BATCH_SIZE, (bi + 1) * SAVE_BATCH_SIZE);
    progress(`  Batch ${bi + 1}/${batches} — ${batch.length} asset...`);
    try {
      const result = await saveAssets(batch);
      totalSaved    += result.savedCount ?? 0;
      totalFailed   += result.failedCount ?? 0;
      totalRejected += result.rejected ?? 0;
    } catch (e) {
      log(`\n  Batch ${bi + 1} gagal: ${e.message}`);
    }
  }
  progress('');

  log('');
  log('═══════════════════════════════════════════════════════');
  log('  SELESAI');
  log('═══════════════════════════════════════════════════════');
  log(`  Asset ditemukan  : ${allAssets.length}`);
  log(`  Berhasil disimpan: ${totalSaved}`);
  log(`  Ditolak (geo)    : ${totalRejected}`);
  log(`  Gagal simpan     : ${totalFailed}`);
  log('═══════════════════════════════════════════════════════');
  log('');
}

main().catch(e => {
  console.error('\nFatal error:', e.message);
  process.exit(1);
});
