import { NextRequest } from 'next/server';
import { getFieldAliasRepository } from '@/lib/container';
import { ok, err, requirePrivileged } from '@/lib/api';

export async function GET() {
  try {
    const aliases = await getFieldAliasRepository().findAll();
    return ok(aliases);
  } catch (e) {
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}

export async function POST(req: NextRequest) {
  const { error, session } = await requirePrivileged();
  if (error) return error;

  try {
    const body = await req.json();
    const { aliasText, canonicalField } = body;
    if (!aliasText || !canonicalField) return err('VALIDATION_ERROR', 'aliasText dan canonicalField wajib diisi');

    const alias = await getFieldAliasRepository().save({
      aliasText,
      canonicalField,
      confidence: 1.0,
      source: 'MANUAL',
      createdBy: session!.user?.email ?? 'unknown',
    });
    return ok(alias);
  } catch (e) {
    return err('SERVER_ERROR', 'Terjadi kesalahan', 500);
  }
}
