import { NextRequest } from 'next/server';
import { getAssetRepository, getAreaIntelligenceRepository } from '@/lib/container';
import { ok, err } from '@/lib/api';
import { AssetFilter } from '@/repositories/interfaces/IAssetRepository';
import { Asset } from '@/domain/entities/Asset';
import { canonicalize } from '@/lib/cityUtils';

// Sellable: lulus quality filter + area ada di database intelligence dengan demand >= 40
function isSellable(
  asset: Asset,
  areaEntry: { demandScore: number } | undefined,
): boolean {
  if (!areaEntry) return false;
  if (areaEntry.demandScore < 40) return false;
  // liquidationRatio check sudah dilakukan oleh minLiquidationRatioPct filter
  // LTV check sudah dilakukan oleh minLtvPct filter
  return true;
}

// PUBLIC — read access
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const filter: AssetFilter = {
      bankName: searchParams.get('bankName') ?? undefined,
      city: searchParams.get('city') ?? undefined,
      area: searchParams.get('area') ?? undefined,
      status: (searchParams.get('status') as AssetFilter['status']) ?? undefined,
      search: searchParams.get('search') ?? undefined,
      minLiquidationRatioPct: 2,
      minLtvPct: 1,
      sortBy: 'liquidationRatio',
      sortDir: 'desc',
    };
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);

    // Parallel: ambil assets + area intelligence
    const [result, allAreas] = await Promise.all([
      getAssetRepository().findAll(filter, { page, limit }),
      getAreaIntelligenceRepository().findAll(),
    ]);

    // Bangun map: canonical city → entry dengan demand tertinggi
    const cityAreaMap = new Map<string, { demandScore: number; medianPrice: number; areaName: string }>();
    for (const ai of allAreas) {
      const key = canonicalize(ai.city).toLowerCase();
      const existing = cityAreaMap.get(key);
      if (!existing || ai.final.demandScore > existing.demandScore) {
        cityAreaMap.set(key, {
          demandScore: ai.final.demandScore,
          medianPrice: ai.final.medianPrice,
          areaName: ai.area,
        });
      }
    }

    // Enrichment: tambahkan marketPriceEst & sellable ke setiap asset
    const enriched = result.data.map((asset) => {
      const cityKey = canonicalize(asset.city).toLowerCase();
      const areaEntry = cityAreaMap.get(cityKey);
      return {
        ...asset,
        marketPriceEst: areaEntry?.medianPrice ?? null,
        sellable: isSellable(asset, areaEntry),
      };
    });

    return ok(enriched, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (e) {
    console.error('[GET /api/assets]', e);
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}
