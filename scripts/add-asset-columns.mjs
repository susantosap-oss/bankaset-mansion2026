// Add 4 new columns to Asset Engine sheet
// Run: node scripts/add-asset-columns.mjs
import { google } from 'googleapis';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env.local', 'utf-8');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SHEET_ID = env.GOOGLE_SHEET_ID;
const IMPERSONATE_SA = env.GOOGLE_IMPERSONATE_SA;

async function main() {
  const sourceAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const sourceClient = await sourceAuth.getClient();
  const auth = new Impersonated({
    sourceClient, targetPrincipal: IMPERSONATE_SA,
    lifetime: 3600, delegates: [],
    targetScopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Read current header row
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Asset Engine!A1:Z1',
  });
  const headers = current.data.values?.[0] ?? [];
  console.log('Current headers:', headers.length, 'columns');
  console.log(headers.join(' | '));

  // New headers to append at P-S (cols 16-19, 0-indexed 15-18)
  const newCols = ['debtor_name', 'principal_outstanding', 'liquidation_ratio', 'liquidation_value'];
  const colLetter = (i) => String.fromCharCode(65 + i); // A=0, P=15, Q=16, R=17, S=18

  for (let i = 0; i < newCols.length; i++) {
    const colIdx = 15 + i;
    const col = colLetter(colIdx);
    if (headers[colIdx]) {
      console.log(`Col ${col} already has: ${headers[colIdx]} — skip`);
      continue;
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Asset Engine!${col}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [[newCols[i]]] },
    });
    console.log(`✅ Set col ${col} = ${newCols[i]}`);
  }

  console.log('\nDone — Asset Engine now has extended columns.');
}

main().catch(console.error);
