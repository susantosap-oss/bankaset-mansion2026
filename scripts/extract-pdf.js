#!/usr/bin/env node
'use strict';

/**
 * extract-pdf.js — CLI tool untuk ekstrak asset dari PDF besar (bypass Cloud Run upload limit)
 *
 * Usage:
 *   node scripts/extract-pdf.js <pdf-path> <bankName> <LELANG|CASSIE> [server-url]
 *
 * Contoh:
 *   node scripts/extract-pdf.js "C:/Users/mansion/Downloads/BTN Lelang.pdf" "BTN" LELANG
 *   node scripts/extract-pdf.js "BTN.pdf" "BRI Surabaya" CASSIE https://bankaset-mansion2026-diodfcxltq-et.a.run.app
 */

const fs   = require('fs');
const path = require('path');

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
const [,, pdfArg, bankName, labelAsset, serverArg] = process.argv;

if (!pdfArg || !bankName || !labelAsset) {
  console.log('\nUsage: node scripts/extract-pdf.js <pdf-path> <bankName> <LELANG|CASSIE> [server-url]\n');
  console.log('Contoh:');
  console.log('  node scripts/extract-pdf.js "C:/Downloads/BTN Lelang.pdf" "BTN" LELANG');
  process.exit(1);
}
if (!['LELANG', 'CASSIE'].includes(labelAsset)) {
  console.error('Error: labelAsset harus LELANG atau CASSIE'); process.exit(1);
}

const pdfPath  = path.resolve(pdfArg);
const SERVER   = (serverArg || 'https://bankaset-mansion2026-diodfcxltq-et.a.run.app').replace(/\/$/, '');
const GROQ_KEY = process.env.GROQ_API_KEY;
const CLI_AUTH = process.env.AUTH_SECRET;

if (!GROQ_KEY)  { console.error('Error: GROQ_API_KEY tidak ada di .env.local'); process.exit(1); }
if (!CLI_AUTH)  { console.error('Error: AUTH_SECRET tidak ada di .env.local'); process.exit(1); }

// ── Config ───────────────────────────────────────────────────────────────────
const GROQ_MODEL        = 'llama-3.3-70b-versatile';
const CHUNK_SIZE        = 200;   // virtual chunk per iterasi
const MAX_GROQ_PER_CHUNK = 50;  // max halaman relevan per chunk dikirim ke Groq
const PAGE_TEXT_LIMIT   = 2000;
const SAVE_BATCH_SIZE   = 400;  // max asset per 1 POST confirm

