import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface ProductionRouteStep {
  id: string;
  route_id: string;
  sequence: number;
  step_name: string;
  sector_id: string | null;
  resource_id: string | null;
  setup_time_minutes: number;
  operation_time_minutes: number;
  description: string | null;
  created_at: string;
  sector_name?: string;
  resource_name?: string;
}

export interface ProductionRouteRow {
  id: string;
  code: string;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  version: string;
  description: string | null;
  is_active: boolean;
  total_time_minutes: number;
  created_at: string;
  updated_at: string;
  steps?: ProductionRouteStep[];
}

export function useProductionRoutes() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [routes, setRoutes] = useState<ProductionRouteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) { setRoutes([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('production_routes')
      .select('*')
      .eq('company_id', companyId)
      .order('code');
    if (companyIdRef.current !== companyId) return;
    if (error) { console.error(error); toast.error('Erro ao carregar rotas'); }
    else setRoutes(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (item: Partial<ProductionRouteRow>) => {
    if (!companyId) { toast.error('Selecione a empresa para cadastrar o roteiro'); return false; }
    const { error } = await supabase.from('production_routes').insert({ ...item, company_id: companyId } as TablesInsert<'production_routes'>);
    if (error) { toast.error('Erro ao criar rota'); return false; }
    toast.success('Rota cadastrada');
    await fetch();
    return true;
  };

  const update = async (id: string, updates: Partial<ProductionRouteRow>) => {
    if (!companyId) { toast.error('Selecione a empresa para alterar o roteiro'); return false; }
    const { data, error } = await supabase.from('production_routes').update({ ...updates, company_id: companyId, updated_at: new Date().toISOString() } as TablesUpdate<'production_routes'>).eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao atualizar rota'); return false; }
    toast.success('Rota atualizada');
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    if (!companyId) { toast.error('Selecione a empresa para excluir o roteiro'); return false; }
    // The route_steps FK has ON DELETE CASCADE: delete the parent in one
    // database statement. Never delete children before the parent succeeds.
    const { data, error } = await supabase.from('production_routes').delete().eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) {
      toast.error('Rota não excluída. Pode estar vinculada a uma OP ou faltar permissão.');
      return false;
    }
    toast.success('Rota excluída');
    await fetch();
    return true;
  };

  return { routes, loading, refetch: fetch, create, update, remove };
}

export function useProductionRouteSteps(routeId?: string) {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [steps, setSteps] = useState<ProductionRouteStep[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!routeId || !companyId) { setSteps([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('production_route_steps')
      .select('*, production_sectors(name), production_resources(name)')
      .eq('route_id', routeId).eq('company_id', companyId)
      .order('sequence');
    if (companyIdRef.current !== companyId) return;
    if (error) { console.error(error); }
    else setSteps((data || []).map((d) => ({
      ...d,
      sector_name: d.production_sectors?.name,
      resource_name: d.production_resources?.name,
    })));
    setLoading(false);
  }, [routeId, companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const addStep = async (step: Partial<ProductionRouteStep>) => {
    if (!routeId || !companyId) { toast.error('Selecione a empresa e o roteiro'); return false; }
    const { error } = await supabase.from('production_route_steps').insert({ ...step, route_id: routeId, company_id: companyId } as TablesInsert<'production_route_steps'>);
    if (error) { toast.error('Erro ao adicionar etapa'); return false; }
    toast.success('Etapa adicionada');
    await fetch();
    // Update total time on route
    await recalcTotalTime();
    return true;
  };

  const updateStep = async (id: string, updates: Partial<ProductionRouteStep>) => {
    if (!companyId) { toast.error('Selecione a empresa para alterar a etapa'); return; }
    const { data, error } = await supabase.from('production_route_steps').update(updates as TablesUpdate<'production_route_steps'>).eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao atualizar etapa'); return; }
    await fetch();
    await recalcTotalTime();
  };

  const removeStep = async (id: string) => {
    if (!companyId) { toast.error('Selecione a empresa para excluir a etapa'); return; }
    const { data, error } = await supabase.from('production_route_steps').delete().eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao excluir etapa'); return; }
    toast.success('Etapa removida');
    await fetch();
    await recalcTotalTime();
  };

  const recalcTotalTime = async () => {
    if (!routeId || !companyId) return;
    const { data } = await supabase.from('production_route_steps').select('setup_time_minutes, operation_time_minutes').eq('route_id', routeId).eq('company_id', companyId);
    const total = (data || []).reduce((s: number, r: { setup_time_minutes: number | null; operation_time_minutes: number | null }) => s + (r.setup_time_minutes || 0) + (r.operation_time_minutes || 0), 0);
    await supabase.from('production_routes').update({ total_time_minutes: total, updated_at: new Date().toISOString() } as TablesUpdate<'production_routes'>).eq('id', routeId).eq('company_id', companyId);
  };

  return { steps, loading, refetch: fetch, addStep, updateStep, removeStep };
}
