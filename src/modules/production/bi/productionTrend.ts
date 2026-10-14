import { differenceInMinutes, format, isValid, startOfDay, subDays } from 'date-fns';

type CompletedEntry = {
  status: string;
  start_time: string;
  end_time: string | null;
  produced_quantity: number;
  rejected_quantity: number;
};

/** Completed entries are assigned to their completion day. Missing data is not 100% yield. */
export function buildProductionTrend(entries: CompletedEntry[], periodDays: number, now = new Date()) {
  const days = new Map<string, { produced: number; rejected: number; hours: number; day: string }>();
  const today = startOfDay(now);
  if (!isValid(now) || !Number.isInteger(periodDays) || periodDays < 1 || periodDays > 366) return [];
  for (let i = periodDays - 1; i >= 0; i--) {
    const date = subDays(today, i);
    days.set(format(date, 'yyyy-MM-dd'), { day: format(date, 'dd/MM'), produced: 0, rejected: 0, hours: 0 });
  }
  for (const entry of entries) {
    if (entry.status !== 'completed' || !entry.end_time) continue;
    const start = new Date(entry.start_time);
    const end = new Date(entry.end_time);
    if (!isValid(start) || !isValid(end) || end > now) continue;
    const minutes = differenceInMinutes(end, start);
    if (minutes <= 0 || !Number.isFinite(entry.produced_quantity) || entry.produced_quantity < 0
      || !Number.isFinite(entry.rejected_quantity) || entry.rejected_quantity < 0) continue;
    const day = days.get(format(end, 'yyyy-MM-dd'));
    if (!day) continue;
    day.produced += entry.produced_quantity;
    day.rejected += entry.rejected_quantity;
    day.hours += minutes / 60;
  }
  return [...days.values()].map(day => ({
    day: day.day,
    produced: day.produced,
    rejected: day.rejected,
    hours: day.hours,
    pcsH: day.hours > 0 ? +(day.produced / day.hours).toFixed(1) : null,
    yieldRate: day.produced + day.rejected > 0
      ? +(day.produced / (day.produced + day.rejected) * 100).toFixed(1) : null,
  }));
}
