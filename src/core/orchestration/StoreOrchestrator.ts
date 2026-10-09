import { useEventBus } from '@/core/events/useEventBus';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { replenishmentEngine } from '@/services/operational/inventory/replenishmentEngine';
import { toastSuccess, toastError } from '@/lib/toastHelpers';

/**
 * Store Orchestrator
 * 
 * Orquestra a inteligência prescritiva e tarefas automáticas da unidade (Minha Loja).
 * Item 19 & 20 do Roadmap Enterprise.
 */
export const useStoreOrchestrator = (providedCompanyId?: string) => {
  const { currentCompany, currentBranch, isLoading: isContextLoading } = useEnterprise();
  const companyId = providedCompanyId || currentCompany?.id;
  const branchId = currentBranch?.id;
  const eventBus = useEventBus();
  
  const lastAnalyzedBranchId = useRef<string | null>(null);

  /**
   * P13 - Ruptura Antecipada & Reabastecimento Automático
   * Analisa periodicamente ou sob evento o status da loja.
   */
  const runPrescriptiveAnalysis = useCallback(async (targetBranchId: string) => {
    if (!companyId || !targetBranchId) return;

    console.log('[StoreOrchestrator] Running prescriptive analysis for branch:', targetBranchId);

    // 1. Buscar produtos com baixo estoque nesta filial
    const { data: lowStockItems } = await (supabase as any)
      .from('stock_balances')
      .select('product_id')
      .eq('branch_id', targetBranchId)
      .lt('quantity', 10) // Threshold simplificado para o MVP
      .limit(5);

    if (!lowStockItems) return;

    for (const item of lowStockItems) {
      const recommendation = await replenishmentEngine.getPrescriptiveRecommendation(item.product_id, targetBranchId);
      
      if (recommendation && recommendation.urgency === 'critical') {
        // Criar uma tarefa operacional automática (Item 19)
        const { data: existingTask } = await (supabase as any)
          .from('operational_tasks')
          .select('id')
          .eq('branch_id', targetBranchId)
          .eq('category', 'replenishment')
          .eq('title', `Ruptura Crítica: ${recommendation.productName}`)
          .eq('status', 'pending')
          .maybeSingle();

        if (!existingTask) {
          await (supabase as any)
            .from('operational_tasks')
            .insert({
              company_id: companyId,
              branch_id: targetBranchId,
              category: 'replenishment',
              priority: 'critical',
              title: `Ruptura Crítica: ${recommendation.productName}`,
              description: `Análise: ${recommendation.reason} Recomendação: ${recommendation.suggestedQty} un de ${recommendation.sourceBranchName || 'Compra'}.`,
              status: 'pending',
              metadata: { recommendation }
            });
            
          toastSuccess(`Nova tarefa crítica gerada para ${recommendation.productName}`);
        }
      }
    }
  }, [companyId]);

  useEffect(() => {
    if (!branchId || isContextLoading) return;
    if (lastAnalyzedBranchId.current === branchId) return;
    
    lastAnalyzedBranchId.current = branchId;
    runPrescriptiveAnalysis(branchId);

    // Subscrever a eventos que podem disparar re-análise
    const unsubscribeStock = eventBus.subscribe('STOCK_MOVED', (payload) => {
      if (payload.branchId === branchId) {
        runPrescriptiveAnalysis(branchId);
      }
    });

    return () => {
      unsubscribeStock();
    };
  }, [branchId, eventBus, isContextLoading, runPrescriptiveAnalysis]);

  return {
    runPrescriptiveAnalysis
  };
};
