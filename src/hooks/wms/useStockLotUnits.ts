import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import {
  stockLotUnitPayload,
  validateStockLotUnitDrafts,
  type StockLotUnit,
  type StockLotUnitDraft,
} from "@/lib/wms/stockLotUnits";

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

type StockLotUnitRow = Omit<StockLotUnit, "lot_number" | "product_code" | "product_name">;

interface LotIdentityRow {
  id: string;
  lot_number: string;
  product_code: string;
  product_name: string;
}

export interface RegisterStockLotUnitsResult {
  lot_id: string;
  request_id: string;
  unit_ids: string[];
  unit_count: number;
  total_quantity: number;
  idempotent_replay: boolean;
}

async function enrichUnits(rows: StockLotUnitRow[]): Promise<StockLotUnit[]> {
  if (rows.length === 0) return [];
  const lotIds = [...new Set(rows.map((row) => row.lot_id))];
  const response = await looseClient
    .from<LotIdentityRow[]>("stock_lots")
    .select("id, lot_number, product_code, product_name")
    .in("id", lotIds);
  const lots = new Map((response.data ?? []).map((lot) => [lot.id, lot]));
  return rows.map((row) => ({
    ...row,
    lot_number: lots.get(row.lot_id)?.lot_number,
    product_code: lots.get(row.lot_id)?.product_code,
    product_name: lots.get(row.lot_id)?.product_name,
  }));
}

export function useStockLotUnits() {
  const [units, setUnits] = useState<StockLotUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchUnits = useCallback(async (lotId?: string): Promise<StockLotUnit[]> => {
    setLoading(true);
    try {
      let query = looseClient
        .from<StockLotUnitRow[]>("stock_lot_units")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (lotId) query = query.eq("lot_id", lotId);
      const response = await query;
      if (response.error) throw new Error(response.error.message);
      const enriched = await enrichUnits(response.data ?? []);
      setUnits(enriched);
      return enriched;
    } catch (error) {
      throw new Error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const registerUnits = useCallback(async (
    lotId: string,
    drafts: StockLotUnitDraft[],
    existingTotal: number,
    lotTotal: number,
    idempotencyKey: string,
  ): Promise<RegisterStockLotUnitsResult> => {
    const validationError = validateStockLotUnitDrafts(drafts, existingTotal, lotTotal);
    if (validationError) throw new Error(validationError);
    setSaving(true);
    try {
      const { data, error } = await rpcClient.rpc("register_stock_lot_units", {
        p_lot_id: lotId,
        p_units: drafts.map(stockLotUnitPayload),
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return data as RegisterStockLotUnitsResult;
    } catch (error) {
      throw new Error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }, []);

  const inspectUnit = useCallback(async (
    unitId: string,
    decision: "approved" | "quarantine" | "rejected",
    reason?: string,
    defectCount = 0,
  ): Promise<StockLotUnit> => {
    setSaving(true);
    try {
      const { data, error } = await rpcClient.rpc("inspect_stock_lot_unit", {
        p_unit_id: unitId,
        p_decision: decision,
        p_reason: reason || null,
        p_notes: null,
        p_defect_count: defectCount,
      });
      if (error) throw new Error(error.message);
      return data as StockLotUnit;
    } catch (error) {
      throw new Error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }, []);

  const setPackingStatus = useCallback(async (
    unitId: string,
    status: "available" | "packed",
    location?: string,
  ): Promise<StockLotUnit> => {
    setSaving(true);
    try {
      const { data, error } = await rpcClient.rpc("set_stock_lot_unit_packing_status", {
        p_unit_id: unitId,
        p_status: status,
        p_location: location || null,
      });
      if (error) throw new Error(error.message);
      return data as StockLotUnit;
    } catch (error) {
      throw new Error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }, []);

  return { units, loading, saving, fetchUnits, registerUnits, inspectUnit, setPackingStatus };
}
