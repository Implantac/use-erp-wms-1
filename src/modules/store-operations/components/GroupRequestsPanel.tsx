import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  useCreateGroupRequest,
  useGroupRequests,
  useReceiveGroupDelivery,
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
import { Building2, PackageCheck, Plus } from 'lucide-react';

const STATUS_LABEL: Record<GroupRequest['status'], string> = {
  pendente: 'Aguardando indústria',
  aprovada: 'Aprovada — aguardando envio',
  producao_solicitada: 'Indústria vai produzir',
  rejeitada: 'Rejeitada',
  recebida: 'Recebida',
  cancelada: 'Cancelada',
};

/**
 * Grupo: lojas com CNPJ próprio pedem reposição à indústria do grupo,
 * acompanham a decisão e confirmam o recebimento (estoque via ledger).
 * Só aparece dados reais: sem grupo/sem solicitações, mostra o vazio.
 */
export function GroupRequestsPanel() {
  const { data: requests = [], isLoading } = useGroupRequests();
  const create = useCreateGroupRequest();
  const receive = useReceiveGroupDelivery();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['own-products-group-request'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, code, name, unit')
        .order('name')
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = async () => {
    const qty = Number(quantity);
    if (!productId || !(qty > 0)) return;
    await create.mutateAsync({ productId, quantity: qty, notes: notes || undefined });
    setOpen(false);
    setProductId('');
    setQuantity('');
    setNotes('');
  };

  return (
    <Card className="border-primary/10">
      <CardHeader className="p-4 border-b bg-muted/10">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> Reposição — Indústria do grupo
          </CardTitle>
          <Button size="sm" className="h-8 text-[11px] font-black" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> SOLICITAR AO GRUPO
          </Button>
        </div>
        <CardDescription className="text-[11px]">
          Para lojas com CNPJ próprio: a indústria decide (vender, transferir do CD,
          remanejar de outra loja ou produzir) e você confirma o recebimento aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="p-4 text-xs text-muted-foreground">Carregando solicitações…</p>
        ) : requests.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            Nenhuma solicitação ao grupo. Se a sua loja é filial (mesmo CNPJ), use a
            solicitação ao CD ao lado; se é empresa do grupo, use “Solicitar ao grupo”.
          </p>
        ) : (
          <div className="divide-y divide-primary/5">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-black">
                    {r.product_code} — {r.product_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-medium">
                    {r.quantity} {r.unit ?? 'un'} · {new Date(r.created_at).toLocaleDateString('pt-BR')}
                    {r.received_quantity != null && ` · recebido: ${r.received_quantity}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[9px] font-bold uppercase">
                    {STATUS_LABEL[r.status]}
                  </Badge>
                  {r.status === 'aprovada' && (
                    <Button
                      size="sm"
                      className="h-7 text-[10px] font-black px-3"
                      disabled={receive.isPending}
                      onClick={() => receive.mutate({ requestId: r.id })}
                    >
                      <PackageCheck className="mr-1 h-3.5 w-3.5" /> CONFIRMAR RECEBIMENTO
                    </Button>
                  )}
                </div>
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
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase">Produto (do seu cadastro)</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
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
              <Label className="text-[10px] font-black uppercase">Quantidade</Label>
              <Input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase">Observações</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Urgência, campanha, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={create.isPending || !productId || !(Number(quantity) > 0)}>
              Enviar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
