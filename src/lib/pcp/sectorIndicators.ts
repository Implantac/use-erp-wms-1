import {
  deviationCategoryLabel,
  sectorKindFromSectorText,
  type SectorKind,
} from './sectorProfiles';
import { isDyeProduct, isFiberProduct, isYarnProduct, machineMatchesSector, type YarnProductLike } from './productFilters';

/**
 * Indicadores setoriais do PCP — calculados SOMENTE de registros reais
 * (ordens, eventos apontados, inspeções decididas, janelas programadas).
 * Nenhum valor é estimado: sem denominador, o indicador é `null` e a tela
 * mostra "sem dados no período". Fórmulas (skills de PCP por setor,
 * seção de indicadores):
 *
 * - Aderência ao plano = Σ produzido / Σ planejado das OPs do setor
 *   concluídas na janela. Mede quantidade, não prazo.
 * - Cumprimento de prazo = OPs concluídas na janela com conclusão até a
 *   data devida / OPs concluídas na janela com data devida informada.
 * - Inspeções aprovadas = inspeções decididas "aprovadas" / inspeções
 *   decididas das OPs do setor na janela (contagem de inspeções, não de
 *   quantidade — a quantidade aprovada/rejeitada aparece nas OPs).
 * - Paradas = Σ downtime_minutes dos eventos do setor na janela,
 *   agrupadas pela classificação de desvio; eventos sem classificação
 *   aparecem como "Sem classificação" (nunca presumimos a causa).
 * - Quebras = contagem dos eventos de ruptura próprios do setor.
 * - Retrabalho (tinturaria) = eventos de retingimento registrados.
 * - WIP = OPs abertas do setor (planejado − produzido, quando positivo).
 */

export interface SectorIndicatorOrder {
  id: string;
  status: string;
  quantity: number | null;
  produced_quantity: number | null;
  completed_date: string | null;
  due_date: string | null;
}

export interface SectorIndicatorEvent {
  production_order_id: string;
  event_type: string;
  downtime_minutes: number | null;
  deviation_category: string | null;
  machine_id: string | null;
  occurred_at: string;
}

export interface SectorIndicatorInspection {
  production_order_id: string | null;
  status: string;
  created_at?: string | null;
}

export interface CategoryDowntime {
  category: string;
  label: string;
  minutes: number;
  events: number;
}

export interface MachineDowntime {
  machineId: string;
  minutes: number;
  events: number;
}

export interface SectorIndicators {
  windowDays: number;
  adherencePct: number | null;
  completedOrders: number;
  plannedTotal: number;
  producedTotal: number;
  onTimePct: number | null;
  onTimeBase: number;
  approvedInspectionPct: number | null;
  decidedInspections: number;
  downtimeMinutes: number;
  downtimeByCategory: CategoryDowntime[];
  unclassifiedDowntimeMinutes: number;
  downtimeByMachine: MachineDowntime[];
  breaksCount: number;
  reworkEvents: number;
  wipOrders: number;
  wipRemainingQty: number;
}

const BREAK_EVENT_TYPES: Record<SectorKind, readonly string[]> = {
  fiacao: ['fiber_break'],
  malharia: ['yarn_break'],
  tecelagem: ['warp_break', 'weft_break', 'yarn_break'],
  tinturaria: [],
};

const CLOSED = new Set(['completed', 'cancelled', 'canceled', 'done', 'closed']);

function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function inWindow(iso: string | null | undefined, now: Date, days: number): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && time <= now.getTime() && now.getTime() - time <= days * 24 * 60 * 60 * 1000;
}

