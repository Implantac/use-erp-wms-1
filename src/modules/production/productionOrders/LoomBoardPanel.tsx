import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Progress } from '@/ui/base/progress';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { formatNumber } from '@/lib/formatters';

const WEAVING_EVENT_LABELS: Record<string, string> = {
  setup: 'Setup',
  start: 'Início da tecelagem',
  pause: 'Pausa',
  resume: 'Retomada',
  stop: 'Parada',
  yarn_break: 'Ruptura de fio',
  warp_break: 'Ruptura de urdume',
  weft_break: 'Ruptura de trama',
  beam_change: 'Troca de rolo de urdume',
  quality_hold: 'Bloqueio de qualidade',
  quality_release: 'Liberação de qualidade',
  inspection: 'Inspeção',
  note: 'Observação',
};

function weavingEventLabel(type?: string | null): string {
  if (!type) return 'sem evento';
  return WEAVING_EVENT_LABELS[type] ?? type.replace(/_/g, ' ');
}

function machineAvailability(status?: string | null): { label: string; unavailable: boolean } {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (['maintenance', 'manutencao', 'manutenção'].includes(normalized)) return { label: 'em manutenção', unavailable: true };
  if (['inactive', 'inativo', 'down', 'parado'].includes(normalized)) return { label: 'indisponível', unavailable: true };
  return { label: '', unavailable: false };
}

interface Props {
  onOpenOrder?: (orderId: string, targetId: string) => void;
}

/**
 * Mapa de Teares — a tela diária do gerente de tecelagem: cada tear com a
 * OP montada, rolo de urdume, metros planejados × produzidos (apontamentos
 * reais de weaving_production_events) e o último evento. Sem OP ativa, o
 * tear aparece livre. Nada estimado: só o que foi apontado.
 */
export function LoomBoardPanel({ onOpenOrder }: Props) {
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

      // Todos os eventos (paginado): janela fixa subcontava OP longa.
      const events: any[] = [];
      for (let page = 0; page < 100; page++) {
        const from = page * 1000;
        const { data: pageRows } = await (supabase as any)
          .from('weaving_production_events')
          .select('production_order_id, event_type, quantity_m, occurred_at')
          .eq('company_id', companyId)
          .order('occurred_at', { ascending: false })
          .range(from, from + 999);
        if (!pageRows?.length) break;
        events.push(...pageRows);
        if (pageRows.length < 1000) break;
      }
      const produced = new Map<string, number>();
      const lastEvent = new Map<string, any>();
      for (const e of events) {
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
          availability: machineAvailability(m.status),
          orderId: active?.order?.id || null,
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
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">{l.code} — {l.name}</p>
                  <Badge variant={l.orderNumber ? 'default' : 'secondary'}>
                    {l.orderNumber ? 'tecendo' : l.availability.unavailable ? l.availability.label : 'livre'}
                  </Badge>
                </div>
                {l.orderNumber ? (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">
                      OP {l.orderNumber}{l.product ? ` · ${l.product}` : ''}{l.beam ? ` · rolo de urdume ${l.beam}` : ''}
                    </p>
                    {l.planned > 0 ? (
                      <>
                        <div className="mt-2 flex items-center gap-2">
                          <Progress value={l.pct} className="h-2 flex-1" />
                          <span className="text-xs font-bold">{l.pct}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(l.done)} m produzidos de {formatNumber(l.planned)} m planejados
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatNumber(l.done)} m apontados · comprimento planejado ainda não informado no perfil da OP
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Último registro: {l.last ? weavingEventLabel(l.last.event_type) : 'nenhum evento apontado ainda'}
                    </p>
                    {l.availability.unavailable ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">A máquina está sinalizada como {l.availability.label}; confira o cadastro antes de novas programações.</p>
                    ) : null}
                    {l.orderId && onOpenOrder ? (
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => onOpenOrder(l.orderId as string, 'pcp-op-atual')}>
                        Abrir esta OP <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {l.availability.unavailable
                      ? 'Indisponível para nova programação enquanto estiver assim no cadastro de máquinas.'
                      : 'Sem OP montada. Quando programar, escolha este tear na fila de programação.'}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
