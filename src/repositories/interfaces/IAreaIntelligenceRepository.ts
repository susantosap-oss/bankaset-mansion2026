import { AreaIntelligence, ExternalMarketData, ComputedMarketData } from '@/domain/entities/AreaIntelligence';

export interface IAreaIntelligenceRepository {
  findAll(): Promise<AreaIntelligence[]>;
  findByAreaAndCity(area: string, city: string): Promise<AreaIntelligence | null>;
  findByCity(city: string): Promise<AreaIntelligence[]>;
  upsertExternal(area: string, city: string, data: ExternalMarketData): Promise<AreaIntelligence>;
  upsertComputed(area: string, city: string, data: ComputedMarketData): Promise<AreaIntelligence>;
  delete(areaId: string): Promise<void>;
}
