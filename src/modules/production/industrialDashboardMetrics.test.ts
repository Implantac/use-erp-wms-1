import { describe, expect, it } from 'vitest';
import { calculateIndustrialDashboardMetrics } from './industrialDashboardMetrics';

const now = new Date('2026-10-19T12:00:00-03:00');

describe('industrial dashboard metrics', () => {
  it('calculates open, overdue, started-today and progress only from valid OP rows', () => {
    const metrics = calculateIndustrialDashboardMetrics([
      { status: 'in_progress', quantity: 100, produced_quantity: 40, due_date: '2026-10-18T12:00:00-03:00', start_date: '2026-10-19T08:00:00-03:00', sector: 'Tecelagem' },
      { status: 'planned', quantity: 50, produced_quantity: 10, due_date: '2026-10-25T12:00:00-03:00', start_date: null, work_center: 'Tear 01' },
      { status: 'completed', quantity: 10, produced_quantity: 10, due_date: '2026-10-01T12:00:00-03:00', start_date: '2026-10-01T08:00:00-03:00', sector: 'Tecelagem' },
      { status: 'planned', quantity: Number.NaN, produced_quantity: 0, due_date: null, start_date: null, sector: null },
    ], [], now);

    expect(metrics.openOrders).toBe(3);
    expect(metrics.inProgressOrders).toBe(1);
    expect(metrics.startedToday).toBe(1);
    expect(metrics.overdueOrders).toBe(1);
    expect(metrics.averageProgressPct).toBeCloseTo(30);
    expect(metrics.progressSampleSize).toBe(2);
    expect(metrics.sectorCounts).toEqual([
      { sector: 'Sem setor/centro registrado', openOrders: 1 },
      { sector: 'Tear 01', openOrders: 1 },
      { sector: 'Tecelagem', openOrders: 1 },
    ]);
  });

  it('does not invent quality quantities or approval rate without inspections', () => {
    const metrics = calculateIndustrialDashboardMetrics([], [], now);
    expect(metrics.inspectionCount).toBe(0);
    expect(metrics.approvalRatePct).toBeNull();
    expect(metrics.approvedQuantity).toBeNull();
    expect(metrics.qualityUnit).toBeNull();
  });

  it('aggregates quality only when every inspection has the same OP unit', () => {
    const metrics = calculateIndustrialDashboardMetrics([], [
      { approved_quantity: 90, rejected_quantity: 10, order_unit: 'm' },
      { approved_quantity: 45, rejected_quantity: 5, order_unit: 'm' },
    ], now);
    expect(metrics.qualityUnit).toBe('m');
    expect(metrics.approvedQuantity).toBe(135);
    expect(metrics.rejectedQuantity).toBe(15);
    expect(metrics.approvalRatePct).toBeCloseTo(90);
  });

  it('refuses to mix kg and metres or inspections without an OP unit', () => {
    for (const inspections of [
      [
        { approved_quantity: 90, rejected_quantity: 10, order_unit: 'kg' },
        { approved_quantity: 45, rejected_quantity: 5, order_unit: 'm' },
      ],
      [
        { approved_quantity: 90, rejected_quantity: 10, order_unit: 'kg' },
        { approved_quantity: 45, rejected_quantity: 5, order_unit: null },
      ],
    ]) {
      const metrics = calculateIndustrialDashboardMetrics([], inspections, now);
      expect(metrics.approvalRatePct).toBeNull();
      expect(metrics.approvedQuantity).toBeNull();
      expect(metrics.qualityUnit).toBeNull();
    }
  });
});
