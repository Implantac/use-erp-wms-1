import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import {
  fiberClassificationPayload,
  validateFiberReceipt,
  type FiberClassification,
  type FiberReceiptFormValues,
} from "@/lib/wms/fiberReceipt";

interface RpcClient {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

interface LooseClient {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
  };
}

const rpcClient = supabase as unknown as RpcClient;
const looseClient = supabase as unknown as LooseClient;

export interface FiberReceiptResult {
  lot_id: string;
  lot_number: string;
  product_id: string;
  quantity: number;
  remaining_qty: number;
  quality_status: string;
  balance_quantity: number;
  idempotent_replay: boolean;
}

export interface FiberLotClassificationRow extends FiberClassification {
  id: string;
  company_id: string;
  lot_id: string;
  classified_at?: string | null;
}

export function useFiberReceipt() {
  const [saving, setSaving] = useState(false);

  const register = useCallback(async (
    values: FiberReceiptFormValues,
    idempotencyKey: string,
  ): Promise<FiberReceiptResult> => {
    const validationError = validateFiberReceipt(values);
    if (validationError) throw new Error(validationError);

    setSaving(true);
    try {
      const { data, error } = await rpcClient.rpc("register_fiber_receipt", {
        p_product_id: values.product_id,
        p_lot_number: values.lot_number.trim(),
        p_quantity_kg: values.quantity_kg,
        p_idempotency_key: idempotencyKey,
        p_supplier_id: values.supplier_id || null,
        p_supplier_name: values.supplier_name.trim(),
        p_location: values.location.trim() || null,
        p_origin_reference: values.origin_reference.trim() || null,
        p_unit_cost: values.unit_cost ?? 0,
        p_classification: fiberClassificationPayload(values),
      });
      if (error) throw new Error(error.message);
      return data as FiberReceiptResult;
    } catch (error) {
      throw new Error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }, []);

  const classify = useCallback(async (
    lotId: string,
    classification: FiberClassification,
  ): Promise<FiberLotClassificationRow | null> => {
    setSaving(true);
    try {
      const { data, error } = await rpcClient.rpc("classify_fiber_lot", {
        p_lot_id: lotId,
        p_classification: fiberClassificationPayload(classification),
      });
      if (error) throw new Error(error.message);
      return data as FiberLotClassificationRow | null;
    } catch (error) {
      throw new Error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }, []);

  const fetchClassifications = useCallback(async (
    lotIds: string[],
  ): Promise<Map<string, FiberLotClassificationRow>> => {
    const result = new Map<string, FiberLotClassificationRow>();
    if (lotIds.length === 0) return result;
    const { data, error } = await looseClient
      .from("fiber_lot_classifications")
      .select("*")
      .in("lot_id", lotIds);
    if (error) throw new Error(error.message);
    for (const row of (data as FiberLotClassificationRow[] | null) ?? []) {
      result.set(row.lot_id, row);
    }
    return result;
  }, []);

  return { saving, register, classify, fetchClassifications };
}
