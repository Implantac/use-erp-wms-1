import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import { toast } from 'sonner';

export interface ProductionLogRow {
  id: string;
  production_order_id: string | null;
  step_id: string | null;
  event_type: string;
  operator: string | null;
  quantity: number | null;
  description: string | null;
  metadata: unknown;
  created_at: string;
}

/** Limited event history, not complete lot genealogy or an inventory ledger. */
export function useProductionLogs(orderId?: string) {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ProductionLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchData = useCallback(async () => {
    if (!companyId) { setLogs([]); setLoadedCompanyId(null); setLoadError(false); setLoading(false); return false; }
    setLoading(true);
    let query = supabase.from('production_logs').select('*').eq('company_id', companyId)
      .order('created_at', { ascending: false }).limit(200);
    if (orderId) query = query.eq('production_order_id', orderId);
    const { data, error } = await query;
    if (companyIdRef.current !== companyId) return false;
    if (error) {
      console.error(error); toast.error('Erro ao carregar histórico');
      setLogs([]); setLoadedCompanyId(null); setLoadError(true); setLoading(false); return false;
    }
    setLogs(data || []); setLoadedCompanyId(companyId); setLoadError(false); setLoading(false);
    return true;
  }, [companyId, orderId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  return { logs: loadedCompanyId === companyId ? logs : [], loading, loadError, hasCompany: !!companyId, refetch: fetchData };
}
