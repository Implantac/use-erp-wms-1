import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Factory, Inbox, PackageCheck, Store, Truck, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { supabase } from '@/integrations/supabase/client';
import {
  decideSupplyRequest,
  getSupplyCandidates,
  type SupplyCandidate,
} from '@/services/operational/store/supplyService';
import { useDecideGroupRequest } from '@/hooks/operational/store/useGroupReplenishment';
import { rankSupplyCandidates } from '@/lib/store/supplyRecommendation';
import { createTextileProductionOrder } from '@/services/production/textilePcpService';
import { useSupplyAccess } from '@/hooks/operational/store/useSupplyAccess';

const fmt = (n: any) => Number(n || 0).toLocaleString('pt-BR');

const kindLabel: Record<string, string> = {
  LOJA: 'Outra Loja (remanejo)',
  CD: 'CD Loja',
  FABRICA: 'Fábrica',
};

/**
 * Caixa de entrada da indústria: TODA solicitação das lojas aparece aqui,
 * via RPC factory_inbox() (autorizada no servidor, sem depender de contexto
 * nem de RLS de tabela). Daqui o gestor:
 *  - decide pedidos diretos à Fábrica (vender/transferir/produzir/rejeitar);
 *  - analisa solicitações de abastecimento e define a origem
 *    (outra Loja = remanejo, CD, ou a própria Fábrica).
 */
