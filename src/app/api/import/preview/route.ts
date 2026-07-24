import { NextRequest } from 'next/server';
import * as xlsx from 'xlsx';
import Papa from 'papaparse';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getNormalizationService } from '@/lib/container';

// PROTECTED — upload requires login
export async function POST(req: NextRequest) {
  const { error } = await requirePrivileged();
  if (error) return error;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const bankName = formData.get('bankName') as string | null;

    if (!file) return err('VALIDATION_ERROR', 'File wajib diupload');
    if (!bankName) return err('VALIDATION_ERROR', 'Nama bank wajib diisi');

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) return err('FILE_TOO_LARGE', 'Ukuran file maksimal 10MB');

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['xlsx', 'xls', 'csv', 'pdf'].includes(ext)) {
      return err('INVALID_FILE_TYPE', 'Format file tidak didukung. Gunakan Excel (.xlsx/.xls) atau CSV');
    }

    if (ext === 'pdf') {
      return ok({
        fileType: 'PDF',
        message: 'PDF processing tersedia di Phase berikutnya. Silakan konversi ke Excel terlebih dahulu.',
        headers: [], sampleRows: [], allRows: [], totalRows: 0, suggestions: [],
      });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let headers: string[] = [];
    let allRows: Record<string, string>[] = [];

    if (ext === 'csv') {
      const text = buffer.toString('utf-8');
      const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
      const rows = result.data as string[][];
      headers = (rows[0] ?? []).map(String);
      allRows = rows.slice(1).map((row) =>
        Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? '')]))
      );
    } else {
      const XLSX = xlsx;
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      headers = ((data[0] as unknown[]) ?? []).map(String);
      allRows = (data.slice(1) as unknown[][]).map((row) =>
        Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? '')]))
      );
    }

    // Drop rows that are completely empty
    allRows = allRows.filter((row) => Object.values(row).some((v) => v.trim()));

    const normService = getNormalizationService();
    const suggestions = await normService.suggestMapping(headers, bankName);

    return ok({
      fileType: ext === 'csv' ? 'CSV' : 'EXCEL',
      fileName: file.name,
      bankName,
      headers,
      sampleRows: allRows.slice(0, 5),
      allRows,
      totalRows: allRows.length,
      suggestions,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/import/preview]', msg);
    return err('SERVER_ERROR', `Gagal memproses file: ${msg}`, 500);
  }
}
