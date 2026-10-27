import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Progress } from '@/ui/base/progress';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { formatNumber } from '@/lib/formatters';

interface SectorBoardConfig {
  kind: 'fiacao' | 'malharia' | 'tinturaria' | 'beneficiamento';
  title: string;
  machineMatch: string;
  profileTable: string;
  unit: string;
  plannedField: 'planned_output_kg' | 'planned_output_m';
  extraLabel: (profile: any) => string | null;
}

export const SECTOR_BOARDS: Record<'fiacao' | 'malharia' | 'tinturaria' | 'beneficiamento', SectorBoardConfig> = {
  fiacao: {
    kind: 'fiacao',
    title: 'Quadro de Máquinas — Fiação',
    machineMatch: 'fia',
    profileTable: 'spinning_order_profiles',
    unit: 'kg',
    plannedField: 'planned_output_kg',
    extraLabel: (p) => (p?.target_title ? `título ${p.target_title}` : null),
  },
  malharia: {
    kind: 'malharia',
    title: 'Quadro de Teares Circulares — Malharia',
    machineMatch: 'malhar',
    profileTable: 'knitting_order_profiles',
    unit: 'kg',
    plannedField: 'planned_output_kg',
    extraLabel: (p) => (p?.gauge ? `galga ${p.gauge}` : null),
  },
  tinturaria: {
    kind: 'tinturaria',
    title: 'Quadro de Cubas/Máquinas — Tinturaria',
    machineMatch: 'tintur',
    profileTable: 'dyeing_order_profiles',
    unit: 'kg',
    plannedField: 'planned_output_kg',
    extraLabel: (p) =>
      p?.color_name ? `cor ${p.color_name}${p.bath_ratio ? ` · banho 1:${p.bath_ratio}` : ''}` : null,
  },
  beneficiamento: {
    kind: 'beneficiamento',
    title: 'Quadro de Ramas/Máquinas — Beneficiamento',
    machineMatch: 'benefici',
    profileTable: 'beneficiamento_order_profiles',
    unit: 'm',
    plannedField: 'planned_output_m',
    extraLabel: (p) =>
      p?.target_width_cm ? `largura alvo ${p.target_width_cm} cm${p.target_grammage_g_m2 ? ` · ${p.target_grammage_g_m2} g/m²` : ''}` : null,
  },
};

/**
 * Quadro diário do setor (fiação/tinturaria): cada máquina/cuba com a OP
 * montada, o planejado (perfil setorial gravado) × produzido (eventos
 * setoriais apontados) e o último evento. Só dado real apontado.
 */
export function SectorBoardPanel({ config }: { config: SectorBoardConfig }) {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;

  const board = useQuery({
    queryKey: ['sector-board', config.kind, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: machines } = await (supabase as any)
        .from('production_machines')
        .select('id, code, name, sector, status')
        .eq('company_id', companyId)
        .order('code');
      const sectorMachines = (machines || []).filter((m: any) =>
        String(m.sector || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .includes(config.machineMatch),
      );

      const { data: profiles } = await (supabase as any)
        .from(config.profileTable)
        .select('*')
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

      // Todos os eventos do setor (paginado): janela fixa subcontava OP longa.
      const events: any[] = [];
      for (let page = 0; page < 100; page++) {
        const from = page * 1000;
        const { data: pageRows } = await (supabase as any)
          .from('sector_production_events')
          .select('production_order_id, event_type, quantity, occurred_at')
          .eq('company_id', companyId)
          .eq('sector', config.kind)
          .order('occurred_at', { ascending: false })
          .range(from, from + 999);
        if (!pageRows?.length) break;
        events.push(...pageRows);
        if (pageRows.length < 1000) break;
      }
      const produced = new Map<string, number>();
      const lastEvent = new Map<string, any>();
      for (const e of events) {
        if (e.quantity) {
          produced.set(e.production_order_id, (produced.get(e.production_order_id) || 0) + Number(e.quantity));
        }
        if (!lastEvent.has(e.production_order_id)) lastEvent.set(e.production_order_id, e);
      }

      const activeByMachine = new Map<string, any>();
      for (const p of profiles || []) {
        const order = openOrders.get(p.production_order_id);
        if (order && p.machine_id) activeByMachine.set(p.machine_id, { profile: p, order });
      }

      return sectorMachines.map((m: any) => {
        const active = activeByMachine.get(m.id);
        const planned = Number(active?.profile?.[config.plannedField] || 0);
        const done = active ? produced.get(active.order.id) || 0 : 0;
        return {
          id: m.id,
          code: m.code,
          name: m.name,
          orderNumber: active?.order?.order_number || null,
          product: active ? productName.get(active.order.product_id) || null : null,
          extra: active ? config.extraLabel(active.profile) : null,
          planned,
          done,
          pct: planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0,
          last: active ? lastEvent.get(active.order.id) || null : null,
        };
      });
    },
    staleTime: 30_000,
  });

  const machines = board.data || [];
  const busy = machines.filter((m) => m.orderNumber).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold">{config.title}</CardTitle>
        <CardDescription>
          {busy} de {machines.length} máquina(s) com OP ativa · produzido = eventos apontados no setor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {machines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma máquina deste setor cadastrada. Cadastre em Produção → Máquinas.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {machines.map((m) => (
              <div key={m.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-bold">{m.code} — {m.name}</p>
                  <Badge variant={m.orderNumber ? 'default' : 'secondary'}>
                    {m.orderNumber ? 'em produção' : 'livre'}
                  </Badge>
                </div>
                {m.orderNumber ? (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">
                      OP {m.orderNumber}{m.product ? ` · ${m.product}` : ''}{m.extra ? ` · ${m.extra}` : ''}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={m.pct} className="h-2 flex-1" />
                      <span className="text-xs font-bold">{m.pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(m.done)} {config.unit} de {formatNumber(m.planned)} {config.unit} planejados
                      {m.last ? ` · último evento: ${m.last.event_type}` : ''}
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
