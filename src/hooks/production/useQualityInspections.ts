import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface QualityInspection {
  id: string;
  company_id: string;
  production_order_id: string | null;
  step_id: string | null;
  inspector: string;
  inspection_date: string;
  approved_quantity: number;
  rejected_quantity: number;
  defect_reason: string | null;
  defect_category: string | null;
  severity: string;
  corrective_action: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  order_number?: string;
  /** Unit of the linked OP; quality quantities must not be assumed to be "peças". */
  order_unit?: string;
  /** Resolved by the page from production_steps because step_id has no FK join. */
  step_name?: string;
}

type InspectionRow = Omit<QualityInspection, 'order_number' | 'order_unit' | 'step_name'> & {
  production_orders?: { order_number?: string; unit?: string } | null;
};

export function useQualityInspections(productionOrderId?: string) {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [inspections, setInspections] = useState<QualityInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetch = useCallback(async () => {
    if (!companyId) {
      setInspections([]);
      setLoadedCompanyId(null);
      setLoadError(false);
      setLoading(false);
      return false;
    }
    setLoading(true);
    // quality_inspections.step_id has no foreign key to production_steps, so
    // PostgREST cannot join it. Select only the real OP relationship and let
    // the page resolve step names from its already-loaded step catalogue.
    let query = supabase
      .from('quality_inspections')
      .select('*, production_orders(order_number, unit)')
      .eq('company_id', companyId);
    if (productionOrderId) query = query.eq('production_order_id', productionOrderId);
    const { data, error } = await query.order('inspection_date', { ascending: false });
    if (companyIdRef.current !== companyId) return false;
    if (error) {
      console.error(error);
      toast.error('Erro ao carregar inspeções');
      setInspections([]);
      setLoadedCompanyId(null);
      setLoadError(true);
      setLoading(false);
      return false;
    }
    setInspections(((data as InspectionRow[] | null) || []).map((row) => ({
      ...row,
      order_number: row.production_orders?.order_number,
      order_unit: row.production_orders?.unit,
    })));
    setLoadedCompanyId(companyId);
    setLoadError(false);
    setLoading(false);
    return true;
  }, [companyId, productionOrderId]);

  useEffect(() => { void fetch(); }, [fetch]);

  const create = async (inspection: Partial<QualityInspection>) => {
    if (!companyId || loadedCompanyId !== companyId) {
      toast.error('Selecione e carregue a empresa ativa antes de registrar a inspeção');
      return false;
    }
    if (!inspection.production_order_id || !inspection.inspector?.trim()) {
      toast.error('Informe a OP e o inspetor');
      return false;
    }
    const payload: TablesInsert<'quality_inspections'> = {
      company_id: companyId,
      production_order_id: inspection.production_order_id,
      step_id: inspection.step_id || null,
      inspector: inspection.inspector.trim(),
      inspection_date: inspection.inspection_date,
      approved_quantity: inspection.approved_quantity ?? 0,
      rejected_quantity: inspection.rejected_quantity ?? 0,
      defect_reason: inspection.defect_reason || null,
      defect_category: inspection.defect_category || null,
      severity: inspection.severity || 'minor',
      corrective_action: inspection.corrective_action || null,
      notes: inspection.notes || null,
      status: inspection.status || 'open',
    };
    const { data, error } = await supabase.from('quality_inspections').insert(payload).select('id');
    if (companyIdRef.current !== companyId) return false;
    if (error || !data?.length) { toast.error('Erro ao registrar inspeção'); return false; }
    toast.success('Inspeção registrada');
    await fetch();
    return true;
  };

  return {
    inspections: loadedCompanyId === companyId ? inspections : [],
    loading,
    loadError,
    hasCompany: !!companyId,
    refetch: fetch,
    create,
  };
}