export function FactoryInboxPanel() {
  const supplyAccess = useSupplyAccess();
  const queryClient = useQueryClient();
  const decideInter = useDecideGroupRequest();
  const [openId, setOpenId] = useState<string | null>(null);

  const inboxQuery = useQuery({
    queryKey: ['factory-inbox'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('factory_inbox');
      if (error) throw error;
      return data as { supply: any[]; intercompany: any[] };
    },
    staleTime: 15_000,
    enabled: supplyAccess.canManage,
  });

  const candidatesQuery = useQuery({
    queryKey: ['factory-inbox-candidates', openId],
    queryFn: () => getSupplyCandidates(openId!),
    enabled: !!openId,
  });

  const decideSupply = useMutation({
    mutationFn: (args: { id: string; kind: 'LOJA' | 'CD' | 'FABRICA' | 'REJEITAR'; branchId?: string }) =>
      decideSupplyRequest(args.id, args.kind, args.branchId),
    onSuccess: (r) => {
      if (r.status === 'REJEITADA') toast.success('Solicitação → rejeitada.');
      else if (r.intercompany_request_id) toast.success('Origem = FÁBRICA: pedido criado para decisão da indústria.');
      else toast.success('Origem definida: transferência criada e APROVADA para separação/expedição.');
      queryClient.invalidateQueries({ queryKey: ['factory-inbox'] });
    },
    onError: (e: any) => toast.error(`Não foi possível decidir: ${e?.message || 'erro inesperado'}`),
  });

  // Separação de papéis: esta caixa é do gestor da indústria. Para a Loja
  // (que só solicita e recebe) o painel nem aparece.
  if (!supplyAccess.isLoading && !supplyAccess.canManage) return null;

  // Produzir = decisão da indústria + OP gerada na hora (cai no PCP).
  // O produto da indústria casa pelo CÓDIGO com o pedido da Loja; sem
  // produto correspondente, a decisão fica registrada e o gestor é avisado.
  const [producingId, setProducingId] = useState<string | null>(null);
  const handleProduce = async (r: any) => {
    setProducingId(r.id);
    try {
      await decideInter.mutateAsync({ requestId: r.id, decision: 'produzir' });
      const rootId = (inboxQuery.data as any)?.group_root_company_id as string | undefined;
      const { data: product } = rootId
        ? await (supabase as any).from('products').select('id, name')
            .eq('company_id', rootId).eq('code', r.product_code).maybeSingle()
        : { data: null };
      if (!product?.id) {
        toast.warning(`Decisão "produzir" registrada, mas a indústria não tem produto com o código ${r.product_code} — cadastre/vincule para gerar a OP.`);
        return;
      }
      const op = await createTextileProductionOrder({
        productId: product.id,
        quantity: Number(r.quantity),
        clientName: r.company_name,
        idempotencyKey: `inter-produz-${String(r.id).slice(0, 8)}`,
      });
      const replay = (op as any)?.idempotent_replay === true;
      toast.success(replay
        ? `OP já existia para este pedido (${(op as any)?.order_number ?? ''}) — nada duplicado. Acompanhe no PCP.`
        : `OP ${(op as any)?.order_number ?? ''} criada e já está no PCP para programar/executar.`);
      queryClient.invalidateQueries({ queryKey: ['factory-inbox'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar a OP');
    } finally {
      setProducingId(null);
    }
  };

  const supply = inboxQuery.data?.supply || [];
  const inter = inboxQuery.data?.intercompany || [];
  const total = supply.length + inter.length;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-5 w-5 text-primary" /> Solicitações das Lojas — caixa de entrada da Fábrica
          {total > 0 && <Badge variant="destructive">{total} pendente(s)</Badge>}
        </CardTitle>
        <CardDescription>
          Toda reposição que qualquer Loja do grupo solicitar aparece aqui na indústria.
          Pedidos à Fábrica: decida vender, transferir, produzir ou rejeitar. Solicitações de
          abastecimento: analise os saldos e defina se sai de <strong>outra Loja (remanejo)</strong>,
          do <strong>CD</strong> ou da <strong>Fábrica</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {inboxQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando solicitações das lojas…</p>}
        {inboxQuery.isError && (
          <p className="text-sm text-red-600">
            Não foi possível carregar: {(inboxQuery.error as any)?.message || 'erro inesperado'}
          </p>
        )}
        {!inboxQuery.isLoading && !inboxQuery.isError && total === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação de Loja pendente no momento.</p>
        )}

        {inter.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
              <Factory className="h-4 w-4" /> Pedidos à Fábrica aguardando decisão
            </p>
            {inter.map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{r.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.company_name}{r.branch_name ? ` · ${r.branch_name}` : ''} ·{' '}
                    {new Date(r.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <Badge variant="outline">{r.product_code}</Badge>
                <Badge>{fmt(r.quantity)} un</Badge>
                <div className="flex gap-1">
                  <Button size="sm" disabled={decideInter.isPending}
                    onClick={() => decideInter.mutate({ requestId: r.id, decision: 'vender' })}>Vender</Button>
                  <Button size="sm" variant="secondary" disabled={decideInter.isPending}
                    onClick={() => decideInter.mutate({ requestId: r.id, decision: 'transferir_cd' })}>Transferir CD</Button>
                  <Button size="sm" variant="secondary" disabled={decideInter.isPending || producingId === r.id}
                    onClick={() => void handleProduce(r)}>Produzir (gera OP)</Button>
                  <Button size="sm" variant="destructive" disabled={decideInter.isPending}
                    onClick={() => decideInter.mutate({ requestId: r.id, decision: 'rejeitar' })}>Rejeitar</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {supply.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
              <PackageCheck className="h-4 w-4" /> Abastecimento aguardando análise de origem
            </p>
            {supply.map((r: any) => (
              <div key={r.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{r.product_name}</span>
                  <Badge variant="outline">{r.product_code}</Badge>
                  <Badge>{fmt(r.quantity)} un</Badge>
                  <span className="text-xs text-muted-foreground">
                    {r.company_name}{r.branch_name ? ` · ${r.branch_name}` : ''} ·{' '}
                    {new Date(r.created_at).toLocaleString('pt-BR')}
                  </span>
                  <div className="ml-auto flex gap-2">
                    {openId !== r.id ? (
                      <Button size="sm" variant="outline" onClick={() => setOpenId(r.id)}>
                        Analisar origens
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>Fechar</Button>
                    )}
                    <Button size="sm" variant="destructive" disabled={decideSupply.isPending}
                      onClick={() => decideSupply.mutate({ id: r.id, kind: 'REJEITAR' })}>
                      <X className="mr-1 h-4 w-4" /> Rejeitar
                    </Button>
                  </div>
                </div>
                {openId === r.id && (
                  <div className="mt-2 space-y-1.5">
                    {candidatesQuery.isLoading && (
                      <p className="text-xs text-muted-foreground">Consultando saldos do grupo (Loja × CD × Fábrica)…</p>
                    )}
                    {rankSupplyCandidates(candidatesQuery.data || [], Number(r.quantity)).map((ranked) => {
                      const c: SupplyCandidate = ranked.candidate;
                      const saldo = Number(c.quantity || 0);
                      const Icon = c.source_kind === 'FABRICA' ? Factory : c.source_kind === 'CD' ? Truck : Store;
                      return (
                        <div key={`${c.source_kind}-${c.branch_id}`}
                          className={`flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-sm ${ranked.recommended ? 'border-primary/60 bg-primary/5' : 'bg-muted/30'}`}>
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{kindLabel[c.source_kind]}</span>
                          <span className="text-muted-foreground">{c.branch_name} ({c.company_name})</span>
                          <Badge variant={saldo === 0 ? 'destructive' : saldo >= Number(r.quantity) ? 'default' : 'secondary'}>
                            saldo {fmt(saldo)}
                          </Badge>
                          {ranked.recommended && <Badge variant="default">Melhor opção</Badge>}
                          {ranked.recommended && ranked.reason && <span className="text-xs text-muted-foreground">{ranked.reason}</span>}
                          <Button size="sm" className="ml-auto" disabled={decideSupply.isPending || saldo <= 0}
                            onClick={() => decideSupply.mutate({ id: r.id, kind: c.source_kind, branchId: c.branch_id })}>
                            Atender desta origem
                          </Button>
                        </div>
                      );
                    })}
                    {!candidatesQuery.isLoading && (candidatesQuery.data || []).length === 0 && (
                      <p className="text-xs text-amber-600">
                        Nenhuma origem com saldo no grupo — produza na Fábrica ou rejeite.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
