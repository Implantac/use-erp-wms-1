import { describe, expect, it } from 'vitest';
import {
  getOrderOverdueDays,
  getOrderProgress,
  isOrderOverdue,
  parseValidDueDate,
  productionOrderPriorityLabel,
  productionOrderStatusLabel,
} from './orderPresentation';

describe('OP presentation for the production manager', () => {
  it('shows floor language instead of internal status and priority codes', () => {
    expect(productionOrderStatusLabel('in_progress')).toBe('Em produção');
    expect(productionOrderStatusLabel('waiting_material')).toBe('Aguardando material');
    expect(productionOrderStatusLabel('quality_check')).toBe('Em controle de qualidade');
    expect(productionOrderStatusLabel('completed')).toBe('Concluída');
    expect(productionOrderPriorityLabel('urgent')).toBe('Urgente');
    expect(productionOrderPriorityLabel(null)).toBe('Não definida');
  });
});

describe('OP presentation: never turn invalid dates or quantities into KPIs', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  it('excludes malformed dates and inactive/completed OPs from overdue count', () => {
    expect(parseValidDueDate('invalid')).toBeNull();
    expect(isOrderOverdue({ status: 'planned', due_date: 'invalid' }, now)).toBe(false);
    expect(isOrderOverdue({ status: 'completed', due_date: '2026-10-10' }, now)).toBe(false);
    expect(isOrderOverdue({ status: 'draft', due_date: '2026-10-10' }, now)).toBe(false);
    expect(getOrderOverdueDays({ status: 'planned', due_date: '2026-10-10' }, now)).toBeGreaterThan(0);
  });
  it('rejects progress outside a valid individual OP ratio', () => {
    expect(getOrderProgress({ quantity: 0, produced_quantity: 0 })).toBeNull();
    expect(getOrderProgress({ quantity: 5, produced_quantity: 6 })).toBeNull();
    expect(getOrderProgress({ quantity: 5, produced_quantity: -1 })).toBeNull();
    expect(getOrderProgress({ quantity: 5, produced_quantity: Number.NaN })).toBeNull();
    expect(getOrderProgress({ quantity: 5, produced_quantity: 2 })).toBe(40);
  });
});
