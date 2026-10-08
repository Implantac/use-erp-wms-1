// Onboarding coverage checks only. A passing check is NOT permission to emit
// a fiscal document or calculate tax: no emission workflow uses this result.
export interface FiscalCoverage {
  company_id: string;
  document_model: string;
  operation_kind: string;
  cfop: string | null;
  tax_regime: string;
  valid_from: string;
  valid_until: string | null;
  status: 'draft' | 'reviewed' | 'homologated' | 'suspended';
}
export interface FiscalContext {
  companyId: string;
  documentModel: string;
  operationKind: string;
  cfop: string;
  taxRegime: string;
  date: string;
}

export function checkFiscalCoverage(rows: readonly FiscalCoverage[], context: FiscalContext): string[] {
  const issues: string[] = [];
  if (!context.companyId || !context.taxRegime || !context.documentModel || !context.operationKind) {
    issues.push('Contexto da empresa, regime, documento ou operação incompleto.');
  }
  const parsedDate = new Date(`${context.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(context.date) ||
      Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== context.date) {
    issues.push('Data da operação inválida.');
  }
  if (!/^[1-7][0-9]{3}$/.test(context.cfop)) issues.push('CFOP inválido quanto ao formato.');
  if (issues.length) return issues;
  const matching = rows.filter(row => row.company_id === context.companyId &&
    row.document_model === context.documentModel && row.operation_kind === context.operationKind &&
    row.tax_regime === context.taxRegime && row.cfop === context.cfop &&
    row.valid_from <= context.date && (!row.valid_until || row.valid_until >= context.date));
  if (matching.length !== 1) {
    issues.push('Cobertura fiscal específica ausente ou ambígua para empresa, CFOP, regime, documento, operação e data.');
  } else if (matching[0].status !== 'homologated') {
    issues.push('Cobertura fiscal ainda não homologada para este cliente.');
  }
  return issues;
}
