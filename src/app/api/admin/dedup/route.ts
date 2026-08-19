import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getAssetRepository } from '@/lib/container';
import { fingerprint } from '@/lib/assetFingerprint';

export const maxDuration = 60;

function deduplicateKey(bankName: string, debtorName: string | undefined, address: string): string {
  return `${bankName.toLowerCase().trim()}||${fingerprint(debtorName, address)}`;
}

async function findDuplicates() {
  const repo = getAssetRepository();
  const { data: all } = await repo.findAll(undefined, { page: 1, limit: 9999 });

  const groups = new Map<string, typeof all>();
  for (const asset of all) {
    if (asset.status === 'SOLD') continue; // skip yang sudah di-disable
    const key = deduplicateKey(asset.bankName, asset.debtorName, asset.address);
    if (!key.includes('||') || key.endsWith('||')) continue; // skip aset tanpa address & debtorName
    const group = groups.get(key) ?? [];
    group.push(asset);
    groups.set(key, group);
  }

  const duplicateGroups: Array<{
    key: string;
    keep: (typeof all)[0];
    remove: (typeof all);
  }> = [];

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    // Urutkan: simpan yang paling lama (createdAt terkecil), hapus sisanya
    group.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    duplicateGroups.push({ key, keep: group[0], remove: group.slice(1) });
  }

  return duplicateGroups;
}

// GET — preview duplikat tanpa menghapus
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const isCLI = !!process.env.AUTH_SECRET && authHeader === `Bearer ${process.env.AUTH_SECRET}`;
  if (!isCLI) {
    const { error } = await requirePrivileged();
    if (error) return error;
  }

  try {
    const groups = await findDuplicates();
    const totalDuplicates = groups.reduce((s, g) => s + g.remove.length, 0);

    return ok({
      duplicateGroups: groups.length,
      totalDuplicates,
      preview: groups.slice(0, 20).map((g) => ({
        keep:   { id: g.keep.assetId,   bank: g.keep.bankName,   address: g.keep.address,   createdAt: g.keep.createdAt },
        remove: g.remove.map((a) => ({ id: a.assetId, bank: a.bankName, address: a.address, createdAt: a.createdAt })),
      })),
    });
  } catch (e) {
    console.error('[GET /api/admin/dedup]', e);
    return err('SERVER_ERROR', 'Gagal cek duplikat', 500);
  }
}

// POST — hapus duplikat (simpan yang pertama, buang sisanya)
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const isCLI = !!process.env.AUTH_SECRET && authHeader === `Bearer ${process.env.AUTH_SECRET}`;
  if (!isCLI) {
    const { error } = await requirePrivileged();
    if (error) return error;
  }

  try {
    const repo = getAssetRepository();
    const groups = await findDuplicates();

    if (groups.length === 0) {
      return ok({ removed: 0, message: 'Tidak ada duplikat ditemukan.' });
    }

    const idsToRemove = groups.flatMap((g) => g.remove.map((a) => a.assetId));
    const removed = await repo.bulkDisable(idsToRemove);

    return ok({
      duplicateGroups: groups.length,
      removed,
      message: `${removed} aset duplikat dihapus (di-nonaktifkan).`,
    });
  } catch (e) {
    console.error('[POST /api/admin/dedup]', e);
    return err('SERVER_ERROR', 'Gagal hapus duplikat', 500);
  }
}
