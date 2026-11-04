import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';

type OrderDisplay = {
  due_date?: string | null;
  status: string;
  quantity: number;
  produced_quantity: number;
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  planned: 'Planejada',
  waiting_material: 'Aguardando material',
  in_progress: 'Em produção',
  outsourced: 'Em terceiro',
  paused: 'Pausada',
  finishing: 'Em finalização',
  quality_check: 'Em controle de qualidade',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  canceled: 'Cancelada',
};

/** Nome de tela para o gerente: nunca expor o código interno da OP. */
export function productionOrderStatusLabel(status?: string | null): string {
  if (!status?.trim()) return 'Sem status';
  return ORDER_STATUS_LABELS[status.trim().toLowerCase()] ?? status.replace(/_/g, ' ');
}

const ORDER_PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

export function productionOrderPriorityLabel(priority?: string | null): string {
  if (!priority?.trim()) return 'Não definida';
  return ORDER_PRIORITY_LABELS[priority.trim().toLowerCase()] ?? priority;
}

export function parseValidDueDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = parseISO(value);
  return isValid(date) ? date : null;
}

export function getOrderOverdueDays(order: Pick<OrderDisplay, 'due_date' | 'status'>, now = new Date()): number {
  const due = parseValidDueDate(order.due_date);
  if (!due || !isValid(now) || !['planned', 'in_progress', 'paused', 'waiting_material', 'outsourced', 'finishing'].includes(order.status)) return 0;
  return Math.max(0, differenceInCalendarDays(now, due));
}

export function isOrderOverdue(order: Pick<OrderDisplay, 'due_date' | 'status'>, now = new Date()): boolean {
  return getOrderOverdueDays(order, now) > 0;
}

export function getOrderProgress(order: Pick<OrderDisplay, 'quantity' | 'produced_quantity'>): number | null {
  const { quantity, produced_quantity } = order;
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(produced_quantity)
    || produced_quantity < 0 || produced_quantity > quantity) return null;
  return Math.round((produced_quantity / quantity) * 100);
}
