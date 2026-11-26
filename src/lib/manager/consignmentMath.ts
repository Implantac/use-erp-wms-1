/**
 * Cálculos puros do módulo de consignação — saldos e sugestão de
 * remanejo entre lojas por GIRO (peça parada na loja de giro baixo →
 * loja onde o giro é maior / está em ruptura).
 * Sem dependência de Supabase — testável isoladamente.
 */

export interface ConsignBalanceLike {
  branchId: string;
  productId: string;
  qtyReceived: number;
  qtySold: number;
  qtySponsored: number;
  qtyReturned: number;
  qtyTransferredIn: number;
  qtyTransferredOut: number;
  consignedValue: number;
  soldValue: number;
  settledValue: number;
}

/** Peças sob consignação realmente disponíveis na loja. */
export function availableQty(b: ConsignBalanceLike): number {
  return (
    (b.qtyReceived || 0) +
    (b.qtyTransferredIn || 0) -
    (b.qtySold || 0) -
    (b.qtySponsored || 0) -
    (b.qtyReturned || 0) -
    (b.qtyTransferredOut || 0)
  );
}

/** Valor vendido em consignação ainda não liquidado pela loja. */
export function pendingSettlement(b: ConsignBalanceLike): number {
  return Math.max(0, (b.soldValue || 0) - (b.settledValue || 0));
}

export interface StoreProductStock {
  branchId: string;
  productId: string;
  available: number;
  /** Demanda média diária da loja para o produto (un/dia) */
  dailyDemand: number;
}

export interface ConsignTransferSuggestion {
  productId: string;
  fromBranchId: string;
  toBranchId: string;
  /** Quantidade sugerida para mover */
  qty: number;
  /** Dias de cobertura que a origem tem (giro baixo = alto) */
  sourceCoverageDays: number;
  /** Dias de cobertura do destino antes do remanejo */
  destCoverageDays: number;
  reason: string;
}

export interface SuggestOptions {
  /** Origem precisa ter, no mínimo, esta cobertura em dias (padrão 45) */
  minSourceCoverageDays?: number;
  /** Destino só é candidato abaixo desta cobertura em dias (padrão 7) */
  maxDestCoverageDays?: number;
  /** Dias de cobertura alvo pós-remanejo (padrão 30) */
  targetCoverageDays?: number;
  /** Máximo de sugestões retornadas */
  limit?: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Para cada produto, encontra a melhor par origem→destino:
 *  - origem: sobra real (cobertura >= minSourceCoverageDays) — giro baixo,
 *    a peça está parada lá;
 *  - destino: ruptura/atenção (cobertura < maxDestCoverageDays) — giro maior
 *    que a origem, mercadoria faz falta;
 *  - quantidade: o que falta para o destino chegar ao alvo, limitado ao
 *    excedente da origem (a origem mantém targetCoverageDays para si).
 */
export function suggestConsignmentTransfers(
  stocks: StoreProductStock[],
  opts: SuggestOptions = {},
): ConsignTransferSuggestion[] {
  const minSourceCoverage = opts.minSourceCoverageDays ?? 45;
  const maxDestCoverage = opts.maxDestCoverageDays ?? 7;
  const targetCoverage = opts.targetCoverageDays ?? 30;
  const limit = opts.limit ?? 50;

  const byProduct = new Map<string, StoreProductStock[]>();
  for (const s of stocks) {
    if (!s || s.available <= 0) continue;
    const list = byProduct.get(s.productId) ?? [];
    list.push(s);
    byProduct.set(s.productId, list);
  }

  const suggestions: ConsignTransferSuggestion[] = [];

  for (const [productId, list] of byProduct) {
    if (list.length < 2) continue;

    const coverageOf = (s: StoreProductStock): number =>
      s.dailyDemand > 0 ? s.available / s.dailyDemand : Number.POSITIVE_INFINITY;

    // Só faz sentido se algum destino tem demanda (giro) e está necessitando
    const destCandidates = list
      .filter((s) => s.dailyDemand > 0 && coverageOf(s) < maxDestCoverage)
      .sort((a, b) => coverageOf(a) - coverageOf(b));

    if (destCandidates.length === 0) continue;

    const dest = destCandidates[0];
    const destCoverage = coverageOf(dest);

    const sourceCandidates = list
      .filter((s) => s.branchId !== dest.branchId && coverageOf(s) >= minSourceCoverage)
      // maior cobertura primeiro = peça mais parada = giro mais baixo
      .sort((a, b) => coverageOf(b) - coverageOf(a));

    if (sourceCandidates.length === 0) continue;

    const source = sourceCandidates[0];
    const sourceCoverage = coverageOf(source);

    const destNeed = Math.ceil(dest.dailyDemand * targetCoverage - dest.available);
    const sourceKeep = source.dailyDemand > 0
      ? Math.ceil(source.dailyDemand * targetCoverage)
      : 0;
    const sourceSurplus = Math.floor(source.available - sourceKeep);
    const qty = Math.min(destNeed, sourceSurplus);

    if (qty <= 0) continue;

    const sourceGiro = source.dailyDemand > 0 ? round2(source.dailyDemand) : 0;
    const destGiro = round2(dest.dailyDemand);

    suggestions.push({
      productId,
      fromBranchId: source.branchId,
      toBranchId: dest.branchId,
      qty,
      sourceCoverageDays: Number.isFinite(sourceCoverage) ? round2(sourceCoverage) : 999,
      destCoverageDays: round2(destCoverage),
      reason:
        `Origem com ${Number.isFinite(sourceCoverage) ? sourceCoverage.toFixed(0) : '∞'} dias de cobertura ` +
        `(giro ${sourceGiro}/dia) → destino com ${destCoverage.toFixed(1)} dia(s) ` +
        `(giro ${destGiro}/dia). Mover ${qty} un para cobrir ${targetCoverage} dias no destino.`,
    });
  }

  return suggestions
    .sort((a, b) => a.destCoverageDays - b.destCoverageDays)
    .slice(0, limit);
}

/** Giro diário médio de uma loja para um produto a partir das vendas. */
export function dailyGiro(soldQty: number, days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 0;
  return round2(Math.max(0, soldQty) / days);
}
