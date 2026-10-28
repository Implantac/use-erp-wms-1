import { detectScheduleConflicts } from './capacityConflicts';

// ---------------------------------------------------------------------------
// Programação do setor (a fila do gerente de chão): monta, a partir das OPs
// do setor e das janelas finitas (production_schedule), a fila por máquina/
// recurso com atrasos e conflitos; re-sequencia mantendo as durações
// planejadas; e sugere a ordem das partidas de tinturaria por cor.
// Só lógica pura sobre dados reais — nenhum tempo é inventado: a duração
// de cada janela é a que o próprio PCP programou.
// ---------------------------------------------------------------------------

export interface ProgrammingOrderLike {
  id: string;
  order_number: string;
  product_name: string;
  quantity: number;
  produced_quantity: number;
  unit: string;
  status: string;
  priority?: string | null;
  due_date?: string | null;
  created_at?: string;
  estimated_time_minutes?: number | null;
}

export interface ProgrammingScheduleLike {
  id: string;
  production_order_id: string | null;
  planned_start: string;
  planned_end: string;
  actual_start?: string | null;
  status?: string | null;
  machine_id?: string | null;
  resource_id?: string | null;
  work_center?: string | null;
  sector?: string | null;
  shift?: string | null;
}

export interface MachineLike {
  id: string;
  code: string;
  name: string;
}

export interface ProgrammingSlot {
  scheduleId: string;
  order: ProgrammingOrderLike;
  plannedStart: string;
  plannedEnd: string;
  /** Janela já iniciada no chão: é âncora fixa do sequenciamento. */
  started: boolean;
  isLate: boolean;
  hasConflict: boolean;
}

export interface ProgrammingQueue {
  key: string;
  label: string;
  machineId: string | null;
  slots: ProgrammingSlot[];
}

export interface SectorProgramming {
  queues: ProgrammingQueue[];
  unscheduled: ProgrammingOrderLike[];
}

const SCHEDULABLE_ORDER_STATUSES = new Set(['planned', 'in_progress', 'paused', 'waiting_material']);
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Mesma chave de recurso do Painel do Gerente (máquina > recurso > centro > setor+turno). */
export function scheduleResourceKey(s: ProgrammingScheduleLike): string | null {
  if (s.machine_id) return `machine:${s.machine_id}`;
  if (s.resource_id) return `resource:${s.resource_id}`;
  const workCenter = s.work_center?.trim();
  if (workCenter) return `work-center:${workCenter}`;
  const sector = s.sector?.trim();
  return sector ? `sector:${sector} · ${s.shift?.trim() || 'sem turno'}` : null;
}

function resourceLabel(key: string, s: ProgrammingScheduleLike, machinesById: Map<string, MachineLike>): string {
  if (s.machine_id) {
    const m = machinesById.get(s.machine_id);
    return m ? `${m.code} — ${m.name}` : `Máquina ${s.machine_id.slice(0, 8)}`;
  }
  if (s.work_center?.trim()) return s.work_center.trim();
  if (s.sector?.trim()) return `${s.sector.trim()} · ${s.shift?.trim() || 'sem turno'}`;
  return key;
}

