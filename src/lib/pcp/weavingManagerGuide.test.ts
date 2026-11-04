import { describe, expect, it } from 'vitest';
import {
  buildWeavingManagerActions,
  buildWeavingOrderJourney,
  getWeavingNextStage,
} from './weavingManagerGuide';
import type { ProgrammingOrderLike, ProgrammingScheduleLike } from './sectorProgramming';

const NOW = new Date('2026-10-28T12:00:00Z');

const order = (over: Partial<ProgrammingOrderLike>): ProgrammingOrderLike => ({
  id: over.id || 'op1',
  order_number: over.order_number || 'OP-1',
  product_name: over.product_name || 'Tecido',
  quantity: over.quantity ?? 100,
  produced_quantity: over.produced_quantity ?? 0,
  unit: 'm',
  status: over.status || 'planned',
  priority: over.priority ?? 'medium',
  due_date: over.due_date ?? null,
  created_at: over.created_at || '2026-10-20T00:00:00Z',
});

const schedule = (over: Partial<ProgrammingScheduleLike>): ProgrammingScheduleLike => ({
  id: over.id || 's1',
  production_order_id: over.production_order_id || 'op2',
  planned_start: over.planned_start || '2026-10-29T08:00:00Z',
  planned_end: over.planned_end || '2026-10-29T12:00:00Z',
  actual_start: over.actual_start ?? null,
  status: over.status || 'scheduled',
  machine_id: over.machine_id ?? 'tear-1',
  resource_id: null,
  work_center: null,
  sector: 'Tecelagem',
  shift: 'diurno',
});

describe('buildWeavingManagerActions', () => {
  it('coloca prazo vencido, conflito e OP fora da fila como decisões do gerente', () => {
    const actions = buildWeavingManagerActions({
      now: NOW,
      orders: [
        order({ id: 'op1', order_number: 'OP-1', due_date: '2026-10-27T23:59:59Z' }),
        order({ id: 'op2', order_number: 'OP-2', due_date: '2026-11-05T00:00:00Z' }),
        order({ id: 'op3', order_number: 'OP-3', due_date: '2026-11-06T00:00:00Z' }),
      ],
      schedules: [
        schedule({ id: 's2', production_order_id: 'op2' }),
        schedule({ id: 's3', production_order_id: 'op3', planned_start: '2026-10-29T10:00:00Z', planned_end: '2026-10-29T14:00:00Z' }),
      ],
    });

    expect(actions.map((action) => action.key)).toEqual(['entrega', 'conflito', 'programar']);
    expect(actions[0].orderId).toBe('op1');
    expect(actions[2].orderId).toBe('op1');
  });

  it('quando a fila está sob controle, aponta a próxima janela em vez de criar alarme', () => {
    const actions = buildWeavingManagerActions({
      now: NOW,
      orders: [order({ id: 'op2', order_number: 'OP-2', due_date: '2026-11-05T00:00:00Z' })],
      schedules: [schedule({ production_order_id: 'op2' })],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].key).toBe('proxima');
  });

  it('ignora OP concluída e cancelada', () => {
    expect(buildWeavingManagerActions({
      now: NOW,
      orders: [order({ status: 'completed' }), order({ id: 'op9', status: 'cancelled' })],
      schedules: [],
    })).toEqual([]);
  });
});

describe('buildWeavingOrderJourney', () => {
  const base = {
    orderStatus: 'planned',
    hasSchedule: false,
    bomLineCount: 2,
    activeReservationCount: 0,
    totalSteps: 3,
    completedSteps: 0,
    plannedQuantity: 100,
    approvedQuantity: 0,
    blockedQuality: false,
  };

  it('começa pela programação e sinaliza a BOM faltante sem esconder o problema', () => {
    const stages = buildWeavingOrderJourney({ ...base, bomLineCount: 0 });
    expect(stages[0].state).toBe('current');
    expect(stages[1].state).toBe('blocked');
    expect(getWeavingNextStage(stages)?.key).toBe('programar');
  });

  it('leva o gerente para a passagem atual quando tear e materiais estão prontos', () => {
    const stages = buildWeavingOrderJourney({ ...base, hasSchedule: true, completedSteps: 1 });
    expect(getWeavingNextStage(stages)?.key).toBe('tecer');
  });

  it('bloqueia na qualidade quando há inspeção rejeitada ou em quarentena', () => {
    const stages = buildWeavingOrderJourney({
      ...base,
      orderStatus: 'quality_check',
      hasSchedule: true,
      completedSteps: 3,
      blockedQuality: true,
    });
    expect(getWeavingNextStage(stages)?.key).toBe('qualidade');
    expect(getWeavingNextStage(stages)?.state).toBe('blocked');
  });

  it('só chama gerar estoque depois de passagens e qualidade; concluída fecha a rota', () => {
    const ready = buildWeavingOrderJourney({
      ...base,
      orderStatus: 'finishing',
      hasSchedule: true,
      completedSteps: 3,
      approvedQuantity: 100,
    });
    expect(getWeavingNextStage(ready)?.key).toBe('estoque');

    const done = buildWeavingOrderJourney({ ...base, orderStatus: 'completed', hasSchedule: true, completedSteps: 3, approvedQuantity: 100 });
    expect(done.every((stage) => stage.state === 'done')).toBe(true);
    expect(getWeavingNextStage(done)).toBeNull();
  });
});
