import { v4 as uuidv4 } from 'uuid';
import { GoogleSheetClient } from '@/infrastructure/gsheet/GoogleSheetClient';
import { IFieldAliasRepository } from '@/repositories/interfaces/IFieldAliasRepository';
import { FieldAlias, CreateFieldAliasInput } from '@/domain/entities/FieldAlias';
import { CanonicalField } from '@/domain/entities/BankMapping';

const SHEET_NAME = 'Field Alias';

function rowToAlias(row: string[]): FieldAlias | null {
  if (!row[0]) return null;
  return {
    aliasId: row[0],
    aliasText: row[1],
    canonicalField: row[2] as CanonicalField,
    confidence: parseFloat(row[3] ?? '1.0'),
    source: (row[4] as FieldAlias['source']) || 'MANUAL',
    createdBy: row[5] ?? '',
    createdAt: row[6] ?? '',
  };
}

function aliasToRow(a: FieldAlias): string[] {
  return [a.aliasId, a.aliasText, a.canonicalField, String(a.confidence), a.source, a.createdBy, a.createdAt];
}

export class GoogleSheetFieldAliasRepository implements IFieldAliasRepository {
  private readonly spreadsheetId: string;

  constructor(private readonly client: GoogleSheetClient) {
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID ?? '';
  }

  private async getAll(): Promise<FieldAlias[]> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    return rows.slice(1).map(rowToAlias).filter((a): a is FieldAlias => a !== null);
  }

  async findAll(): Promise<FieldAlias[]> {
    return this.getAll();
  }

  async findByCanonicalField(field: CanonicalField): Promise<FieldAlias[]> {
    const all = await this.getAll();
    return all.filter((a) => a.canonicalField === field);
  }

  async findByText(text: string): Promise<FieldAlias | null> {
    const all = await this.getAll();
    const normalized = text.toLowerCase().trim();
    return all.find((a) => a.aliasText.toLowerCase() === normalized) ?? null;
  }

  async save(input: CreateFieldAliasInput): Promise<FieldAlias> {
    const alias: FieldAlias = {
      ...input,
      aliasId: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    await this.client.appendRows(this.spreadsheetId, SHEET_NAME, [aliasToRow(alias)]);
    return alias;
  }

  async delete(aliasId: string): Promise<void> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const dataRows = rows.slice(1);
    const idx = dataRows.findIndex((r) => r[0] === aliasId);
    if (idx === -1) return;
    await this.client.updateRow(this.spreadsheetId, SHEET_NAME, idx + 1, Array(7).fill(''));
    this.client.invalidateCache(this.spreadsheetId, SHEET_NAME);
  }
}
