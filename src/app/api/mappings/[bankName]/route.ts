import { NextRequest } from 'next/server';
import { getBankMappingRepository } from '@/lib/container';
import { ok, err, requirePrivileged } from '@/lib/api';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ bankName: string }> }) {
  const { bankName } = await params;
  try {
    const mapping = await getBankMappingRepository().findByBank(decodeURIComponent(bankName));
    if (!mapping) return err('NOT_FOUND', 'Mapping tidak ditemukan', 404);
    return ok(mapping);
  } catch (e) {
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ bankName: string }> }) {
  const { error, session } = await requirePrivileged();
  if (error) return error;

  const { bankName } = await params;
  try {
    const body = await req.json();
    const mapping = await getBankMappingRepository().update(decodeURIComponent(bankName), {
      ...body,
      updatedBy: session!.user?.email ?? 'unknown',
    });
    return ok(mapping);
  } catch (e) {
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ bankName: string }> }) {
  const { error } = await requirePrivileged();
  if (error) return error;

  const { bankName } = await params;
  try {
    await getBankMappingRepository().delete(decodeURIComponent(bankName));
    return ok({ deleted: true });
  } catch (e) {
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}
