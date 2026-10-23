import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createSupplyRequest } from '@/services/operational/store/supplyService';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, Boxes, TriangleAlert } from 'lucide-react';

/**
 * Abas operacionais da Central da Loja com dados reais:
 * recebimentos, transferências (matriz de movimentações da unidade),
 * estoque da unidade e ocorrências (perdas, contagens e divergências).
 * Nenhum número de demonstração: tudo vem do ledger e das ordens reais.
 */

interface TransferRow {
  id: string;
  current_status: string;
  created_at: string;
  origin_unit_id: string;
  destination_unit_id: string;
  stock_transfer_items: { id: string; requested_qty: number; shipped_qty?: number; products?: { name: string; code: string } | null }[];
  origin?: { name: string } | null;
  destination?: { name: string } | null;
}

const statusVariant = (s: string): 'default' | 'secondary' | 'destructive' | 'outline' =>
  s.includes('DIVERGÊNCIA') || s === 'REJEITADA' ? 'destructive'
  : s === 'EM TRÂNSITO' || s === 'EXPEDIDA' ? 'default'
  : s === 'ENCERRADA' || s === 'CONFERIDA' ? 'outline' : 'secondary';

function useUnitTransfers(limit = 30) {
  const { currentBranch } = useEnterprise();
  return useQuery({
    queryKey: ['store-tab-transfers', currentBranch?.id],
    enabled: !!currentBranch?.id,
    queryFn: async () => {
      const unit = currentBranch!.id;
      const { data, error } = await (supabase as any)
        .from('stock_transfer_orders')
        .select('id, current_status, created_at, origin_unit_id, destination_unit_id, stock_transfer_items(id, requested_qty, shipped_qty, products(name, code)), origin:origin_unit_id(name), destination:destination_unit_id(name)')
        .or(`origin_unit_id.eq.${unit},destination_unit_id.eq.${unit}`)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as TransferRow[];
    },
    staleTime: 30_000,
  });
}

