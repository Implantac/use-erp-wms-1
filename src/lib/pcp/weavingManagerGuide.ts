import {
  buildSectorProgramming,
  type ProgrammingOrderLike,
  type ProgrammingScheduleLike,
} from './sectorProgramming';

// ---------------------------------------------------------------------------
// Guia do gerente de tecelagem: transforma OPs e janelas reais em decisões.
// Nada aqui estima produção ou inventa prioridade: usa prazo, fila, conflito
// e estado já gravados. A central usa o resultado para dizer "comece por
// aqui" e levar o gerente à OP certa.
// ---------------------------------------------------------------------------

export type WeavingManagerActionKey = 'entrega' | 'conflito' | 'atraso' | 'programar' | 'producao' | 'proxima';

export interface WeavingManagerAction {
  key: WeavingManagerActionKey;
  title: string;
  detail: string;
  orderId: string;
  targetId: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
}

const CLOSED = new Set(['completed', 'cancelled', 'canceled']);
const ACTION_PRIORITY: Record<WeavingManagerActionKey, number> = {
  entrega: 0,
  conflito: 1,
  atraso: 2,
  programar: 3,
  producao: 4,
  proxima: 5,
};

function validTime(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function buildWeavingManagerActions(input: {
  orders: readonly ProgrammingOrderLike[];
  schedules: readonly ProgrammingScheduleLike[];
  now?: Date;
}): WeavingManagerAction[] {
  const now = input.now ?? new Date();
  const orders = input.orders.filter((order) => !CLOSED.has(order.status));
  if (orders.length === 0) return [];

  const programming = buildSectorProgramming({
    orders: [...orders],
    schedules: [...input.schedules],
    machines: [],
    now,
  });
  const slots = programming.queues.flatMap((queue) => queue.slots);
  const actions: WeavingManagerAction[] = [];

  const overdue = orders
    .filter((order) => {
      const due = validTime(order.due_date);
      return due !== null && due < now.getTime();
    })
    .sort((a, b) => (validTime(a.due_date) ?? 0) - (validTime(b.due_date) ?? 0));
  if (overdue.length > 0) {
    const first = overdue[0];
    actions.push({
      key: 'entrega',
      title: 'Entrega vencida',
      detail: `${overdue.length} OP(s) aberta(s) passaram do prazo. Comece pela ${first.order_number} — ${first.product_name}.`,
      orderId: first.id,
      targetId: 'pcp-op-atual',
      tone: 'danger',
    });
  }

  const conflicts = slots.filter((slot) => slot.hasConflict);
  if (conflicts.length > 0) {
    const first = conflicts[0];
    actions.push({
      key: 'conflito',
      title: 'Conflito no tear',
      detail: `${conflicts.length} janela(s) disputam o mesmo recurso. Ajuste a fila começando pela ${first.order.order_number}.`,
      orderId: first.order.id,
      targetId: 'pcp-programacao',
      tone: 'warning',
    });
  }

  const late = slots.filter((slot) => slot.isLate && !slot.started);
  if (late.length > 0) {
    const first = late[0];
    actions.push({
      key: 'atraso',
      title: 'Fila atrasada',
      detail: `${late.length} OP(s) já deveriam ter terminado a janela. Reordene ou reprograme a partir da ${first.order.order_number}.`,
      orderId: first.order.id,
      targetId: 'pcp-programacao',
      tone: 'warning',
    });
  }

  if (programming.unscheduled.length > 0) {
    const first = programming.unscheduled[0];
    actions.push({
      key: 'programar',
      title: 'Programar no tear',
      detail: `${programming.unscheduled.length} OP(s) fora da fila. A próxima sugerida pela prioridade/prazo é ${first.order_number} — ${first.product_name}.`,
      orderId: first.id,
      targetId: 'pcp-programacao',
      tone: 'info',
    });
  }

  const runningById = new Map<string, ProgrammingOrderLike>();
  for (const order of orders) {
    if (order.status === 'in_progress') runningById.set(order.id, order);
  }
  for (const slot of slots) {
    if (slot.started) runningById.set(slot.order.id, slot.order);
  }
  if (runningById.size > 0) {
    const first = [...runningById.values()][0];
    actions.push({
      key: 'producao',
      title: 'Acompanhar tecelagem',
      detail: `${runningById.size} OP(s) em produção. Abra a ${first.order_number} para conferir passagens, paradas e qualidade.`,
      orderId: first.id,
      targetId: 'pcp-op-atual',
      tone: 'success',
    });
  }

  if (actions.length === 0 && slots.length > 0) {
    const next = [...slots].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))[0];
    actions.push({
      key: 'proxima',
      title: 'Próxima OP da fila',
      detail: `${next.order.order_number} — ${next.order.product_name} é a próxima janela programada.`,
      orderId: next.order.id,
      targetId: 'pcp-programacao',
      tone: 'info',
    });
  }

  return actions.sort((a, b) => ACTION_PRIORITY[a.key] - ACTION_PRIORITY[b.key]).slice(0, 4);
}

