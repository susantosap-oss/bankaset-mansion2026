import { NextRequest } from 'next/server';
import { getBankMappingRepository } from '@/lib/container';
import { ok, err, requirePrivileged } from '@/lib/api';

export async function GET() {
  try {
    const mappings = await getBankMappingRepository().findAll();
    return ok(mappings);
  } catch (e) {
    console.error('[GET /api/mappings]', e);
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}

export async function POST(req: NextRequest) {
  const { error, session } = await requirePrivileged();
  if (error) return error;

  try {
    const body = await req.json();
    const { bankName, fields } = body;
    if (!bankName || !fields) return err('VALIDATION_ERROR', 'bankName dan fields wajib diisi');

    const mapping = await getBankMappingRepository().save({
      bankName,
      fields,
      active: true,
      updatedBy: session!.user?.email ?? 'unknown',
    });
    return ok(mapping);
  } catch (e) {
    console.error('[POST /api/mappings]', e);
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}
