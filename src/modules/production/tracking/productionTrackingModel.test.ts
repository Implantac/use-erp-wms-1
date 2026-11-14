import { describe, expect, it } from 'vitest';
import { allowedTrackingSectors, buildTrackingCsv, defaultTrackingFilters, displayTrackingNumber, parseTrackingSectorAccess,
  trackingDateRange, trackingPageSummary, trackingProgress, trackingQuantityIssues, type TrackingRow } from './productionTrackingModel';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const fixture: TrackingRow = { id: id(1), company_id: id(2), branch_id: null, order_number: 'OP-1', product_code: 'TEC-1',
  product_name: 'Tecido', quantity: 100, produced_quantity: 50, rejected_quantity: null, unit: 'm', status: 'in_progress', priority: 'high',
  sector: 'tecelagem', work_center: null, client_name: null, sales_order_id: null, start_date: null, due_date: '2026-11-01',
  completed_date: null, created_at: '2026-11-04T10:00:00Z', updated_at: '2026-11-04T10:00:00Z' };

describe('production tracking model: no fake KPIs', () => {
  it('defaults to 30 inclusive local calendar dates, with explicit created-at range', () => {
    const filters = defaultTrackingFilters(new Date(2026, 10, 4, 12));
    expect(filters.start).toBe('2026-10-06'); expect(filters.end).toBe('2026-11-04');
    const range = trackingDateRange(filters);
    expect(new Date(range.before).getDate()).toBe(5);
    expect(new Date(range.from).getDate()).toBe(6);
  });
  it.each([{ start: '', end: '2026-11-04' }, { start: '2026-02-31', end: '2026-11-04' },
    { start: '2026-11-05', end: '2026-11-04' }])('rejects invalid/inverted calendar inputs %j', filters => {
    expect(() => trackingDateRange(filters)).toThrow();
  });
  it('distinguishes registered progress from efficiency and excess production', () => {
    expect(trackingProgress(fixture)).toEqual({ percent: 50, label: '50% produzido/planejado' });
    expect(trackingProgress({ ...fixture, produced_quantity: 120 })).toEqual({ percent: null, label: 'Acima do planejado — conferir' });
  });
  it.each([0, -1, NaN, Infinity])('does not fabricate a valid percentage for planned %s', quantity => {
    expect(trackingProgress({ ...fixture, quantity }).percent).toBeNull();
  });
  it.each([-1, NaN, Infinity])('flags invalid rejected quantities %s without inventing approved production', rejected_quantity => {
    const row = { ...fixture, rejected_quantity };
    expect(trackingQuantityIssues(row)).toContain('Rejeitado informado inválido ou negativo');
    expect(buildTrackingCsv([row])).toContain('Rejeitado informado inválido ou negativo');
    expect(trackingQuantityIssues({ ...fixture, rejected_quantity: null })).toEqual([]);
  });
  it.each([-1, NaN, Infinity])('does not clamp invalid produced values %s into a percentage', produced_quantity => {
    expect(trackingProgress({ ...fixture, produced_quantity }).percent).toBeNull();
    expect(trackingQuantityIssues({ ...fixture, produced_quantity }).length).toBeGreaterThan(0);
  });
  it('preserves missing and non-finite values as unavailable, not zero', () => {
    expect(displayTrackingNumber(null)).toBe('Não apurado'); expect(displayTrackingNumber(Infinity)).toBe('Não apurado');
    expect(displayTrackingNumber(0)).toBe('0');
    expect(buildTrackingCsv([fixture])).toContain('Não informado');
  });
  it('returns page counts, never a mixed-unit production total', () => {
    const rows = [fixture, { ...fixture, id: id(3), unit: 'kg', status: 'completed', produced_quantity: 10 }];
    expect(trackingPageSummary(rows, new Date('2026-11-04T12:00:00Z'))).toEqual({ total: 2, inProgress: 1, completed: 1, late: 1 });
    expect(trackingPageSummary(rows)).not.toHaveProperty('totalProduced');
  });
  it('parses explicit sector authority and rejects absent/unknown permissive fallbacks', () => {
    const access = parseTrackingSectorAccess({ is_admin: false, enforced: true, access: { tecelagem: 'viewer' } });
    expect(allowedTrackingSectors(access)).toEqual(['tecelagem']);
    expect(allowedTrackingSectors({ ...access, access: {} })).toEqual([]);
    expect(allowedTrackingSectors({ ...access, is_admin: true })).toBeNull();
    expect(() => parseTrackingSectorAccess(null)).toThrow();
    expect(() => parseTrackingSectorAccess({ is_admin: false, enforced: true, access: { tecelagem: 'superuser' } })).toThrow();
  });
  it('generates actual BOM/semicolon CSV with accents, delimiters, quotes and CRLF', () => {
    const csv = buildTrackingCsv([{ ...fixture, product_name: 'Tecido; "azul"\r\nalgodão', unit: 'm' }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Tecido; ""azul""\r\nalgodão"');
    expect(csv).toContain(';m;'); expect(csv.endsWith('\r\n')).toBe(true);
  });
  it.each(['=1+1', '+CMD', '-CMD', '@SUM(A1)', '\t=1+1', '\n=1+1', '  =1+1'])('neutralizes textual spreadsheet formulas %j', product_name => {
    expect(buildTrackingCsv([{ ...fixture, product_name }])).toContain(`'${product_name}`);
  });
  it('does not neutralize numeric negative values as though they were text', () => {
    const csv = buildTrackingCsv([{ ...fixture, quantity: -3 }]);
    expect(csv).toContain(';-3;'); expect(csv).not.toContain(";'-3;");
  });
});
