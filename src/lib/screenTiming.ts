/**
 * Medição de tempo de tela NO NAVEGADOR do usuário (diagnóstico).
 * Guarda as últimas trocas de rota e quanto cada uma levou para responder
 * (aproximação de tempo-até-interagir: clique -> rota pintada). É dado
 * real da sessão de quem está usando — nada é estimado nem enviado.
 */
export interface RouteTiming {
  route: string;
  ms: number;
  at: string;
}

const MAX = 30;
let timings: RouteTiming[] = [];
let navStartedAt = 0;
const listeners = new Set<() => void>();

export function markNavigationStart() {
  navStartedAt = performance.now();
}

export function markRouteRendered(route: string) {
  if (!navStartedAt) return;
  const ms = Math.round(performance.now() - navStartedAt);
  navStartedAt = 0;
  timings = [{ route, ms, at: new Date().toLocaleTimeString('pt-BR') }, ...timings].slice(0, MAX);
  listeners.forEach((fn) => fn());
}

export function getRouteTimings(): RouteTiming[] {
  return timings;
}

export function subscribeRouteTimings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function navigationTimingSummary(): { loadMs: number | null; domMs: number | null } {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (!nav) return { loadMs: null, domMs: null };
  return {
    loadMs: Math.round(nav.loadEventEnd || nav.responseEnd),
    domMs: Math.round(nav.domContentLoadedEventEnd),
  };
}
