export type AssetType =
  | 'RUMAH'
  | 'APARTEMEN'
  | 'RUKO'
  | 'GUDANG'
  | 'PABRIK'
  | 'LAHAN'
  | 'KANTOR'
  | 'HOTEL'
  | 'OTHER';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  RUMAH: 'Rumah',
  APARTEMEN: 'Apartemen',
  RUKO: 'Ruko',
  GUDANG: 'Gudang',
  PABRIK: 'Pabrik',
  LAHAN: 'Lahan / Tanah',
  KANTOR: 'Kantor',
  HOTEL: 'Hotel',
  OTHER: 'Lainnya',
};

// Accepted outside Surabaya Raya — industrial/logistic only
export const COMMERCIAL_ASSET_TYPES: AssetType[] = ['GUDANG', 'PABRIK', 'LAHAN', 'HOTEL'];

// Residential types — only accepted in Surabaya Raya
export const RESIDENTIAL_ASSET_TYPES: AssetType[] = ['RUMAH', 'APARTEMEN'];

// Keyword aliases used during normalization
export const ASSET_TYPE_ALIASES: Record<string, AssetType> = {
  rumah: 'RUMAH',
  house: 'RUMAH',
  'rumah tinggal': 'RUMAH',
  'tanah & bangunan': 'RUMAH',
  apartemen: 'APARTEMEN',
  apartment: 'APARTEMEN',
  ruko: 'RUKO',
  shophouse: 'RUKO',
  rukan: 'RUKO',
  gudang: 'GUDANG',
  warehouse: 'GUDANG',
  pabrik: 'PABRIK',
  factory: 'PABRIK',
  industri: 'PABRIK',
  industrial: 'PABRIK',
  lahan: 'LAHAN',
  tanah: 'LAHAN',
  'tanah kosong': 'LAHAN',
  land: 'LAHAN',
  kantor: 'KANTOR',
  office: 'KANTOR',
  hotel: 'HOTEL',
  'hotel & resort': 'HOTEL',
  resort: 'HOTEL',
  penginapan: 'HOTEL',
  vila: 'HOTEL',
  villa: 'HOTEL',
};

export function normalizeAssetType(raw: string): AssetType {
  const key = raw.toLowerCase().trim();
  return ASSET_TYPE_ALIASES[key] ?? 'OTHER';
}
