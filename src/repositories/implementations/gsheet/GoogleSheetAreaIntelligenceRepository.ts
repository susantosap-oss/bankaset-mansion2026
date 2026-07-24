import { v4 as uuidv4 } from 'uuid';
import { GoogleSheetClient } from '@/infrastructure/gsheet/GoogleSheetClient';
import { IAreaIntelligenceRepository } from '@/repositories/interfaces/IAreaIntelligenceRepository';
import {
  AreaIntelligence,
  ExternalMarketData,
  ComputedMarketData,
} from '@/domain/entities/AreaIntelligence';

const SHEET_NAME = 'Area Intelligence';

// Columns: areaId | area | city | demandScore | liquidityScore | medianPrice | priceTrend | sourceNote | updatedAt | updatedBy
function rowToArea(row: string[]): AreaIntelligence | null {
  if (!row[0]?.trim()) return null;
  const demandScore = parseFloat(row[3] ?? '50') || 50;
  const liquidityScore = parseFloat(row[4] ?? '50') || 50;
  const medianPrice = parseFloat(row[5] ?? '0') || 0;
  const priceTrend = row[6] ? parseFloat(row[6]) : null;
  return {
    areaId: row[0],
    area: row[1] ?? '',
    city: row[2] ?? '',
    external: {
      medianPrice,
      demandScore,
      liquidityScore,
      priceTrend,
      sourceNote: row[7] ?? '',
      updatedAt: row[8] ?? '',
      updatedBy: row[9] ?? '',
    },
    computed: null,
    final: {
      demandScore,
      liquidityScore,
      medianPrice,
      source: 'EXTERNAL',
    },
  };
}

function areaToRow(a: AreaIntelligence): string[] {
  const ext = a.external;
  return [
    a.areaId,
    a.area,
    a.city,
    String(ext?.demandScore ?? 50),
    String(ext?.liquidityScore ?? 50),
    String(ext?.medianPrice ?? 0),
    ext?.priceTrend != null ? String(ext.priceTrend) : '',
    ext?.sourceNote ?? '',
    ext?.updatedAt ?? '',
    ext?.updatedBy ?? '',
  ];
}

export class GoogleSheetAreaIntelligenceRepository implements IAreaIntelligenceRepository {
  private readonly spreadsheetId: string;

  constructor(private readonly client: GoogleSheetClient) {
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID ?? '';
  }

  private async getAllRows(): Promise<AreaIntelligence[]> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const [, ...dataRows] = rows;
    return dataRows.map(rowToArea).filter((a): a is AreaIntelligence => a !== null);
  }

  async findAll(): Promise<AreaIntelligence[]> {
    return this.getAllRows();
  }

  async findByAreaAndCity(area: string, city: string): Promise<AreaIntelligence | null> {
    const all = await this.getAllRows();
    return all.find(
      (a) =>
        a.area.toLowerCase() === area.toLowerCase() &&
        a.city.toLowerCase() === city.toLowerCase(),
    ) ?? null;
  }

  async findByCity(city: string): Promise<AreaIntelligence[]> {
    const all = await this.getAllRows();
    return all.filter((a) => a.city.toLowerCase() === city.toLowerCase());
  }

  async upsertExternal(area: string, city: string, data: ExternalMarketData): Promise<AreaIntelligence> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const dataRows = rows.slice(1);
    const idx = dataRows.findIndex(
      (r) => r[1]?.toLowerCase() === area.toLowerCase() && r[2]?.toLowerCase() === city.toLowerCase(),
    );

    const existing = idx >= 0 ? rowToArea(dataRows[idx]) : null;
    const updated: AreaIntelligence = {
      areaId: existing?.areaId ?? uuidv4(),
      area,
      city,
      external: data,
      computed: existing?.computed ?? null,
      final: {
        demandScore: data.demandScore ?? existing?.final.demandScore ?? 50,
        liquidityScore: data.liquidityScore ?? existing?.final.liquidityScore ?? 50,
        medianPrice: data.medianPrice ?? existing?.final.medianPrice ?? 0,
        source: 'EXTERNAL',
      },
    };

    if (idx >= 0) {
      await this.client.updateRow(this.spreadsheetId, SHEET_NAME, idx + 1, areaToRow(updated));
    } else {
      await this.client.appendRows(this.spreadsheetId, SHEET_NAME, [areaToRow(updated)]);
    }
    this.client.invalidateCache(this.spreadsheetId, SHEET_NAME);
    return updated;
  }

  async upsertComputed(area: string, city: string, data: ComputedMarketData): Promise<AreaIntelligence> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const dataRows = rows.slice(1);
    const idx = dataRows.findIndex(
      (r) => r[1]?.toLowerCase() === area.toLowerCase() && r[2]?.toLowerCase() === city.toLowerCase(),
    );
    const existing = idx >= 0 ? rowToArea(dataRows[idx]) : null;
    const updated: AreaIntelligence = {
      areaId: existing?.areaId ?? uuidv4(),
      area,
      city,
      external: existing?.external ?? null,
      computed: data,
      final: existing?.final ?? {
        demandScore: 50,
        liquidityScore: 50,
        medianPrice: data.medianPrice,
        source: 'COMPUTED',
      },
    };

    if (idx >= 0) {
      await this.client.updateRow(this.spreadsheetId, SHEET_NAME, idx + 1, areaToRow(updated));
    } else {
      await this.client.appendRows(this.spreadsheetId, SHEET_NAME, [areaToRow(updated)]);
    }
    this.client.invalidateCache(this.spreadsheetId, SHEET_NAME);
    return updated;
  }

  async delete(areaId: string): Promise<void> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const dataRows = rows.slice(1);
    const idx = dataRows.findIndex((r) => r[0] === areaId);
    if (idx < 0) return;
    await this.client.updateRow(this.spreadsheetId, SHEET_NAME, idx + 1, Array(10).fill(''));
    this.client.invalidateCache(this.spreadsheetId, SHEET_NAME);
  }
}
