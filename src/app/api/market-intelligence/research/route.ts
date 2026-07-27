import { NextRequest } from 'next/server';
import { ok, err, requireAuth } from '@/lib/api';
import { AreaResearchService } from '@/services/AreaResearchService';
import { getAssetRepository } from '@/lib/container';
import { rateLimit } from '@/lib/ratelimit';

export const maxDuration = 30;

const SELLABLE_FILTER = {
  minLiquidationRatioPct: 2,
  minLtvPct: 1,
} as const;

export async function POST(req: NextRequest) {
  const { error: authError, session } = await requireAuth();
  if (authError) return authError;

  const userId = session!.user?.email ?? 'anon';
  const rl = rateLimit(`area-research:${userId}`, 5, 60_000);
  if (!rl.ok) {
    return err('RATE_LIMITED', `Terlalu banyak permintaan riset. Coba lagi dalam ${Math.ceil(rl.retryAfterMs / 1000)} detik.`, 429);
  }

  try {
    const body = await req.json() as { area?: string; city?: string };
    const area = body.area?.trim() || null;
    const city = body.city?.trim().toLowerCase();

    if (!city) return err('VALIDATION_ERROR', 'city wajib diisi');

    // Jika area kosong → cari kecamatan dari asset Sellable di kota ini
    let dbCandidates: string[] = [];
    if (!area) {
      const { data: assets } = await getAssetRepository().findAll(
        { city, ...SELLABLE_FILTER },
        { page: 1, limit: 9999 },
      );

      // Hitung frekuensi tiap kecamatan (district), fallback ke area jika district kosong
      const districtCount = new Map<string, number>();
      for (const a of assets) {
        const kec = a.district?.trim() || a.area?.trim();
        if (kec) districtCount.set(kec, (districtCount.get(kec) ?? 0) + 1);
      }

      // Urut berdasarkan jumlah asset terbanyak, ambil top 5
      dbCandidates = [...districtCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([kec]) => kec);
    }

    const service = new AreaResearchService();
    const result = await service.research(area, city, dbCandidates);
    return ok(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/market-intelligence/research]', msg);
    return err('SERVER_ERROR', `Gagal melakukan riset: ${msg}`, 500);
  }
}
