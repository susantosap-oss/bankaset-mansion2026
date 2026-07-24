export interface ExternalMarketData {
  medianPrice: number | null;
  demandScore: number | null;
  liquidityScore: number | null;
  priceTrend: number | null;
  sourceNote: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ComputedMarketData {
  medianPrice: number;
  listingCount: number;
  supplyScore: number;
  marginAvg: number;
  computedAt: string;
}

export interface ResolvedMarketData {
  demandScore: number;
  liquidityScore: number;
  medianPrice: number;
  source: 'EXTERNAL' | 'COMPUTED' | 'MIXED';
}

export interface AreaIntelligence {
  readonly areaId: string;
  readonly area: string;
  readonly city: string;
  readonly external: ExternalMarketData | null;
  readonly computed: ComputedMarketData | null;
  readonly final: ResolvedMarketData;
}
