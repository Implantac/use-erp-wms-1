type DatedOrder = {
  status: string;
  start_date: string | null;
  completed_date: string | null;
  due_date: string | null;
};

const parseInstant = (value: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

/** Timestamp-based sample; unknown or contradictory dates are not classified as on time. */
export function calculateOrderDateMetrics<T extends DatedOrder>(orders: T[], now = new Date()) {
  if (!Number.isFinite(now.getTime())) return {
    completedOPs: [] as T[], onTime: 0, onTimePct: null as number | null,
    lateOPs: [] as T[], avgLeadTime: null as number | null, leadTimeSampleSize: 0,
  };
  const completedOPs = orders.filter(order => {
    if (order.status !== 'completed') return false;
    const end = parseInstant(order.completed_date);
    const due = parseInstant(order.due_date);
    const start = parseInstant(order.start_date);
    return !!end && !!due && end <= now && (!order.start_date || (!!start && start <= end));
  });
  const onTime = completedOPs.filter(order => parseInstant(order.completed_date)!.getTime()
    <= parseInstant(order.due_date)!.getTime()).length;
  const lateOPs = orders.filter(order => {
    if (!['planned', 'in_progress', 'paused'].includes(order.status)) return false;
    const due = parseInstant(order.due_date);
    return !!due && due < now;
  });
  const leadTimes = orders.flatMap(order => {
    if (order.status !== 'completed') return [];
    const start = parseInstant(order.start_date);
    const end = parseInstant(order.completed_date);
    return start && end && end >= start && end <= now ? [(end.getTime() - start.getTime()) / 86_400_000] : [];
  });
  return {
    completedOPs,
    onTime,
    onTimePct: completedOPs.length ? onTime / completedOPs.length * 100 : null,
    lateOPs,
    avgLeadTime: leadTimes.length ? leadTimes.reduce((sum, days) => sum + days, 0) / leadTimes.length : null,
    leadTimeSampleSize: leadTimes.length,
  };
}
