import { describe, expect, it } from "vitest";
import { buildWipPanel, wipAgeBucket, type WipOrderInput, type WipStepInput } from "./wipPanel";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const orders: WipOrderInput[] = [
  { id: "op-1", order_number: "OP-1", product_name: "Tecido A", status: "in_progress", quantity: 100, produced_quantity: 40, unit: "m", created_at: iso(NOW - 10 * day) },
  { id: "op-2", order_number: "OP-2", product_name: "Tecido B", status: "planned", quantity: 50, produced_quantity: 0, unit: "m", created_at: iso(NOW - 1 * day) },
  { id: "op-3", order_number: "OP-3", product_name: "Tecido C", status: "completed", quantity: 10, produced_quantity: 10, unit: "m", created_at: iso(NOW - 30 * day) },
];

const steps: WipStepInput[] = [
  { production_order_id: "op-1", sequence: 1, status: "completed", started_at: iso(NOW - 9 * day), created_at: iso(NOW - 10 * day), step_name: "Urdimento" },
  { production_order_id: "op-1", sequence: 2, status: "in_progress", started_at: iso(NOW - 4 * day), created_at: iso(NOW - 9 * day), step_name: "Tecelagem", step_sector: "Tecelagem" },
];

describe("painel WIP por etapa e idade (T89)", () => {
  it("só OPs abertas entram, ordenadas da mais antiga para a mais nova", () => {
    const panel = buildWipPanel(orders, steps, NOW);
    expect(panel.totalOpen).toBe(2);
    expect(panel.rows.map((row) => row.orderNumber)).toEqual(["OP-1", "OP-2"]);
  });

  it("etapa atual é a primeira não concluída; idade e permanência vêm das datas reais", () => {
    const [first] = buildWipPanel(orders, steps, NOW).rows;
    expect(first.currentStepName).toBe("Tecelagem");
    expect(first.ageDays).toBe(10);
    expect(first.daysInCurrentStep).toBe(4);
    expect(first.remainingQty).toBe(60);
    expect(first.ageBucket).toBe("8-15 dias");
  });

  it("OP sem etapa gerada aparece explicitamente, sem estimativa", () => {
    const [, second] = buildWipPanel(orders, steps, NOW).rows;
    expect(second.currentStepName).toBe("Sem etapa gerada");
    expect(second.daysInCurrentStep).toBe(1);
  });

  it("agrupa por etapa atual e por faixa de idade", () => {
    const panel = buildWipPanel(orders, steps, NOW);
    expect(panel.byStep).toEqual([
      { stepName: "Tecelagem", orders: 1, oldestAgeDays: 10 },
      { stepName: "Sem etapa gerada", orders: 1, oldestAgeDays: 1 },
    ]);
    expect(panel.byBucket.find((item) => item.bucket === "0-2 dias")?.orders).toBe(1);
    expect(wipAgeBucket(20)).toBe("mais de 15 dias");
  });
});
