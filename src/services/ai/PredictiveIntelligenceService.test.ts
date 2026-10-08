import { describe, expect, it } from 'vitest';
import { predictiveIntelligenceService } from './PredictiveIntelligenceService';

describe('AI demand and slotting without a validated provider', () => {
  it('never invents demand, confidence, EOQ or warehouse positions', async () => {
    await expect(predictiveIntelligenceService.predictProductDemand('product', { days: 30 })).rejects.toThrow('indisponível');
    await expect(predictiveIntelligenceService.optimizeWarehouseSlotting()).rejects.toThrow('indisponível');
  });
});
