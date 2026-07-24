export interface AIAnalysis {
  readonly analysisId: string;
  readonly assetId: string;
  readonly summary: string;
  readonly investmentPotential: string;
  readonly sellPotential: string;
  readonly risks: string;
  readonly recommendation: string;
  readonly marketingStrategy: string;
  readonly modelUsed: string;
  readonly generatedAt: string;
}
