// RTC cCredPres: validation only. This module never determines entitlement,
// calculates amounts, creates fiscal XML or posts accounting credits.
export type CreditDocument = 'nfe' | 'nfce' | 'cte' | 'nfse';
export type CreditTax = 'ibs' | 'cbs';
export type CreditRoute = 'invoice' | 'event';

export interface PresumedCreditCatalogEntry {
  version: string;
  code: string;
  version_valid_from: string;
  version_valid_until: string | null;
  cbs_valid_from: string | null;
  cbs_valid_until: string | null;
  ibs_valid_from: string | null;
  ibs_valid_until: string | null;
  allow_nfe: boolean;
  allow_nfce: boolean;
  allow_cte: boolean;
  allow_nfse: boolean;
  appropriation_via_invoice: boolean;
  appropriation_via_event: boolean;
  allow_cbs_group: boolean;
  allow_ibs_group: boolean;
}

export interface PresumedCreditRequest {
  code: string;
  date: string; // Date of the fiscal operation, YYYY-MM-DD.
  document: CreditDocument;
  tax: CreditTax;
  route: CreditRoute;
  // From the applicable official cClassTrib table. Never infer from the code.
  classificationAllowsOperationalCredit: boolean;
}

const isoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const inWindow = (date: string, start: string | null, end: string | null): boolean =>
  start !== null && date >= start && (end === null || date <= end);

/** Fails closed when the audited official catalog/version is absent or ambiguous. */
export function validatePresumedCredit(
  entries: readonly PresumedCreditCatalogEntry[],
  request: PresumedCreditRequest,
): { valid: true } | { valid: false; reason: string } {
  if (!isoDate(request.date) || !/^[0-9]{2}$/.test(request.code)) {
    return { valid: false, reason: 'Data ou código de crédito presumido inválido.' };
  }
  if (!request.classificationAllowsOperationalCredit) {
    return { valid: false, reason: 'A classificação tributária não permite crédito presumido da operação.' };
  }
  // All rows for an imported version must share the same version window.
  // Do not accept a stale version when multiple versions cover the same date.
  const versions = new Set(entries.filter(entry =>
    inWindow(request.date, entry.version_valid_from, entry.version_valid_until),
  ).map(entry => entry.version));
  if (versions.size !== 1) {
    return { valid: false, reason: 'Tabela oficial vigente de crédito presumido ausente ou ambígua.' };
  }
  const version = [...versions][0];
  const matches = entries.filter(entry => entry.version === version && entry.code === request.code);
  if (matches.length !== 1) {
    return { valid: false, reason: 'Código não consta na tabela oficial vigente.' };
  }
  const entry = matches[0];
  if (!inWindow(request.date, entry[`${request.tax}_valid_from`], entry[`${request.tax}_valid_until`])) {
    return { valid: false, reason: `Crédito presumido de ${request.tax.toUpperCase()} fora de vigência.` };
  }
  if (!entry[`allow_${request.document}`]) {
    return { valid: false, reason: 'Código não permitido para este modelo de documento.' };
  }
  if (!entry[`appropriation_via_${request.route}`]) {
    return { valid: false, reason: 'Via de apropriação não permitida na tabela vigente.' };
  }
  if (!entry[`allow_${request.tax}_group`]) {
    return { valid: false, reason: 'Grupo do tributo não permitido na tabela vigente.' };
  }
  return { valid: true };
}
