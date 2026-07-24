import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getAssetRepository } from '@/lib/container';

export const maxDuration = 60;

const QUALITY_FILTER = {
  minLiquidationRatioPct: 2,
  minLtvPct: 1,
  sortBy: 'liquidationRatio' as const,
  sortDir: 'desc' as const,
};

export async function POST(_req: NextRequest) {
  const { error } = await requirePrivileged();
  if (error) return error;

  try {
    const count = await getAssetRepository().exportSellable(QUALITY_FILTER);
    return ok({ exported: count, sheet: 'Asset Sellable' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/admin/export-ssot]', msg);
    return err('SERVER_ERROR', `Export gagal: ${msg}`, 500);
  }
}
