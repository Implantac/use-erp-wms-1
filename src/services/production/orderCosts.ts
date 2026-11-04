import { supabase } from "@/integrations/supabase/client";
import type { ConsumptionCostLine } from "@/lib/pcp/orderCostComparison";

interface ConsumptionRow {
  component_code: string;
  expected_quantity: number;
  consumed_quantity: number;
  lot_id: string | null;
}

interface LotCostRow {
  id: string;
  unit_cost: number | null;
}

interface ProductCostRow {
  id: string;
  cost_price: number | null;
}

/** Consumos reais da OP (material_consumptions) com o custo do lote usado. */
export async function fetchOrderConsumptions(productionOrderId: string): Promise<ConsumptionCostLine[]> {
  const { data, error } = await supabase
    .from("material_consumptions")
    .select("component_code, expected_quantity, consumed_quantity, lot_id")
    .eq("production_order_id", productionOrderId)
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ConsumptionRow[];

  const lotIds = [...new Set(rows.map((row) => row.lot_id).filter(Boolean))] as string[];
  const lotCosts = new Map<string, number | null>();
  if (lotIds.length > 0) {
    const { data: lots, error: lotError } = await supabase
      .from("stock_lots")
      .select("id, unit_cost")
      .in("id", lotIds);
    if (lotError) throw new Error(lotError.message);
    for (const lot of (lots ?? []) as unknown as LotCostRow[]) lotCosts.set(lot.id, lot.unit_cost);
  }

  return rows.map((row) => ({
    componentCode: row.component_code,
    expectedQuantity: Number(row.expected_quantity) || 0,
    consumedQuantity: Number(row.consumed_quantity) || 0,
    lotUnitCost: row.lot_id ? (lotCosts.get(row.lot_id) ?? null) : null,
  }));
}

/** Custo de referência cadastrado (products.cost_price) dos componentes. */
export async function fetchComponentReferenceCosts(
  companyId: string,
  componentIds: string[],
): Promise<Map<string, number | null>> {
  const costs = new Map<string, number | null>();
  if (componentIds.length === 0) return costs;
  const { data, error } = await supabase
    .from("products")
    .select("id, cost_price")
    .eq("company_id", companyId)
    .in("id", componentIds);
  if (error) throw new Error(error.message);
  for (const product of (data ?? []) as unknown as ProductCostRow[]) {
    costs.set(product.id, product.cost_price);
  }
  return costs;
}
