import { v4 as uuidv4 } from 'uuid';
import { canonicalize } from '@/lib/cityUtils';
import { GoogleSheetClient } from '@/infrastructure/gsheet/GoogleSheetClient';
import {
  IAssetRepository,
  AssetFilter,
  Pagination,
  PaginatedResult,
  BulkSaveResult,
} from '@/repositories/interfaces/IAssetRepository';
import { Asset, CreateAssetInput } from '@/domain/entities/Asset';
import { Grade } from '@/domain/value-objects/Grade';

const SHEET_NAME = 'Asset Engine';

// Column order in the sheet (cols 0–14 existing, 15–19 extended)
const COLS = [
  'assetId', 'bankName', 'assetType', 'city', 'district', 'area',
  'address', 'marketValue', 'outstanding', 'landArea', 'buildingArea',
  'status', 'createdAt', 'updatedAt', 'rawRowRef',
  'debtorName', 'principalOutstanding', 'liquidationRatio', 'liquidationValue',
  'certificateType',
] as const;

function rowToAsset(row: string[]): Asset | null {
  if (!row[0]) return null;
  return {
    assetId: row[0],
    bankName: row[1],
    assetType: (row[2] as Asset['assetType']) || 'OTHER',
    city: row[3] ?? '',
    district: row[4] ?? '',
    area: row[5] ?? '',
    address: row[6] ?? '',
    marketValue: parseFloat(row[7] ?? '0') || 0,
    outstanding: parseFloat(row[8] ?? '0') || 0,
    landArea: parseFloat(row[9] ?? '0') || 0,
    buildingArea: parseFloat(row[10] ?? '0') || 0,
    status: (row[11] as Asset['status']) || 'ACTIVE',
    createdAt: row[12] ?? new Date().toISOString(),
    updatedAt: row[13] ?? new Date().toISOString(),
    rawRowRef: row[14] ?? '',
    debtorName: row[15] || undefined,
    principalOutstanding: row[16] ? parseFloat(row[16]) || undefined : undefined,
    liquidationRatio: row[17] ? parseFloat(row[17]) || undefined : undefined,
    liquidationValue: row[18] ? parseFloat(row[18]) || undefined : undefined,
    certificateType: row[19] || undefined,
  };
}

function assetToRow(asset: Asset): string[] {
  return [
    asset.assetId, asset.bankName, asset.assetType, asset.city, asset.district,
    asset.area, asset.address, String(asset.marketValue), String(asset.outstanding),
    String(asset.landArea), String(asset.buildingArea), asset.status,
    asset.createdAt, asset.updatedAt, asset.rawRowRef ?? '',
    asset.debtorName ?? '',
    asset.principalOutstanding != null ? String(asset.principalOutstanding) : '',
    asset.liquidationRatio != null ? String(asset.liquidationRatio) : '',
    asset.liquidationValue != null ? String(asset.liquidationValue) : '',
    asset.certificateType ?? '',
  ];
}

