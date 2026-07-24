import { Asset, CreateAssetInput } from '@/domain/entities/Asset';
import { Grade } from '@/domain/value-objects/Grade';
import { AssetType } from '@/domain/value-objects/AssetType';
import { AssetStatus } from '@/domain/value-objects/AssetStatus';

export interface AssetFilter {
  bankName?: string;
  city?: string;
  area?: string;
  grade?: Grade;
  assetType?: AssetType;
  status?: AssetStatus;
  minMarketValue?: number;
  maxMarketValue?: number;
  maxOutstanding?: number;
  search?: string;
  /** Skip asset jika liquidationRatio ada & > 0 & < nilai ini (%). Default: tidak difilter. */
  minLiquidationRatioPct?: number;
  /** Skip asset jika (outstanding/marketValue)*100 < nilai ini (%). Default: tidak difilter. */
  minLtvPct?: number;
  /** Field untuk sorting hasil. */
  sortBy?: 'liquidationRatio' | 'marketValue' | 'outstanding' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}

export interface Pagination {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BulkSaveResult {
  saved: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface IAssetRepository {
  findAll(filter?: AssetFilter, pagination?: Pagination): Promise<PaginatedResult<Asset>>;
  findById(id: string): Promise<Asset | null>;
  save(asset: CreateAssetInput): Promise<Asset>;
  bulkSave(assets: CreateAssetInput[]): Promise<BulkSaveResult>;
  update(id: string, partial: Partial<CreateAssetInput>): Promise<Asset>;
  delete(id: string): Promise<void>;
  countByGrade(): Promise<Record<Grade, number>>;
  countByType(): Promise<Record<string, number>>;
  countByCity(): Promise<Record<string, number>>;
  countTotal(): Promise<number>;
  findDistinctCities(): Promise<string[]>;
  findDistinctAreas(city?: string): Promise<string[]>;
  findDistinctBanks(): Promise<string[]>;
}
