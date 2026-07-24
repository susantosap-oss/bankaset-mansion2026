import { getGoogleSheetClient } from '@/infrastructure/gsheet/GoogleSheetClient';
import { GoogleSheetAssetRepository } from '@/repositories/implementations/gsheet/GoogleSheetAssetRepository';
import { GoogleSheetBankMappingRepository } from '@/repositories/implementations/gsheet/GoogleSheetBankMappingRepository';
import { GoogleSheetFieldAliasRepository } from '@/repositories/implementations/gsheet/GoogleSheetFieldAliasRepository';
import { GoogleSheetAreaIntelligenceRepository } from '@/repositories/implementations/gsheet/GoogleSheetAreaIntelligenceRepository';
import { GoogleSheetAIAnalysisRepository } from '@/repositories/implementations/gsheet/GoogleSheetAIAnalysisRepository';
import { AIAnalystService } from '@/services/AIAnalystService';
import { NormalizationService } from '@/services/NormalizationService';
import { GeographicFilterService } from '@/services/GeographicFilterService';
import { AssetScoringService } from '@/services/AssetScoringService';

// Singletons — instantiated once per server process
let _assetRepo: GoogleSheetAssetRepository | null = null;
let _bankMappingRepo: GoogleSheetBankMappingRepository | null = null;
let _fieldAliasRepo: GoogleSheetFieldAliasRepository | null = null;
let _areaIntelligenceRepo: GoogleSheetAreaIntelligenceRepository | null = null;
let _aiAnalysisRepo: GoogleSheetAIAnalysisRepository | null = null;
let _aiAnalystService: AIAnalystService | null = null;
let _normalizationService: NormalizationService | null = null;
let _geoFilterService: GeographicFilterService | null = null;
let _scoringService: AssetScoringService | null = null;

export function getAssetRepository(): GoogleSheetAssetRepository {
  if (!_assetRepo) _assetRepo = new GoogleSheetAssetRepository(getGoogleSheetClient());
  return _assetRepo;
}

export function getBankMappingRepository(): GoogleSheetBankMappingRepository {
  if (!_bankMappingRepo) _bankMappingRepo = new GoogleSheetBankMappingRepository(getGoogleSheetClient());
  return _bankMappingRepo;
}

export function getFieldAliasRepository(): GoogleSheetFieldAliasRepository {
  if (!_fieldAliasRepo) _fieldAliasRepo = new GoogleSheetFieldAliasRepository(getGoogleSheetClient());
  return _fieldAliasRepo;
}

export function getAreaIntelligenceRepository(): GoogleSheetAreaIntelligenceRepository {
  if (!_areaIntelligenceRepo) _areaIntelligenceRepo = new GoogleSheetAreaIntelligenceRepository(getGoogleSheetClient());
  return _areaIntelligenceRepo;
}

export function getAIAnalysisRepository(): GoogleSheetAIAnalysisRepository {
  if (!_aiAnalysisRepo) _aiAnalysisRepo = new GoogleSheetAIAnalysisRepository(getGoogleSheetClient());
  return _aiAnalysisRepo;
}

export function getAIAnalystService(): AIAnalystService {
  if (!_aiAnalystService) _aiAnalystService = new AIAnalystService();
  return _aiAnalystService;
}

export function getNormalizationService(): NormalizationService {
  if (!_normalizationService)
    _normalizationService = new NormalizationService(getBankMappingRepository(), getFieldAliasRepository());
  return _normalizationService;
}

export function getGeographicFilterService(): GeographicFilterService {
  if (!_geoFilterService) _geoFilterService = new GeographicFilterService();
  return _geoFilterService;
}

export function getScoringService(): AssetScoringService {
  if (!_scoringService) _scoringService = new AssetScoringService();
  return _scoringService;
}
