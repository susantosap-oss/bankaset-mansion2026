import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { PDFExtractService } from '@/services/PDFExtractService';

export const maxDuration = 300; // seconds — multi-chunk PDF processing (5 chunks × ~60s)

export async function POST(req: NextRequest) {
  const { error } = await requirePrivileged();
  if (error) return error;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const bankName = formData.get('bankName') as string | null;

    if (!file) return err('VALIDATION_ERROR', 'File PDF wajib diupload');
    if (!bankName?.trim()) return err('VALIDATION_ERROR', 'Nama bank wajib diisi');

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf') return err('INVALID_FILE_TYPE', 'Hanya file PDF yang didukung di endpoint ini');

    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_SIZE) return err('FILE_TOO_LARGE', 'Ukuran file PDF maksimal 20MB');

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const service = new PDFExtractService();
    const result = await service.extractFromBuffer(buffer, bankName.trim());

    return ok({
      fileName: file.name,
      bankName: bankName.trim(),
      totalPages: result.totalPages,
      relevantPages: result.relevantPages,
      assets: result.assets,
      warnings: result.warnings,
      method: result.method,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/import/pdf]', msg);
    return err('SERVER_ERROR', `Gagal memproses PDF: ${msg}`, 500);
  }
}
