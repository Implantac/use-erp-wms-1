import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";

interface RpcClient {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

interface LooseQuery<T> extends PromiseLike<{ data: T | null; error: { message: string } | null }> {
  select: (columns: string) => LooseQuery<T>;
  eq: (column: string, value: unknown) => LooseQuery<T>;
  in: (column: string, values: unknown[]) => LooseQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => LooseQuery<T>;
  limit: (count: number) => LooseQuery<T>;
}

interface LooseClient {
  from: <T>(table: string) => LooseQuery<T>;
}

const rpcClient = supabase as unknown as RpcClient;
const looseClient = supabase as unknown as LooseClient;

export interface ReworkOrderRow {
  id: string;
  original_order_id: string;
  original_lot_id: string;
  rework_order_id: string;
  output_lot_id: string | null;
  quantity: number;
  reason: string;
  status: string;
  created_at: string;
}

export interface OriginalOrderOption {
  id: string;
  order_number: string;
  status: string;
}

export interface CreateReworkResult {
  rework_id: string;
  rework_order_id: string;
  rework_order_number?: string;
  status: string;
  idempotent_replay: boolean;
}

export async function fetchOriginalOrderOptions(productId: string): Promise<OriginalOrderOption[]> {
  const response = await looseClient
    .from<OriginalOrderOption[]>("production_orders")
    .select("id, order_number, status")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (response.error) throw new Error(response.error.message);
  return response.data ?? [];
}

export async function fetchReworksForLot(lotId: string): Promise<ReworkOrderRow[]> {
  const response = await looseClient
    .from<ReworkOrderRow[]>("production_rework_orders")
    .select("id, original_order_id, original_lot_id, rework_order_id, output_lot_id, quantity, reason, status, created_at")
    .eq("original_lot_id", lotId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (response.error) throw new Error(response.error.message);
  return response.data ?? [];
}

export async function createReworkOrder(input: {
  originalOrderId: string;
  originalLotId: string;
  quantity: number;
  reason: string;
  idempotencyKey: string;
}): Promise<CreateReworkResult> {
  const { data, error } = await rpcClient.rpc("create_rework_order", {
    p_original_order_id: input.originalOrderId,
    p_original_lot_id: input.originalLotId,
    p_quantity: input.quantity,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(errorMessage(error));
  return data as CreateReworkResult;
}

export async function fetchReworkByOrderId(reworkOrderId: string): Promise<ReworkOrderRow | null> {
  const response = await looseClient
    .from<ReworkOrderRow[]>("production_rework_orders")
    .select("id, original_order_id, original_lot_id, rework_order_id, output_lot_id, quantity, reason, status, created_at")
    .eq("rework_order_id", reworkOrderId)
    .limit(1);
  if (response.error) throw new Error(response.error.message);
  return (response.data ?? [])[0] ?? null;
}

export async function completeReworkOrder(input: {
  reworkOrderId: string;
  idempotencyKey: string;
  producedQuantity: number;
  rejectedQuantity: number;
  outputLotNumber?: string | null;
}): Promise<Record<string, unknown>> {
  const { data, error } = await rpcClient.rpc("complete_rework_order", {
    p_rework_order_id: input.reworkOrderId,
    p_idempotency_key: input.idempotencyKey,
    p_produced_quantity: input.producedQuantity,
    p_rejected_quantity: input.rejectedQuantity,
    p_output_lot_number: input.outputLotNumber ?? null,
  });
  if (error) throw new Error(errorMessage(error));
  return data as Record<string, unknown>;
}

export async function fetchOrderNumbers(orderIds: string[]): Promise<Map<string, string>> {
  if (orderIds.length === 0) return new Map();
  const response = await looseClient
    .from<OriginalOrderOption[]>("production_orders")
    .select("id, order_number, status")
    .in("id", orderIds)
    .limit(200);
  if (response.error) throw new Error(response.error.message);
  return new Map((response.data ?? []).map((row) => [row.id, row.order_number]));
}
