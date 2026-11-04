import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import type { StockLotUnit } from "@/lib/wms/stockLotUnits";

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

export interface OrderReservationForUnits {
  id: string;
  lot_id: string | null;
  product_code: string;
  product_name: string;
  reserved_qty: number;
  picked_qty: number;
  status: string;
}

export interface StockLotUnitAllocation {
  id: string;
  unit_id: string;
  lot_id: string;
  order_id: string;
  reservation_id: string | null;
  quantity: number;
  status: "allocated" | "picked" | "shipped" | "released";
  allocated_at: string;
  picked_at: string | null;
  shipped_at: string | null;
}

export interface AllocateUnitsResult {
  order_id: string;
  request_id: string;
  allocation_ids: string[];
  unit_count: number;
  idempotent_replay: boolean;
}

export async function fetchOrderReservations(orderId: string): Promise<OrderReservationForUnits[]> {
  const response = await looseClient
    .from<OrderReservationForUnits[]>("stock_reservations")
    .select("id, lot_id, product_code, product_name, reserved_qty, picked_qty, status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (response.error) throw new Error(response.error.message);
  return response.data ?? [];
}

export async function fetchOrderUnitAllocations(orderId: string): Promise<StockLotUnitAllocation[]> {
  const response = await looseClient
    .from<StockLotUnitAllocation[]>("stock_lot_unit_allocations")
    .select("id, unit_id, lot_id, order_id, reservation_id, quantity, status, allocated_at, picked_at, shipped_at")
    .eq("order_id", orderId)
    .order("allocated_at", { ascending: true })
    .limit(500);
  if (response.error) throw new Error(response.error.message);
  return response.data ?? [];
}

export async function allocateUnitsToOrder(
  orderId: string,
  unitIds: string[],
  idempotencyKey: string,
): Promise<AllocateUnitsResult> {
  const { data, error } = await rpcClient.rpc("allocate_stock_lot_units_to_order", {
    p_order_id: orderId,
    p_unit_ids: unitIds,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(errorMessage(error));
  return data as AllocateUnitsResult;
}

export async function releaseUnitAllocation(allocationId: string): Promise<StockLotUnitAllocation> {
  const { data, error } = await rpcClient.rpc("release_stock_lot_unit_allocation", {
    p_allocation_id: allocationId,
  });
  if (error) throw new Error(errorMessage(error));
  return data as StockLotUnitAllocation;
}

export type { StockLotUnit };
