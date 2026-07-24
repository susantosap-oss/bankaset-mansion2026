import { NextRequest } from 'next/server';
import { getAssetRepository } from '@/lib/container';
import { ok, err } from '@/lib/api';
import { AssetFilter } from '@/repositories/interfaces/IAssetRepository';

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
      // Business rule: tampilkan hanya asset dengan data keuangan yang viable
      minLiquidationRatioPct: 2,     // Sisa Pokok/Outstanding >= 2%
      minLtvPct: 1,                  // Outstanding/Nilai Pasar >= 1%
      sortBy: 'liquidationRatio',
      sortDir: 'desc',
    };
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);

    const result = await getAssetRepository().findAll(filter, { page, limit });
    return ok(result.data, {
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
