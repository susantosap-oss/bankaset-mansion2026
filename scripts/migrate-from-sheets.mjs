/**
 * Migrate data dari Google Sheets → PostgreSQL
 *
 * Usage:
 *   node scripts/migrate-from-sheets.mjs
 *
 * Requires:
 *   - DATABASE_URL di .env.local (postgresql://...)
 *   - GOOGLE_SHEET_ID, CRM_SHEET_ID, GOOGLE_IMPERSONATE_SA (atau SA key) di .env.local
 *   - npm install pg (sementara) atau gunakan: pnpm add pg @types/pg
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually
try {
  const envFile = readFileSync(resolve(__dir, '../.env.local'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.error('Tidak dapat membaca .env.local');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL belum diset di .env.local');
  console.error('Contoh: DATABASE_URL=postgresql://user:pass@localhost:5432/mansion_abi');
  process.exit(1);
}

// Dynamically import pg (must be installed separately)
let pg;
try {
  pg = await import('pg');
} catch {
  console.error('Package "pg" belum terinstall. Jalankan: pnpm add pg');
  process.exit(1);
}

const { default: { Client } } = pg;
const client = new Client({ connectionString: DATABASE_URL });

// Google Sheets client (simplified direct fetch via googleapis)
let { google } = await import('googleapis').catch(() => {
  console.error('googleapis belum terinstall'); process.exit(1);
});
let { GoogleAuth, Impersonated } = await import('google-auth-library').catch(() => {
  console.error('google-auth-library belum terinstall'); process.exit(1);
});

async function buildSheetsClient() {
  const privateKey  = process.env.GOOGLE_PRIVATE_KEY;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const impersonateSA = process.env.GOOGLE_IMPERSONATE_SA;

  let auth;
  if (privateKey && clientEmail) {
    auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  } else if (impersonateSA) {
    const sourceAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const sourceClient = await sourceAuth.getClient();
    auth = new Impersonated({
      sourceClient,
      targetPrincipal: impersonateSA,
      lifetime: 3600,
      delegates: [],
      targetScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  } else {
    auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  }
  return google.sheets({ version: 'v4', auth });
}

async function readSheet(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName });
  return res.data.values ?? [];
}

async function migrateAssets(sheets, pgClient) {
  console.log('\n→ Migrating assets...');
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const rows = await readSheet(sheets, SHEET_ID, 'Asset Engine');
  const dataRows = rows.slice(1).filter(r => r[0]?.trim());

  let count = 0;
  for (const r of dataRows) {
    await pgClient.query(`
      INSERT INTO assets (
        asset_id, bank_name, asset_type, city, district, area, address,
        market_value, outstanding, land_area, building_area, status, raw_row_ref,
        debtor_name, principal_outstanding, liquidation_ratio, liquidation_value,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (asset_id) DO NOTHING
    `, [
      r[0], r[1], r[2]||'OTHER', r[3]||'', r[4]||'', r[5]||'', r[6]||'',
      parseInt(r[7])||0, parseInt(r[8])||0,
      parseFloat(r[9])||0, parseFloat(r[10])||0,
      r[11]||'ACTIVE', r[14]||null,
      r[15]||null, r[16]?parseInt(r[16]):null,
      r[17]?parseFloat(r[17]):null, r[18]?parseInt(r[18]):null,
      r[12]||new Date().toISOString(), r[13]||new Date().toISOString(),
    ]);
    count++;
  }
  console.log(`  ✓ ${count} assets migrated`);
}

async function migrateAreaIntelligence(sheets, pgClient) {
  console.log('\n→ Migrating area intelligence...');
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const rows = await readSheet(sheets, SHEET_ID, 'Area Intelligence');
  const dataRows = rows.slice(1).filter(r => r[0]?.trim());

  let count = 0;
  for (const r of dataRows) {
    await pgClient.query(`
      INSERT INTO area_intelligence (
        area_id, area, city, demand_score, liquidity_score,
        median_price, price_trend, source_note, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (city, area) DO UPDATE SET
        demand_score = EXCLUDED.demand_score,
        liquidity_score = EXCLUDED.liquidity_score,
        median_price = EXCLUDED.median_price,
        updated_at = EXCLUDED.updated_at
    `, [
      r[0], r[1], r[2],
      parseInt(r[3])||50, parseInt(r[4])||50,
      parseInt(r[5])||0, r[6]?parseFloat(r[6]):null,
      r[7]||null, r[8]||new Date().toISOString(),
    ]);
    count++;
  }
  console.log(`  ✓ ${count} area intelligence entries migrated`);
}

async function migrateAIAnalyses(sheets, pgClient) {
  console.log('\n→ Migrating AI analyses...');
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const rows = await readSheet(sheets, SHEET_ID, 'AI Analysis');
  const dataRows = rows.slice(1).filter(r => r[0]?.trim() && r[1]?.trim());

  let count = 0; let skipped = 0;
  for (const r of dataRows) {
    // Check if asset exists
    const exists = await pgClient.query('SELECT 1 FROM assets WHERE asset_id=$1', [r[1]]);
    if (exists.rowCount === 0) { skipped++; continue; }

    await pgClient.query(`
      INSERT INTO ai_analyses (
        analysis_id, asset_id, summary, investment_potential, sell_potential,
        risks, recommendation, marketing_strategy, model_used, generated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (analysis_id) DO NOTHING
    `, [r[0],r[1],r[2]||'',r[3]||'',r[4]||'',r[5]||'',r[6]||'',r[7]||'',r[8]||'',r[9]||new Date().toISOString()]);
    count++;
  }
  console.log(`  ✓ ${count} AI analyses migrated (${skipped} skipped — asset tidak ditemukan)`);
}

async function main() {
  console.log('Mansion Asset Bank Intelligence — Migration Google Sheets → PostgreSQL');
  console.log('=======================================================================');

  await client.connect();
  console.log('✓ Terhubung ke PostgreSQL');

  const sheets = await buildSheetsClient();
  console.log('✓ Google Sheets auth OK');

  await migrateAssets(sheets, client);
  await migrateAreaIntelligence(sheets, client);
  await migrateAIAnalyses(sheets, client);

  await client.end();
  console.log('\n✓ Migrasi selesai!');
  console.log('\nLangkah selanjutnya:');
  console.log('  1. Verifikasi data: psql $DATABASE_URL -c "SELECT COUNT(*) FROM assets;"');
  console.log('  2. Update container.ts untuk pakai PostgreSQL repository');
  console.log('  3. Implementasi src/repositories/implementations/pg/*.ts');
}

main().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