export function buildSectorProgramming(input: {
  orders: ProgrammingOrderLike[];
  schedules: ProgrammingScheduleLike[];
  machines: MachineLike[];
  now?: Date;
}): SectorProgramming {
  const now = input.now ?? new Date();
  const orderById = new Map(input.orders.map((o) => [o.id, o]));
  const machinesById = new Map(input.machines.map((m) => [m.id, m]));

  const active = input.schedules.filter(
    (s) =>
      s.production_order_id &&
      orderById.has(s.production_order_id) &&
      ['scheduled', 'in_progress'].includes((s.status || '').toLowerCase()),
  );

  const conflicts = detectScheduleConflicts(
    active.map((s) => ({
      id: s.id,
      orderNumber: orderById.get(s.production_order_id as string)?.order_number,
      resourceKey: scheduleResourceKey(s),
      plannedStart: s.planned_start,
      plannedEnd: s.planned_end,
      status: s.status,
    })),
  );
  const conflictIds = new Set<string>();
  for (const c of conflicts) {
    conflictIds.add(c.firstId);
    conflictIds.add(c.secondId);
  }

  const byKey = new Map<string, ProgrammingQueue>();
  const scheduledOrderIds = new Set<string>();
  for (const s of active) {
    const order = orderById.get(s.production_order_id as string) as ProgrammingOrderLike;
    scheduledOrderIds.add(order.id);
    const key = scheduleResourceKey(s) || `schedule:${s.id}`;
    const queue =
      byKey.get(key) ||
      ({
        key,
        label: resourceLabel(key, s, machinesById),
        machineId: s.machine_id ?? null,
        slots: [],
      } as ProgrammingQueue);
    queue.slots.push({
      scheduleId: s.id,
      order,
      plannedStart: s.planned_start,
      plannedEnd: s.planned_end,
      started: Boolean(s.actual_start) || (s.status || '').toLowerCase() === 'in_progress',
      isLate: new Date(s.planned_end).getTime() < now.getTime(),
      hasConflict: conflictIds.has(s.id),
    });
    byKey.set(key, queue);
  }
  const queues = [...byKey.values()]
    .map((q) => ({ ...q, slots: q.slots.sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const unscheduled = input.orders
    .filter((o) => SCHEDULABLE_ORDER_STATUSES.has(o.status) && !scheduledOrderIds.has(o.id))
    .sort((a, b) => {
      const pa = PRIORITY_RANK[(a.priority || '').toLowerCase()] ?? 9;
      const pb = PRIORITY_RANK[(b.priority || '').toLowerCase()] ?? 9;
      if (pa !== pb) return pa - pb;
      const da = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      const db = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });

  return { queues, unscheduled };
}

export interface WindowChange {
  scheduleId: string;
  orderId: string;
  plannedStart: string;
  plannedEnd: string;
}

/**
 * Re-sequencia a fila na ordem pedida MANTENDO a duração de cada janela:
 * empilha as OPs a partir do início mais cedo da fila, sem mover as que já
 * começaram (âncoras). Devolve só as janelas que de fato mudam.
 */
export function resequenceWindows(
  slots: { scheduleId: string; orderId: string; plannedStart: string; plannedEnd: string; started: boolean }[],
  orderedIds: string[],
): WindowChange[] {
  const byId = new Map(slots.map((s) => [s.orderId, s]));
  const order: string[] = [];
  for (const id of orderedIds) if (byId.has(id) && !order.includes(id)) order.push(id);
  for (const s of slots) if (!order.includes(s.orderId)) order.push(s.orderId);

  const movable = slots.filter((s) => !s.started);
  if (movable.length === 0) return [];
  let cursor = Math.min(...movable.map((s) => new Date(s.plannedStart).getTime()));

  const changes: WindowChange[] = [];
  for (const id of order) {
    const slot = byId.get(id) as (typeof slots)[number];
    const startMs = new Date(slot.plannedStart).getTime();
    const endMs = new Date(slot.plannedEnd).getTime();
    if (slot.started) {
      cursor = Math.max(cursor, endMs);
      continue;
    }
    const duration = endMs - startMs;
    const newStart = cursor;
    const newEnd = newStart + duration;
    if (Math.abs(newStart - startMs) > 1000) {
      changes.push({
        scheduleId: slot.scheduleId,
        orderId: slot.orderId,
        plannedStart: new Date(newStart).toISOString(),
        plannedEnd: new Date(newEnd).toISOString(),
      });
    }
    cursor = newEnd;
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Tinturaria: sequência por cor (claro -> escuro poupa lavagem entre partidas)
// ---------------------------------------------------------------------------

export interface DyeingColorLike {
  orderId: string;
  colorName?: string | null;
  colorCode?: string | null;
  labL?: number | null;
}

export type DyeingTransitionKind = 'mesma-cor' | 'mais-escura' | 'mais-clara' | 'sem-referencia';

export interface DyeingSequence {
  orderedIds: string[];
  /** Transição PARA cada OP (a primeira não tem transição). */
  transitions: { orderId: string; kind: DyeingTransitionKind }[];
}

export const DYEING_TRANSITION_LABEL: Record<DyeingTransitionKind, string> = {
  'mesma-cor': 'mesma cor — sem lavagem',
  'mais-escura': 'escurecendo — sequência econômica',
  'mais-clara': 'clareando — conferir lavagem da cuba',
  'sem-referencia': 'sem L* cadastrado — conferir a cor manualmente',
};

function normColor(c?: string | null): string {
  return (c || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Transições de cor de uma sequência JÁ ordenada (para diagnosticar a fila atual). */
export function dyeingTransitions(itemsInOrder: DyeingColorLike[]): { orderId: string; kind: DyeingTransitionKind }[] {
  const transitions: { orderId: string; kind: DyeingTransitionKind }[] = [];
  for (let i = 1; i < itemsInOrder.length; i++) {
    const prev = itemsInOrder[i - 1];
    const cur = itemsInOrder[i];
    const sameColor = normColor(prev.colorName) !== '' && normColor(prev.colorName) === normColor(cur.colorName);
    let kind: DyeingTransitionKind;
    if (sameColor) kind = 'mesma-cor';
    else if (prev.labL != null && cur.labL != null) {
      kind = Number(cur.labL) < Number(prev.labL) ? 'mais-escura' : Number(cur.labL) > Number(prev.labL) ? 'mais-clara' : 'mesma-cor';
    } else kind = 'sem-referencia';
    transitions.push({ orderId: cur.orderId, kind });
  }
  return transitions;
}

/**
 * Ordem sugerida das partidas: quem tem L* (CIELAB) vai do claro para o
 * escuro (L* maior primeiro); quem não tem L* entra depois, agrupado por
 * nome de cor para ao menos manter a mesma cor junta. Nada é presumido:
 * sem L* e sem cor, a OP vai para o fim sinalizada.
 */
export function suggestDyeingSequence(items: DyeingColorLike[]): DyeingSequence {
  const withL = items
    .filter((i) => i.labL != null && Number.isFinite(Number(i.labL)))
    .sort((a, b) => Number(b.labL) - Number(a.labL) || normColor(a.colorName).localeCompare(normColor(b.colorName)));
  const withoutL = items
    .filter((i) => !(i.labL != null && Number.isFinite(Number(i.labL))))
    .sort((a, b) => {
      const ca = normColor(a.colorName) || '￿';
      const cb = normColor(b.colorName) || '￿';
      return ca.localeCompare(cb);
    });
  const ordered = [...withL, ...withoutL];
  return { orderedIds: ordered.map((i) => i.orderId), transitions: dyeingTransitions(ordered) };
}
