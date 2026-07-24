import { NextResponse } from 'next/server';
import { getAssetRepository } from '@/lib/container';
import { canonicalize } from '@/lib/cityUtils';

const QUALITY_FILTER = { minLiquidationRatioPct: 2, minLtvPct: 1 } as const;

// PUBLIC — no auth required
export async function GET() {
  try {
    const repo = getAssetRepository();

    const [totalImported, { data: sellable, total: totalSellable }, banks, cities] =
      await Promise.all([
        repo.countTotal(),
        repo.findAll(QUALITY_FILTER, { page: 1, limit: 9999 }),
        repo.findDistinctBanks(),
        repo.findDistinctCities(),
      ]);

    // Agregasi dari sellable dataset (sama dengan Asset Bank list)
    const byType: Record<string, number> = {};
    const byCity: Record<string, number> = {};
    for (const a of sellable) {
      byType[a.assetType] = (byType[a.assetType] ?? 0) + 1;
      const city = canonicalize(a.city);
      if (city) byCity[city] = (byCity[city] ?? 0) + 1;
    }

    const assetsByType = Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({ type, count }));

    const assetsByCity = Object.entries(byCity)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([city, count]) => ({ city, count }));

    return NextResponse.json({
      success: true,
      data: {
        totalAssets: totalImported,   // semua yang diimport (tanpa filter)
        totalSellable,                // lolos filter kualitas = Asset Bank list
        totalBanks: banks.length,
        totalCities: cities.length,
        banks,
        cities,
        assetsByType,
        assetsByCity,
      },
    });
  } catch (err) {
    console.error('[GET /api/dashboard]', err);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: 'Terjadi kesalahan' } },
      { status: 500 }
    );
  }
}
