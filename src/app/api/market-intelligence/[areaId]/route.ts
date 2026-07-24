import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getAreaIntelligenceRepository } from '@/lib/container';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ areaId: string }> }) {
  const { error } = await requirePrivileged();
  if (error) return error;

  const { areaId } = await params;
  try {
    await getAreaIntelligenceRepository().delete(areaId);
    return ok({ deleted: true });
  } catch (e) {
    console.error('[DELETE /api/market-intelligence/:areaId]', e);
    return err('SERVER_ERROR', 'Gagal menghapus', 500);
  }
}