function applyFilter(assets: Asset[], filter?: AssetFilter): Asset[] {
  if (!filter) return assets;
  return assets.filter((a) => {
    if (filter.bankName && a.bankName !== filter.bankName) return false;
    if (filter.city && a.city.toLowerCase() !== filter.city.toLowerCase()) return false;
    if (filter.area && a.area.toLowerCase() !== filter.area.toLowerCase()) return false;
    if (filter.assetType && a.assetType !== filter.assetType) return false;
    if (filter.status && a.status !== filter.status) return false;
    if (filter.minMarketValue && a.marketValue < filter.minMarketValue) return false;
    if (filter.maxMarketValue && a.marketValue > filter.maxMarketValue) return false;
    if (filter.maxOutstanding && a.outstanding > filter.maxOutstanding) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const haystack = `${a.address} ${a.city} ${a.area} ${a.district} ${a.debtorName ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // ── Financial quality filters ─────────────────────────────────
    // Rasio Sisa Pokok / Outstanding: skip jika data ada tapi di bawah threshold
    if (filter.minLiquidationRatioPct != null) {
      const r = a.liquidationRatio;
      if (r != null && r > 0 && r < filter.minLiquidationRatioPct) return false;
    }
    // Outstanding / Nilai Pasar: skip jika LTV terlalu kecil
    if (filter.minLtvPct != null) {
      if (a.outstanding > 0 && a.marketValue > 0) {
        const ltv = (a.outstanding / a.marketValue) * 100;
        if (ltv < filter.minLtvPct) return false;
      }
    }

    return true;
  });
}

export class GoogleSheetAssetRepository implements IAssetRepository {
  private readonly spreadsheetId: string;

  constructor(private readonly client: GoogleSheetClient) {
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID ?? '';
  }

  private async getAllRows(): Promise<Asset[]> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const [_header, ...dataRows] = rows;
    return dataRows.map(rowToAsset).filter((a): a is Asset => a !== null);
  }

  async findAll(filter?: AssetFilter, pagination?: Pagination): Promise<PaginatedResult<Asset>> {
    const all = await this.getAllRows();
    const filtered = applyFilter(all, filter);

    // Sort sebelum pagination
    if (filter?.sortBy) {
      const key = filter.sortBy;
      const dir = filter.sortDir === 'asc' ? 1 : -1;
      filtered.sort((a, b) => {
        const av = (a[key] as number | string | undefined) ?? 0;
        const bv = (b[key] as number | string | undefined) ?? 0;
        if (av < bv) return -dir;
        if (av > bv) return dir;
        return 0;
      });
    }

    const total = filtered.length;
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<Asset | null> {
    const all = await this.getAllRows();
    return all.find((a) => a.assetId === id) ?? null;
  }

  async save(input: CreateAssetInput): Promise<Asset> {
    const now = new Date().toISOString();
    const asset: Asset = {
      ...input,
      assetId: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    await this.client.appendRows(this.spreadsheetId, SHEET_NAME, [assetToRow(asset)]);
    return asset;
  }

  async bulkSave(inputs: CreateAssetInput[]): Promise<BulkSaveResult> {
    const now = new Date().toISOString();
    const rows: string[][] = [];
    const errors: Array<{ row: number; reason: string }> = [];
    let saved = 0;

    for (let i = 0; i < inputs.length; i++) {
      try {
        const asset: Asset = {
          ...inputs[i],
          assetId: uuidv4(),
          createdAt: now,
          updatedAt: now,
        };
        rows.push(assetToRow(asset));
        saved++;
      } catch (err) {
        errors.push({ row: i, reason: String(err) });
      }
    }

    if (rows.length > 0) {
      await this.client.appendRows(this.spreadsheetId, SHEET_NAME, rows);
    }

    return { saved, failed: errors.length, errors };
  }

  async update(id: string, partial: Partial<CreateAssetInput>): Promise<Asset> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const dataRows = rows.slice(1);
    const idx = dataRows.findIndex((r) => r[0] === id);
    if (idx === -1) throw new Error(`Asset not found: ${id}`);

    const existing = rowToAsset(dataRows[idx])!;
    const updated: Asset = { ...existing, ...partial, updatedAt: new Date().toISOString() };
    await this.client.updateRow(this.spreadsheetId, SHEET_NAME, idx + 1, assetToRow(updated));
    return updated;
  }

  async delete(id: string): Promise<void> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const dataRows = rows.slice(1);
    const idx = dataRows.findIndex((r) => r[0] === id);
    if (idx === -1) return;
    // Mark as deleted by clearing the row (GSheet has no easy delete without batchUpdate + sheetId)
    await this.client.updateRow(this.spreadsheetId, SHEET_NAME, idx + 1, Array(COLS.length).fill(''));
    this.client.invalidateCache(this.spreadsheetId, SHEET_NAME);
  }

  async countByGrade(): Promise<Record<Grade, number>> {
    return { A: 0, B: 0, C: 0, D: 0 };
  }

  async countByType(): Promise<Record<string, number>> {
    const all = await this.getAllRows();
    const counts: Record<string, number> = {};
    for (const a of all) {
      if (a.status !== 'ACTIVE') continue;
      counts[a.assetType] = (counts[a.assetType] ?? 0) + 1;
    }
    return counts;
  }

  async countByCity(): Promise<Record<string, number>> {
    const all = await this.getAllRows();
    const counts: Record<string, number> = {};
    for (const a of all) {
      if (a.status !== 'ACTIVE' || !a.city) continue;
      const city = canonicalize(a.city); // merge "Kota Surabaya" → "Surabaya" dll
      counts[city] = (counts[city] ?? 0) + 1;
    }
    return counts;
  }

  async countTotal(): Promise<number> {
    const all = await this.getAllRows();
    return all.filter((a) => a.status === 'ACTIVE').length;
  }

  async findDistinctCities(): Promise<string[]> {
    const all = await this.getAllRows();
    return [...new Set(all.map((a) => a.city).filter(Boolean))].sort();
  }

  async findDistinctAreas(city?: string): Promise<string[]> {
    const all = await this.getAllRows();
    const filtered = city ? all.filter((a) => a.city === city) : all;
    return [...new Set(filtered.map((a) => a.area).filter(Boolean))].sort();
  }

  async findDistinctBanks(): Promise<string[]> {
    const all = await this.getAllRows();
    return [...new Set(all.map((a) => a.bankName).filter(Boolean))].sort();
  }

  /**
   * Tulis semua sellable assets (sudah difilter + diurutkan) ke sheet tab SSoT.
   * Sheet dibuat otomatis jika belum ada. Isi lama di-clear dulu.
   * options.areaMap: canonical city (lowercase) → { medianPrice, demandScore, topArea }
   */
  async exportSellable(
    filter: import('@/repositories/interfaces/IAssetRepository').AssetFilter,
    sheetName = 'Asset Sellable',
    options?: {
      areaMap?: Map<string, { medianPrice: number; demandScore: number; topArea: string }>;
    },
  ): Promise<number> {
    const { data: assets } = await this.findAll(filter, { page: 1, limit: 9999 });
    const areaMap = options?.areaMap;

    function getCityKey(city: string): string {
      return city.trim().toLowerCase().replace(/^kota\s+/, '').replace(/^kabupaten\s+/, '');
    }

    function isSellable(asset: Asset, entry: { demandScore: number } | undefined): boolean {
      if (!entry || entry.demandScore < 40) return false;
      return true;
    }

    const HEADER = [
      'Asset ID', 'Source', 'Tipe Aset', 'Kota', 'Kecamatan', 'Area/Kelurahan',
      'Alamat Lengkap', 'Nilai Pasar', 'Outstanding', 'Sisa Pokok',
      'LT (m²)', 'LB (m²)', 'Tipe Sertifikat', 'Debitur',
      'Rasio Sisa Pokok/Outstanding', 'Nilai Likuidasi',
      'Harga_Pasar_Est (Rp/m²)', 'Demand Score (AI)', 'Sellable', 'Status',
      'Dibuat', 'Diperbarui',
    ];

    const rows: unknown[][] = [
      HEADER,
      ...assets.map((a) => {
        const cityKey = getCityKey(a.city);
        const entry = areaMap?.get(cityKey);
        const hargaPasarEst = entry?.medianPrice && entry.medianPrice > 0 ? entry.medianPrice : '';
        const demandScore = entry?.demandScore ?? '';
        const sellable = isSellable(a, entry) ? 'Ya' : 'Tidak';
        return [
          a.assetId, a.bankName, a.assetType, a.city, a.district, a.area,
          a.address, a.marketValue, a.outstanding, a.principalOutstanding ?? '',
          a.landArea > 0 ? a.landArea : '-',
          a.buildingArea > 0 ? a.buildingArea : '-',
          a.certificateType || '-',
          a.debtorName ?? '-',
          a.liquidationRatio ?? '', a.liquidationValue ?? '',
          hargaPasarEst, demandScore, sellable,
          a.status, a.createdAt, a.updatedAt,
        ];
      }),
    ];

    await this.client.overwriteSheet(this.spreadsheetId, sheetName, rows);
    return assets.length;
  }

  /**
   * One-time backfill: update city/district/area for a batch of assets in a single API call.
   * Reads the sheet once, applies all updates, writes back via batchUpdate.
   */
  async bulkNormalizeCities(
    updates: Array<{ assetId: string; city: string; district?: string; area?: string }>
  ): Promise<number> {
    if (updates.length === 0) return 0;
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const dataRows = rows.slice(1); // skip header
    const now = new Date().toISOString();

    const byId = new Map(updates.map((u) => [u.assetId, u]));
    const batchUpdates: Array<{ rowIndex: number; values: unknown[] }> = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const assetId = row[0];
      const upd = byId.get(assetId);
      if (!upd) continue;

      const existing = rowToAsset(row);
      if (!existing) continue;

      const updated: typeof existing = {
        ...existing,
        city: upd.city,
        district: upd.district ?? existing.district,
        area: upd.area ?? existing.area,
        updatedAt: now,
      };
      // rowIndex is 1-based (header=row1, data starts at row2)
      batchUpdates.push({ rowIndex: i + 1, values: assetToRow(updated) });
    }

    await this.client.batchUpdateRows(this.spreadsheetId, SHEET_NAME, batchUpdates);
    return batchUpdates.length;
  }
}
