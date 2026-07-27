import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getAssetRepository, getAreaIntelligenceRepository } from '@/lib/container';
import { canonicalize } from '@/lib/cityUtils';

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
    // Bangun peta area intelligence: canonical city → entry demand tertinggi
    const allAreas = await getAreaIntelligenceRepository().findAll();
    const areaMap = new Map<string, { medianPrice: number; demandScore: number; topArea: string }>();
    for (const ai of allAreas) {
      const key = canonicalize(ai.city).toLowerCase();
      const existing = areaMap.get(key);
      if (!existing || ai.final.demandScore > existing.demandScore) {
        areaMap.set(key, {
          medianPrice: ai.final.medianPrice,
          demandScore: ai.final.demandScore,
          topArea: ai.area,
        });
      }
    }

    const count = await getAssetRepository().exportSellable(QUALITY_FILTER, 'Asset Sellable', { areaMap });
    return ok({ exported: count, sheet: 'Asset Sellable' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/admin/export-ssot]', msg);
    return err('SERVER_ERROR', `Export gagal: ${msg}`, 500);
  }
}
