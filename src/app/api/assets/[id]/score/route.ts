import { NextRequest } from 'next/server';
import { getAssetRepository, getScoringService, getAreaIntelligenceRepository } from '@/lib/container';
import { ok, err } from '@/lib/api';

// PUBLIC — real-time scoring, no auth required
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const asset = await getAssetRepository().findById(id);
    if (!asset) return err('NOT_FOUND', 'Asset tidak ditemukan', 404);

    const area = asset.area && asset.city
      ? await getAreaIntelligenceRepository().findByAreaAndCity(asset.area, asset.city).catch(() => null)
      : null;

    const score = getScoringService().score(asset, area);
    return ok(score);
  } catch (e) {
    console.error('[GET /api/assets/:id/score]', e);
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}
