import { getAreaIntelligenceRepository } from '@/lib/container';
import { AreaResearchService } from '@/services/AreaResearchService';

const MAX_NEW_AREAS = 5;

interface AssetFinancials {
  area?: string | null;
  city?: string | null;
  outstanding?: number | null;
  marketValue?: number | null;
  principalOutstanding?: number | null;
}

/**
 * Step 5 filter: check if an area's assets are financially viable candidates
 * for market research. Criteria:
 *   - At least one asset has outstanding > 0 (has real debt data)
 *   - Ratio outstanding/marketValue < 2.0 (not catastrophically underwater),
 *     or marketValue is unknown (0) — we give benefit of the doubt
 *   - Ratio principalOutstanding/outstanding > 0.3 (majority is real debt, not fees)
 */
function isAreaViable(assets: AssetFinancials[]): boolean {
  return assets.some((a) => {
    const os = a.outstanding ?? 0;
    if (os <= 0) return false;

    const mv = a.marketValue ?? 0;
    if (mv > 0 && os / mv > 2.0) return false; // too underwater

    const po = a.principalOutstanding ?? 0;
    if (po > 0 && po / os < 0.3) return false; // mostly fees/interest, not principal

    return true;
  });
}

/**
 * After an import, automatically research area intelligence for new area+city
 * combinations using Groq.
 *
 * Flow:
 *   1. Collect unique area+city from saved assets
 *   2. Skip pairs already in Area Intelligence
 *   3. Step 5 filter: only research areas with viable financial assets
 *   4. Run Groq in parallel (max 5)
 *   5. Save areas where demand ≥ 50 OR liquidity ≥ 50
 *
 * Returns count of areas successfully saved.
 */
export async function autoResearchNewAreas(
  assets: AssetFinancials[]
): Promise<number> {
  // Group assets by area+city key
  const grouped = new Map<string, AssetFinancials[]>();
  for (const a of assets) {
    const area = a.area?.trim();
    const city = a.city?.trim().toLowerCase();
    if (!area || !city) continue;
    const key = `${area.toLowerCase()}|${city}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(a);
  }

  if (grouped.size === 0) return 0;

  // Find which area+city are missing from Area Intelligence
  const areaRepo = getAreaIntelligenceRepository();
  const existing = await areaRepo.findAll();
  const existingKeys = new Set(
    existing.map((e) => `${e.area.toLowerCase()}|${e.city.toLowerCase()}`)
  );

  // Step 5: filter to areas that are new AND have viable financial assets
  const candidates = [...grouped.entries()]
    .filter(([key]) => !existingKeys.has(key))
    .filter(([, groupAssets]) => isAreaViable(groupAssets))
    .slice(0, MAX_NEW_AREAS)
    .map(([key]) => {
      const [area, city] = key.split('|');
      return { area, city };
    });

  if (candidates.length === 0) return 0;

  const researchService = new AreaResearchService();
  const now = new Date().toISOString();

  const results = await Promise.allSettled(
    candidates.map(async ({ area, city }) => {
      const r = await researchService.research(area, city);

      // Only persist if area shows meaningful market potential
      if (r.suggestedDemandScore < 50 && r.suggestedLiquidityScore < 50) return;

      await areaRepo.upsertExternal(area, city, {
        demandScore: r.suggestedDemandScore,
        liquidityScore: r.suggestedLiquidityScore,
        medianPrice: r.suggestedMedianPrice > 0 ? r.suggestedMedianPrice : null,
        priceTrend: null,
        sourceNote: `Auto (${r.method === 'PORTAL_DATA' ? 'Portal Data' : 'Groq'}) — Import ${now.slice(0, 10)}`,
        updatedAt: now,
        updatedBy: 'system',
      });
    })
  );

  return results.filter((r) => r.status === 'fulfilled').length;
}
