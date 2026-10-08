import { describe, expect, it } from 'vitest';
import { validatePresumedCredit, type PresumedCreditCatalogEntry, type PresumedCreditRequest } from './presumedCredit';

const entry: PresumedCreditCatalogEntry = {
  version: 'fixture', code: '01', version_valid_from: '2026-10-16', version_valid_until: null,
  cbs_valid_from: '2026-01-01', cbs_valid_until: null,
  ibs_valid_from: '2029-01-01', ibs_valid_until: null,
  allow_nfe: true, allow_nfce: false, allow_cte: false, allow_nfse: true,
  appropriation_via_invoice: false, appropriation_via_event: true,
  allow_cbs_group: true, allow_ibs_group: true,
};
const request: PresumedCreditRequest = {
  code: '01', date: '2026-10-16', tax: 'cbs', document: 'nfe', route: 'event',
  classificationAllowsOperationalCredit: true,
};

describe('presumed credit catalog guard', () => {
  it('fails closed without a catalog or classification permission', () => {
    expect(validatePresumedCredit([], request).valid).toBe(false);
    expect(validatePresumedCredit([entry], { ...request, classificationAllowsOperationalCredit: false }).valid).toBe(false);
  });
  it('does not silently choose between overlapping versions', () => {
    expect(validatePresumedCredit([entry, { ...entry, version: 'other' }], request).valid).toBe(false);
  });
  it('enforces distinct tax windows and version windows', () => {
    expect(validatePresumedCredit([entry], { ...request, tax: 'ibs' }).valid).toBe(false);
    expect(validatePresumedCredit([entry], { ...request, date: '2026-10-15' }).valid).toBe(false);
    expect(validatePresumedCredit([entry], { ...request, date: '2026-13-99' }).valid).toBe(false);
  });
  it('enforces document and appropriation route independently', () => {
    expect(validatePresumedCredit([entry], { ...request, document: 'nfce' }).valid).toBe(false);
    expect(validatePresumedCredit([entry], { ...request, route: 'invoice' }).valid).toBe(false);
    expect(validatePresumedCredit([entry], request)).toEqual({ valid: true });
  });
  it('rejects absent code and disabled group', () => {
    expect(validatePresumedCredit([entry], { ...request, code: '03' }).valid).toBe(false);
    expect(validatePresumedCredit([{ ...entry, allow_cbs_group: false }], request).valid).toBe(false);
  });
});
