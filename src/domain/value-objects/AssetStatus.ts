export type AssetStatus = 'ACTIVE' | 'SOLD' | 'IN_PROCESS' | 'NPL';

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  ACTIVE: 'Aktif',
  SOLD: 'Terjual',
  IN_PROCESS: 'Dalam Proses',
  NPL: 'NPL',
};
