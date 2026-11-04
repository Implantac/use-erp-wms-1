import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toastSuccess, toastError } from '@/lib/toastHelpers';
import {
  STAGE_LABEL,
  type PickOrderResult,
  type ShipOrderResult,
  type StageForm,
  type UpdateStageResult,
} from './types';

const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useOrderPickingMutations(stageForm: StageForm, onStageSuccess: () => void) {
  const qc = useQueryClient();

  const pickMut = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('wms_pick_order_stock', { p_order_id: orderId });
      if (error) throw error;
      return (data ?? {}) as PickOrderResult;
    },
    onSuccess: (data) => {
      const short = data?.lines_short || 0;
      if (short > 0) toastError(`Separação parcial: ${short} linha(s) sem saldo suficiente`);
      else toastSuccess(`Separação concluída — ${data?.total_picked || 0} unidade(s)`);
      qc.invalidateQueries({ queryKey: ['orders-for-picking'] });
      qc.invalidateQueries({ queryKey: ['orders-for-reservation'] });
      qc.invalidateQueries({ queryKey: ['stock_balances'] });
      qc.invalidateQueries({ queryKey: ['stock-reservations'] });
    },
    onError: (err) => toastError(`Falha na separação: ${errMessage(err)}`),
  });

  const shipMut = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('wms_ship_order', { p_order_id: orderId });
      if (error) throw error;
      return (data ?? {}) as ShipOrderResult;
    },
    onSuccess: (data) => {
      const units = data?.units_shipped || 0;
      toastSuccess(`Expedição registrada — ${data?.lines_shipped || 0} linha(s)${units > 0 ? ` e ${units} rolo(s)/peça(s)` : ''}`);
      qc.invalidateQueries({ queryKey: ['orders-for-picking'] });
      qc.invalidateQueries({ queryKey: ['stock-reservations'] });
    },
    onError: (err) => toastError(`Falha na expedição: ${errMessage(err)}`),
  });

  const stageMut = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('wms_update_shipment_stage', {
        p_order_id: orderId,
        p_stage: stageForm.stage,
        p_tracking_number: stageForm.tracking_number || null,
        p_carrier: stageForm.carrier || null,
        p_location: stageForm.location || null,
        p_notes: stageForm.notes || null,
      });
      if (error) throw error;
      return (data ?? {}) as UpdateStageResult;
    },
    onSuccess: (data) => {
      toastSuccess(`Expedição ${data?.shipment_number} → ${STAGE_LABEL[stageForm.stage]}`);
      qc.invalidateQueries({ queryKey: ['order-shipment'] });
      qc.invalidateQueries({ queryKey: ['orders-for-picking'] });
      onStageSuccess();
    },
    onError: (err) => toastError(`Falha: ${errMessage(err)}`),
  });

  return { pickMut, shipMut, stageMut };
}