export function computeSectorIndicators(input: {
  kind: SectorKind;
  orders: readonly SectorIndicatorOrder[];
  events: readonly SectorIndicatorEvent[];
  inspections: readonly SectorIndicatorInspection[];
  now?: Date;
  windowDays?: number;
}): SectorIndicators {
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? 30;
  const orderIds = new Set(input.orders.map((order) => order.id));

  const completed = input.orders.filter(
    (order) => order.status === 'completed' && inWindow(order.completed_date, now, windowDays),
  );
  let plannedTotal = 0;
  let producedTotal = 0;
  for (const order of completed) {
    plannedTotal += num(order.quantity);
    producedTotal += num(order.produced_quantity);
  }
  const adherencePct = plannedTotal > 0 ? (producedTotal / plannedTotal) * 100 : null;

  const withDue = completed.filter((order) => order.due_date && order.completed_date);
  const onTime = withDue.filter(
    (order) => new Date(order.completed_date as string).getTime() <= new Date(order.due_date as string).getTime(),
  );
  const onTimePct = withDue.length > 0 ? (onTime.length / withDue.length) * 100 : null;

  const decided = input.inspections.filter(
    (inspection) => inspection.production_order_id && orderIds.has(inspection.production_order_id)
      && ['approved', 'rejected'].includes(inspection.status.toLowerCase())
      && inWindow(inspection.created_at, now, windowDays),
  );
  const approved = decided.filter((inspection) => inspection.status.toLowerCase() === 'approved').length;
  const approvedInspectionPct = decided.length > 0 ? (approved / decided.length) * 100 : null;

  const windowEvents = input.events.filter(
    (event) => orderIds.has(event.production_order_id) && inWindow(event.occurred_at, now, windowDays),
  );
  let downtimeMinutes = 0;
  let unclassifiedDowntimeMinutes = 0;
  const byCategory = new Map<string, CategoryDowntime>();
  const byMachine = new Map<string, MachineDowntime>();
  for (const event of windowEvents) {
    const minutes = num(event.downtime_minutes);
    downtimeMinutes += minutes;
    if (minutes > 0 && !event.deviation_category) unclassifiedDowntimeMinutes += minutes;
    if (minutes > 0 && event.deviation_category) {
      const row = byCategory.get(event.deviation_category) ?? {
        category: event.deviation_category,
        label: deviationCategoryLabel(input.kind, event.deviation_category) ?? event.deviation_category,
        minutes: 0,
        events: 0,
      };
      row.minutes += minutes;
      row.events += 1;
      byCategory.set(event.deviation_category, row);
    }
    if (minutes > 0 && event.machine_id) {
      const row = byMachine.get(event.machine_id) ?? { machineId: event.machine_id, minutes: 0, events: 0 };
      row.minutes += minutes;
      row.events += 1;
      byMachine.set(event.machine_id, row);
    }
  }

  const breakTypes = new Set(BREAK_EVENT_TYPES[input.kind]);
  const breaksCount = windowEvents.filter((event) => breakTypes.has(event.event_type)).length;
  const reworkEvents = windowEvents.filter((event) => event.event_type === 're_dye').length;

  const open = input.orders.filter((order) => !CLOSED.has(order.status));
  const wipRemainingQty = open.reduce(
    (sum, order) => sum + Math.max(0, num(order.quantity) - num(order.produced_quantity)),
    0,
  );

  return {
    windowDays,
    adherencePct,
    completedOrders: completed.length,
    plannedTotal,
    producedTotal,
    onTimePct,
    onTimeBase: withDue.length,
    approvedInspectionPct,
    decidedInspections: decided.length,
    downtimeMinutes,
    downtimeByCategory: [...byCategory.values()].sort((a, b) => b.minutes - a.minutes),
    unclassifiedDowntimeMinutes,
    downtimeByMachine: [...byMachine.values()].sort((a, b) => b.minutes - a.minutes),
    breaksCount,
    reworkEvents,
    wipOrders: open.length,
    wipRemainingQty,
  };
}

/**
 * Prontidão mínima para programar (skills, "dados mínimos para
 * programação" e "perguntas obrigatórias"): presença real de cadastros —
 * nunca supõe capacidade. Item ausente = "não informado", com a orientação
 * de onde cadastrar.
 */
export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

export function computeSectorReadiness(input: {
  kind: SectorKind;
  machines: readonly { sector?: string | null }[];
  products: readonly YarnProductLike[];
}): ReadinessItem[] {
  const strictMachines = input.machines.filter(
    (machine) => sectorKindFromSectorText(machine.sector) === input.kind,
  ).length;
  const looseMachines = input.machines.filter(
    (machine) => machineMatchesSector(machine.sector, input.kind),
  ).length;

  const items: ReadinessItem[] = [
    {
      key: 'machines',
      label: 'Máquinas identificadas com o setor',
      ok: strictMachines > 0,
      detail: strictMachines > 0
        ? `${strictMachines} máquina(s) com o setor informado no cadastro`
        : looseMachines > 0
          ? 'há máquinas sem setor definido (informe o setor no cadastro de máquinas)'
          : 'nenhuma máquina do setor cadastrada',
    },
  ];

  const keyInput = (() => {
    switch (input.kind) {
      case 'fiacao': {
        const count = input.products.filter(isFiberProduct).length;
        return { label: 'Fibra/pluma cadastrada', count, hint: 'cadastre a fibra como produto (ex.: pluma/fibra na categoria ou no nome)' };
      }
      case 'tinturaria': {
        const count = input.products.filter(isDyeProduct).length;
        return { label: 'Corantes/auxiliares cadastrados', count, hint: 'cadastre corantes e auxiliares como produtos (categoria ou nome de corante)' };
      }
      default: {
        const count = input.products.filter(isYarnProduct).length;
        return { label: 'Fios cadastrados', count, hint: 'cadastre os fios como produtos (categoria de fios ou nome/código iniciado por "Fio")' };
      }
    }
  })();
  items.push({
    key: 'key-input',
    label: keyInput.label,
    ok: keyInput.count > 0,
    detail: keyInput.count > 0 ? `${keyInput.count} produto(s) classificado(s)` : keyInput.hint,
  });

  return items;
}
