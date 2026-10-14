import { describe, expect, it } from 'vitest';
import { buildProductionTrend } from './productionTrend';
const now = new Date('2026-10-14T18:00:00Z');
const entry = (start: string, end: string, status = 'completed') => ({ status, start_time: start, end_time: end });
describe('BI daily completed entry trend', () => {
  it('does not infer worked hours when no records exist', () => {
    expect(buildProductionTrend([], 2, now)).toMatchObject([{ entryCount: 0, elapsedHours: null }, { entryCount: 0, elapsedHours: null }]);
  });
  it('uses completion day and ignores future, invalid, ongoing and outside-window entries', () => {
    const trend = buildProductionTrend([
      entry('2026-10-13T23:30:00Z', '2026-10-14T00:30:00Z'),
      entry('2026-10-14T12:00:00Z', '2026-10-14T11:00:00Z'),
      entry('2026-10-14T19:00:00Z', '2026-10-14T20:00:00Z'),
      entry('2025-10-14T12:00:00Z', '2025-10-14T13:00:00Z'),
      entry('2026-10-14T12:00:00Z', '2026-10-14T13:00:00Z', 'in_progress'),
    ], 2, now);
    expect(trend[0].entryCount).toBe(0);
    expect(trend[1]).toMatchObject({ entryCount: 1, elapsedHours: 1 });
    expect('produced' in trend[1]).toBe(false);
  });
  it('rejects invalid period', () => {
    expect(buildProductionTrend([], 0, now)).toEqual([]);
  });
});
