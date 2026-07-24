import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getAreaIntelligenceRepository, getAssetRepository } from '@/lib/container';
import { canonicalize } from '@/lib/cityUtils';

const QUALITY_FILTER = { minLiquidationRatioPct: 2, minLtvPct: 1 } as const;

// PUBLIC — read
export async function GET() {
  try {
    const [areas, { data: assets, total }] = await Promise.all([
      getAreaIntelligenceRepository().findAll(),
      getAssetRepository().findAll(QUALITY_FILTER, { page: 1, limit: 9999 }),
    ]);

    const byType: Record<string, number> = {};
    const byCity: Record<string, number> = {};
    for (const a of assets) {
      byType[a.assetType] = (byType[a.assetType] ?? 0) + 1;
      const city = canonicalize(a.city);
      if (city) byCity[city] = (byCity[city] ?? 0) + 1;
    }

    const assetsByType = Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({ type, count }));

    const assetsByCity = Object.entries(byCity)
      .sort(([, a], [, b]) => b - a)
      .map(([city, count]) => ({ city, count }));

    return ok({ areas, stats: { totalActive: total, assetsByType, assetsByCity } });
  } catch (e) {
    console.error('[GET /api/market-intelligence]', e);
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}

// PROTECTED — upsert area entry
export async function POST(req: NextRequest) {
  const { error, session } = await requirePrivileged();
  if (error) return error;

  try {
    const body = await req.json() as {
      area: string;
      city: string;
      demandScore: number;
      liquidityScore: number;
      medianPrice?: number;
      priceTrend?: number;
      sourceNote?: string;
    };

    const { area, city, demandScore, liquidityScore } = body;
    if (!area?.trim()) return err('VALIDATION_ERROR', 'area wajib diisi');
    if (!city?.trim()) return err('VALIDATION_ERROR', 'city wajib diisi');
    if (demandScore < 0 || demandScore > 100) return err('VALIDATION_ERROR', 'demandScore harus 0-100');
    if (liquidityScore < 0 || liquidityScore > 100) return err('VALIDATION_ERROR', 'liquidityScore harus 0-100');

    const result = await getAreaIntelligenceRepository().upsertExternal(area.trim(), city.trim(), {
      demandScore,
      liquidityScore,
      medianPrice: body.medianPrice ?? null,
      priceTrend: body.priceTrend ?? null,
      sourceNote: body.sourceNote ?? '',
      updatedAt: new Date().toISOString(),
      updatedBy: session?.user?.email ?? 'system',
    });

    return ok(result);
  } catch (e) {
    console.error('[POST /api/market-intelligence]', e);
    return err('SERVER_ERROR', 'Gagal menyimpan area intelligence', 500);
  }
}
