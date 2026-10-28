/**
 * Ranking transparente de origens para uma solicitação de abastecimento.
 * Não decide sozinho — ordena e MARCA a recomendada para o gestor confirmar.
 * Regra (sempre exibida ao gestor):
 *  1. quem cobre o pedido inteiro vem antes de saldo parcial;
 *  2. entre os que cobrem: CD primeiro (logística mais curta), depois outra
 *     Loja (remanejo), por último a Fábrica (pode exigir produzir/vender);
 *  3. desempate: maior saldo disponível.
 * Se ninguém cobre, a recomendada é o maior saldo parcial, sinalizado como
 * parcial — nunca apresentada como se cobrisse o pedido.
 */
export interface SupplyCandidateLike {
  source_kind: 'LOJA' | 'CD' | 'FABRICA';
  branch_id: string;
  quantity: number;
}

export interface RankedCandidate<T extends SupplyCandidateLike> {
  candidate: T;
  covers: boolean;
  recommended: boolean;
  reason: string | null;
}

const KIND_PRIORITY: Record<SupplyCandidateLike['source_kind'], number> = { CD: 0, LOJA: 1, FABRICA: 2 };

export function rankSupplyCandidates<T extends SupplyCandidateLike>(
  candidates: T[],
  requestedQty: number,
): Array<RankedCandidate<T>> {
  const sorted = [...candidates].sort((a, b) => {
    const coversA = a.quantity >= requestedQty && a.quantity > 0;
    const coversB = b.quantity >= requestedQty && b.quantity > 0;
    if (coversA !== coversB) return coversA ? -1 : 1;
    if (coversA && coversB) {
      const kindDiff = KIND_PRIORITY[a.source_kind] - KIND_PRIORITY[b.source_kind];
      if (kindDiff !== 0) return kindDiff;
    }
    return b.quantity - a.quantity;
  });

  return sorted.map((candidate, index) => {
    const covers = candidate.quantity >= requestedQty && candidate.quantity > 0;
    const recommended = index === 0 && candidate.quantity > 0;
    let reason: string | null = null;
    if (recommended) {
      reason = covers
        ? candidate.source_kind === 'FABRICA'
          ? 'Recomendada: cobre o pedido, mas é a Fábrica — confirme se vale produzir/expedir de lá.'
          : 'Recomendada: cobre o pedido inteiro com a logística mais curta.'
        : 'Recomendada (parcial): maior saldo disponível — NÃO cobre o pedido inteiro.';
    }
    return { candidate, covers, recommended, reason };
  });
}
