/**
 * Fiscal preview only. No legal classification or NF-e XML is inferred here.
 * Missing explicit rules must fail rather than fabricating rates or reductions.
 */
export interface TaxCalculationResult {
  icms_base: number;
  icms_value: number;
  icms_st_value: number;
  ipi_value: number;
  pis_value: number;
  cofins_value: number;
  cbs_value: number;
  ibs_value: number;
  total_taxes: number;
}

export interface TaxRuleLike {
  origin_state?: string | null;
  destination_state?: string | null;
  ncm?: string | null;
  icms_rate?: number | null;
  icms_st_rate?: number | null;
  ipi_rate?: number | null;
  pis_rate?: number | null;
  cofins_rate?: number | null;
  cbs_rate?: number | null;
  ibs_rate?: number | null;
}

function explicitRate(value: number | null | undefined, name: string): number {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`Regra fiscal incompleta: ${name} precisa de alíquota explícita e válida.`);
  }
  return value;
}

export const calculateTaxes = (
  item: { price: number; quantity: number; ncm?: string },
  origin: string,
  destination: string,
  rules: TaxRuleLike[],
  _taxRegime: string = 'simples_nacional',
  regimeType: 'current' | 'hybrid' | 'reformed' = 'current',
): TaxCalculationResult => {
  if (!Number.isFinite(item.price) || !Number.isFinite(item.quantity) || item.price < 0 || item.quantity <= 0) {
    throw new Error('Valor ou quantidade do item inválidos para cálculo fiscal.');
  }
  const rule = rules.find(r => r.origin_state === origin && r.destination_state === destination && r.ncm === item.ncm)
    ?? rules.find(r => r.origin_state === origin && r.destination_state === destination && !r.ncm);
  if (!rule) throw new Error('Regra fiscal ausente para a operação, UF e NCM informados.');

  const baseAmount = item.price * item.quantity;
  const current = regimeType !== 'reformed';
  const reform = regimeType !== 'current';
  const icms_value = current ? baseAmount * explicitRate(rule.icms_rate, 'ICMS') / 100 : 0;
  const ipi_value = current ? baseAmount * explicitRate(rule.ipi_rate, 'IPI') / 100 : 0;
  const pis_value = current ? baseAmount * explicitRate(rule.pis_rate, 'PIS') / 100 : 0;
  const cofins_value = current ? baseAmount * explicitRate(rule.cofins_rate, 'COFINS') / 100 : 0;
  const icms_st_value = current ? baseAmount * explicitRate(rule.icms_st_rate, 'ICMS-ST') / 100 : 0;
  const cbs_value = reform ? baseAmount * explicitRate(rule.cbs_rate, 'CBS') / 100 : 0;
  const ibs_value = reform ? baseAmount * explicitRate(rule.ibs_rate, 'IBS') / 100 : 0;

  // IBS/CBS amounts are informational in this preview and must not be added
  // to a payment total. The 2026 treatment depends on document and regime.
  return {
    icms_base: baseAmount, icms_value, icms_st_value, ipi_value, pis_value,
    cofins_value, cbs_value, ibs_value,
    total_taxes: icms_value + icms_st_value + ipi_value + pis_value + cofins_value,
  };
};

/** There is no authorized XML builder in this module. */
export function generateNFeXML(): never {
  throw new Error('XML fiscal indisponível: exige leiaute vigente, assinatura, validação e protocolo oficial.');
}
