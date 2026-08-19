import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getAssetRepository } from '@/lib/container';

export const maxDuration = 60;

// One-time fix: aset LELANG/AYDA yang tersimpan dengan ratio desimal (< 2)
// padahal seharusnya persen (>= 2). Recalculate dari limitPrice/marketValue.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const isCLI = !!process.env.AUTH_SECRET && authHeader === `Bearer ${process.env.AUTH_SECRET}`;
  if (!isCLI) {
    const { error } = await requirePrivileged();
    if (error) return error;
  }

  try {
    const repo = getAssetRepository();
    const { data: all } = await repo.findAll(undefined, { page: 1, limit: 9999 });

    const toFix: Array<{ assetId: string; partial: { liquidationRatio: number } }> = [];

    for (const a of all) {
      const isLelangAyda = a.labelAsset === 'LELANG' || a.labelAsset === 'AYDA';
      const hasDecimalRatio = a.liquidationRatio != null && a.liquidationRatio > 0 && a.liquidationRatio < 2;
      const canRecalc = a.limitPrice && a.limitPrice > 0 && a.marketValue && a.marketValue > 0;

      if (isLelangAyda && hasDecimalRatio && canRecalc) {
        const corrected = Math.round((a.limitPrice! / a.marketValue) * 100);
        toFix.push({ assetId: a.assetId, partial: { liquidationRatio: corrected } });
      }
    }

    if (toFix.length === 0) {
      return ok({ fixed: 0, message: 'Tidak ada aset yang perlu diperbaiki.' });
    }

    const fixed = await repo.bulkUpdateFields(toFix);
    return ok({ fixed, message: `${fixed} aset berhasil diperbarui rasionya.` });
  } catch (e) {
    console.error('[POST /api/admin/fix-ratio]', e);
    return err('SERVER_ERROR', 'Gagal memperbaiki ratio', 500);
  }
}
