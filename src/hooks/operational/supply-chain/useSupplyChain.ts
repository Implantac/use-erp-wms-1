import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getActiveCompanyId, getActiveBranchId } from '@/core/stores/useEnterpriseStore';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { supplyChainService, SupplyChainMovement, MovementStatus } from '@/services/operational/supply-chain/supplyChainService';
import { supabase } from "@/integrations/supabase/client";
import { toast } from 'sonner';

export function useSupplyChain(filters?: { status?: MovementStatus[]; scope?: 'unit' | 'group' }) {
  const { currentBranch, currentCompany, isLoading: isEnterpriseLoading } = useEnterprise();
  const [movements, setMovements] = useState<SupplyChainMovement[]>([]);
  const [loadedScope, setLoadedScope] = useState('');
  const [isDataLoading, setIsDataLoading] = useState(false);

  const branchId = currentBranch?.id;
  const statusKey = filters?.status?.join('|') ?? '';
  const statusFilter = useMemo(() => statusKey ? statusKey.split('|') as MovementStatus[] : undefined, [statusKey]);
  const scopeKey = `${currentCompany?.id ?? ''}:${branchId ?? ''}:${statusKey}:${filters?.scope ?? 'unit'}`;
  const latestScope = useRef(scopeKey);
  latestScope.current = scopeKey;

  const fetchMovements = useCallback(async () => {
    if (!branchId || !currentCompany?.id || isEnterpriseLoading) return;
    
    setIsDataLoading(true);
    try {
      const data = await supplyChainService.getMovements({
        unit_id: branchId,
        status: statusFilter,
        scope: filters?.scope ?? 'unit'
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

  // Referência sempre atual para o efeito de Realtime assinar uma única vez
  // por unidade, sem re-assinar a cada nova identidade de fetchMovements.
  const fetchMovementsRef = useRef(fetchMovements);
  fetchMovementsRef.current = fetchMovements;

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
    // Tópico único por assinatura: o cliente Realtime reutiliza o canal de um
    // tópico já existente, e chamar .on() num canal já subscrito lança
    // "cannot add postgres_changes callbacks ... after subscribe()". O sufixo
    // garante um canal novo a cada assinatura (o cleanup remove o anterior).
    const channelName = `supply_chain_movements_${branchId}_${Math.random().toString(36).slice(2, 10)}`;
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
            fetchMovementsRef.current();
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
  }, [branchId, isEnterpriseLoading]);

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
    // Leitura autorizada no servidor (RPC group_transfer_detail): a RLS por
    // empresa escondia o histórico das transferências das lojas do gestor.
    const { data, error } = await (supabase as any).rpc('group_transfer_detail', { p_transfer_id: movementId });
    if (error) throw error;
    const rows = (data?.history ?? []) as any[];
    return rows.map((r: any, i: number) => ({
      id: r.id,
      movement_id: movementId,
      previous_status: i === 0 ? null : rows[i - 1].status,
      new_status: r.status,
      created_at: r.created_at,
      notes: r.notes,
    }));
  };

  return {
    movements: loadedScope === scopeKey && getActiveCompanyId() === currentCompany?.id ? movements : [],
    isLoading: isEnterpriseLoading || isDataLoading,
    refresh: fetchMovements,
    updateStatus,
    getMovementLedger
  };
}