// ---------------------------------------------------------------------------
// Rota de uma OP de tecelagem: cinco passos na linguagem do chão de fábrica.
// A tela usa o primeiro passo pendente como "próxima ação" e transforma os
// demais em atalhos. A RPC continua sendo a autoridade das travas.
// ---------------------------------------------------------------------------

export type WeavingJourneyStageKey = 'programar' | 'materiais' | 'tecer' | 'qualidade' | 'estoque';
export type WeavingJourneyStageState = 'done' | 'current' | 'blocked' | 'todo';

export interface WeavingJourneyStage {
  key: WeavingJourneyStageKey;
  label: string;
  detail: string;
  state: WeavingJourneyStageState;
  targetId: string;
}

export interface WeavingJourneyInput {
  orderStatus: string;
  hasSchedule: boolean;
  bomLineCount: number;
  activeReservationCount: number;
  totalSteps: number;
  completedSteps: number;
  plannedQuantity: number;
  approvedQuantity: number;
  blockedQuality: boolean;
}

export function buildWeavingOrderJourney(input: WeavingJourneyInput): WeavingJourneyStage[] {
  const completed = input.orderStatus === 'completed';
  const cancelled = ['cancelled', 'canceled'].includes(input.orderStatus);
  const qualityDone = completed || (!input.blockedQuality && input.plannedQuantity > 0 && input.approvedQuantity >= input.plannedQuantity);

  const definitions: Array<Omit<WeavingJourneyStage, 'state'> & { done: boolean; blocked?: boolean }> = [
    {
      key: 'programar',
      label: 'Programar no tear',
      detail: input.hasSchedule || completed
        ? 'Tear e janela já definidos para esta OP.'
        : 'Escolha o tear, o início e a duração para a OP entrar na fila.',
      targetId: 'pcp-programacao',
      done: input.hasSchedule || completed,
    },
    {
      key: 'materiais',
      label: 'Conferir fios e lotes',
      detail: input.bomLineCount > 0
        ? `${input.bomLineCount} componente(s) na ficha; ${input.activeReservationCount} reserva(s) ativa(s). Reservar é preparação — o lote consumido é confirmado na finalização.`
        : 'Cadastre a ficha de materiais (BOM) do artigo antes de tecer.',
      targetId: 'pcp-materiais',
      done: input.bomLineCount > 0 || completed,
      blocked: input.bomLineCount === 0 && !completed,
    },
    {
      key: 'tecer',
      label: 'Tecer e apontar',
      detail: input.totalSteps === 0
        ? 'Nenhuma passagem foi gerada pelo roteiro desta OP.'
        : input.completedSteps >= input.totalSteps
          ? `${input.totalSteps} passagem(ns) concluída(s).`
          : `${input.completedSteps}/${input.totalSteps} passagens concluídas. Aponte a passagem atual e registre as paradas do tear.`,
      targetId: 'pcp-passagens',
      done: completed || (input.totalSteps > 0 && input.completedSteps >= input.totalSteps),
      blocked: input.totalSteps === 0 && !completed,
    },
    {
      key: 'qualidade',
      label: 'Liberar a qualidade',
      detail: input.blockedQuality
        ? 'Existe inspeção rejeitada, bloqueada ou em quarentena. Resolva antes de gerar estoque.'
        : qualityDone
          ? 'Quantidade aprovada suficiente para finalizar.'
          : `Aprovado ${input.approvedQuantity} de ${input.plannedQuantity}. Registre/aprove a inspeção do tecido.`,
      targetId: 'pcp-qualidade',
      done: qualityDone,
      blocked: input.blockedQuality && !completed,
    },
    {
      key: 'estoque',
      label: 'Gerar estoque',
      detail: completed
        ? 'Tecido finalizado e entrada em estoque registrada.'
        : 'Com passagens e qualidade liberadas, finalize para criar o lote do tecido e creditar o saldo.',
      targetId: 'pcp-estoque',
      done: completed,
    },
  ];

  let currentAssigned = false;
  return definitions.map((stage) => {
    if (stage.done) return { ...stage, state: 'done' as const };
    if (cancelled) return { ...stage, state: 'todo' as const };
    if (stage.blocked) {
      if (!currentAssigned) currentAssigned = true;
      return { ...stage, state: 'blocked' as const };
    }
    if (!currentAssigned) {
      currentAssigned = true;
      return { ...stage, state: 'current' as const };
    }
    return { ...stage, state: 'todo' as const };
  });
}

export function getWeavingNextStage(stages: readonly WeavingJourneyStage[]): WeavingJourneyStage | null {
  return stages.find((stage) => stage.state === 'current' || stage.state === 'blocked') ?? null;
}
