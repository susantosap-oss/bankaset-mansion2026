import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getGoogleSheetClient } from '@/infrastructure/gsheet/GoogleSheetClient';

export const maxDuration = 60;

const CRM_SHEET_NAME = 'Assets';

function rowKey(row: string[]): string {
  return row.map((v) => (v ?? '').trim()).join('||');
}

async function findCRMDuplicates() {
  const sheetId = process.env.CRM_SHEET_ID;
  if (!sheetId) throw new Error('CRM_SHEET_ID tidak dikonfigurasi');

  const client = getGoogleSheetClient();
  const rows = await client.readSheet(sheetId, CRM_SHEET_NAME);
  if (rows.length < 2) return { rows, toDelete: [] };

  const seen = new Map<string, number>(); // key → first row index (0-based, including header)
  const toDelete: number[] = [];

  for (let i = 1; i < rows.length; i++) {
    const key = rowKey(rows[i]);
    if (!key.replace(/\|/g, '').trim()) continue; // skip baris kosong
    if (seen.has(key)) {
      toDelete.push(i);
    } else {
      seen.set(key, i);
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
      totalRows: rows.length - 1, // exclude header
      duplicates: toDelete.length,
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
