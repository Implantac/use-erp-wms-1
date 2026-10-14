import { describe, expect, it } from 'vitest';
import { calculateOrderDateMetrics } from './orderDateMetrics';
const now = new Date('2026-10-14T18:00:00Z');
const op = (overrides: Record<string, string | null> = {}) => ({
  status: 'completed', start_date: '2026-10-13T12:00:00Z',
  completed_date: '2026-10-14T00:00:00Z', due_date: '2026-10-14T12:00:00Z', ...overrides,
});
describe('BI date-based OP indicators', () => {
  it('reports unknown, not zero, without an eligible sample', () => {
    const result = calculateOrderDateMetrics([], now);
    expect(result.onTimePct).toBeNull();
    expect(result.avgLeadTime).toBeNull();
  });
  it('uses timestamp precision and excludes impossible and future completions', () => {
    const result = calculateOrderDateMetrics([
      op(),
      op({ start_date: '2026-10-14T12:00:00Z', completed_date: '2026-10-14T06:00:00Z' }),
      op({ completed_date: '2026-10-15T00:00:00Z' }),
      op({ start_date: 'invalid' }),
      op({ due_date: 'invalid' }),
    ], now);
    expect(result.completedOPs).toHaveLength(1);
    expect(result.onTimePct).toBe(100);
    expect(result.avgLeadTime).toBe(0.5);
    expect(result.leadTimeSampleSize).toBe(2); // The no-due-date OP still has a valid elapsed duration.
  });
  it('classifies only active OPs with valid overdue timestamps', () => {
    const result = calculateOrderDateMetrics([
      op({ status: 'planned', due_date: '2026-10-14T17:00:00Z' }),
      op({ status: 'draft', due_date: '2026-10-14T17:00:00Z' }),
      op({ status: 'paused', due_date: 'invalid' }),
      op({ status: 'in_progress', due_date: '2026-10-14T19:00:00Z' }),
    ], now);
    expect(result.lateOPs).toHaveLength(1);
  });
});
