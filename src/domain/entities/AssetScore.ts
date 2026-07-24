import { Grade } from '@/domain/value-objects/Grade';

export interface AssetScore {
  readonly scoreId: string;
  readonly assetId: string;
  readonly marginValue: number;
  readonly marginPercent: number;
  readonly demandScore: number;
  readonly liquidityScore: number;
  readonly finalScore: number;
  readonly grade: Grade;
  readonly isStale: boolean;
  readonly dataSource: 'EXTERNAL' | 'COMPUTED' | 'MIXED';
  readonly computedAt: string;
}
