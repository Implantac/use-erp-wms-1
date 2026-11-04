/**
 * Rolos/peças são unidades físicas de um lote de estoque.
 *
 * Eles não criam saldo paralelo: a quantidade continua pertencendo ao
 * stock_lot e ao stock_balances. A unidade serve para identificar,
 * inspecionar, localizar e embalar cada rolo/peça.
 */

export type StockLotUnitType = "roll" | "piece" | "bale" | "package";
export type StockLotUnitStatus = "available" | "reserved" | "packed" | "shipped" | "consumed" | "blocked";
export type StockLotUnitQualityStatus = "pending" | "approved" | "quarantine" | "rejected" | "blocked";

export interface StockLotUnitDraft {
  unit_code: string;
  unit_type: StockLotUnitType;
  quantity: number | null;
  length_m?: number | null;
  width_cm?: number | null;
  weight_kg?: number | null;
  location?: string;
}

export interface StockLotUnit extends Required<Omit<StockLotUnitDraft, "quantity" | "location">> {
  id: string;
  company_id: string;
  lot_id: string;
  lot_number?: string;
  product_code?: string;
  product_name?: string;
  production_order_id?: string | null;
  quantity: number;
  unit: string;
  location?: string | null;
  status: StockLotUnitStatus;
  quality_status: StockLotUnitQualityStatus;
  inspected_at?: string | null;
  packed_at?: string | null;
  created_at: string;
}

export const stockLotUnitTypeLabels: Record<StockLotUnitType, string> = {
  roll: "Rolo",
  piece: "Peça",
  bale: "Fardo",
  package: "Pacote",
};

export function validateStockLotUnitDrafts(
  drafts: readonly StockLotUnitDraft[],
  existingTotal: number,
  lotTotal: number,
): string | null {
  if (drafts.length === 0) return "Adicione ao menos um rolo/peça para registrar.";
  const codes = new Set<string>();
  let draftTotal = 0;

  for (const draft of drafts) {
    const code = draft.unit_code.trim();
    if (!code) return "Informe o código/etiqueta de cada rolo/peça.";
    const normalized = code.toLowerCase();
    if (codes.has(normalized)) return `O código ${code} está repetido nesta divisão.`;
    codes.add(normalized);
    if (typeof draft.quantity !== "number" || !Number.isFinite(draft.quantity) || draft.quantity <= 0) {
      return `Informe uma quantidade válida para ${code}.`;
    }
    if ((draft.length_m ?? 0) < 0 || (draft.width_cm ?? 0) < 0 || (draft.weight_kg ?? 0) < 0) {
      return `As medidas de ${code} não podem ser negativas.`;
    }
    draftTotal += draft.quantity;
  }

  if (existingTotal + draftTotal > lotTotal + 0.0005) {
    return "A soma dos rolos/peças não pode passar da quantidade física do lote.";
  }
  return null;
}

export function stockLotUnitPayload(draft: StockLotUnitDraft): StockLotUnitDraft {
  return {
    unit_code: draft.unit_code.trim(),
    unit_type: draft.unit_type,
    quantity: draft.quantity,
    length_m: draft.length_m ?? null,
    width_cm: draft.width_cm ?? null,
    weight_kg: draft.weight_kg ?? null,
    location: draft.location?.trim() || undefined,
  };
}

export function formatStockLotUnitMeasures(unit: Pick<StockLotUnit, "length_m" | "width_cm" | "weight_kg">): string | null {
  const parts: string[] = [];
  if (typeof unit.length_m === "number") parts.push(`${unit.length_m} m`);
  if (typeof unit.width_cm === "number") parts.push(`${unit.width_cm} cm`);
  if (typeof unit.weight_kg === "number") parts.push(`${unit.weight_kg} kg`);
  return parts.length ? parts.join(" · ") : null;
}

export interface UnitAllocationCapacity {
  lot_id: string;
  capacity: number;
  allocated: number;
}

type AllocatableUnit = Pick<StockLotUnit, "unit_code" | "lot_id" | "quantity" | "status" | "quality_status">;

/**
 * Um rolo só entra no pedido se estiver aprovado, embalado e couber na
 * quantidade separável da reserva daquele lote (sem passar do pedido).
 */
export function validateUnitAllocationSelection(
  units: readonly AllocatableUnit[],
  capacities: readonly UnitAllocationCapacity[],
): string | null {
  if (units.length === 0) return "Selecione ao menos um rolo/peça para vincular ao pedido.";
  const byLot = new Map<string, number>();
  for (const unit of units) {
    if (unit.quality_status !== "approved") return `O rolo/peça ${unit.unit_code} precisa estar aprovado.`;
    if (unit.status !== "packed") return `O rolo/peça ${unit.unit_code} precisa estar embalado.`;
    byLot.set(unit.lot_id, (byLot.get(unit.lot_id) ?? 0) + unit.quantity);
  }
  for (const [lotId, total] of byLot) {
    const capacity = capacities.find((item) => item.lot_id === lotId);
    if (!capacity) return "Um dos rolos pertence a um lote sem reserva separável neste pedido.";
    if (capacity.allocated + total > capacity.capacity + 0.0005) {
      return "Os rolos selecionados excedem a quantidade reservada do lote neste pedido.";
    }
  }
  return null;
}
