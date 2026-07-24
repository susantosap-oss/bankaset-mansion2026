// Test login debug — run: node scripts/test-login.mjs
import { google } from 'googleapis';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const envFile = readFileSync('.env.local', 'utf-8');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const CRM_SHEET_ID = env.CRM_SHEET_ID;
const IMPERSONATE_SA = env.GOOGLE_IMPERSONATE_SA;

const TEST_EMAIL = 'susanto.mansion@gmail.com';
const TEST_PASSWORD = process.argv[2] ?? ''; // pass password as arg: node test-login.mjs mypassword

async function main() {
  // Build auth
  const sourceAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const sourceClient = await sourceAuth.getClient();
  const auth = new Impersonated({
    sourceClient,
    targetPrincipal: IMPERSONATE_SA,
    lifetime: 3600,
    delegates: [],
    targetScopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CRM_SHEET_ID,
    range: 'AGENTS!A1:H20',
  });

  const rows = res.data.values ?? [];
  console.log('\n=== Header Row ===');
  console.log('Kolom:', rows[0]?.join(' | '));

  console.log('\n=== Mencari email:', TEST_EMAIL, '===');
  const dataRows = rows.slice(1);
  const found = dataRows.find(row => row[2]?.toLowerCase().trim() === TEST_EMAIL.toLowerCase());

  if (!found) {
    console.log('❌ Email TIDAK DITEMUKAN di sheet AGENTS');
    console.log('\nSemua email yang ada:');
    dataRows.forEach((r, i) => console.log(`  Row ${i+2}: ${r[2] ?? '(kosong)'}`));
    return;
  }

  console.log('✅ Email ditemukan!');
  console.log('  Kolom B (Nama)   :', found[1]);
  console.log('  Kolom C (Email)  :', found[2]);
  const hash = found[3] ?? '';
  console.log('  Kolom D (PwHash) :', hash ? `${hash.slice(0,8)}... (panjang: ${hash.length} karakter)` : '(KOSONG)');
  console.log('  Kolom F (Role)   :', found[5]);
  console.log('  Kolom G (Status) :', found[6]);

  // Diagnose hash format
  if (hash.length === 32 && /^[a-f0-9]+$/i.test(hash)) {
    console.log('\n  Format: tampak seperti MD5 hex (32 karakter hex)');
  } else if (hash.length === 40) {
    console.log('\n  Format: tampak seperti SHA-1 (40 karakter)');
  } else if (hash.length === 64) {
    console.log('\n  Format: tampak seperti SHA-256 (64 karakter)');
  } else if (hash.startsWith('$2')) {
    console.log('\n  Format: bcrypt');
  } else {
    console.log('\n  Format: TIDAK DIKENAL —', hash.length, 'karakter');
    console.log('  Nilai hash:', hash);
  }

  // If password provided, test MD5
  if (TEST_PASSWORD) {
    const md5 = createHash('md5').update(TEST_PASSWORD).digest('hex');
    const md5upper = md5.toUpperCase();
    console.log('\n=== Test Password ===');
    console.log('  MD5 (lowercase):', md5);
    console.log('  MD5 (uppercase):', md5upper);
    console.log('  Match lowercase?', hash.toLowerCase() === md5);
    console.log('  Match uppercase?', hash.toUpperCase() === md5upper);

    // Also test SHA1
    const sha1 = createHash('sha1').update(TEST_PASSWORD).digest('hex');
    console.log('  SHA-1          :', sha1);
    console.log('  Match SHA-1?   ', hash.toLowerCase() === sha1);

    // SHA256
    const sha256 = createHash('sha256').update(TEST_PASSWORD).digest('hex');
    console.log('  Match SHA-256? ', hash.toLowerCase() === sha256);
  } else {
    console.log('\nTip: jalankan dengan password untuk test hash:');
    console.log('  node scripts/test-login.mjs "passwordanda"');
  }

  console.log('\n=== Done ===\n');
}

main().catch(console.error);
