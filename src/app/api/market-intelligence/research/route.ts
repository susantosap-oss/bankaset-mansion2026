import { NextRequest } from 'next/server';
import { ok, err, requireAuth } from '@/lib/api';
import { AreaResearchService } from '@/services/AreaResearchService';
import { rateLimit } from '@/lib/ratelimit';

export const maxDuration = 30;

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

    const service = new AreaResearchService();
    const result = await service.research(area, city);
    return ok(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/market-intelligence/research]', msg);
    return err('SERVER_ERROR', `Gagal melakukan riset: ${msg}`, 500);
  }
}
