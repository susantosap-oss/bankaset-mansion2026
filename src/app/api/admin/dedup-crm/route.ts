import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getGoogleSheetClient } from '@/infrastructure/gsheet/GoogleSheetClient';

export const maxDuration = 60;

const CRM_SHEET_NAME = 'Assets';
// Kolom dedup: Source_Row_ID (col 29) = Asset ID dari Asset Engine
const COL_SOURCE_ID  = 29;
// Kolom tiebreaker: Updated_At (col 34) — simpan yang paling baru
const COL_UPDATED_AT = 34;

async function findCRMDuplicates() {
  const sheetId = process.env.CRM_SHEET_ID;
  if (!sheetId) throw new Error('CRM_SHEET_ID tidak dikonfigurasi');

  const client = getGoogleSheetClient();
  const rows = await client.readSheet(sheetId, CRM_SHEET_NAME);
  if (rows.length < 2) return { rows, toDelete: [] };

  // Group by Source_Row_ID → simpan yang Updated_At terbesar (terbaru)
  const groups = new Map<string, { rowIndex: number; updatedAt: string }>();
  const toDelete: number[] = [];

  for (let i = 1; i < rows.length; i++) {
    const sourceId = (rows[i][COL_SOURCE_ID] ?? '').trim();
    if (!sourceId) continue; // skip baris tanpa Source_Row_ID
    const updatedAt = (rows[i][COL_UPDATED_AT] ?? '').trim();

    const existing = groups.get(sourceId);
    if (!existing) {
      groups.set(sourceId, { rowIndex: i, updatedAt });
    } else if (updatedAt > existing.updatedAt) {
      // Row baru lebih baru → buang row lama
      toDelete.push(existing.rowIndex);
      groups.set(sourceId, { rowIndex: i, updatedAt });
    } else {
      // Row baru lebih lama → buang row baru
      toDelete.push(i);
    }
  }

  return { rows, toDelete };
}

// GET — preview jumlah duplikat
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const isCLI = !!process.env.AUTH_SECRET && authHeader === `Bearer ${process.env.AUTH_SECRET}`;
  if (!isCLI) {
    const { error } = await requirePrivileged();
    if (error) return error;
  }

  try {
    const { rows, toDelete } = await findCRMDuplicates();
    return ok({
      totalRows: rows.length - 1,
      duplicates: toDelete.length,
      headers: rows[0] ?? [],
      sampleRow: rows[1] ?? [],
    });
  } catch (e) {
    console.error('[GET /api/admin/dedup-crm]', e);
    return err('SERVER_ERROR', e instanceof Error ? e.message : 'Gagal cek duplikat CRM', 500);
  }
}

// POST — hapus duplikat dari CRM Assets
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

    const { toDelete } = await findCRMDuplicates();
    if (toDelete.length === 0) {
      return ok({ removed: 0, message: 'Tidak ada duplikat ditemukan.' });
    }

    const client = getGoogleSheetClient();
    await client.deleteSheetRows(sheetId, CRM_SHEET_NAME, toDelete);

    return ok({
      removed: toDelete.length,
      message: `${toDelete.length} baris duplikat berhasil dihapus dari CRM.`,
    });
  } catch (e) {
    console.error('[POST /api/admin/dedup-crm]', e);
    return err('SERVER_ERROR', e instanceof Error ? e.message : 'Gagal hapus duplikat CRM', 500);
  }
}
