import { NextRequest } from 'next/server';
import { getAssetRepository } from '@/lib/container';
import { ok, err, requirePrivileged } from '@/lib/api';

// PUBLIC — read
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const asset = await getAssetRepository().findById(id);
    if (!asset) return err('NOT_FOUND', `Asset tidak ditemukan: ${id}`, 404);
    return ok(asset);
  } catch (e) {
    console.error('[GET /api/assets/:id]', e);
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}

// PROTECTED — ADMIN / PRINCIPAL / SUPERUSER
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requirePrivileged();
  if (error) return error;

  const { id } = await params;
  try {
    await getAssetRepository().delete(id);
    return ok({ deleted: true });
  } catch (e) {
    console.error('[DELETE /api/assets/:id]', e);
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}
