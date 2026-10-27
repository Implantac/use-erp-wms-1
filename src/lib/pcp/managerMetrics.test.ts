import { describe, expect, it } from 'vitest';
import { computeManagerMetrics } from './managerMetrics';

const NOW = new Date('2026-10-19T12:00:00-03:00');
const TODAY = '2026-10-19T10:00:00-03:00';

// Dataset espelhando a cadeia provada no Postgres embarcado:
// pluma -> fio 30 -> malha crua -> malha tingida -> venda/expedição.
const orders = [
  { id: 'op-tecido', status: 'completed', sector: 'Tecelagem', unit: 'm', quantity: 100, produced_quantity: 95, rejected_quantity: 5, completed_date: TODAY, due_date: null },
  { id: 'op-fio', status: 'completed', sector: 'Fiação', unit: 'kg', quantity: 100, produced_quantity: 93, rejected_quantity: 7, completed_date: TODAY, due_date: null },
  { id: 'op-malha', status: 'completed', sector: 'Malharia', unit: 'kg', quantity: 90, produced_quantity: 87, rejected_quantity: 3, completed_date: TODAY, due_date: null },
  { id: 'op-ting', status: 'completed', sector: 'Tinturaria', unit: 'kg', quantity: 80, produced_quantity: 75, rejected_quantity: 5, completed_date: TODAY, due_date: null },
  { id: 'op-aberta', status: 'planned', sector: 'Tecelagem', unit: 'm', quantity: 50, produced_quantity: 0, rejected_quantity: 0, completed_date: null, due_date: '2026-10-01T00:00:00-03:00' },
  { id: 'op-antiga', status: 'completed', sector: 'Tecelagem', unit: 'm', quantity: 10, produced_quantity: 10, rejected_quantity: 0, completed_date: '2026-08-01T10:00:00-03:00', due_date: null },
];

describe('computeManagerMetrics', () => {
  it('resume OPs, produção por unidade e rendimento sem somar unidades', () => {
    const metrics = computeManagerMetrics({ orders, schedules: [], lots: [], shipments: [], inspections: [], now: NOW });
    expect(metrics.totalOrders).toBe(6);
    expect(metrics.openOrders).toBe(1);
    expect(metrics.completedInWindow).toBe(4); // a de agosto fica fora da janela de 30 dias
    const byUnit = Object.fromEntries(metrics.productionByUnit.map((row) => [row.unit, row]));
    expect(byUnit.m.produced).toBe(95);
    expect(byUnit.m.yieldPct).toBeCloseTo(95);
    expect(byUnit.kg.produced).toBe(255); // 93 + 87 + 75
    expect(byUnit.kg.rejected).toBe(15); // 7 + 3 + 5
    expect(byUnit.kg.yieldPct).toBeCloseTo((255 / 270) * 100);
    expect(metrics.overdueOpenOrders).toBe(1);
  });

  it('qualidade mista entre unidades não vira número (Sem dados suficientes)', () => {
    const inspections = [
      { approved_quantity: 95, rejected_quantity: 5, order_unit: 'm' },
      { approved_quantity: 93, rejected_quantity: 4, order_unit: 'kg' },
    ];
    const metrics = computeManagerMetrics({ orders: [], schedules: [], lots: [], shipments: [], inspections, now: NOW });
    expect(metrics.qualityApprovalPct).toBeNull();
    expect(metrics.qualitySampleSize).toBe(2);
  });

  it('qualidade de uma unidade só calcula aprovação', () => {
    const inspections = [{ approved_quantity: 93, rejected_quantity: 4, order_unit: 'kg' }];
    const metrics = computeManagerMetrics({ orders: [], schedules: [], lots: [], shipments: [], inspections, now: NOW });
    expect(metrics.qualityApprovalPct).toBeCloseTo((93 / 97) * 100);
  });

  it('programação: sem janela ativa, janelas de hoje e setores abertos', () => {
    const schedules = [
      { production_order_id: 'op-aberta', planned_start: '2026-10-19T08:00:00-03:00', planned_end: '2026-10-19T12:00:00-03:00', status: 'scheduled' },
      { production_order_id: 'op-fio', planned_start: '2026-10-10T08:00:00-03:00', planned_end: '2026-10-10T12:00:00-03:00', status: 'completed' },
    ];
    const metrics = computeManagerMetrics({ orders, schedules, lots: [], shipments: [], inspections: [], now: NOW });
    expect(metrics.unscheduledOpenOrders).toBe(0);
    expect(metrics.windowsToday).toBe(1);
    const semJanela = computeManagerMetrics({ orders, schedules: [], lots: [], shipments: [], inspections: [], now: NOW });
    expect(semJanela.unscheduledOpenOrders).toBe(1);
    expect(metrics.openBySector).toEqual([{ sector: 'Tecelagem', openOrders: 1 }]);
  });

  it('lotes: saldo por produto e bloqueados com saldo', () => {
    const lots = [
      { product_code: 'PLUMA-01', remaining_qty: 382, status: 'available', quality_status: 'approved' },
      { product_code: 'MALHA-TING-30', remaining_qty: 25, status: 'available', quality_status: 'approved' },
      { product_code: 'CORANTE-AZUL', remaining_qty: 8, status: 'available', quality_status: 'approved' },
      { product_code: 'CORANTE-AZUL', remaining_qty: 5, status: 'available', quality_status: 'quarantine' },
      { product_code: 'FIO-30-CARD', remaining_qty: 0, status: 'consumed', quality_status: 'approved' },
    ];
    const metrics = computeManagerMetrics({ orders: [], schedules: [], lots, shipments: [], inspections: [], now: NOW });
    expect(metrics.lotsByProduct[0]).toEqual({ productCode: 'PLUMA-01', quantity: 382 });
    expect(metrics.blockedLots).toBe(1); // quarentena com saldo; lote zerado não conta
  });

  it('expedido na janela de 7 dias por produto', () => {
    const shipments = [
      { product_code: 'MALHA-TING-30', quantity: 50, created_at: TODAY },
      { product_code: 'MALHA-TING-30', quantity: 999, created_at: '2026-09-01T10:00:00-03:00' },
    ];
    const metrics = computeManagerMetrics({ orders: [], schedules: [], lots: [], shipments, inspections: [], now: NOW });
    expect(metrics.shippedByProduct).toEqual([{ productCode: 'MALHA-TING-30', quantity: 50 }]);
  });

  it('sem dados: zeros e nulls honestos, sem NaN', () => {
    const metrics = computeManagerMetrics({ orders: [], schedules: [], lots: [], shipments: [], inspections: [], now: NOW });
    expect(metrics.totalOrders).toBe(0);
    expect(metrics.productionByUnit).toEqual([]);
    expect(metrics.qualityApprovalPct).toBeNull();
  });
});
