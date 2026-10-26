/**
 * Pré-requisitos operacionais para concluir uma OP e registrar a ENTRADA EM
 * ESTOQUE do produto acabado. Espelha as travas de `complete_production_order`
 * (migration 20261019110000) para o operador enxergar, na própria tela, o que
 * falta — em vez de um botão desabilitado sem explicação. A RPC continua sendo
 * a autoridade; isto é apenas orientação fiel às mesmas regras.
 */
export interface ReadinessStep { status: string }
export interface ReadinessInspection { status: string; approved_quantity: number }

export interface CompletionReadinessItem {
  key: 'status' | 'steps' | 'quality' | 'bom';
  label: string;
  ok: boolean;
  hint: string;
}

const BLOCKED_QUALITY = new Set(['blocked', 'rejected', 'quarantine', 'bloqueada', 'bloqueado', 'rejeitada', 'rejeitado', 'quarentena']);

export function computeCompletionReadiness(input: {
  orderStatus: string;
  plannedQuantity: number;
  steps: ReadinessStep[];
  inspections: ReadinessInspection[];
  bomLineCount: number;
}): { items: CompletionReadinessItem[]; ready: boolean; approvedQuantity: number } {
  const executable = ['in_progress', 'finishing', 'quality_check'].includes(input.orderStatus);
  const completed = input.orderStatus === 'completed';
  const stepsDone = input.steps.length > 0 && input.steps.every((step) => step.status === 'completed');
  const approvedInspections = input.inspections.filter((i) => i.status.toLowerCase() === 'approved');
  const approvedQuantity = approvedInspections.reduce((sum, i) => sum + (Number(i.approved_quantity) || 0), 0);
  const hasBlocked = input.inspections.some((i) => BLOCKED_QUALITY.has(i.status.toLowerCase()));
  const qualityOk = approvedInspections.length > 0 && !hasBlocked && approvedQuantity >= input.plannedQuantity && input.plannedQuantity > 0;

  const items: CompletionReadinessItem[] = [
    {
      key: 'status',
      label: 'OP em execução',
      ok: executable || completed,
      hint: completed ? 'OP já concluída.' : executable ? 'Status permite a conclusão.' : 'Inicie a primeira etapa no apontamento para colocar a OP em produção.',
    },
    {
      key: 'steps',
      label: 'Etapas do roteiro concluídas',
      ok: stepsDone,
      hint: input.steps.length === 0
        ? 'Nenhuma etapa gerada pelo roteiro — a conclusão fica bloqueada.'
        : stepsDone ? `${input.steps.length} etapa(s) concluídas.` : `${input.steps.filter((s) => s.status === 'completed').length}/${input.steps.length} concluídas — conclua as etapas pendentes no apontamento.`,
    },
    {
      key: 'quality',
      label: 'Qualidade aprovada',
      ok: qualityOk,
      hint: hasBlocked
        ? 'Existe inspeção rejeitada/bloqueada/em quarentena — resolva antes de concluir.'
        : approvedInspections.length === 0
          ? 'Registre e aprove uma inspeção no painel de qualidade abaixo.'
          : approvedQuantity < input.plannedQuantity
            ? `Aprovado ${approvedQuantity} de ${input.plannedQuantity} — aprove o restante na qualidade.`
            : `Aprovado ${approvedQuantity} — suficiente para concluir.`,
    },
    {
      key: 'bom',
      label: 'Ficha de materiais (BOM)',
      ok: input.bomLineCount > 0,
      hint: input.bomLineCount > 0 ? `${input.bomLineCount} componente(s) na ficha.` : 'Cadastre a BOM do produto para comprovar o consumo.',
    },
  ];
  return { items, ready: items.every((item) => item.ok), approvedQuantity };
}

/** Chave estável por item de pedido: reabrir o diálogo nunca duplica a OP. */
export function demandIdempotencyKey(orderId: string, itemId: string): string {
  return `demanda-${orderId.slice(0, 8)}-${itemId.slice(0, 8)}`;
}
