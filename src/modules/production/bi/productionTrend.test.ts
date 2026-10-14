import { describe, expect, it } from 'vitest';
import { buildProductionTrend } from './productionTrend';
const now = new Date('2026-10-14T18:00:00Z');
const entry = (start: string, end: string, produced = 5, rejected = 1) => ({
  status: 'completed', start_time: start, end_time: end, produced_quantity: produced, rejected_quantity: rejected,
});
describe('BI daily completed entry trend', () => {
  it('shows unobserved yield as unknown, not perfect', () => {
    expect(buildProductionTrend([], 2, now)).toMatchObject([{ yieldRate: null, pcsH: null }, { yieldRate: null, pcsH: null }]);
  });
  it('uses completion day and ignores future, invalid and outside-window entries', () => {
    const trend = buildProductionTrend([
      entry('2026-10-13T23:30:00Z', '2026-10-14T00:30:00Z'),
      entry('2026-10-14T12:00:00Z', '2026-10-14T11:00:00Z', 900),
      entry('2026-10-14T19:00:00Z', '2026-10-14T20:00:00Z', 900),
      entry('2025-10-14T12:00:00Z', '2025-10-14T13:00:00Z', 900),
    ], 2, now);
    expect(trend[0].produced).toBe(0);
    expect(trend[1]).toMatchObject({ produced: 5, rejected: 1, pcsH: 5, yieldRate: 83.3 });
  });
  it('rejects malformed quantities and invalid period', () => {
    expect(buildProductionTrend([entry('2026-10-14T12:00:00Z', '2026-10-14T13:00:00Z', -1)], 1, now)[0].yieldRate).toBeNull();
    expect(buildProductionTrend([], 0, now)).toEqual([]);
  });
});
