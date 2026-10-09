// An empty denominator is unavailable, never perfect performance.
export function measuredPercent(passing: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(passing) || passing < 0 || passing > total) return null;
  return Math.round((passing / total) * 1000) / 10;
}
