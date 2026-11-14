import { describe, expect, it } from 'vitest';
import { canReleaseInContext, formatReleaseQuantity, INTERCOMPANY_RELEASE_OPERATIONAL_ENABLED,
  parseIntercompanyReleaseResult, parseIntercompanyReleaseRow, releasePresentation } from './intercompanyRelease';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = { id: id(1), request_id: id(2), company_id: id(3), branch_id: null, requesting_company_id: id(4), requesting_branch_id: null,
  production_order_id: id(5), completion_id: id(6), output_lot_id: id(7), stock_balance_id: id(8), sales_order_id: id(9), order_item_id: id(10),
  reservation_id: id(11), quantity: 10, unit: 'm', release_status: 'reservada_bloqueada_fiscal', released_by: id(12), released_at: '2026-11-04T10:00:00Z' };
const result = { id: id(2), status: 'producao_solicitada', release_id: id(1), release_status: 'reservada_bloqueada_fiscal',
  production_order_id: id(5), completion_id: id(6), output_lot_id: id(7), sales_order_id: id(9), reservation_id: id(11), quantity: 10,
  unit: 'm', dispatch_enabled: false, idempotent_replay: false };

describe('LOJ-05A contract and presentation', () => {
  it('keeps operational activation closed in candidate source', () => expect(INTERCOMPANY_RELEASE_OPERATIONAL_ENABLED).toBe(false));
  it('parses persisted proof without inventing dispatch_enabled as a column', () => {
    expect(parseIntercompanyReleaseRow(row)).toEqual(row);
    expect(row).not.toHaveProperty('dispatch_enabled');
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid release quantity %s', quantity => {
    expect(() => parseIntercompanyReleaseRow({ ...row, quantity })).toThrow();
  });
  it('requires a valid unit, timestamp and distinct companies', () => {
    for (const patch of [{ unit: '' }, { released_at: 'invalid' }, { requesting_company_id: id(3) }]) expect(() => parseIntercompanyReleaseRow({ ...row, ...patch })).toThrow();
  });
  it('accepts success/replay only with unchanged closed contract and request identity', () => {
    expect(parseIntercompanyReleaseResult(result, id(2))).toEqual(result);
    expect(parseIntercompanyReleaseResult({ ...result, idempotent_replay: true }, id(2)).sales_order_id).toBe(id(9));
    for (const patch of [{ dispatch_enabled: true }, { status: 'aprovada' }, { release_status: 'disponivel_expedicao' }, { id: id(33) }, { idempotent_replay: null }]) {
      expect(() => parseIntercompanyReleaseResult({ ...result, ...patch }, id(2))).toThrow();
    }
  });
  it('requires exact active root and admin/manager, not visual system_admin/admin_matriz access', () => {
    const base = { userId: id(12), companyId: id(3), rootCompanyId: id(3), rolesReady: true };
    expect(canReleaseInContext({ ...base, roles: [{ company_id: id(3), role: 'manager' }] })).toBe(true);
    for (const role of ['operator', 'system_admin', 'admin_matriz']) expect(canReleaseInContext({ ...base, roles: [{ company_id: id(3), role }] })).toBe(false);
    expect(canReleaseInContext({ ...base, rolesReady: false, roles: [{ company_id: id(3), role: 'admin' }] })).toBe(false);
    expect(canReleaseInContext({ ...base, companyId: id(4), roles: [{ company_id: id(3), role: 'admin' }] })).toBe(false);
  });
  it('does not equate read failures/loading with no proof', () => {
    for (const state of ['loading', 'error', 'incompatible', 'inconsistent', 'unavailable'] as const) {
      expect(releasePresentation({ requestId: id(2), productionOrderId: id(5), productionStatus: 'completed', readState: state }).canReview).toBe(false);
    }
  });
  it('offers review only for officially completed OP and no visible proof', () => {
    const base = { requestId: id(2), productionOrderId: id(5), readState: 'ready' as const };
    expect(releasePresentation({ ...base, productionStatus: 'planned' }).canReview).toBe(false);
    expect(releasePresentation({ ...base, productionStatus: 'completed' }).canReview).toBe(true);
    expect(releasePresentation({ ...base, productionOrderId: null }).kind).toBe('inconsistent');
  });
  it('shows closed reservation, but rejects inconsistent links even for a completed OP', () => {
    const proof = parseIntercompanyReleaseRow(row);
    expect(releasePresentation({ requestId: id(2), productionOrderId: id(5), salesOrderId: id(9), readState: 'ready', release: proof }).kind).toBe('reserved');
    expect(releasePresentation({ requestId: id(2), productionOrderId: id(5), salesOrderId: null, readState: 'ready', release: proof }).kind).toBe('inconsistent');
  });
  it('does not default an unknown unit/quantity to physical units or zero', () => {
    expect(formatReleaseQuantity(null)).toContain('Não apurada');
    expect(formatReleaseQuantity(10)).toContain('unidade não informada');
    expect(formatReleaseQuantity(10, 'kg')).toBe('10 kg');
  });
});
