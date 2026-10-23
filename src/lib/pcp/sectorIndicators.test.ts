import { describe, expect, it } from 'vitest';

import { computeSectorIndicators, computeSectorReadiness } from './sectorIndicators';

const NOW = new Date('2026-10-21T12:00:00Z');
const recent = '2026-10-15T10:00:00Z';

describe('computeSectorIndicators — só dado real, sem denominador é null', () => {
  it('aderência, prazo, inspeções, paradas classificadas e WIP', () => {
    const result = computeSectorIndicators({
      kind: 'tecelagem',
      now: NOW,
      orders: [
        { id: 'o1', status: 'completed', quantity: 500, produced_quantity: 480, completed_date: recent, due_date: '2026-10-20T00:00:00Z' },
        { id: 'o2', status: 'in_progress', quantity: 300, produced_quantity: 100, completed_date: null, due_date: null },
      ],
      events: [
        { production_order_id: 'o1', event_type: 'warp_break', downtime_minutes: 12, deviation_category: 'fio_urdume', machine_id: 'm1', occurred_at: recent },
        { production_order_id: 'o1', event_type: 'stop', downtime_minutes: 30, deviation_category: null, machine_id: 'm1', occurred_at: recent },
      ],
      inspections: [
        { production_order_id: 'o1', status: 'approved', created_at: recent },
        { production_order_id: 'o1', status: 'rejected', created_at: recent },
      ],
    });
    expect(result.adherencePct).toBeCloseTo(96);
    expect(result.onTimePct).toBe(100);
    expect(result.approvedInspectionPct).toBe(50);
    expect(result.downtimeMinutes).toBe(42);
    expect(result.downtimeByCategory[0]).toMatchObject({ category: 'fio_urdume', minutes: 12 });
    expect(result.unclassifiedDowntimeMinutes).toBe(30);
    expect(result.breaksCount).toBe(1);
    expect(result.wipOrders).toBe(1);
    expect(result.wipRemainingQty).toBe(200);
  });

  it('sem OP concluída nem inspeção, percentuais são null (sem estimativa)', () => {
    const result = computeSectorIndicators({ kind: 'fiacao', now: NOW, orders: [], events: [], inspections: [] });
    expect(result.adherencePct).toBeNull();
    expect(result.onTimePct).toBeNull();
    expect(result.approvedInspectionPct).toBeNull();
    expect(result.downtimeMinutes).toBe(0);
  });

  it('retingimento conta como retrabalho só na tinturaria', () => {
    const base = {
      now: NOW,
      orders: [{ id: 'o1', status: 'in_progress', quantity: 10, produced_quantity: 0, completed_date: null, due_date: null }],
      events: [{ production_order_id: 'o1', event_type: 're_dye', downtime_minutes: null, deviation_category: 'cor', machine_id: null, occurred_at: recent }],
      inspections: [],
    };
    expect(computeSectorIndicators({ ...base, kind: 'tinturaria' }).reworkEvents).toBe(1);
  });
});

describe('computeSectorReadiness — dados mínimos das skills', () => {
  it('máquina sem setor não conta como identificada, mas é sinalizada', () => {
    const items = computeSectorReadiness({
      kind: 'tecelagem',
      machines: [{ sector: null }, { sector: 'Tecelagem' }],
      products: [{ id: 'p1', code: 'FIO-01', name: 'Fio 01' }],
    });
    expect(items.find((i) => i.key === 'machines')?.ok).toBe(true);
    expect(items.find((i) => i.key === 'key-input')?.ok).toBe(true);
  });

  it('sem fio cadastrado, prontidão de tecelagem acusa o cadastro faltante', () => {
    const items = computeSectorReadiness({
      kind: 'tecelagem',
      machines: [{ sector: 'Fiação' }],
      products: [{ id: 'p1', code: 'MALHA-30', name: 'Malha fio 30 crua' }],
    });
    expect(items.every((i) => !i.ok)).toBe(true);
  });
});
