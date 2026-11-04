export interface ReworkDraft {
  originalOrderId: string | null;
  quantity: number | null;
  lotRemaining: number;
  reason: string;
}

/**
 * Reprocesso nasce de um lote real e de uma OP original: motivo obrigatório
 * e quantidade nunca acima do saldo restante do lote. A quantidade boa do
 * reprocesso substitui a do lote original — não se soma como produção nova.
 */
export function validateReworkDraft(draft: ReworkDraft): string | null {
  if (!draft.originalOrderId) return "Selecione a ordem de produção original do lote.";
  if (!draft.reason.trim()) return "Informe o motivo do reprocesso.";
  if (draft.quantity === null || !Number.isFinite(draft.quantity) || draft.quantity <= 0) {
    return "Informe a quantidade a reprocessar.";
  }
  if (draft.quantity > draft.lotRemaining + 0.0005) {
    return "A quantidade a reprocessar não pode passar do saldo restante do lote.";
  }
  return null;
}

export const REWORK_STATUS_LABELS: Record<string, string> = {
  planned: "Planejado",
  in_progress: "Em reprocesso",
  completed: "Concluído",
  cancelled: "Cancelado",
};
