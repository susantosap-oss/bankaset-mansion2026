import { Asset } from '@/domain/entities/Asset';
import { AssetScore } from '@/domain/entities/AssetScore';
import { AreaIntelligence } from '@/domain/entities/AreaIntelligence';
import { gradeFromScore } from '@/domain/value-objects/Grade';
import { v4 as uuidv4 } from 'uuid';

export class AssetScoringService {
  score(asset: Asset, area: AreaIntelligence | null): AssetScore {
    const marginValue = asset.marketValue - asset.outstanding;
    const marginPercent =
      asset.marketValue > 0 ? (marginValue / asset.marketValue) * 100 : 0;

    // Normalize margin to 0-1 (cap at 100% margin = 1.0)
    const marginNorm = Math.min(Math.max(marginPercent / 100, 0), 1);

    const demandScore = area?.final.demandScore ?? 50;
    const liquidityScore = area?.final.liquidityScore ?? 50;
    const demandNorm = demandScore / 100;
    const liquidityNorm = liquidityScore / 100;

    // Weighted formula: 40% margin + 40% demand + 20% liquidity
    const finalScore =
      marginNorm * 0.4 + demandNorm * 0.4 + liquidityNorm * 0.2;

    const dataSource = area?.final.source ?? 'COMPUTED';

    return {
      scoreId: uuidv4(),
      assetId: asset.assetId,
      marginValue,
      marginPercent,
      demandScore,
      liquidityScore,
      finalScore,
      grade: gradeFromScore(finalScore),
      isStale: false,
      dataSource,
      computedAt: new Date().toISOString(),
    };
  }
}
