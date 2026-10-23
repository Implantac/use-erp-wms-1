import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, Package } from 'lucide-react';
import { Badge } from '@/ui/base/badge';
import { supabase } from '@/integrations/supabase/client';

const fmt = (n: any) => Number(n || 0).toLocaleString('pt-BR');

interface TransferDetailProps {
  movement: any;
}

/**
 * Detalhe da transferência ao clicar no cartão: abre mostrando a ORIGEM
 * (unidade e empresa), o destino e os itens com quantidades do fluxo
 * oficial (stock_transfer_orders / stock_transfer_items).
 */
export function TransferDetail({ movement }: TransferDetailProps) {
  const transferId = movement.id;

  const detailQuery = useQuery({
    queryKey: ['transfer-detail', transferId],
    queryFn: async () => {
      const { data: items, error } = await (supabase as any)
        .from('stock_transfer_items')
        .select('id, product_id, requested_qty, shipped_qty, received_qty')
        .eq('transfer_id', transferId);
      if (error) throw error;
      const ids = [...new Set((items || []).map((i: any) => i.product_id))];
      const { data: prods } = ids.length
        ? await (supabase as any)
            .from('products')
            .select('id, name, code, image_url')
            .in('id', ids)
        : { data: [] };
      const byId = new Map((prods || []).map((p: any) => [p.id, p]));
      return (items || []).map((i: any) => ({ ...i, product: byId.get(i.product_id) || {} }));
    },
  });

  const items = detailQuery.data || [];

  if (movement.kind === 'intercompany') {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="flex-1 min-w-[220px] rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
            <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-primary">
              <Building2 className="h-3 w-3" /> Origem: fábrica (indústria do grupo)
            </p>
            <p className="mt-1 text-sm font-black uppercase">{movement.origin_company || movement.origin_name || 'Fábrica'}</p>
            <p className="text-[11px] text-muted-foreground">Pedido intercompany da Loja — decisão: vender, transferir, remanejar ou produzir</p>
          </div>
          <div className="flex items-center justify-center px-1">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-[220px] rounded-lg border bg-muted/30 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Destino (Loja solicitante)</p>
            <p className="mt-1 text-sm font-black uppercase">{movement.destination_name || '—'}</p>
            <p className="text-[11px] text-muted-foreground">{movement.destination_company || ''}</p>
          </div>
        </div>
        <div className="rounded-lg border px-3 py-2 text-sm flex flex-wrap items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="font-bold">{movement.product_name || movement.product_code}</span>
          <Badge variant="outline">{movement.product_code}</Badge>
          <span>{fmt(movement.quantity)} un</span>
          <Badge>{movement.intercompany_status}</Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex-1 min-w-[220px] rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
          <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-primary">
            <Building2 className="h-3 w-3" /> Origem da transferência
          </p>
          <p className="mt-1 text-sm font-black uppercase">
            {movement.origin_name || movement.origin_type || '—'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {movement.origin_type}
            {movement.origin_company ? ` · ${movement.origin_company}` : ''}
          </p>
        </div>
        <div className="flex items-center justify-center px-1">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-[220px] rounded-lg border bg-muted/30 p-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
            Destino
          </p>
          <p className="mt-1 text-sm font-black uppercase">
            {movement.destination_name || movement.destination_type || '—'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {movement.destination_type}
            {movement.destination_company ? ` · ${movement.destination_company}` : ''}
          </p>
        </div>
      </div>

      <div className="rounded-lg border">
        <p className="border-b bg-muted/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest">
          Itens da transferência
        </p>
        {detailQuery.isLoading ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Carregando itens…</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Nenhum item encontrado.</p>
        ) : (
          <div className="divide-y">
            {items.map((i: any) => (
              <div key={i.id} className="flex items-center gap-3 px-3 py-2">
                {i.product?.image_url ? (
                  <img
                    src={i.product.image_url}
                    alt=""
                    className="h-10 w-10 rounded border object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded border bg-muted">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{i.product?.name || i.product_id}</p>
                  <p className="text-[10px] text-muted-foreground">{i.product?.code || ''}</p>
                </div>
                <div className="flex gap-2 text-right">
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Pedida</p>
                    <p className="text-xs font-black">{fmt(i.requested_qty)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Enviada</p>
                    <p className="text-xs font-black">{fmt(i.shipped_qty)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Recebida</p>
                    <p className="text-xs font-black">{fmt(i.received_qty)}</p>
                  </div>
                  {Number(i.shipped_qty || 0) > 0 &&
                    Number(i.received_qty || 0) > 0 &&
                    Number(i.received_qty) < Number(i.shipped_qty) && (
                      <Badge variant="destructive" className="self-center text-[9px]">
                        faltam {fmt(Number(i.shipped_qty) - Number(i.received_qty))}
                      </Badge>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
