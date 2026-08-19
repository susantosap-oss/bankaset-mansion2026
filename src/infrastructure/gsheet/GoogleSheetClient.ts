import { google, sheets_v4 } from 'googleapis';
import { GoogleAuth, Impersonated, OAuth2Client } from 'google-auth-library';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return null; }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  invalidate(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

/**
 * Auth priority:
 *  1. GOOGLE_PRIVATE_KEY + GOOGLE_SERVICE_ACCOUNT_EMAIL → JWT (prod / local with SA key)
 *  2. GOOGLE_IMPERSONATE_SA set → Impersonate SA via ADC (local dev, user has TokenCreator role)
 *  3. None → GoogleAuth ADC (Cloud Run uses attached service account automatically)
 */
async function buildAuthClient() {
  const privateKey  = process.env.GOOGLE_PRIVATE_KEY;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const impersonateSA = process.env.GOOGLE_IMPERSONATE_SA;

  // Mode 1: Explicit SA key (fastest, works everywhere)
  if (privateKey && clientEmail) {
    return new google.auth.JWT({
      email: clientEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  // Mode 2: Impersonate SA via user ADC (local dev without SA key)
  if (impersonateSA) {
    const sourceAuth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const sourceClient = await sourceAuth.getClient() as OAuth2Client;
    return new Impersonated({
      sourceClient,
      targetPrincipal: impersonateSA,
      lifetime: 3600,
      delegates: [],
      targetScopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  // Mode 3: ADC — Cloud Run uses attached SA automatically
  return new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export class GoogleSheetClient {
  private sheets!: sheets_v4.Sheets;
  private cache = new SimpleCache();
  private readonly TTL = 60_000;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = buildAuthClient().then((auth) => {
      this.sheets = google.sheets({ version: 'v4', auth: auth as never });
      this.initialized = true;
    });
    return this.initPromise;
  }

  async readSheet(spreadsheetId: string, sheetName: string): Promise<string[][]> {
    await this.init();
    const cacheKey = `read:${spreadsheetId}:${sheetName}`;
    const cached = this.cache.get<string[][]>(cacheKey);
    if (cached) return cached;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
    });
    const rows = (res.data.values ?? []) as string[][];
    this.cache.set(cacheKey, rows, this.TTL);
    return rows;
  }

  async appendRows(spreadsheetId: string, sheetName: string, rows: unknown[][]): Promise<void> {
    await this.init();
    await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
    this.cache.invalidate(`read:${spreadsheetId}:${sheetName}`);
  }

  async updateRow(spreadsheetId: string, sheetName: string, rowIndex: number, values: unknown[]): Promise<void> {
    await this.init();
    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    });
    this.cache.invalidate(`read:${spreadsheetId}:${sheetName}`);
  }

  async batchUpdateRows(
    spreadsheetId: string,
    sheetName: string,
    updates: Array<{ rowIndex: number; values: unknown[] }>
  ): Promise<void> {
    if (updates.length === 0) return;
    await this.init();
    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates.map(({ rowIndex, values }) => ({
          range: `${sheetName}!A${rowIndex + 1}`,
          values: [values],
        })),
      },
    });
    this.cache.invalidate(`read:${spreadsheetId}:${sheetName}`);
  }

  /** Buat sheet tab jika belum ada, lalu tulis ulang seluruh isi (header + data). */
  async overwriteSheet(spreadsheetId: string, sheetName: string, rows: unknown[][]): Promise<void> {
    await this.init();

    // Pastikan sheet tab ada — buat jika belum
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId });
    const exists = meta.data.sheets?.some((s) => s.properties?.title === sheetName);
    if (!exists) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
      });
    }

    // Clear semua isi lama
    await this.sheets.spreadsheets.values.clear({ spreadsheetId, range: sheetName });

    // Tulis baru dari A1
    if (rows.length > 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
    }

    this.cache.invalidate(`read:${spreadsheetId}:${sheetName}`);
  }

  /** Hapus baris-baris tertentu dari sheet secara fisik menggunakan deleteDimension.
   *  rowIndices adalah 0-based index di sheet (baris header = 0, data pertama = 1).
   *  Proses dari bawah ke atas agar index tidak bergeser. */
  async deleteSheetRows(spreadsheetId: string, sheetName: string, rowIndices: number[]): Promise<void> {
    if (rowIndices.length === 0) return;
    await this.init();

    const meta = await this.sheets.spreadsheets.get({ spreadsheetId });
    const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName);
    if (!sheet?.properties?.sheetId == null) throw new Error(`Sheet "${sheetName}" not found`);
    const sheetId = sheet!.properties!.sheetId!;

    // Delete dari bawah ke atas agar row index tidak bergeser
    const sorted = [...rowIndices].sort((a, b) => b - a);
    const requests = sorted.map((rowIndex) => ({
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
      },
    }));

    await this.sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    this.cache.invalidate(`read:${spreadsheetId}:${sheetName}`);
  }

  invalidateCache(spreadsheetId: string, sheetName?: string): void {
    const prefix = sheetName ? `read:${spreadsheetId}:${sheetName}` : `read:${spreadsheetId}`;
    this.cache.invalidate(prefix);
  }
}

let instance: GoogleSheetClient | null = null;
export function getGoogleSheetClient(): GoogleSheetClient {
  if (!instance) instance = new GoogleSheetClient();
  return instance;
}
