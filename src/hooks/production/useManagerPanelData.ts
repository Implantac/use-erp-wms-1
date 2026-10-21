import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import type { ManagerLotInput, ManagerShipmentInput } from '@/lib/pcp/managerMetrics';

/**
 * Dados reais do Painel do Gerente: lotes com saldo e expedições recentes
 * (picking WMS) da empresa ativa. Sem empresa ou com falha de leitura,
 * retorna vazio + loadError para a tela mostrar "Sem dados suficientes".
 */
export function useManagerPanelData() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [lots, setLots] = useState<ManagerLotInput[]>([]);
  const [shipments, setShipments] = useState<ManagerShipmentInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchData = useCallback(async () => {
    if (!companyId) {
      setLots([]);
      setShipments([]);
      setLoadError(false);
      setLoading(false);
      return false;
    }
    setLoading(true);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [lotsResult, movementsResult] = await Promise.all([
      supabase
        .from('stock_lots')
        .select('product_code, remaining_qty, status, quality_status')
        .eq('company_id', companyId)
        .gt('remaining_qty', 0),
      supabase
        .from('stock_movements')
        .select('product_code, quantity, created_at')
        .eq('company_id', companyId)
        .eq('source', 'wms_pick')
        .gte('created_at', since)
        .order('created_at', { ascending: false }),
    ]);
    if (companyIdRef.current !== companyId) return false;
    if (lotsResult.error || movementsResult.error) {
      console.error(lotsResult.error ?? movementsResult.error);
      setLots([]);
      setShipments([]);
      setLoadError(true);
      setLoading(false);
      return false;
    }
    setLots((lotsResult.data ?? []).map((row) => ({
      product_code: row.product_code,
      remaining_qty: Number(row.remaining_qty ?? 0),
      status: row.status,
      quality_status: row.quality_status,
    })));
    setShipments((movementsResult.data ?? []).map((row) => ({
      product_code: row.product_code,
      quantity: Number(row.quantity ?? 0),
      created_at: row.created_at,
    })));
    setLoadError(false);
    setLoading(false);
    return true;
  }, [companyId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { lots, shipments, loading, loadError, hasCompany: !!companyId, refetch: fetchData };
}
