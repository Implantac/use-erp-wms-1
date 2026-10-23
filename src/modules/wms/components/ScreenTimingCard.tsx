import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import {
  getRouteTimings,
  markNavigationStart,
  markRouteRendered,
  navigationTimingSummary,
  subscribeRouteTimings,
} from '@/lib/screenTiming';
import { useEnterprise } from '@/core/auth/EnterpriseContext';

/** Registra o tempo de cada troca de rota nesta sessão. */
export function useRouteTimingRecorder() {
  const location = useLocation();
  useEffect(() => {
    markNavigationStart();
    const raf = requestAnimationFrame(() => {
      const t = setTimeout(() => markRouteRendered(location.pathname), 0);
      return () => clearTimeout(t);
    });
    return () => cancelAnimationFrame(raf);
  }, [location.pathname]);
}

/**
 * Tempo de tela (neste navegador): diagnóstico visível só para o admin de
 * sistema. Mostra as rotas mais lentas da sessão para atacar o gargalo
 * certo — se o banco responde em <5 ms (docs/PERFORMANCE), a lentidão
 * percebida mora aqui.
 */
export function ScreenTimingCard() {
  const { role } = useEnterprise();
  const timings = useSyncExternalStore(subscribeRouteTimings, getRouteTimings);
  const [summary] = useState(() => navigationTimingSummary());

  if (role !== 'system_admin') return null;

  const slowest = [...timings].sort((a, b) => b.ms - a.ms).slice(0, 8);
  const color = (ms: number) => (ms > 2000 ? 'destructive' : ms > 800 ? 'outline' : 'secondary');

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold">Tempo de tela (neste navegador)</CardTitle>
        <CardDescription>
          Diagnóstico da sessão atual: abertura inicial
          {summary.loadMs ? ` em ${summary.loadMs} ms` : ''} e as rotas mais lentas desde o login.
          Banco responde em ms (ver docs/PERFORMANCE) — lentidão percebida mora na tela/rede.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {slowest.length === 0 ? (
          <p className="text-sm text-muted-foreground">Navegue entre telas para coletar tempos.</p>
        ) : (
          <div className="space-y-1">
            {slowest.map((t, i) => (
              <div key={`${t.route}-${t.at}-${i}`} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                <span className="font-mono text-xs">{t.route}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t.at}</span>
                  <Badge variant={color(t.ms) as any}>{t.ms} ms</Badge>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