export function StoreReceivingTab({ onReceive }: { onReceive: () => void }) {
  const { currentBranch } = useEnterprise();
  const { data: rows = [], isLoading } = useUnitTransfers();
  const arriving = rows.filter((r) => r.destination_unit_id === currentBranch?.id && (r.current_status === 'EXPEDIDA' || r.current_status === 'EM TRÂNSITO'));
  const received = rows.filter((r) => r.destination_unit_id === currentBranch?.id && ['RECEBIDA', 'RECEBIDA COM DIVERGÊNCIA', 'CONFERIDA', 'ENCERRADA'].includes(r.current_status));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="p-4"><CardTitle className="text-sm font-black uppercase flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" /> A Receber</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          {isLoading ? <p className="text-[11px] text-muted-foreground">Carregando…</p>
          : arriving.length === 0 ? <p className="text-[11px] text-muted-foreground">Nada a caminho desta unidade.</p>
          : arriving.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 bg-background rounded-lg border shadow-sm">
              <div className="space-y-0.5">
                <p className="text-xs font-bold uppercase tracking-tight">De {t.origin?.name ?? 'origem'}</p>
                <p className="text-[10px] text-muted-foreground">{t.stock_transfer_items?.length ?? 0} item(ns) · {new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(t.current_status)}>{t.current_status}</Badge>
                <Button size="sm" className="h-7 text-[10px] font-black px-3" onClick={onReceive}>CONFERIR</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-4"><CardTitle className="text-sm font-black uppercase">Recebidos Recentes</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          {received.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhum recebimento concluído ainda.</p>
          : received.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 bg-background rounded-lg border shadow-sm">
              <div className="space-y-0.5">
                <p className="text-xs font-bold uppercase tracking-tight">De {t.origin?.name ?? 'origem'}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <Badge variant={statusVariant(t.current_status)}>{t.current_status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function StoreTransfersTab() {
  const { currentBranch } = useEnterprise();
  const { data: rows = [], isLoading } = useUnitTransfers();
  return (
    <div className="space-y-6">
    <TransferDecisionPanel />
    <Card>
      <CardHeader className="p-4"><CardTitle className="text-sm font-black uppercase flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Transferências da Unidade</CardTitle></CardHeader>
      <CardContent className="p-4 pt-0 space-y-2">
        {isLoading ? <p className="text-[11px] text-muted-foreground">Carregando…</p>
        : rows.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhuma transferência registrada para esta unidade.</p>
        : rows.map((t) => {
          const outgoing = t.origin_unit_id === currentBranch?.id;
          return (
            <div key={t.id} className="flex items-center justify-between p-3 bg-background rounded-lg border shadow-sm">
              <div className="space-y-0.5">
                <p className="text-xs font-bold uppercase tracking-tight">
                  {outgoing ? `Para ${t.destination?.name ?? 'destino'}` : `De ${t.origin?.name ?? 'origem'}`}
                </p>
                <p className="text-[10px] text-muted-foreground">{outgoing ? 'Saindo' : 'Chegando'} · {t.stock_transfer_items?.length ?? 0} item(ns) · {new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
                <p className="text-[11px] text-foreground/80">
                  {(t.stock_transfer_items ?? []).slice(0, 3).map((i: any) => `${i.products?.name ?? 'Produto'} ×${Number(i.requested_qty || 0)}`).join(' · ')}
                  {(t.stock_transfer_items?.length ?? 0) > 3 ? ` · +${(t.stock_transfer_items?.length ?? 0) - 3}` : ''}
                </p>
              </div>
              <Badge variant={statusVariant(t.current_status)}>{t.current_status}</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
    </div>
  );
}

export function StoreStockTab() {
  const { currentBranch } = useEnterprise();
  const { data, isLoading } = useQuery({
    queryKey: ['store-tab-stock', currentBranch?.id],
    enabled: !!currentBranch?.id,
    queryFn: async () => {
      const unit = currentBranch!.id;
      const [{ data: balances }, { data: policies }] = await Promise.all([
        (supabase as any).from('stock_balances').select('quantity, reserved_qty, product_id').eq('branch_id', unit),
        (supabase as any).from('replenishment_policies').select('min_stock, max_stock, product_id').eq('branch_id', unit),
      ]);
      const ids = [...new Set((balances ?? []).map((b: any) => b.product_id))];
      const { data: prods } = ids.length
        ? await (supabase as any).from('products').select('id, name, code, cost_price, image_url').in('id', ids)
        : { data: [] };
      const prodMap = new Map((prods ?? []).map((p: any) => [p.id, p]));
      const byProduct = new Map<string, { id: string; name: string; code: string; qty: number; min: number; max: number; cost: number; image: string | null }>();
      for (const b of balances ?? []) {
        const pr: any = prodMap.get(b.product_id);
        const cur = byProduct.get(b.product_id) ?? { id: b.product_id, name: pr?.name ?? b.product_id, code: pr?.code ?? '', qty: 0, min: 0, max: 0, cost: Number(pr?.cost_price ?? 0), image: pr?.image_url ?? null };
        cur.qty += Number(b.quantity ?? 0) - Number(b.reserved_qty ?? 0);
        byProduct.set(b.product_id, cur);
      }
      for (const p of policies ?? []) {
        const cur = byProduct.get(p.product_id);
        if (cur) { cur.min = Number(p.min_stock ?? 0); cur.max = Number(p.max_stock ?? 0); }
      }
      return [...byProduct.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 30_000,
  });
  const rows = data ?? [];
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'ruptura' | 'minimo' | 'ok'>('all');
  const visibleRows = rows.filter((r) => {
    const situation = r.qty <= 0 ? 'RUPTURA' : r.min > 0 && r.qty < r.min ? 'ABAIXO DO MÍNIMO' : 'OK';
    if (stockFilter === 'ruptura' && situation !== 'RUPTURA') return false;
    if (stockFilter === 'minimo' && situation !== 'ABAIXO DO MÍNIMO') return false;
    if (stockFilter === 'ok' && situation !== 'OK') return false;
    if (stockSearch && !`${r.name} ${r.code}`.toLowerCase().includes(stockSearch.toLowerCase())) return false;
    return true;
  });
  const queryClient = useQueryClient();
  const requestMutation = useMutation({
    mutationFn: (r: { id: string; qty: number; min: number; max: number }) =>
      createSupplyRequest(currentBranch!.id, r.id, Math.max((r.max > 0 ? r.max : r.min * 3) - r.qty, 1)),
    onSuccess: () => {
      toast.success('Abastecimento solicitado. O almoxarifado vai analisar a melhor origem.');
      queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
    },
    onError: (e: any) => toast.error(`Não foi possível solicitar: ${e?.message || 'erro inesperado'}`),
  });
  const stockValue = rows.reduce((acc, r) => acc + r.qty * r.cost, 0);
  return (
    <Card>
      <CardHeader className="p-4"><CardTitle className="text-sm font-black uppercase flex items-center gap-2"><Boxes className="h-4 w-4" /> Estoque da Unidade {stockValue > 0 ? `· R$ ${stockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}</CardTitle></CardHeader>
      <CardContent className="p-4 pt-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <Input placeholder="Buscar produto ou código…" value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} className="h-8 w-56 text-xs" />
          {([['all', 'Todos'], ['ruptura', 'Ruptura'], ['minimo', 'Abaixo do mínimo'], ['ok', 'OK']] as const).map(([f, label]) => (
            <Button key={f} size="sm" variant={stockFilter === f ? 'default' : 'outline'} className="h-7 text-[10px]" onClick={() => setStockFilter(f)}>
              {label}
            </Button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {rows.filter((r) => r.qty <= 0).length} em ruptura · {visibleRows.length} exibido(s)
          </span>
        </div>
        {isLoading ? <p className="text-[11px] text-muted-foreground">Carregando…</p>
        : rows.length === 0 ? <p className="text-[11px] text-muted-foreground">Sem saldo registrado nesta unidade.</p>
        : visibleRows.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhum produto neste filtro.</p>
        : visibleRows.map((r) => {
          const situation = r.qty <= 0 ? 'RUPTURA' : r.min > 0 && r.qty < r.min ? 'ABAIXO DO MÍNIMO' : 'OK';
          return (
            <div key={r.code + r.name} className="flex items-center justify-between gap-3 p-3 bg-background rounded-lg border shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                {r.image ? <img src={r.image} alt="" className="h-10 w-10 rounded border object-cover" loading="lazy" /> : null}
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-tight truncate">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground">{r.code} · mínimo {r.min}{r.max > 0 ? ` · máximo ${r.max}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black">{r.qty}</span>
                <Badge variant={situation === 'OK' ? 'outline' : 'destructive'}>{situation}</Badge>
                {situation !== 'OK' && (
                  <Button
                    size="sm"
                    className="h-7 text-[10px]"
                    disabled={requestMutation.isPending}
                    onClick={() => requestMutation.mutate(r)}
                  >
                    Solicitar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function StoreOccurrencesTab() {
  const { currentBranch } = useEnterprise();
  const { data, isLoading } = useQuery({
    queryKey: ['store-tab-occurrences', currentBranch?.id],
    enabled: !!currentBranch?.id,
    queryFn: async () => {
      const unit = currentBranch!.id;
      const [{ data: movements }, { data: divergences }] = await Promise.all([
        (supabase as any).from('stock_movements').select('id, type, quantity, product_name, reference, created_at')
          .eq('branch_id', unit).in('type', ['loss', 'inventory_count'])
          .order('created_at', { ascending: false }).limit(20),
        (supabase as any).from('stock_transfer_orders').select('id, current_status, created_at, origin:origin_unit_id(name)')
          .eq('destination_unit_id', unit).eq('current_status', 'RECEBIDA COM DIVERGÊNCIA')
          .order('created_at', { ascending: false }).limit(10),
      ]);
      return { movements: movements ?? [], divergences: divergences ?? [] };
    },
    staleTime: 30_000,
  });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="p-4"><CardTitle className="text-sm font-black uppercase flex items-center gap-2"><TriangleAlert className="h-4 w-4" /> Perdas e Contagens</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0 space-y-2">
          {isLoading ? <p className="text-[11px] text-muted-foreground">Carregando…</p>
          : !data || data.movements.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhuma perda ou contagem registrada.</p>
          : data.movements.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between p-3 bg-background rounded-lg border shadow-sm">
              <div className="space-y-0.5">
                <p className="text-xs font-bold uppercase tracking-tight">{m.product_name ?? 'Produto'}</p>
                <p className="text-[10px] text-muted-foreground">{m.reference ?? ''} · {new Date(m.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <Badge variant="secondary">{m.type === 'loss' ? `PERDA ${m.quantity}` : `CONTAGEM ${m.quantity}`}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-4"><CardTitle className="text-sm font-black uppercase">Recebimentos com Divergência</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0 space-y-2">
          {!data || data.divergences.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhuma divergência registrada.</p>
          : data.divergences.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between p-3 bg-background rounded-lg border shadow-sm">
              <div className="space-y-0.5">
                <p className="text-xs font-bold uppercase tracking-tight">De {t.origin?.name ?? 'origem'}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <Badge variant="destructive">{t.current_status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
