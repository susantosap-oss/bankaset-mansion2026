import { v4 as uuidv4 } from 'uuid';
import { GoogleSheetClient } from '@/infrastructure/gsheet/GoogleSheetClient';
import { IBankMappingRepository } from '@/repositories/interfaces/IBankMappingRepository';
import { BankMapping, CanonicalField, CreateBankMappingInput } from '@/domain/entities/BankMapping';

const SHEET_NAME = 'Bank Mapping';

function rowToMapping(row: string[]): BankMapping | null {
  if (!row[0]) return null;
  let fields: Partial<Record<CanonicalField, string>> = {};
  try { fields = JSON.parse(row[2] ?? '{}'); } catch { /* skip */ }
  return {
    mappingId: row[0],
    bankName: row[1],
    fields,
    active: row[3] === 'true',
    updatedAt: row[4] ?? '',
    updatedBy: row[5] ?? '',
  };
}

function mappingToRow(m: BankMapping): string[] {
  return [m.mappingId, m.bankName, JSON.stringify(m.fields), String(m.active), m.updatedAt, m.updatedBy];
}

export class GoogleSheetBankMappingRepository implements IBankMappingRepository {
  private readonly spreadsheetId: string;

  constructor(private readonly client: GoogleSheetClient) {
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID ?? '';
  }

  private async getAll(): Promise<BankMapping[]> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    return rows.slice(1).map(rowToMapping).filter((m): m is BankMapping => m !== null);
  }

  async findAll(): Promise<BankMapping[]> {
    return this.getAll();
  }

  async findByBank(bankName: string): Promise<BankMapping | null> {
    const all = await this.getAll();
    return all.find((m) => m.bankName.toLowerCase() === bankName.toLowerCase() && m.active) ?? null;
  }

  async save(input: CreateBankMappingInput): Promise<BankMapping> {
    const mapping: BankMapping = {
      ...input,
      mappingId: uuidv4(),
      updatedAt: new Date().toISOString(),
    };
    await this.client.appendRows(this.spreadsheetId, SHEET_NAME, [mappingToRow(mapping)]);
    return mapping;
  }

  async update(bankName: string, partial: Partial<CreateBankMappingInput>): Promise<BankMapping> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const dataRows = rows.slice(1);
    const idx = dataRows.findIndex((r) => r[1]?.toLowerCase() === bankName.toLowerCase());
    if (idx === -1) throw new Error(`Mapping not found: ${bankName}`);
    const existing = rowToMapping(dataRows[idx])!;
    const updated: BankMapping = { ...existing, ...partial, updatedAt: new Date().toISOString() };
    await this.client.updateRow(this.spreadsheetId, SHEET_NAME, idx + 1, mappingToRow(updated));
    return updated;
  }

  async delete(bankName: string): Promise<void> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const dataRows = rows.slice(1);
    const idx = dataRows.findIndex((r) => r[1]?.toLowerCase() === bankName.toLowerCase());
    if (idx === -1) return;
    await this.client.updateRow(this.spreadsheetId, SHEET_NAME, idx + 1, Array(6).fill(''));
    this.client.invalidateCache(this.spreadsheetId, SHEET_NAME);
  }
}
