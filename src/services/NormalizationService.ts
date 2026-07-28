import { IBankMappingRepository } from '@/repositories/interfaces/IBankMappingRepository';
import { IFieldAliasRepository } from '@/repositories/interfaces/IFieldAliasRepository';
import { CanonicalField, ALL_CANONICAL_FIELDS } from '@/domain/entities/BankMapping';
import { AssetDraft } from '@/domain/entities/Asset';
import { normalizeAssetType } from '@/domain/value-objects/AssetType';

export type ResolutionStatus = 'AUTO_MAPPED' | 'SUGGESTION' | 'UNRESOLVED';
export type MatchedVia = 'BANK_MAPPING' | 'ALIAS_EXACT' | 'ALIAS_FUZZY' | null;

export interface ColumnResolution {
  sourceColumn: string;
  suggestedField: CanonicalField | null;
  confidence: number;
  status: ResolutionStatus;
  matchedVia: MatchedVia;
}

export type ResolvedMapping = Record<string, CanonicalField>;

export interface NormalizedRow {
  asset: Partial<AssetDraft>;
  unmappedColumns: string[];
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function fuzzyScore(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

export class NormalizationService {
  constructor(
    private readonly bankMappingRepo: IBankMappingRepository,
    private readonly fieldAliasRepo: IFieldAliasRepository,
  ) {}

  /** Layer 1+2+3: Suggest mapping for all headers from a file */
  async suggestMapping(headers: string[], bankName: string): Promise<ColumnResolution[]> {
    const bankMapping = await this.bankMappingRepo.findByBank(bankName);
    const allAliases = await this.fieldAliasRepo.findAll();

    return headers.map((header): ColumnResolution => {
      // Layer 1: Bank Mapping (exact)
      if (bankMapping) {
        for (const [canonical, sourceCol] of Object.entries(bankMapping.fields)) {
          if (sourceCol?.toLowerCase() === header.toLowerCase()) {
            return {
              sourceColumn: header,
              suggestedField: canonical as CanonicalField,
              confidence: 1.0,
              status: 'AUTO_MAPPED',
              matchedVia: 'BANK_MAPPING',
            };
          }
        }
      }

      // Layer 2a: Field Alias exact match
      const exactAlias = allAliases.find((a) => a.aliasText.toLowerCase() === header.toLowerCase());
      if (exactAlias) {
        return {
          sourceColumn: header,
          suggestedField: exactAlias.canonicalField,
          confidence: exactAlias.confidence,
          status: exactAlias.confidence >= 0.9 ? 'AUTO_MAPPED' : 'SUGGESTION',
          matchedVia: 'ALIAS_EXACT',
        };
      }

      // Layer 2b: Field Alias fuzzy match
      let bestAlias = { score: 0, field: null as CanonicalField | null };
      for (const alias of allAliases) {
        const score = fuzzyScore(header, alias.aliasText) * alias.confidence;
        if (score > bestAlias.score) bestAlias = { score, field: alias.canonicalField };
      }
      if (bestAlias.score >= 0.75) {
        return {
          sourceColumn: header,
          suggestedField: bestAlias.field,
          confidence: bestAlias.score,
          status: bestAlias.score >= 0.9 ? 'AUTO_MAPPED' : 'SUGGESTION',
          matchedVia: 'ALIAS_FUZZY',
        };
      }

      // Layer 3: Unresolved — needs manual input
      return {
        sourceColumn: header,
        suggestedField: null,
        confidence: 0,
        status: 'UNRESOLVED',
        matchedVia: null,
      };
    });
  }

  /** Apply resolved mapping to convert a raw row to an Asset */
  normalizeRow(rawRow: Record<string, string>, resolvedMapping: ResolvedMapping): NormalizedRow {
    const asset: Partial<AssetDraft> = {};
    const unmappedColumns: string[] = [];

    for (const [sourceCol, value] of Object.entries(rawRow)) {
      const canonical = resolvedMapping[sourceCol];
      if (!canonical) {
        unmappedColumns.push(sourceCol);
        continue;
      }
      this.applyField(asset, canonical, value);
    }

    return { asset, unmappedColumns };
  }

  private applyField(asset: Partial<AssetDraft>, field: CanonicalField, raw: string): void {
    const value = raw?.trim() ?? '';
    switch (field) {
      case 'bank_name': asset.bankName = value; break;
      case 'asset_type': asset.assetType = normalizeAssetType(value); break;
      case 'city': asset.city = value; break;
      case 'district': asset.district = value; break;
      case 'area': asset.area = value; break;
      case 'address': asset.address = value; break;
      case 'market_value': asset.marketValue = this.parseCurrency(value); break;
      case 'outstanding': asset.outstanding = this.parseCurrency(value); break;
      case 'land_area': asset.landArea = parseFloat(value.replace(/[^0-9.]/g, '')) || 0; break;
      case 'building_area': asset.buildingArea = parseFloat(value.replace(/[^0-9.]/g, '')) || 0; break;
      case 'status': asset.status = value.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'ACTIVE'; break;
      case 'debtor_name': asset.debtorName = value; break;
      case 'principal_outstanding': asset.principalOutstanding = this.parseCurrency(value); break;
      case 'liquidation_ratio': asset.liquidationRatio = parseFloat(value.replace(/[^0-9.]/g, '')) || 0; break;
      case 'liquidation_value': asset.liquidationValue = this.parseCurrency(value); break;
      case 'limit_price': asset.limitPrice = this.parseCurrency(value); break;
    }
  }

  private parseCurrency(raw: string): number {
    // Handle Indonesian formats: "1.500.000.000" or "1,500,000,000" or "1.5M" or "1500000"
    const cleaned = raw.replace(/[Rp\s]/gi, '').trim();
    if (cleaned.toLowerCase().endsWith('m')) {
      return parseFloat(cleaned.slice(0, -1)) * 1_000_000;
    }
    if (cleaned.toLowerCase().endsWith('b') || cleaned.toLowerCase().endsWith('m')) {
      return parseFloat(cleaned.slice(0, -1)) * 1_000_000_000;
    }
    // Handle dot as thousand separator (Indonesian style)
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    return parseFloat(normalized) || 0;
  }

  validateRequiredFields(asset: Partial<AssetDraft>): string[] {
    const required: Array<keyof AssetDraft> = ['bankName', 'city', 'address', 'marketValue'];
    return required.filter((f) => !asset[f]) as string[];
  }
}
