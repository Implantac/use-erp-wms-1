import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { formatDate } from '@/lib/formatters';

const CLOSED = ['completed', 'cancelled', 'canceled'];

/**
 * Fila do dia da Produção: OPs atrasadas, OPs ativas sem apontamento hoje
 * e OPs programadas que ainda não começaram. Só dado real.
 */
export function ProductionDailyQueue() {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;

  const queue = useQuery({
    queryKey: ['production-daily-queue', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: orders } = await (supabase as any)
        .from('production_orders')
        .select('id, order_number, status, due_date, start_date, product_id, products:product_id(name)')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true })
        .limit(500);
      const open = (orders || []).filter((o: any) => !CLOSED.includes(o.status));
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const iso = startOfDay.toISOString();

      const [sectorEv, weavingEv] = await Promise.all([
        (supabase as any)
          .from('sector_production_events')
          .select('production_order_id')
          .eq('company_id', companyId)
          .gte('occurred_at', iso),
        (supabase as any)
          .from('weaving_production_events')
          .select('production_order_id')
          .eq('company_id', companyId)
          .gte('occurred_at', iso),
      ]);
      const pointedToday = new Set([
        ...(sectorEv.data || []).map((e: any) => e.production_order_id),
        ...(weavingEv.data || []).map((e: any) => e.production_order_id),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const late = open.filter((o: any) => o.due_date && new Date(o.due_date) < today);
      const silent = open.filter(
        (o: any) => ['in_progress', 'outsourced'].includes(o.status) && !pointedToday.has(o.id),
      );
      const notStarted = open.filter(
        (o: any) =>
          !['in_progress', 'outsourced'].includes(o.status) &&
          o.start_date &&
          new Date(o.start_date) <= today,
      );
      return { late, silent, notStarted };
    },
    staleTime: 30_000,
  });

  const d = queue.data || { late: [], silent: [], notStarted: [] };
  const label = (o: any) =>
    `OP ${o.order_number}${o.products?.name ? ` · ${o.products.name}` : ''}`;
  const sections = [
    {
      icon: AlertTriangle,
      title: `Atrasadas (${d.late.length})`,
      rows: d.late.slice(0, 5).map((o: any) => ({ id: o.id, main: label(o), sub: `prazo ${formatDate(o.due_date)}` })),
      empty: 'Nenhuma OP atrasada.',
    },
    {
      icon: CalendarClock,
      title: `Sem apontamento hoje (${d.silent.length})`,
      rows: d.silent.slice(0, 5).map((o: any) => ({ id: o.id, main: label(o), sub: `em produção · prazo ${o.due_date ? formatDate(o.due_date) : '—'}` })),
      empty: 'Toda OP ativa teve apontamento hoje.',
    },
    {
      icon: ClipboardList,
      title: `Programadas não iniciadas (${d.notStarted.length})`,
      rows: d.notStarted.slice(0, 5).map((o: any) => ({ id: o.id, main: label(o), sub: `início previsto ${formatDate(o.start_date)}` })),
      empty: 'Nenhuma OP aguardando início.',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold">Fila do dia — Produção</CardTitle>
        <CardDescription>Atrasos, silêncio de apontamento e inícios pendentes, das OPs reais da empresa.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-3">
        {sections.map((s) => (
          <div key={s.title} className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
              <s.icon className="h-4 w-4 text-primary" /> {s.title}
            </p>
            {s.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{s.empty}</p>
            ) : (
              s.rows.map((r) => (
                <div key={r.id} className="rounded-lg border p-2">
                  <p className="text-sm font-bold">{r.main}</p>
                  <p className="text-xs text-muted-foreground">{r.sub}</p>
                </div>
              ))
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
