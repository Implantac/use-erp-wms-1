import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";

interface RpcClient {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

const rpcClient = supabase as unknown as RpcClient;

export interface OutsourcingSendRow {
  id: string;
  production_order_step_id: string | null;
  supplier_name: string;
  service_description: string | null;
  sent_date: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  quantity_sent: number;
  quantity_returned: number | null;
  quantity_rejected: number | null;
  status: string;
  created_at: string;
}

export async function fetchOutsourcingForOrder(productionOrderId: string): Promise<OutsourcingSendRow[]> {
  const { data, error } = await supabase
    .from("outsourcing_orders")
    .select("id, production_order_step_id, supplier_name, service_description, sent_date, expected_return_date, actual_return_date, quantity_sent, quantity_returned, quantity_rejected, status, created_at")
    .eq("production_order_id", productionOrderId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OutsourcingSendRow[];
}

export async function sendOrderStepToSupplier(input: {
  stepId: string;
  supplierName: string;
  quantity: number;
  expectedReturnDate?: string | null;
  serviceDescription?: string | null;
  idempotencyKey?: string | null;
}): Promise<Record<string, unknown>> {
  const { data, error } = await rpcClient.rpc("send_order_step_to_supplier", {
    p_step_id: input.stepId,
    p_supplier_name: input.supplierName.trim(),
    p_quantity: input.quantity,
    p_expected_return_date: input.expectedReturnDate ?? null,
    p_service_description: input.serviceDescription?.trim() || null,
    p_idempotency_key: input.idempotencyKey ?? null,
  });
  if (error) throw new Error(errorMessage(error));
  return data as Record<string, unknown>;
}

export async function receiveOrderStepFromSupplier(input: {
  outsourcingOrderId: string;
  quantityReturned: number;
  quantityRejected: number;
}): Promise<Record<string, unknown>> {
  const { data, error } = await rpcClient.rpc("receive_order_step_from_supplier", {
    p_outsourcing_order_id: input.outsourcingOrderId,
    p_quantity_returned: input.quantityReturned,
    p_quantity_rejected: input.quantityRejected,
  });
  if (error) throw new Error(errorMessage(error));
  return data as Record<string, unknown>;
}
