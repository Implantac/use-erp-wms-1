import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';

type OrderDisplay = {
  due_date?: string | null;
  status: string;
  quantity: number;
  produced_quantity: number;
};

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
