import { GoogleSheetClient } from '@/infrastructure/gsheet/GoogleSheetClient';
import { AIAnalysis } from '@/domain/entities/AIAnalysis';

const SHEET_NAME = 'AI Analysis';

// Columns: analysisId | assetId | summary | investmentPotential | sellPotential | risks | recommendation | marketingStrategy | modelUsed | generatedAt
function rowToAnalysis(row: string[]): AIAnalysis | null {
  if (!row[0]?.trim() || !row[1]?.trim()) return null;
  return {
    analysisId: row[0],
    assetId: row[1],
    summary: row[2] ?? '',
    investmentPotential: row[3] ?? '',
    sellPotential: row[4] ?? '',
    risks: row[5] ?? '',
    recommendation: row[6] ?? '',
    marketingStrategy: row[7] ?? '',
    modelUsed: row[8] ?? '',
    generatedAt: row[9] ?? '',
  };
}

function analysisToRow(a: AIAnalysis): string[] {
  return [
    a.analysisId, a.assetId, a.summary, a.investmentPotential,
    a.sellPotential, a.risks, a.recommendation, a.marketingStrategy,
    a.modelUsed, a.generatedAt,
  ];
}

export class GoogleSheetAIAnalysisRepository {
  private readonly spreadsheetId: string;

  constructor(private readonly client: GoogleSheetClient) {
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID ?? '';
  }

  async findByAssetId(assetId: string): Promise<AIAnalysis | null> {
    const rows = await this.client.readSheet(this.spreadsheetId, SHEET_NAME);
    const dataRows = rows.slice(1);
    // Return most recent analysis for the asset
    const matches = dataRows
      .map(rowToAnalysis)
      .filter((a): a is AIAnalysis => a !== null && a.assetId === assetId);
    if (matches.length === 0) return null;
    return matches.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  }

  async save(analysis: AIAnalysis): Promise<void> {
    await this.client.appendRows(this.spreadsheetId, SHEET_NAME, [analysisToRow(analysis)]);
    this.client.invalidateCache(this.spreadsheetId, SHEET_NAME);
  }
}
