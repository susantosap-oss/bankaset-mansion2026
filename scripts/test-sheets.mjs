// Quick connectivity test — run with: node scripts/test-sheets.mjs
import { google } from 'googleapis';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import { readFileSync } from 'fs';

// Load env from .env.local
const envFile = readFileSync('.env.local', 'utf-8');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const IMPERSONATE_SA = env.GOOGLE_IMPERSONATE_SA;
const PRIVATE_KEY     = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const CLIENT_EMAIL    = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SHEET_ID        = env.GOOGLE_SHEET_ID;
const CRM_SHEET_ID    = env.CRM_SHEET_ID;

async function buildAuth() {
  if (PRIVATE_KEY && CLIENT_EMAIL) {
    console.log('Auth mode: JWT (SA key)');
    return new google.auth.JWT({
      email: CLIENT_EMAIL,
      key: PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  if (IMPERSONATE_SA) {
    console.log('Auth mode: Impersonation →', IMPERSONATE_SA);
    const source = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const sourceClient = await source.getClient();
    return new Impersonated({
      sourceClient,
      targetPrincipal: IMPERSONATE_SA,
      lifetime: 3600,
      delegates: [],
      targetScopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  console.log('Auth mode: ADC');
  return new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

async function main() {
  console.log('\n=== Mansion Asset Bank — Sheets Connectivity Test ===\n');
  const auth = await buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Test 1: Asset Bank Sheet
  console.log('1. Testing Asset Bank Sheet:', SHEET_ID);
  try {
    const res = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const tabs = res.data.sheets?.map(s => s.properties?.title) ?? [];
    console.log('   ✅ Connected! Tabs:', tabs.join(', ') || '(kosong)');
  } catch (e) {
    console.log('   ❌ Error:', e.message);
  }

  // Test 2: CRM Sheet (read AGENTS)
  console.log('\n2. Testing CRM Sheet (AGENTS):', CRM_SHEET_ID);
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: CRM_SHEET_ID,
      range: 'AGENTS!A1:G5',
    });
    const rows = res.data.values ?? [];
    console.log('   ✅ Connected! Header:', rows[0]?.slice(0,7).join(' | '));
    console.log('   ✅ Sample rows:', rows.length - 1, 'data rows (capped at 4)');
  } catch (e) {
    console.log('   ❌ Error:', e.message);
  }

  console.log('\n=== Done ===\n');
}

main().catch(console.error);
