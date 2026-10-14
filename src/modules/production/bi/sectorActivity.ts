type SectorOrder = { sector?: string | null; work_center?: string | null; realized_time_minutes: number };

/** Counts orders and recorded positive time only; no unit-agnostic production or monetary claim. */
export function aggregateSectorActivity(orders: SectorOrder[]) {
  const groups = new Map<string, { orders: number; minutes: number; timedOrders: number }>();
  for (const order of orders) {
    const sector = order.sector?.trim() || order.work_center?.trim() || 'Setor não informado';
    const row = groups.get(sector) ?? { orders: 0, minutes: 0, timedOrders: 0 };
    row.orders++;
    if (Number.isFinite(order.realized_time_minutes) && order.realized_time_minutes > 0) {
      row.minutes += order.realized_time_minutes;
      row.timedOrders++;
    }
    groups.set(sector, row);
  }
  return [...groups].map(([sector, row]) => ({
    sector,
    orders: row.orders,
    timedOrders: row.timedOrders,
    laborHours: row.timedOrders > 0 ? +(row.minutes / 60).toFixed(1) : null,
  })).sort((a, b) => (b.laborHours ?? -1) - (a.laborHours ?? -1));
}
