export interface PDFExtractedAsset {
  bankName: string;
  assetType: string;
  city: string;
  district: string;
  area: string;
  address: string;
  marketValue: number;
  outstanding: number;
  landArea: number;
  buildingArea: number;
  debtorName: string;
  principalOutstanding: number;
  liquidationRatio: number;
  liquidationValue: number;
  limitPrice: number;
  pageNumber: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  rawText: string;
}