const JATIM_KW = [
  'surabaya','sidoarjo','gresik','mojokerto','malang','kediri','jember',
  'banyuwangi','madiun','pasuruan','probolinggo','blitar','tulungagung',
  'jombang','bojonegoro','lamongan','tuban','nganjuk','ngawi','magetan',
  'pamekasan','sumenep','sampang','bangkalan','lumajang','situbondo',
  'bondowoso','trenggalek','ponorogo','pacitan','batu',
  'jawa timur','jatim','sby','sda','gsk',
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function hasJatim(text) {
  const lo = text.toLowerCase();
  return JATIM_KW.some(kw => lo.includes(kw));
}

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

// ── Groq extraction untuk 1 halaman ─────────────────────────────────────────
async function extractPage(pageText, pageNumber, retries = 3) {
  const prompt = `Kamu adalah extractor data properti lelang bank Indonesia.
Ekstrak semua data aset dari teks dokumen bank berikut.
Kembalikan JSON object dengan key "assets" berisi array objek aset.
Jika tidak ada aset ditemukan, kembalikan { "assets": [] }.

Setiap aset harus memiliki field berikut (gunakan 0 atau "" jika tidak ditemukan):
- assetType: salah satu dari [RUMAH, LAHAN, RUKO, GUDANG, PABRIK, APARTEMEN, KANTOR, OTHER]
- city: nama kota/kabupaten (huruf kecil), misal "surabaya", "sidoarjo"
- district: kecamatan atau kelurahan
- area: desa/kelurahan
- address: alamat lengkap
- marketValue: integer nilai pasar/NJOP dalam rupiah
- outstanding: integer baki debet/kewajiban dalam rupiah
- landArea: angka luas tanah dalam m2
- buildingArea: angka luas bangunan dalam m2
- debtorName: nama debitur
- principalOutstanding: integer pokok kredit dalam rupiah
- liquidationValue: integer nilai likuidasi dalam rupiah
- limitPrice: integer harga limit/harga dasar lelang dalam rupiah

Teks dokumen:
${pageText.slice(0, PAGE_TEXT_LIMIT)}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 1024 }),
  });

  if (res.status === 429) {
    if (retries <= 0) { log(`  [skip] hal.${pageNumber} — Groq rate limit, lewati.`); return []; }
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '30', 10);
    const waitSec = Math.min(retryAfter + 2, 90);
    log(`  [429] hal.${pageNumber} — tunggu ${waitSec}s... (retry ${4 - retries}/3)`);
    await new Promise(r => setTimeout(r, waitSec * 1000));
    return extractPage(pageText, pageNumber, retries - 1);
  }
  if (!res.ok) throw new Error(`Groq ${res.status}`);

  const data = await res.json();
  const raw  = data.choices?.[0]?.message?.content ?? '{}';

  let parsed = {};
  try { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; } catch { return []; }

  const key = Object.keys(parsed).find(k => Array.isArray(parsed[k])) ?? '';
  const arr = key ? parsed[key] : [];

  return arr
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      bankName,
      assetType:           String(item.assetType ?? 'OTHER'),
      city:                String(item.city ?? '').toLowerCase().trim(),
      district:            String(item.district ?? ''),
      area:                String(item.area ?? ''),
      address:             String(item.address ?? ''),
      marketValue:         Number(item.marketValue ?? 0),
      outstanding:         Number(item.outstanding ?? 0),
      landArea:            Number(item.landArea ?? 0),
      buildingArea:        Number(item.buildingArea ?? 0),
      debtorName:          String(item.debtorName ?? ''),
      principalOutstanding:Number(item.principalOutstanding ?? 0),
      liquidationRatio:    (() => {
        if (labelAsset === 'LELANG') {
          const mv = Number(item.marketValue ?? 0);
          const lp = Number(item.limitPrice ?? 0);
          return mv > 0 && lp > 0 ? Math.round((lp / mv) * 100) / 100 : 0;
        }
        return 0;
      })(),
      liquidationValue:    Number(item.liquidationValue ?? 0),
      limitPrice:          Number(item.limitPrice ?? 0),
      pageNumber,
      confidence:          confidence(item),
      rawText:             pageText.slice(0, 300),
    }));
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

  // 1. Baca file
  if (!fs.existsSync(pdfPath)) { console.error(`Error: File tidak ditemukan: ${pdfPath}`); process.exit(1); }
  const buffer  = fs.readFileSync(pdfPath);
  const sizeMB  = (buffer.length / 1024 / 1024).toFixed(1);
  log(`[1/4] Membaca file ${sizeMB} MB...`);

  // 2. Ekstrak teks semua halaman
  const { PDFParse } = require(path.join(__dirname, '..', 'node_modules', 'pdf-parse', 'dist', 'pdf-parse', 'cjs', 'index.cjs'));
  const parser = new PDFParse({ data: buffer });
  let pdfResult;
  try {
    pdfResult = await parser.getText();
  } finally {
    await parser.destroy().catch(() => {});
  }

  const totalPages = pdfResult.total;
  const allPages   = pdfResult.pages.map((p, i) => ({ text: p.text, pageNum: i + 1 }));
  const totalChunks = Math.ceil(allPages.length / CHUNK_SIZE);

  log(`[2/4] Teks diekstrak — ${totalPages} halaman, dibagi ${totalChunks} bagian (@${CHUNK_SIZE} halaman)\n`);

  // 3. Proses chunk demi chunk → Groq
  const allAssets = [];
  let totalRelevant = 0;

  for (let ci = 0; ci < totalChunks; ci++) {
    const slice   = allPages.slice(ci * CHUNK_SIZE, (ci + 1) * CHUNK_SIZE);
    const from    = slice[0].pageNum;
    const to      = slice[slice.length - 1].pageNum;
    const label   = `[Bagian ${ci + 1}/${totalChunks} | Hal. ${from}–${to}]`;

    const relevant = slice.filter(p => hasJatim(p.text));
    totalRelevant += relevant.length;

    if (relevant.length === 0) {
      log(`${label} Tidak ada halaman relevan Jawa Timur, skip.`);
      continue;
    }

    const toProcess = relevant.slice(0, MAX_GROQ_PER_CHUNK);
    log(`${label} ${relevant.length} hal. relevan → kirim ${toProcess.length} ke Groq...`);

    let chunkAssets = 0;
    for (let pi = 0; pi < toProcess.length; pi++) {
      const { text, pageNum } = toProcess[pi];
      progress(`  Groq: ${pi + 1}/${toProcess.length} halaman (hal.${pageNum})...`);
      try {
        const assets = await extractPage(text, pageNum);
        allAssets.push(...assets);
        chunkAssets += assets.length;
      } catch (e) {
        log(`  [skip] hal.${pageNum} error: ${e.message}`);
      }
      if (pi < toProcess.length - 1) await new Promise(r => setTimeout(r, 10000));
    }
    progress('');
    log(`  → ${chunkAssets} asset ditemukan (total sejauh ini: ${allAssets.length})`);

    // Jeda kecil antar chunk agar tidak kena Groq rate limit
    if (ci < totalChunks - 1) await new Promise(r => setTimeout(r, 2000));
  }

  log(`\n[3/4] Total: ${allAssets.length} asset dari ${totalRelevant} halaman relevan`);

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
