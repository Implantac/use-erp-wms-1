import { describe, expect, it } from 'vitest';
import {
  buildSectorProgramming,
  resequenceWindows,
  suggestDyeingSequence,
  type ProgrammingOrderLike,
  type ProgrammingScheduleLike,
} from './sectorProgramming';

const order = (over: Partial<ProgrammingOrderLike>): ProgrammingOrderLike => ({
  id: over.id || 'op1',
  order_number: over.order_number || 'OP-1',
  product_name: over.product_name || 'Produto',
  quantity: over.quantity ?? 100,
  produced_quantity: over.produced_quantity ?? 0,
  unit: 'kg',
  status: over.status || 'planned',
  priority: over.priority ?? 'medium',
  due_date: over.due_date ?? null,
  created_at: over.created_at || '2026-10-20T00:00:00Z',
});

const sched = (over: Partial<ProgrammingScheduleLike>): ProgrammingScheduleLike => ({
  id: over.id || 's1',
  production_order_id: over.production_order_id || 'op1',
  planned_start: over.planned_start || '2026-10-27T08:00:00Z',
  planned_end: over.planned_end || '2026-10-27T12:00:00Z',
  actual_start: over.actual_start ?? null,
  status: over.status || 'scheduled',
  machine_id: over.machine_id ?? 'm1',
  resource_id: null,
  work_center: null,
  sector: null,
  shift: 'diurno',
});

const NOW = new Date('2026-10-27T10:00:00Z');

describe('buildSectorProgramming', () => {
  it('monta a fila por máquina com atraso e conflito, e separa as OPs sem programação', () => {
    const orders = [
      order({ id: 'op1', order_number: 'OP-1' }),
      order({ id: 'op2', order_number: 'OP-2' }),
      order({ id: 'op3', order_number: 'OP-3', priority: 'urgent', due_date: '2026-10-28' }),
      order({ id: 'op4', order_number: 'OP-4', status: 'completed' }),
    ];
    const schedules = [
      sched({ id: 's1', production_order_id: 'op1', planned_start: '2026-10-27T06:00:00Z', planned_end: '2026-10-27T09:00:00Z' }),
      sched({ id: 's2', production_order_id: 'op2', planned_start: '2026-10-27T08:00:00Z', planned_end: '2026-10-27T14:00:00Z' }),
    ];
    const result = buildSectorProgramming({
      orders,
      schedules,
      machines: [{ id: 'm1', code: 'JET-01', name: 'Jet 1' }],
      now: NOW,
    });
    expect(result.queues).toHaveLength(1);
    expect(result.queues[0].label).toBe('JET-01 — Jet 1');
    const [first, second] = result.queues[0].slots;
    expect(first.order.order_number).toBe('OP-1');
    expect(first.isLate).toBe(true); // terminava 09:00, agora 10:00
    expect(first.hasConflict).toBe(true); // sobrepõe a OP-2 na mesma máquina
    expect(second.hasConflict).toBe(true);
    expect(result.unscheduled.map((o) => o.id)).toEqual(['op3']);
  });

  it('OP concluída/cancelada não entra na fila nem nas sem programação', () => {
    const result = buildSectorProgramming({
      orders: [order({ id: 'op9', status: 'cancelled' })],
      schedules: [],
      machines: [],
      now: NOW,
    });
    expect(result.queues).toEqual([]);
    expect(result.unscheduled).toEqual([]);
  });
});

describe('resequenceWindows', () => {
  const slot = (orderId: string, start: string, end: string, started = false) => ({
    scheduleId: `s-${orderId}`,
    orderId,
    plannedStart: start,
    plannedEnd: end,
    started,
  });

  it('inverter a fila empilha mantendo as durações a partir do início mais cedo', () => {
    const slots = [
      slot('a', '2026-10-27T08:00:00Z', '2026-10-27T12:00:00Z'),
      slot('b', '2026-10-27T12:00:00Z', '2026-10-27T14:00:00Z'),
    ];
    const changes = resequenceWindows(slots, ['b', 'a']);
    const byOrder = new Map(changes.map((c) => [c.orderId, c]));
    expect(byOrder.get('b')?.plannedStart).toBe('2026-10-27T08:00:00.000Z');
    expect(byOrder.get('b')?.plannedEnd).toBe('2026-10-27T10:00:00.000Z'); // 2h mantidas
    expect(byOrder.get('a')?.plannedStart).toBe('2026-10-27T10:00:00.000Z');
    expect(byOrder.get('a')?.plannedEnd).toBe('2026-10-27T14:00:00.000Z'); // 4h mantidas
  });

  it('janela já iniciada é âncora: não muda e empurra as demais', () => {
    const slots = [
      slot('a', '2026-10-27T08:00:00Z', '2026-10-27T12:00:00Z', true),
      slot('b', '2026-10-27T12:00:00Z', '2026-10-27T14:00:00Z'),
      slot('c', '2026-10-27T14:00:00Z', '2026-10-27T15:00:00Z'),
    ];
    const changes = resequenceWindows(slots, ['a', 'c', 'b']);
    expect(changes.find((c) => c.orderId === 'a')).toBeUndefined();
    const c = changes.find((x) => x.orderId === 'c');
    const b = changes.find((x) => x.orderId === 'b');
    expect(c?.plannedStart).toBe('2026-10-27T12:00:00.000Z');
    expect(b?.plannedStart).toBe('2026-10-27T13:00:00.000Z');
  });

  it('ordem igual à atual não gera mudança', () => {
    const slots = [
      slot('a', '2026-10-27T08:00:00Z', '2026-10-27T12:00:00Z'),
      slot('b', '2026-10-27T12:00:00Z', '2026-10-27T14:00:00Z'),
    ];
    expect(resequenceWindows(slots, ['a', 'b'])).toEqual([]);
  });
});

describe('suggestDyeingSequence', () => {
  it('ordena claro -> escuro pelo L*, mesma cor junta e sinaliza clareamento', () => {
    const seq = suggestDyeingSequence([
      { orderId: 'preto', colorName: 'Preto', labL: 12 },
      { orderId: 'branco', colorName: 'Branco', labL: 92 },
      { orderId: 'azul', colorName: 'Marinho', labL: 30 },
      { orderId: 'branco2', colorName: 'Branco', labL: 92 },
      { orderId: 'semL', colorName: 'Verde' },
    ]);
    expect(seq.orderedIds).toEqual(['branco', 'branco2', 'azul', 'preto', 'semL']);
    const kinds = new Map(seq.transitions.map((t) => [t.orderId, t.kind]));
    expect(kinds.get('branco2')).toBe('mesma-cor');
    expect(kinds.get('azul')).toBe('mais-escura');
    expect(kinds.get('semL')).toBe('sem-referencia');
  });

  it('quem não tem L* agrupa pela mesma cor no fim da fila', () => {
    const seq = suggestDyeingSequence([
      { orderId: 'v1', colorName: 'Verde' },
      { orderId: 'a1', colorName: 'Azul' },
      { orderId: 'v2', colorName: 'verde' },
    ]);
    expect(seq.orderedIds).toEqual(['a1', 'v1', 'v2']);
    expect(new Map(seq.transitions.map((t) => [t.orderId, t.kind])).get('v2')).toBe('mesma-cor');
  });
});
