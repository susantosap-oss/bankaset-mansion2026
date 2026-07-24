import { NextRequest } from 'next/server';
import { getFieldAliasRepository } from '@/lib/container';
import { ok, err, requirePrivileged } from '@/lib/api';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requirePrivileged();
  if (error) return error;

  const { id } = await params;
  try {
    await getFieldAliasRepository().delete(id);
    return ok({ deleted: true });
  } catch (e) {
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}
