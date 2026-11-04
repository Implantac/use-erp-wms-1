import { describe, expect, it } from "vitest";
import { buildOrderCostComparison, type BomCostLine, type ConsumptionCostLine } from "./orderCostComparison";

const bom: BomCostLine[] = [
  { componentCode: "FIO-30", componentName: "Fio 30/1", quantityPerUnit: 0.5, wastePercentage: 10, referenceCost: 20 },
  { componentCode: "GOMA", componentName: "Goma", quantityPerUnit: 0.1, wastePercentage: 0, referenceCost: null },
];

describe("custo previsto x real da OP (T92)", () => {
  it("previsto usa ficha com perda e custo de referência cadastrado", () => {
    const result = buildOrderCostComparison({ plannedQuantity: 100, bomLines: bom, consumptions: [] });
    expect(result.lines[0].plannedQty).toBeCloseTo(55);
    expect(result.lines[0].plannedCost).toBeCloseTo(1100);
    expect(result.plannedCoverage).toBe("partial");
    expect(result.plannedTotal).toBeCloseTo(1100);
    expect(result.variance).toBeNull();
  });

  it("real soma consumo x custo do lote e a variação só sai com previsto completo", () => {
    const consumptions: ConsumptionCostLine[] = [
      { componentCode: "FIO-30", expectedQuantity: 55, consumedQuantity: 58, lotUnitCost: 21 },
    ];
    const partial = buildOrderCostComparison({ plannedQuantity: 100, bomLines: bom, consumptions });
    expect(partial.actualTotal).toBeCloseTo(1218);
    expect(partial.variance).toBeNull();

    const full = buildOrderCostComparison({
      plannedQuantity: 100,
      bomLines: [{ ...bom[0] }],
      consumptions,
    });
    expect(full.plannedCoverage).toBe("complete");
    expect(full.variance).toBeCloseTo(118);
    expect(full.variancePct).toBeCloseTo(10.727, 2);
  });

  it("sem consumo registrado, real fica pendente e nada é estimado", () => {
    const result = buildOrderCostComparison({ plannedQuantity: 100, bomLines: bom, consumptions: [] });
    expect(result.hasActual).toBe(false);
    expect(result.actualTotal).toBe(0);
    expect(result.lines[0].actualCost).toBeNull();
  });

  it("consumo sem custo de lote marca o real como incompleto", () => {
    const result = buildOrderCostComparison({
      plannedQuantity: 100,
      bomLines: [{ ...bom[0] }],
      consumptions: [{ componentCode: "FIO-30", expectedQuantity: 55, consumedQuantity: 55, lotUnitCost: null }],
    });
    expect(result.actualCostComplete).toBe(false);
  });
});
