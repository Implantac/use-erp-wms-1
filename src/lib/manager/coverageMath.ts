/**
 * Cálculos puros de cobertura e ruptura de estoque por unidade.
 * Sem dependência de Supabase — testável isoladamente.
 *
 * Mesmos limiares do stockEngine do sistema:
 *   critical  → projeta menos de 1 dia, ou abaixo de 50% do mínimo
 *   attention → abaixo de 3 dias, ou abaixo do mínimo
 *   excess    → acima do máximo, ou mais de 30 dias de cobertura
 *   normal    → demais casos
 *   no_data   → sem histórico de demanda (não é ruptura, é "sem giro")
 */

export type CoverageStatus = 'critical' | 'attention' | 'normal' | 'excess' | 'no_data';

export interface CoverageInput {
  /** Saldo físico */
  quantity: number;
  /** Reservado (não disponível) */
  reserved?: number;
  /** Em trânsito a caminho (entra na projeção) */
  inTransit?: number;
  /** Demanda média diária real (un/dia) */
  dailyDemand: number;
  minStock?: number;
  maxStock?: number;
}

export interface CoverageResult {
  available: number;
  projected: number;
  /** Peças a caminho (em trânsito) */
  inTransit: number;
  dailyDemand: number;
  /** Dias até zerar; null quando não há demanda calculável */
  coverageDays: number | null;
  /** Data prevista de ruptura; null quando sem demanda ou sem estoque projetado */
  ruptureDate: Date | null;
  status: CoverageStatus;
  /** Quanto falta para chegar ao alvo (mín ou máxima cobertura) */
  gapToMin: number;
}

const num = (v: number | null | undefined): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function computeCoverage(input: CoverageInput, now: Date = new Date()): CoverageResult {
  const quantity = num(input.quantity);
  const reserved = num(input.reserved);
  const inTransit = num(input.inTransit);
  const dailyDemand = num(input.dailyDemand);
  const minStock = num(input.minStock);
  const maxStock = num(input.maxStock);

  const available = quantity - reserved;
  const projected = available + inTransit;

  const hasDemand = dailyDemand > 0;
  const coverageDays = hasDemand ? projected / dailyDemand : null;

  let status: CoverageStatus;
  if (!hasDemand) {
    status = 'no_data';
  } else if (projected <= 0 || (minStock > 0 && projected < minStock * 0.5) || (coverageDays !== null && coverageDays < 1)) {
    status = 'critical';
  } else if ((minStock > 0 && projected < minStock) || (coverageDays !== null && coverageDays < 3)) {
    status = 'attention';
  } else if ((maxStock > 0 && projected > maxStock) || (coverageDays !== null && coverageDays > 30)) {
    status = 'excess';
  } else {
    status = 'normal';
  }

  let ruptureDate: Date | null = null;
  if (hasDemand && projected > 0 && coverageDays !== null) {
    ruptureDate = new Date(now.getTime() + coverageDays * 24 * 60 * 60 * 1000);
  } else if (hasDemand && projected <= 0) {
    ruptureDate = new Date(now);
  }

  const target = minStock > 0 ? minStock : 0;
  const gapToMin = Math.max(0, target - projected);

  return {
    available,
    projected,
    inTransit,
    dailyDemand,
    coverageDays,
    ruptureDate,
    status,
    gapToMin,
  };
}

export function coverageLabel(status: CoverageStatus): string {
  switch (status) {
    case 'critical':
      return 'Ruptura';
    case 'attention':
      return 'Atenção';
    case 'normal':
      return 'Saudável';
    case 'excess':
      return 'Excesso';
    case 'no_data':
      return 'Sem giro';
  }
}

export function formatRuptureDate(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function coverageDaysText(days: number | null): string {
  if (days === null) return 'sem demanda';
  if (days >= 999) return '999+ dias';
  return `${days.toFixed(1)} d`;
}
