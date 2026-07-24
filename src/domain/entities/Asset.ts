import { AssetType } from '@/domain/value-objects/AssetType';
import { AssetStatus } from '@/domain/value-objects/AssetStatus';

export interface Asset {
  readonly assetId: string;
  readonly bankName: string;
  readonly assetType: AssetType;
  readonly city: string;
  readonly district: string;
  readonly area: string;
  readonly address: string;
  readonly marketValue: number;
  readonly outstanding: number;
  readonly landArea: number;
  readonly buildingArea: number;
  readonly status: AssetStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rawRowRef?: string;
  // Extended fields
  readonly debtorName?: string;
  readonly principalOutstanding?: number;
  readonly liquidationRatio?: number;
  readonly liquidationValue?: number;
}

// Mutable version for building assets during normalization
export interface AssetDraft {
  bankName: string;
  assetType: Asset['assetType'];
  city: string;
  district: string;
  area: string;
  address: string;
  marketValue: number;
  outstanding: number;
  landArea: number;
  buildingArea: number;
  status: Asset['status'];
  rawRowRef?: string;
  // Extended fields
  debtorName?: string;
  principalOutstanding?: number;
  liquidationRatio?: number;
  liquidationValue?: number;
}

export type CreateAssetInput = AssetDraft;
