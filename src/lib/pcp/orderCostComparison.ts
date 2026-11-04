export interface BomCostLine {
  componentCode: string;
  componentName: string;
  quantityPerUnit: number;
  wastePercentage: number;
  /** Custo de referência cadastrado do componente; null/<=0 = não cadastrado. */
  referenceCost: number | null;
}

export interface ConsumptionCostLine {
  componentCode: string;
  expectedQuantity: number;
  consumedQuantity: number;
  /** Custo unitário do lote efetivamente consumido; null = lote sem custo. */
  lotUnitCost: number | null;
}

export interface OrderCostLine {
  componentCode: string;
  componentName: string;
  plannedQty: number;
  plannedCost: number | null;
  actualQty: number;
  actualCost: number | null;
  hasReferenceCost: boolean;
  hasActualCost: boolean;
}

export interface OrderCostComparison {
  lines: OrderCostLine[];
  plannedTotal: number;
  /** complete = toda a ficha tem custo de referência; none = nenhuma tem. */
  plannedCoverage: "complete" | "partial" | "none";
  actualTotal: number;
  hasActual: boolean;
  actualCostComplete: boolean;
  variance: number | null;
  variancePct: number | null;
}

/**
 * Custo previsto x real de materiais da OP, só com números cadastrados:
 * previsto = ficha (quantidade x (1+perda)) x custo de referência do
 * componente; real = consumo registrado x custo do lote consumido.
 * Componente sem custo de referência não entra no previsto e marca a
 * cobertura como parcial — nenhum custo é estimado.
 */
export function buildOrderCostComparison(input: {
  plannedQuantity: number;
  bomLines: BomCostLine[];
  consumptions: ConsumptionCostLine[];
}): OrderCostComparison {
  const consumptionsByCode = new Map<string, ConsumptionCostLine[]>();
  for (const consumption of input.consumptions) {
    const list = consumptionsByCode.get(consumption.componentCode) ?? [];
    list.push(consumption);
    consumptionsByCode.set(consumption.componentCode, list);
  }

  const lines: OrderCostLine[] = input.bomLines.map((line) => {
    const plannedQty = input.plannedQuantity * line.quantityPerUnit * (1 + (line.wastePercentage || 0) / 100);
    const hasReferenceCost = line.referenceCost !== null && Number.isFinite(line.referenceCost) && line.referenceCost > 0;
    const consumptions = consumptionsByCode.get(line.componentCode) ?? [];
    const actualQty = consumptions.reduce((sum, item) => sum + (Number(item.consumedQuantity) || 0), 0);
    const costed = consumptions.filter((item) => item.lotUnitCost !== null && Number.isFinite(item.lotUnitCost));
    const actualCost = consumptions.length === 0
      ? null
      : costed.reduce((sum, item) => sum + (Number(item.consumedQuantity) || 0) * (item.lotUnitCost as number), 0);
    return {
      componentCode: line.componentCode,
      componentName: line.componentName,
      plannedQty,
      plannedCost: hasReferenceCost ? plannedQty * (line.referenceCost as number) : null,
      actualQty,
      actualCost,
      hasReferenceCost,
      hasActualCost: consumptions.length > 0 && costed.length === consumptions.length,
    };
  });

  const pricedLines = lines.filter((line) => line.plannedCost !== null);
  const plannedTotal = pricedLines.reduce((sum, line) => sum + (line.plannedCost as number), 0);
  const plannedCoverage = lines.length === 0 || pricedLines.length === 0
    ? "none"
    : pricedLines.length === lines.length ? "complete" : "partial";

  const actualLines = lines.filter((line) => line.actualCost !== null);
  const actualTotal = actualLines.reduce((sum, line) => sum + (line.actualCost as number), 0);
  const hasActual = input.consumptions.length > 0;
  const actualCostComplete = hasActual && lines.every((line) => line.actualQty === 0 || line.hasActualCost);

  const variance = hasActual && plannedCoverage === "complete" ? actualTotal - plannedTotal : null;
  const variancePct = variance !== null && plannedTotal > 0 ? (variance / plannedTotal) * 100 : null;

  return {
    lines,
    plannedTotal,
    plannedCoverage,
    actualTotal,
    hasActual,
    actualCostComplete,
    variance,
    variancePct,
  };
}
