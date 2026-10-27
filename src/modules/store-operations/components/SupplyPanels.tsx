import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Factory, Package, PackageCheck, Store, Truck, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import {
  createSupplyRequest,
  decideSupplyRequest,
  getFactoryInbox,
  getReplenishmentAlerts,
  getSupplyCandidates,
  listSupplyRequests,
  type SupplyCandidate,
  type SupplyRequest,
} from '@/services/operational/store/supplyService';
import { rankSupplyCandidates, type RankedCandidate } from '@/lib/store/supplyRecommendation';

const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR');

const kindLabel: Record<string, string> = {
  LOJA: 'Outra Loja (remanejo)',
  CD: 'CD Loja',
  FABRICA: 'Fábrica',
};

function ProductThumb({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    return <img src={url} alt={name} className="h-11 w-11 rounded border object-cover" loading="lazy" />;
  }
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded border bg-muted">
      <Package className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

/** Alertas reais de reposição da unidade atual + solicitar abastecimento. */
export function ReplenishmentAlertsPanel({ branchId }: { branchId?: string }) {
  const queryClient = useQueryClient();
  const [qty, setQty] = useState<Record<string, number>>({});
  const alertsQuery = useQuery({
    queryKey: ['replenishment-alerts', branchId],
    queryFn: () => getReplenishmentAlerts(branchId!),
    enabled: !!branchId,
  });
  const createMutation = useMutation({
    mutationFn: (args: { productId: string; quantity: number }) =>
      createSupplyRequest(branchId!, args.productId, args.quantity),
    onSuccess: () => {
      toast.success('Solicitação → de abastecimento criada. O almoxarifado vai analisar a melhor origem.');
      queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
    },
    onError: (e: any) => toast.error(`Não foi possível solicitar: ${e?.message || 'erro inesperado'}`),
  });

  const alerts = alertsQuery.data || [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-amber-500" /> Alertas de reposição
        </CardTitle>
        <CardDescription>
          Itens abaixo do estoque mínimo desta unidade (política × saldo real). Ao solicitar, a
          origem <strong>não</strong> é você quem escolhe: o almoxarifado analisa se sai de outra
          Loja, do CD ou da fábrica.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {alertsQuery.isLoading && <p className="text-sm text-muted-foreground">Verificando saldos…</p>}
        {!alertsQuery.isLoading && alerts.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum item abaixo do mínimo nesta unidade. 🎉</p>
        )}
        {alerts.map((a) => (
          <div key={a.productId} className="flex flex-wrap items-center gap-3 rounded-md border p-2">
            <ProductThumb url={a.imageUrl} name={a.productName} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{a.productName}</div>
              <div className="text-xs text-muted-foreground">
                {a.productCode} · saldo <strong className="text-red-600">{fmt(a.currentQty)}</strong>
                {' '}/ mínimo {fmt(a.minStock)} / máximo {fmt(a.maxStock)}
              </div>
            </div>
            <Input
              type="number"
              min={1}
              className="h-9 w-24"
              value={qty[a.productId] ?? a.suggestedQty}
              onChange={(e) => setQty((prev) => ({ ...prev, [a.productId]: Number(e.target.value) }))}
            />
            <Button
              size="sm"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate({
                productId: a.productId,
                quantity: qty[a.productId] ?? a.suggestedQty,
              })}
            >
              Solicitar abastecimento
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CandidateRow({ ranked, requestedQty, onDecide, pending }: {
  ranked: RankedCandidate<SupplyCandidate>;
  requestedQty: number;
  onDecide: (c: SupplyCandidate) => void;
  pending: boolean;
}) {
  const c = ranked.candidate;
  const saldo = Number(c.quantity || 0);
  const covers = ranked.covers;
  const Icon = c.source_kind === 'FABRICA' ? Factory : c.source_kind === 'CD' ? Truck : Store;
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-sm ${ranked.recommended ? 'border-primary/60 bg-primary/5' : 'bg-muted/30'}`}>
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium">{kindLabel[c.source_kind]}</span>
      <span className="text-muted-foreground">
        {c.branch_name} ({c.company_name})
      </span>
      <Badge variant={saldo === 0 ? 'destructive' : covers ? 'default' : 'secondary'}>
        saldo {fmt(saldo)}
      </Badge>
      {ranked.recommended && <Badge variant="default">Melhor opção</Badge>}
      {ranked.recommended && ranked.reason && <span className="text-xs text-muted-foreground">{ranked.reason}</span>}
      {!covers && saldo > 0 && <span className="text-xs text-amber-600">não cobre o pedido inteiro</span>}
      <Button
        size="sm"
        className="ml-auto"
        disabled={pending || saldo <= 0}
        onClick={() => onDecide(c)}
      >
        Atender desta origem
      </Button>
    </div>
  );
}

/** Análise dos almoxarifados: decide a origem de cada solicitação. */
export function SupplyAnalysisPanel() {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const requestsQuery = useQuery({
    queryKey: ['supply-requests'],
    queryFn: listSupplyRequests,
  });
  // Pendentes também pela caixa de entrada autorizada da Fábrica (RPC):
  // garante visibilidade do gestor do grupo sem depender de RLS/contexto.
  const inboxQuery = useQuery({
    queryKey: ['factory-inbox-supply'],
    queryFn: getFactoryInbox,
    staleTime: 15_000,
  });
  const candidatesQuery = useQuery({
    queryKey: ['supply-candidates', openId],
    queryFn: () => getSupplyCandidates(openId!),
    enabled: !!openId,
  });
  const decideMutation = useMutation({
    mutationFn: (args: { id: string; kind: 'LOJA' | 'CD' | 'FABRICA' | 'REJEITAR'; branchId?: string }) =>
      decideSupplyRequest(args.id, args.kind, args.branchId),
    onSuccess: (r) => {
      if (r.status === 'REJEITADA') toast.success('Solicitação → rejeitada.');
      else if (r.intercompany_request_id) toast.success('Origem = FÁBRICA: solicitação criada para a fila de decisão do gestor da indústria.');
      else toast.success('Origem definida: transferência criada e APROVADA. É só separar e expedir na aba Transferências.');
      queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
      queryClient.invalidateQueries({ queryKey: ['replenishment-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['factory-inbox-supply'] });
      queryClient.invalidateQueries({ queryKey: ['factory-inbox'] });
    },
    onError: (e: any) => toast.error(`Não foi possível decidir: ${e?.message || 'erro inesperado'}`),
  });

  const requests = requestsQuery.data || [];
  const byId = new Map<string, SupplyRequest & { company_name?: string; branch_name?: string | null }>();
  for (const r of requests) byId.set(r.id, r);
  for (const item of inboxQuery.data?.supply || []) {
    if (!byId.has(item.id)) {
      byId.set(item.id, {
        id: item.id, company_id: item.company_id, requester_branch_id: item.requester_branch_id,
        product_id: item.product_id, product_code: item.product_code, product_name: item.product_name,
        quantity: item.quantity, status: 'PENDENTE', decided_source_kind: null,
        decided_source_branch_id: null, transfer_order_id: null, intercompany_request_id: null,
        created_at: item.created_at, company_name: item.company_name, branch_name: item.branch_name,
      });
    }
  }
  const pending = [...byId.values()].filter((r) => r.status === 'PENDENTE');
  const decided = requests.filter((r) => r.status !== 'PENDENTE').slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageCheck className="h-5 w-5 text-emerald-600" /> Análise de abastecimento (almoxarifados)
        </CardTitle>
        <CardDescription>
          Para cada pedido de Loja, o sistema mostra o saldo em <strong>outra Loja</strong>, no{' '}
          <strong>CD</strong> e na <strong>fábrica</strong>. Você decide a origem e o fluxo oficial
          é gerado na hora (transferência aprovada ou solicitação à fábrica).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requestsQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando solicitações…</p>}
        {requestsQuery.isError && inboxQuery.isError && (
          <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            Não foi possível carregar as solicitações: {(requestsQuery.error as any)?.message || (inboxQuery.error as any)?.message || 'erro inesperado'}
          </p>
        )}
        {!requestsQuery.isLoading && pending.length === 0 && !requestsQuery.isError && (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente de análise.</p>
        )}
        {pending.map((r) => (
          <div key={r.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{r.product_name}</span>
              <Badge variant="outline">{r.product_code}</Badge>
              <Badge>{fmt(Number(r.quantity))} un</Badge>
              <span className="text-xs text-muted-foreground">
                {(r as any).company_name ? `${(r as any).company_name}${(r as any).branch_name ? ` · ${(r as any).branch_name}` : ''} · ` : ''}{new Date(r.created_at).toLocaleString('pt-BR')}
              </span>
              <div className="ml-auto flex gap-2">
                {openId !== r.id ? (
                  <Button size="sm" variant="outline" onClick={() => setOpenId(r.id)}>
                    Analisar origens
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>Fechar</Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={decideMutation.isPending}
                  onClick={() => decideMutation.mutate({ id: r.id, kind: 'REJEITAR' })}
                >
                  <X className="mr-1 h-4 w-4" /> Rejeitar
                </Button>
              </div>
            </div>
            {openId === r.id && (
              <div className="mt-2 space-y-1.5">
                {candidatesQuery.isLoading && <p className="text-xs text-muted-foreground">Consultando saldos do grupo…</p>}
                {rankSupplyCandidates(candidatesQuery.data || [], Number(r.quantity)).map((ranked) => (
                  <CandidateRow
                    key={`${ranked.candidate.source_kind}-${ranked.candidate.branch_id}`}
                    ranked={ranked}
                    requestedQty={Number(r.quantity)}
                    pending={decideMutation.isPending}
                    onDecide={(cand) => decideMutation.mutate({
                      id: r.id,
                      kind: cand.source_kind,
                      branchId: cand.branch_id,
                    })}
                  />
                ))}
                {!candidatesQuery.isLoading && (candidatesQuery.data || []).length === 0 && (
                  <p className="text-xs text-amber-600">
                    Nenhuma origem com o item no grupo — considere produzir (fábrica sem saldo) ou rejeitar.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {decided.length > 0 && (
          <div className="space-y-1 pt-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Decididas recentemente</p>
            {decided.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{r.product_name}</span>
                <span>{fmt(Number(r.quantity))} un</span>
                <Badge variant={r.status === 'ATENDIDA' ? 'default' : 'destructive'}>{r.status}</Badge>
                {r.decided_source_kind && <span>origem: {kindLabel[r.decided_source_kind]}</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Acompanhamento da própria Loja: o que pedi, onde está na fila da Fábrica. */
export function MySupplyRequestsPanel({ branchId }: { branchId?: string }) {
  const requestsQuery = useQuery({
    queryKey: ['supply-requests'],
    queryFn: listSupplyRequests,
  });
  const mine = (requestsQuery.data || [])
    .filter((r) => !branchId || r.requester_branch_id === branchId)
    .slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-5 w-5 text-primary" /> Minhas solicitações de reposição
        </CardTitle>
        <CardDescription>
          Toda solicitação desta unidade entra na <strong>caixa de entrada da Fábrica</strong> para
          o gestor analisar a melhor origem (Fábrica, CD ou outra Loja). Acompanhe o andamento aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {requestsQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando solicitações…</p>}
        {!requestsQuery.isLoading && mine.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação registrada para esta unidade ainda.</p>
        )}
        {mine.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
            <span className="font-medium">{r.product_name}</span>
            <Badge variant="outline">{r.product_code}</Badge>
            <span>{fmt(Number(r.quantity))} un</span>
            {r.status === 'PENDENTE' && <Badge variant="secondary">Aguardando análise da Fábrica</Badge>}
            {r.status === 'ATENDIDA' && (
              <Badge variant="default">
                Atendida{r.decided_source_kind ? ` — vem de: ${kindLabel[r.decided_source_kind]}` : ''}
              </Badge>
            )}
            {r.status === 'REJEITADA' && <Badge variant="destructive">Rejeitada pela análise</Badge>}
            {r.status === 'CANCELADA' && <Badge variant="outline">Cancelada</Badge>}
            <span className="ml-auto text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleString('pt-BR')}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
