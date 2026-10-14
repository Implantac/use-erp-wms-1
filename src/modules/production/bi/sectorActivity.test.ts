import { describe, expect, it } from 'vitest';
import { aggregateSectorActivity } from './sectorActivity';
describe('sector activity without invalid cost and unit mixing', () => {
  it('counts OPs but does not invent hours for zero/invalid elapsed time', () => {
    expect(aggregateSectorActivity([
      { sector: 'Malharia', realized_time_minutes: 0 },
      { sector: 'Malharia', realized_time_minutes: Number.NaN },
    ])).toEqual([{ sector: 'Malharia', orders: 2, timedOrders: 0, laborHours: null }]);
  });
  it('sums only positive observed minutes by sector and labels unknown sector', () => {
    expect(aggregateSectorActivity([
      { sector: 'Corte', realized_time_minutes: 90 },
      { work_center: 'Corte', realized_time_minutes: 30 },
      { realized_time_minutes: -40 },
    ])).toEqual([
      { sector: 'Corte', orders: 2, timedOrders: 2, laborHours: 2 },
      { sector: 'Setor não informado', orders: 1, timedOrders: 0, laborHours: null },
    ]);
  });
});
