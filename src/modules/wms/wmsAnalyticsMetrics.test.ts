import { describe, expect, it } from 'vitest';
import { measuredPercent } from './wmsAnalyticsMetrics';

describe('WMS measured rates', () => {
  it('does not invent perfect KPI when there are no observations', () => {
    expect(measuredPercent(0, 0)).toBeNull();
    expect(measuredPercent(3, 4)).toBe(75);
    expect(measuredPercent(5, 4)).toBeNull();
  });
});
