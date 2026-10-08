import { BaseService } from '../shared/baseService';

export interface DemandPrediction {
  product_id: string;
  predicted_demand: number;
  confidence_score: number;
  reasoning: string;
  period_days: number;
}

export interface SlottingOptimization {
  product_id: string;
  current_location: string;
  suggested_location: string;
  efficiency_gain: number;
}

export class PredictiveIntelligenceService extends BaseService<'products'> {
  constructor() { super('products'); }

  // No calibrated model or validated historic time series is connected.
  // Never return arbitrary confidence, growth factors, EOQ or fake locations.
  async predictProductDemand(_productId: string, _options: { days?: number; seasonality?: 'none' | 'high' | 'low' } = {}): Promise<DemandPrediction> {
    throw new Error('Previsão de demanda indisponível: modelo e dados históricos não homologados.');
  }

  async optimizeWarehouseSlotting(): Promise<SlottingOptimization[]> {
    throw new Error('Otimização de slotting indisponível: posições e eficiência não verificadas.');
  }
}

export const predictiveIntelligenceService = new PredictiveIntelligenceService();
