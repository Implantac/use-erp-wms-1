import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnterprise } from "@/core/auth/EnterpriseContext";
import { useAppStore } from "@/stores/useAppStore";
import { transferWorkflow, TransferStatus, ItemQuantity } from "@/services/operational/inventory/transferWorkflow";
import { toast } from "sonner";

export function useSupplyChainExecution() {
  const { currentBranch } = useEnterprise();
  const { user } = useAppStore();
  const queryClient = useQueryClient();
  const branchId = currentBranch?.id;

  const tasksQuery = useQuery({
    queryKey: ['supply-chain-tasks', branchId],
    queryFn: async () => {
      if (!branchId) return [];
      
      const { data, error } = await supabase
        .from('stock_transfer_orders')
        .select(`
          *,
          origin:origin_unit_id(name),
          destination:destination_unit_id(name),
          items:stock_transfer_items(
            *,
            product:product_id(name, code)
          )
        `)
        .or(`origin_unit_id.eq.${branchId},destination_unit_id.eq.${branchId}`)
        .not('current_status', 'in', '("ENCERRADA","CANCELADA")')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  const inTransitQuery = useQuery({
    queryKey: ['stock-in-transit', branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from('stock_transfer_orders')
        .select(`
          *,
          origin:origin_unit_id(name),
          items:stock_transfer_items(
            *,
            product:product_id(name, code)
          )
        `)
        .eq('destination_unit_id', branchId)
        .eq('current_status', 'EM TRÂNSITO');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  const transitionMutation = useMutation({
    mutationFn: async ({ transferId, toStatus, itemQuantities, quantity, notes }: {
      transferId: string,
      toStatus: TransferStatus,
      itemQuantities?: ItemQuantity[],
      quantity?: number,
      notes?: string
    }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      
      const correlationId = crypto.randomUUID();
      
      const result = await transferWorkflow.transition({
        transferId,
        toStatus,
        userId: user.id,
        itemQuantities,
        notes,
        correlationId
      });

      // This legacy flow does not write a second, non-atomic ledger entry in
      // the browser. The workflow's own server-side audit must be verified.
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supply-chain-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['stock-in-transit'] });
      toast.success("Status atualizado com sucesso");
    },
    onError: (error) => {
      console.error("Erro na transição:", error);
      toast.error("Falha ao atualizar status");
    }
  });

  return {
    tasks: tasksQuery.data || [],
    inTransit: inTransitQuery.data || [],
    isLoading: tasksQuery.isLoading || inTransitQuery.isLoading,
    isProcessing: transitionMutation.isPending,
    transition: transitionMutation.mutateAsync,
    refetch: () => {
      tasksQuery.refetch();
      inTransitQuery.refetch();
    }
  };
}


