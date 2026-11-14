import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  useCreateGroupRequest,
  useGroupRequests,
  type GroupRequest,
} from '@/hooks/operational/store/useGroupReplenishment';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/ui/base/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/ui/base/select';
import { Building2, Plus } from 'lucide-react';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { useIntercompanyProductionReleases } from '@/hooks/operational/store/useIntercompanyProductionReleases';
import { IntercompanyReleaseSummary } from '@/components/production/IntercompanyReleaseSummary';
import { isUuid, LEGACY_RECEIPT_MESSAGE } from '@/lib/store/intercompanyRelease';

const STATUS_LABEL: Record<GroupRequest['status'], string> = {
  pendente: 'Aguardando indústria',
  aprovada: 'Aprovada — liberação logística/fiscal não confirmada',
  producao_solicitada: 'Produção solicitada — acompanhar disponibilização',
  rejeitada: 'Rejeitada',
  recebida: 'Recebida',
  cancelada: 'Cancelada',
};

/**
 * Grupo: lojas com CNPJ próprio pedem reposição à indústria do grupo,
 * acompanham decisão, OP e disponibilização. Recebimento por entrega permanece pendente.
 * Só aparece dados reais: sem grupo/sem solicitações, mostra o vazio.
 */
export function GroupRequestsPanel() {
  const { data: requests = [], isPending: isLoading, isError, error } = useGroupRequests('requester');
  const context = useEnterprise();
  const contextReady = context.isReady && !context.isSwitching && isUuid(context.userId) && isUuid(context.currentCompany?.id);
  const contextToken = JSON.stringify([context.userId, context.currentCompany?.id, context.currentBranch?.id, context.activeChannel]);
  const currentToken = useRef<string | null>(contextToken); currentToken.current = contextReady ? contextToken : null;
  const releases = useIntercompanyProductionReleases(requests.filter(r => r.decision === 'produzir' || r.status === 'producao_solicitada').map(r => r.id));
  const create = useCreateGroupRequest();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => { setOpen(false); setProductId(''); setQuantity(''); setNotes(''); }, [contextToken]);

  const { data: products = [], isError: productError, isFetching: loadingProducts } = useQuery({
    queryKey: ['own-products-group-request', contextReady ? contextToken : null],
    enabled: open && contextReady, retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('products')
        .select('id, code, name, unit')
        .eq('company_id', context.currentCompany!.id)
        .order('name')
        .limit(500).abortSignal(signal);
      if (signal.aborted) throw new Error('Consulta cancelada.');
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = async () => {
    const qty = Number(quantity); const sentToken = currentToken.current;
    if (!sentToken || create.isPending || loadingProducts || productError || !products.some(p => p.id === productId) || !Number.isFinite(qty) || qty <= 0) return;
    try {
      await create.mutateAsync({ productId, quantity: qty, notes: notes || undefined });
      if (currentToken.current !== sentToken) return;
      setOpen(false); setProductId(''); setQuantity(''); setNotes('');
    } catch { /* Existing mutation displays the backend error; never close or report success here. */ }
  };

  return (
    <Card className="border-primary/10">
      <CardHeader className="p-4 border-b bg-muted/10">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> Reposição — Indústria do grupo
          </CardTitle>
          <Button size="sm" className="h-8 text-[11px] font-black" disabled={!contextReady} onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> SOLICITAR AO GRUPO
          </Button>
        </div>
        <CardDescription className="text-[11px]">
          Para lojas com CNPJ próprio: a indústria decide (vender, transferir do CD,
          remanejar de outra loja ou produzir). Recebimento exige entrega identificada; não é confirmado por este painel.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {!contextReady ? (
          <p role="status" className="p-4 text-xs text-muted-foreground">Aguarde a resolução do contexto da empresa/unidade.</p>
        ) : isError ? (
          <p role="alert" className="p-4 text-xs text-destructive">Falha ao consultar solicitações: {error instanceof Error ? error.message : 'consulta indisponível'}. Não é um resultado vazio.</p>
        ) : isLoading ? (
          <p className="p-4 text-xs text-muted-foreground">Carregando solicitações…</p>
        ) : requests.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            Nenhuma solicitação ao grupo. Se a sua loja é filial (mesmo CNPJ), use a
            solicitação ao CD ao lado; se é empresa do grupo, use “Solicitar ao grupo”.
          </p>
        ) : (
          <div className="divide-y divide-primary/5">
            {requests.map((r) => (
              <div key={r.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="text-xs font-black">
                    {r.product_code} — {r.product_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-medium">
                    {r.quantity} {r.unit || '(unidade não informada)'} · {new Date(r.created_at).toLocaleDateString('pt-BR')}
                    {r.received_quantity != null && ` · recebido: ${r.received_quantity}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[9px] font-bold uppercase">
                    {STATUS_LABEL[r.status]}
                  </Badge>
                  {r.status === 'aprovada' && <p className="max-w-sm text-xs text-muted-foreground">{LEGACY_RECEIPT_MESSAGE}</p>}
                </div>
                {(r.decision === 'produzir' || r.status === 'producao_solicitada') && <div className="w-full">
                  <IntercompanyReleaseSummary requestId={r.id} productionOrderId={r.production_order_id}
                    salesOrderId={r.sales_order_id} readState={releases.state}
                    release={releases.records.find(record => record.request_id === r.id)} scopeToken={releases.scopeToken}
                    onRefresh={async () => { await releases.refetch(); }} />
                </div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="uppercase text-sm font-black">Solicitar reposição à indústria do grupo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {loadingProducts && <p role="status" className="text-xs">Consultando produtos da empresa ativa…</p>}
            {productError && <p role="alert" className="text-xs text-destructive">Falha na consulta dos produtos; não é confirmação de cadastro vazio.</p>}
            <div className="space-y-1">
              <Label htmlFor="group-request-product" className="text-[10px] font-black uppercase">Produto (do seu cadastro)</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id="group-request-product"><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                A indústria localiza o produto dela pelo mesmo código (SKU).
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="group-request-quantity" className="text-[10px] font-black uppercase">Quantidade</Label>
              <Input id="group-request-quantity" type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="group-request-notes" className="text-[10px] font-black uppercase">Observações</Label>
              <Input id="group-request-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Urgência, campanha, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={!contextReady || create.isPending || loadingProducts || productError || !products.some(p => p.id === productId) || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0}>
              Enviar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
