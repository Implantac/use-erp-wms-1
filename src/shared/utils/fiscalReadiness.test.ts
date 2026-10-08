import { describe, expect, it } from 'vitest';
import { checkFiscalCoverage, type FiscalContext, type FiscalCoverage } from './fiscalReadiness';

const context: FiscalContext = { companyId: 'tenant-a', documentModel: 'NFE', operationKind: 'venda', cfop: '5102', taxRegime: 'lucro_real', date: '2026-10-08' };
const row: FiscalCoverage = { company_id: 'tenant-a', document_model: 'NFE', operation_kind: 'venda', cfop: '5102', tax_regime: 'lucro_real', valid_from: '2026-01-01', valid_until: null, status: 'homologated' };

describe('fiscal onboarding coverage guard', () => {
  it('rejects missing, draft, duplicate or expired coverage', () => {
    expect(checkFiscalCoverage([], context)).not.toEqual([]);
    expect(checkFiscalCoverage([{ ...row, status: 'draft' }], context)).not.toEqual([]);
    expect(checkFiscalCoverage([row, row], context)).not.toEqual([]);
    expect(checkFiscalCoverage([{ ...row, valid_until: '2026-10-07' }], context)).not.toEqual([]);
  });
  it('never borrows a rule from another company, regime, CFOP or document', () => {
    for (const change of [{ companyId: 'tenant-b' }, { taxRegime: 'simples_nacional' }, { cfop: '6102' }, { documentModel: 'NFCE' }, { operationKind: 'devolucao' }]) {
      expect(checkFiscalCoverage([row], { ...context, ...change })).not.toEqual([]);
    }
  });
  it('rejects malformed date and code and accepts one reviewed fixture only when homologated', () => {
    expect(checkFiscalCoverage([row], { ...context, date: '2026-02-31' })).not.toEqual([]);
    expect(checkFiscalCoverage([row], { ...context, cfop: '9999' })).not.toEqual([]);
    expect(checkFiscalCoverage([row], context)).toEqual([]);
  });
});
