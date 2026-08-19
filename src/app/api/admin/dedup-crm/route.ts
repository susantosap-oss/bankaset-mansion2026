import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getGoogleSheetClient } from '@/infrastructure/gsheet/GoogleSheetClient';

export const maxDuration = 60;

const CRM_SHEET_NAME = 'Assets';

// Kolom-kolom CRM Assets (0-based)
const COL_SOURCE_ID        = 29; // Source_Row_ID — kunci dedup
const COL_HARGA_LIMIT      = 15; // Harga_Limit_Lelang
const COL_HARGA_LIMIT_FMT  = 16; // Harga_Limit_Format
const COL_EST_PASAR        = 17; // Est_Harga_Pasar
const COL_EST_PASAR_FMT    = 18; // Est_Harga_Pasar_Format
const COL_EST_EKSEKUSI     = 19; // Est_Harga_Eksekusi
const COL_EST_EKSEKUSI_FMT = 20; // Est_Harga_Eksekusi_Format
const COL_STATUS           = 27; // Status (Publish / Terjual / …)
const COL_TAMPILKAN        = 28; // Tampilkan_di_Web (TRUE/FALSE)
const COL_SOURCE_DATA      = 30; // Source_Data JSON terbaru
const COL_UPDATED_AT       = 34; // Updated_At

interface GroupEntry { rowIndex: number; row: string[] }

async function analyzeDuplicates() {
  const sheetId = process.env.CRM_SHEET_ID;
  if (!sheetId) throw new Error('CRM_SHEET_ID tidak dikonfigurasi');

  const client = getGoogleSheetClient();
  const rows = await client.readSheet(sheetId, CRM_SHEET_NAME);
  if (rows.length < 2) return { rows, toUpdate: [], toDelete: [], groups: 0 };

  // Group by Source_Row_ID
  const groups = new Map<string, GroupEntry[]>();
  for (let i = 1; i < rows.length; i++) {
    const sourceId = (rows[i][COL_SOURCE_ID] ?? '').trim();
    if (!sourceId) continue;
    const list = groups.get(sourceId) ?? [];
    list.push({ rowIndex: i, row: rows[i] });
    groups.set(sourceId, list);
  }

  const toUpdate: Array<{ rowIndex: number; mergedRow: string[] }> = [];
  const toDelete: number[] = [];
  let dupGroups = 0;

  for (const [, entries] of groups) {
    if (entries.length < 2) continue;
    dupGroups++;

    // Urutkan by Created_At asc → entry[0] = paling lama (yang dipertahankan)
    entries.sort((a, b) => (a.row[33] ?? '').localeCompare(b.row[33] ?? ''));

    const kept   = entries[0];
    const newest = entries[entries.length - 1];

    // Merge: copy harga & status dari data terbaru ke row lama
    const merged = [...kept.row];
    merged[COL_HARGA_LIMIT]      = newest.row[COL_HARGA_LIMIT]      ?? merged[COL_HARGA_LIMIT];
    merged[COL_HARGA_LIMIT_FMT]  = newest.row[COL_HARGA_LIMIT_FMT]  ?? merged[COL_HARGA_LIMIT_FMT];
    merged[COL_EST_PASAR]        = newest.row[COL_EST_PASAR]        ?? merged[COL_EST_PASAR];
    merged[COL_EST_PASAR_FMT]    = newest.row[COL_EST_PASAR_FMT]    ?? merged[COL_EST_PASAR_FMT];
    merged[COL_EST_EKSEKUSI]     = newest.row[COL_EST_EKSEKUSI]     ?? merged[COL_EST_EKSEKUSI];
    merged[COL_EST_EKSEKUSI_FMT] = newest.row[COL_EST_EKSEKUSI_FMT] ?? merged[COL_EST_EKSEKUSI_FMT];
    merged[COL_STATUS]           = newest.row[COL_STATUS]           ?? merged[COL_STATUS];
    merged[COL_SOURCE_DATA]      = newest.row[COL_SOURCE_DATA]      ?? merged[COL_SOURCE_DATA];
    merged[COL_UPDATED_AT]       = newest.row[COL_UPDATED_AT]       ?? merged[COL_UPDATED_AT];

    // Jika status Terjual → nonaktifkan di web
    if ((merged[COL_STATUS] ?? '').toLowerCase().includes('terjual')) {
      merged[COL_TAMPILKAN] = 'FALSE';
    }

    toUpdate.push({ rowIndex: kept.rowIndex, mergedRow: merged });
    // Semua entry selain yang paling lama → dihapus
    for (const e of entries.slice(1)) toDelete.push(e.rowIndex);
  }

  return { rows, toUpdate, toDelete, groups: dupGroups };
}

// GET — preview
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const isCLI = !!process.env.AUTH_SECRET && authHeader === `Bearer ${process.env.AUTH_SECRET}`;
  if (!isCLI) {
    const { error } = await requirePrivileged();
    if (error) return error;
  }

  try {
    const { rows, toDelete, groups } = await analyzeDuplicates();
    return ok({
      totalRows: rows.length - 1,
      duplicates: toDelete.length,
      duplicateGroups: groups,
      headers: rows[0] ?? [],
      sampleRow: rows[1] ?? [],
    });
  } catch (e) {
    console.error('[GET /api/admin/dedup-crm]', e);
    return err('SERVER_ERROR', e instanceof Error ? e.message : 'Gagal cek duplikat CRM', 500);
  }
}

// POST — merge harga/status ke data lama, hapus duplikat baru
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const isCLI = !!process.env.AUTH_SECRET && authHeader === `Bearer ${process.env.AUTH_SECRET}`;
  if (!isCLI) {
    const { error } = await requirePrivileged();
    if (error) return error;
  }

  try {
    const sheetId = process.env.CRM_SHEET_ID;
    if (!sheetId) return err('CONFIG_ERROR', 'CRM_SHEET_ID tidak dikonfigurasi', 500);

    const { toUpdate, toDelete, groups } = await analyzeDuplicates();
    if (groups === 0) return ok({ updated: 0, removed: 0, message: 'Tidak ada duplikat.' });

    const client = getGoogleSheetClient();

    // 1. Update baris lama dengan harga & status terbaru
    if (toUpdate.length > 0) {
      await client.batchUpdateRows(sheetId, CRM_SHEET_NAME,
        toUpdate.map(({ rowIndex, mergedRow }) => ({ rowIndex, values: mergedRow }))
      );
    }

    // 2. Hapus fisik baris duplikat (yang lebih baru)
    if (toDelete.length > 0) {
      await client.deleteSheetRows(sheetId, CRM_SHEET_NAME, toDelete);
    }

    return ok({
      duplicateGroups: groups,
      updated: toUpdate.length,
      removed: toDelete.length,
      message: `Selesai: ${toUpdate.length} baris diupdate, ${toDelete.length} duplikat dihapus.`,
    });
  } catch (e) {
    console.error('[POST /api/admin/dedup-crm]', e);
    return err('SERVER_ERROR', e instanceof Error ? e.message : 'Gagal cleanup CRM', 500);
  }
}
