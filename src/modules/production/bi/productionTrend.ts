import { differenceInMinutes, format, isValid, startOfDay, subDays } from 'date-fns';

type CompletedEntry = {
  status: string;
  start_time: string;
  end_time: string | null;
};

/** Counts completed entries and gross elapsed time; no quantities across unknown units. */
export function buildProductionTrend(entries: CompletedEntry[], periodDays: number, now = new Date()) {
  if (!isValid(now) || !Number.isInteger(periodDays) || periodDays < 1 || periodDays > 366) return [];
  const days = new Map<string, { day: string; entryCount: number; elapsedMinutes: number }>();
  const today = startOfDay(now);
  for (let i = periodDays - 1; i >= 0; i--) {
    const date = subDays(today, i);
    days.set(format(date, 'yyyy-MM-dd'), { day: format(date, 'dd/MM'), entryCount: 0, elapsedMinutes: 0 });
  }
  for (const entry of entries) {
    if (entry.status !== 'completed' || !entry.end_time) continue;
    const start = new Date(entry.start_time);
    const end = new Date(entry.end_time);
    if (!isValid(start) || !isValid(end) || end > now) continue;
    const minutes = differenceInMinutes(end, start);
    if (minutes <= 0) continue;
    const day = days.get(format(end, 'yyyy-MM-dd'));
    if (!day) continue;
    day.entryCount++;
    day.elapsedMinutes += minutes;
  }
  return [...days.values()].map(({ day, entryCount, elapsedMinutes }) => ({
    day,
    entryCount,
    elapsedHours: entryCount ? +(elapsedMinutes / 60).toFixed(1) : null,
  }));
}
