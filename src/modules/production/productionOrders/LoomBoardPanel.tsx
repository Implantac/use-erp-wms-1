import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Progress } from '@/ui/base/progress';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { formatNumber } from '@/lib/formatters';

/**
 * Mapa de Teares — a tela diária do gerente de tecelagem: cada tear com a
 * OP montada, rolo de urdume, metros planejados × produzidos (apontamentos
 * reais de weaving_production_events) e o último evento. Sem OP ativa, o
 * tear aparece livre. Nada estimado: só o que foi apontado.
 */
export function LoomBoardPanel() {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;

  const board = useQuery({
    queryKey: ['loom-board', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: machines } = await (supabase as any)
        .from('production_machines')
        .select('id, code, name, sector, status')
        .eq('company_id', companyId)
        .order('code');
      const looms = (machines || []).filter((m: any) =>
        String(m.sector || '').toLowerCase().includes('tecelagem'),
      );

      const { data: profiles } = await (supabase as any)
        .from('weaving_order_profiles')
        .select('production_order_id, machine_id, loom_resource_id, beam_code, planned_length_m')
        .eq('company_id', companyId);
      const orderIds = [...new Set((profiles || []).map((p: any) => p.production_order_id))];

      const { data: orders } = orderIds.length
        ? await (supabase as any)
            .from('production_orders')
            .select('id, order_number, status, product_id')
            .in('id', orderIds)
        : { data: [] };
      const openOrders = new Map(
        (orders || [])
          .filter((o: any) => !['completed', 'cancelled', 'canceled'].includes(o.status))
          .map((o: any) => [o.id, o]),
      );
      const productIds = [...new Set((orders || []).map((o: any) => o.product_id).filter(Boolean))];
      const { data: products } = productIds.length
        ? await (supabase as any).from('products').select('id, name').in('id', productIds)
        : { data: [] };
      const productName = new Map((products || []).map((p: any) => [p.id, p.name]));

      const { data: events } = await (supabase as any)
        .from('weaving_production_events')
        .select('production_order_id, event_type, quantity_m, occurred_at')
        .eq('company_id', companyId)
        .order('occurred_at', { ascending: false })
        .limit(2000);
      const produced = new Map<string, number>();
      const lastEvent = new Map<string, any>();
      for (const e of events || []) {
        if (e.quantity_m) {
          produced.set(e.production_order_id, (produced.get(e.production_order_id) || 0) + Number(e.quantity_m));
        }
        if (!lastEvent.has(e.production_order_id)) lastEvent.set(e.production_order_id, e);
      }

      const activeByMachine = new Map<string, any>();
      for (const p of profiles || []) {
        const order = openOrders.get(p.production_order_id);
        if (order && p.machine_id) activeByMachine.set(p.machine_id, { profile: p, order });
      }

      return looms.map((m: any) => {
        const active = activeByMachine.get(m.id);
        const planned = Number(active?.profile?.planned_length_m || 0);
        const done = active ? produced.get(active.order.id) || 0 : 0;
        return {
          id: m.id,
          code: m.code,
          name: m.name,
          status: m.status,
          orderNumber: active?.order?.order_number || null,
          product: active ? productName.get(active.order.product_id) || null : null,
          beam: active?.profile?.beam_code || null,
          planned,
          done,
          pct: planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0,
          last: active ? lastEvent.get(active.order.id) || null : null,
        };
      });
    },
    staleTime: 30_000,
  });

  const looms = board.data || [];
  const busy = looms.filter((l) => l.orderNumber).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold">Mapa de Teares</CardTitle>
        <CardDescription>
          {busy} de {looms.length} tear(es) com OP ativa · metros produzidos = apontamentos reais do setor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {looms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum tear cadastrado (máquinas do setor Tecelagem). Cadastre em Produção → Máquinas.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {looms.map((l) => (
              <div key={l.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-bold">{l.code} — {l.name}</p>
                  <Badge variant={l.orderNumber ? 'default' : 'secondary'}>
                    {l.orderNumber ? 'tecendo' : 'livre'}
                  </Badge>
                </div>
                {l.orderNumber ? (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">
                      OP {l.orderNumber}{l.product ? ` · ${l.product}` : ''}{l.beam ? ` · urdume ${l.beam}` : ''}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={l.pct} className="h-2 flex-1" />
                      <span className="text-xs font-bold">{l.pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(l.done)} m de {formatNumber(l.planned)} m planejados
                      {l.last ? ` · último evento: ${l.last.event_type}` : ''}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Sem OP montada.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
