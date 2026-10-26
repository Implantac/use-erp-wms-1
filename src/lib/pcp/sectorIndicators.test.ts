import { describe, expect, it } from 'vitest';

import { computeMachineEfficiency,
  computeSectorIndicators, computeSectorReadiness } from './sectorIndicators';

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

describe('computeMachineEfficiency — denominador configurado', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  const machines = [
    { id: 'm1', capacity_per_hour: 10 },
    { id: 'm2', capacity_per_hour: null },
  ];
  const events = [
    { production_order_id: 'o1', event_type: 'doffing', downtime_minutes: null, deviation_category: null, machine_id: 'm1', occurred_at: '2026-10-22T10:00:00Z', quantity: 300 },
    { production_order_id: 'o1', event_type: 'doffing', downtime_minutes: null, deviation_category: null, machine_id: 'm1', occurred_at: '2026-10-21T10:00:00Z', quantity: 60 },
    { production_order_id: 'o2', event_type: 'roll_change', downtime_minutes: null, deviation_category: null, machine_id: 'm2', occurred_at: '2026-10-22T10:00:00Z', quantity: 50 },
    { production_order_id: 'o1', event_type: 'doffing', downtime_minutes: null, deviation_category: null, machine_id: 'm1', occurred_at: '2026-08-01T10:00:00Z', quantity: 999 },
  ];
  const schedules = [
    { machine_id: 'm1', planned_start: '2026-10-20T00:00:00Z', planned_end: '2026-10-20T10:00:00Z', status: 'scheduled' },
    { machine_id: 'm1', planned_start: '2026-10-21T00:00:00Z', planned_end: '2026-10-21T10:00:00Z', status: 'in_progress' },
    { machine_id: 'm2', planned_start: '2026-10-20T00:00:00Z', planned_end: '2026-10-20T05:00:00Z', status: 'scheduled' },
  ];

  it('calcula produzido ÷ (capacidade × horas programadas) só dentro da janela', () => {
    const [m1] = computeMachineEfficiency({ events, schedules, machines, now, windowDays: 30 });
    expect(m1.machineId).toBe('m1');
    expect(m1.producedQty).toBe(360); // os 999 de agosto ficam fora
    expect(m1.scheduledHours).toBe(20);
    expect(m1.theoreticalQty).toBe(200);
    expect(m1.efficiencyPct).toBeCloseTo(180);
  });

  it('sem capacidade cadastrada, percentual é null (não estima)', () => {
    const rows = computeMachineEfficiency({ events, schedules, machines, now, windowDays: 30 });
    const m2 = rows.find((r) => r.machineId === 'm2');
    expect(m2?.producedQty).toBe(50);
    expect(m2?.theoreticalQty).toBeNull();
    expect(m2?.efficiencyPct).toBeNull();
  });
});
