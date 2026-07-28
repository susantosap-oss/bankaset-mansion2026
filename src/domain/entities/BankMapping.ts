export type CanonicalField =
  | 'bank_name'
  | 'asset_type'
  | 'city'
  | 'district'
  | 'area'
  | 'address'
  | 'market_value'
  | 'outstanding'
  | 'land_area'
  | 'building_area'
  | 'status'
  | 'debtor_name'
  | 'principal_outstanding'
  | 'liquidation_ratio'
  | 'liquidation_value'
  | 'certificate_type'
  | 'limit_price';

export const CANONICAL_FIELD_LABELS: Record<CanonicalField, string> = {
  bank_name: 'Nama Bank',
  asset_type: 'Jenis Aset',
  city: 'Kota / Kabupaten',
  district: 'Kecamatan',
  area: 'Area / Kelurahan',
  address: 'Alamat Lengkap',
  market_value: 'Nilai Pasar (Market Value)',
  outstanding: 'Outstanding / Total Hutang',
  land_area: 'Luas Tanah (m²)',
  building_area: 'Luas Bangunan (m²)',
  status: 'Status Aset',
  debtor_name: 'Nama Debitur',
  principal_outstanding: 'Sisa Pokok Hutang',
  liquidation_ratio: 'Rasio Sisa Pokok / Outstanding (%)',
  liquidation_value: 'Nilai Likuidasi',
  certificate_type: 'Tipe Sertifikat',
  limit_price: 'Harga Limit',
};

export const ALL_CANONICAL_FIELDS: CanonicalField[] = [
  'bank_name', 'asset_type', 'city', 'district', 'area',
  'address', 'market_value', 'outstanding', 'land_area',
  'building_area', 'status',
  'debtor_name', 'principal_outstanding', 'liquidation_ratio', 'liquidation_value',
  'certificate_type', 'limit_price',
];

export interface BankMapping {
  readonly mappingId: string;
  readonly bankName: string;
  readonly fields: Partial<Record<CanonicalField, string>>;
  readonly active: boolean;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export type CreateBankMappingInput = Omit<BankMapping, 'mappingId' | 'updatedAt'>;
