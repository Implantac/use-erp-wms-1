import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getActiveCompanyId, getActiveBranchId } from '@/core/stores/useEnterpriseStore';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { supplyChainService, SupplyChainMovement, MovementStatus } from '@/services/operational/supply-chain/supplyChainService';
import { supabase } from "@/integrations/supabase/client";
import { toast } from 'sonner';

export function useSupplyChain(filters?: { status?: MovementStatus[] }) {
  const { currentBranch, currentCompany, isLoading: isEnterpriseLoading } = useEnterprise();
  const [movements, setMovements] = useState<SupplyChainMovement[]>([]);
  const [loadedScope, setLoadedScope] = useState('');
  const [isDataLoading, setIsDataLoading] = useState(false);

  const branchId = currentBranch?.id;
  const statusKey = filters?.status?.join('|') ?? '';
  const statusFilter = useMemo(() => statusKey ? statusKey.split('|') as MovementStatus[] : undefined, [statusKey]);
  const scopeKey = `${currentCompany?.id ?? ''}:${branchId ?? ''}:${statusKey}`;
  const latestScope = useRef(scopeKey);
  latestScope.current = scopeKey;

  const fetchMovements = useCallback(async () => {
    if (!branchId || !currentCompany?.id || isEnterpriseLoading) return;
    
    setIsDataLoading(true);
    try {
      const data = await supplyChainService.getMovements({
        unit_id: branchId,
        status: statusFilter
      });
      if (latestScope.current !== scopeKey || getActiveCompanyId() !== currentCompany.id || getActiveBranchId() !== branchId) return;
      setMovements(data);
      setLoadedScope(scopeKey);
    } catch (error) {
      if (latestScope.current === scopeKey && getActiveCompanyId() === currentCompany.id && getActiveBranchId() === branchId) {
        setLoadedScope('');
        console.error('Error in useSupplyChain:', error);
        toast.error('Erro ao carregar movimentações');
      }
    } finally {
      setIsDataLoading(false);
    }
  }, [branchId, currentCompany?.id, scopeKey, statusFilter, isEnterpriseLoading]);

  useEffect(() => {
    if (!isEnterpriseLoading && branchId) {
      const timer = setTimeout(() => {
        fetchMovements();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [branchId, isEnterpriseLoading, fetchMovements]);

  useEffect(() => {
    if (isEnterpriseLoading || !branchId) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const channelName = `supply_chain_movements_${branchId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'supply_chain_movements',
          filter: `unit_id=eq.${branchId}`
        },
        (payload) => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            fetchMovements();
            if (payload.eventType === 'INSERT') {
              toast.success('Nova movimentação detectada.');
            }
          }, 500);
        }
      )
      .subscribe();

    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [branchId, isEnterpriseLoading, fetchMovements]);

  const updateStatus = async (id: string, status: MovementStatus) => {
    try {
      await supplyChainService.updateStatus(id, status);
      toast.success('Status atualizado com sucesso');
      fetchMovements();
    } catch (error) {
      toast.error('Erro ao atualizar status');
      throw error;
    }
  };

  const getMovementLedger = async (movementId: string) => {
    const companyId = getActiveCompanyId();
    if (!companyId) throw new Error('Empresa ativa não identificada para consultar o histórico.');
    const { data, error } = await supabase
      .from('supply_chain_ledger')
      .select('*')
      .eq('company_id', companyId)
      .eq('movement_id', movementId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  };

  return {
    movements: loadedScope === scopeKey && getActiveCompanyId() === currentCompany?.id ? movements : [],
    isLoading: isEnterpriseLoading || isDataLoading,
    refresh: fetchMovements,
    updateStatus,
    getMovementLedger
  };
}