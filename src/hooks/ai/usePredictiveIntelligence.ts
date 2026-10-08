import { useState, useEffect, useCallback, useRef } from 'react';
import { predictiveIntelligenceService, type DemandPrediction } from '@/services/ai/PredictiveIntelligenceService';

export function usePredictiveIntelligence(productId: string | null, options: { days?: number; seasonality?: 'none' | 'high' | 'low' } = {}) {
  const [demand, setDemand] = useState<DemandPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const days = options.days;
  const seasonality = options.seasonality;

  const fetchDemand = useCallback(async () => {
    const version = ++requestVersion.current;
    setDemand(null); // Never show previous product's recommendation while switching SKUs.
    setError(null);
    if (!productId) { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await predictiveIntelligenceService.predictProductDemand(productId, { days, seasonality });
      if (requestVersion.current === version) setDemand(result);
    } catch {
      if (requestVersion.current === version) setError('Projeção indisponível: não há modelo e histórico de demanda homologados.');
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [productId, days, seasonality]);

  useEffect(() => {
    void fetchDemand();
    return () => { requestVersion.current += 1; };
  }, [fetchDemand]);

  return { demand, loading, error, refetch: fetchDemand };
}
