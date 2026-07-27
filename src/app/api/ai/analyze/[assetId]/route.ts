import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { getAssetRepository, getAIAnalysisRepository, getAIAnalystService } from '@/lib/container';
import { rateLimit } from '@/lib/ratelimit';

export const maxDuration = 60;

// GET — return cached analysis (public)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  try {
    const analysis = await getAIAnalysisRepository().findByAssetId(assetId);
    if (!analysis) return err('NOT_FOUND', 'Belum ada analisis untuk asset ini', 404);
    return ok(analysis);
  } catch (e) {
    console.error('[GET /api/ai/analyze/:assetId]', e);
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}

// POST — generate new analysis (public, rate limited by IP: 10 req/minute)
export async function POST(req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'anon';
  const rl = rateLimit(`ai:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return err('RATE_LIMITED', `Terlalu banyak permintaan. Coba lagi dalam ${Math.ceil(rl.retryAfterMs / 1000)} detik.`, 429);
  }

  const { assetId } = await params;
  try {
    const asset = await getAssetRepository().findById(assetId);
    if (!asset) return err('NOT_FOUND', 'Asset tidak ditemukan', 404);

    const analysis = await getAIAnalystService().analyze(asset);
    await getAIAnalysisRepository().save(analysis);
    return ok(analysis);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/ai/analyze/:assetId]', msg);
    return err('SERVER_ERROR', `Gagal generate analisis: ${msg}`, 500);
  }
}
