import { describe, expect, it } from 'vitest';
import { computeDerived } from './usePCPPanel';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { TimeEntryRow } from '@/hooks/system/useTimeEntries';
const today = new Date('2026-10-14T18:00:00Z');
const order = (overrides: Record<string, unknown>): ProductionOrderRow => ({
  id: '1', order_number: 'OP-1', status: 'in_progress', quantity: 10,
  produced_quantity: 5, work_center: 'Corte', due_date: null, ...overrides,
} as ProductionOrderRow);
const entry = (overrides: Record<string, unknown>): TimeEntryRow => ({
  operator: 'Ana Silva', status: 'completed', start_time: '2026-10-14T12:00:00Z',
  end_time: '2026-10-14T13:00:00Z', produced_quantity: 3, ...overrides,
} as TimeEntryRow);
describe('Painel PCP sem agregar quantidades incompatíveis', () => {
  it('conta OPs por centro e calcula apenas razão dentro de cada OP válida', () => {
    const result = computeDerived([
      order({ id: '1', quantity: 10, produced_quantity: 5, unit: 'kg' }),
      order({ id: '2', quantity: 100, produced_quantity: 25, unit: 'm' }),
      order({ id: '3', quantity: 0, produced_quantity: 1 }),
    ], [], [], today);
    expect(result.workCenterData).toEqual([{ name: 'Corte', ordens: 3 }]);
    expect(result.averageProgress).toBe(37.5);
    expect(result.progressSampleSize).toBe(2);
    expect('pendente' in result.workCenterData[0]).toBe(false);
  });
  it('não inventa avanço nem produtividade quando não há amostra', () => {
    const result = computeDerived([order({ status: 'completed' })], [], [entry({ status: 'in_progress' })], today);
    expect(result.averageProgress).toBeNull();
    expect(result.operatorData).toEqual([]);
  });
  it('conta só apontamentos concluídos hoje, sem somar peças ou abreviar operador', () => {
    const result = computeDerived([], [], [
      entry({ produced_quantity: 500, unit: 'kg' }),
      entry({ produced_quantity: 2, unit: 'm' }),
      entry({ end_time: '2026-10-13T13:00:00Z' }),
      entry({ end_time: '2026-10-14T11:00:00Z' }),
    ], today);
    expect(result.operatorData).toEqual([{ name: 'Ana Silva', entries: 2 }]);
  });
});
