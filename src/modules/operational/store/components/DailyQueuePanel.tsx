import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ClipboardList, PackageCheck, Truck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { supabase } from '@/integrations/supabase/client';
import {
  createSupplyRequest,
  getReplenishmentAlerts,
} from '@/services/operational/store/supplyService';

const fmt = (n: any) => Number(n || 0).toLocaleString('pt-BR');

/**
 * Fila do dia da unidade: o que precisa de ação AGORA, com dados reais —
 * recebimentos a conferir, rupturas para solicitar, divergências a tratar
 * e abastecimentos aguardando análise. É a porta de entrada da Loja.
 */
export function DailyQueuePanel({ branchId }: { branchId?: string }) {
  const queryClient = useQueryClient();

  const queueQuery = useQuery({
    queryKey: ['daily-queue', branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const [incomingRes, divergentRes, alerts, supplyRes] = await Promise.all([
        (supabase as any)
          .from('stock_transfer_orders')
          .select('id, origin_unit_id, created_at')
          .eq('destination_unit_id', branchId)
          .eq('current_status', 'EM TRÂNSITO'),
        (supabase as any)
          .from('stock_transfer_orders')
          .select('id, created_at')
          .eq('destination_unit_id', branchId)
          .in('current_status', ['RECEBIDA COM DIVERGÊNCIA', 'RECEBIDA PARCIAL']),
        getReplenishmentAlerts(branchId!),
        (supabase as any)
          .from('supply_requests')
          .select('id')
          .eq('requester_branch_id', branchId)
          .eq('status', 'PENDENTE'),
      ]);
      return {
        incoming: incomingRes.data || [],
        divergent: divergentRes.data || [],
        alerts,
        supplyPending: supplyRes.data || [],
      };
    },
    staleTime: 30_000,
  });

  const requestMutation = useMutation({
    mutationFn: (a: { productId: string; qty: number }) =>
      createSupplyRequest(branchId!, a.productId, a.qty),
    onSuccess: () => {
      toast.success('Abastecimento solicitado. O almoxarifado vai analisar a melhor origem.');
      queryClient.invalidateQueries({ queryKey: ['daily-queue'] });
      queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
      queryClient.invalidateQueries({ queryKey: ['factory-inbox'] });
    },
    onError: (e: any) => toast.error(`Não foi possível solicitar: ${e?.message || 'erro inesperado'}`),
  });

  const q = queueQuery.data;
  const tiles = [
    {
      icon: Truck,
      label: 'Recebimentos a conferir',
      count: q?.incoming.length ?? 0,
      hint: 'Mercadoria em trânsito para esta unidade',
      danger: false,
    },
    {
      icon: AlertTriangle,
      label: 'Itens abaixo do mínimo',
      count: q?.alerts.length ?? 0,
      hint: 'Solicite o abastecimento — a origem é decidida na análise',
      danger: (q?.alerts.length ?? 0) > 0,
    },
    {
      icon: PackageCheck,
      label: 'Divergências a tratar',
      count: q?.divergent.length ?? 0,
      hint: 'Recebimentos parciais aguardando tratamento',
      danger: (q?.divergent.length ?? 0) > 0,
    },
    {
      icon: ClipboardList,
      label: 'Abastecimentos aguardando análise',
      count: q?.supplyPending.length ?? 0,
      hint: 'Pedidos desta unidade esperando a decisão de origem',
      danger: false,
    },
  ];

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold">Fila do dia — o que precisa de ação agora</CardTitle>
        <CardDescription>
          Pendências reais desta unidade. Resolva nesta ordem: receber, repor, tratar divergência.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <t.icon className={`h-4 w-4 ${t.danger ? 'text-red-500' : 'text-primary'}`} />
                <span className={`text-xl font-black ${t.danger ? 'text-red-500' : ''}`}>{t.count}</span>
              </div>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wide">{t.label}</p>
              <p className="text-[11px] text-muted-foreground">{t.hint}</p>
            </div>
          ))}
        </div>

        {!!q?.alerts.length && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              Prioridade de reposição (menor saldo primeiro)
            </p>
            {q.alerts.slice(0, 3).map((a) => (
              <div key={a.productId} className="flex flex-wrap items-center gap-2 rounded border bg-muted/30 px-2 py-1.5 text-sm">
                {a.imageUrl ? (
                  <img src={a.imageUrl} alt="" className="h-8 w-8 rounded border object-cover" loading="lazy" />
                ) : null}
                <span className="min-w-0 flex-1 truncate font-medium">{a.productName}</span>
                <Badge variant="destructive">saldo {fmt(a.currentQty)}</Badge>
                <span className="text-xs text-muted-foreground">mínimo {fmt(a.minStock)}</span>
                <Button
                  size="sm"
                  className="h-7 text-[11px]"
                  disabled={requestMutation.isPending}
                  onClick={() => requestMutation.mutate({ productId: a.productId, qty: a.suggestedQty })}
                >
                  Solicitar {fmt(a.suggestedQty)} un
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
