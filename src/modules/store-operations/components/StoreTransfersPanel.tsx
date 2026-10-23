import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Download, RefreshCcw } from 'lucide-react';

interface Row {
  id: string;
  current_status: string;
  created_at: string;
  origin_unit_id: string;
  stock_transfer_items: { id: string }[];
  branches?: { name: string } | null;
}

const FINAL = ['ENCERRADA', 'REJEITADA', 'CANCELADA', 'CONFERIDA'];

/**
 * Painéis reais da loja: o que está chegando e as solicitações ativas desta
 * unidade, direto de stock_transfer_orders (sem números de demonstração).
 */
export function StoreTransfersPanel({ onReceive }: { onReceive: () => void }) {
  const { currentBranch } = useEnterprise();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['store-transfers-panel', currentBranch?.id],
    enabled: !!currentBranch?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('stock_transfer_orders')
        .select('id, current_status, created_at, origin_unit_id, stock_transfer_items(id), branches:origin_unit_id(name)')
        .eq('destination_unit_id', currentBranch!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 30_000,
  });

  const active = rows.filter((r) => !FINAL.includes(r.current_status) && r.current_status !== 'RECEBIDA');
  const arriving = active.filter((r) => r.current_status === 'EM TRÂNSITO' || r.current_status === 'EXPEDIDA');

  return (
    <>
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardHeader className="p-4">
          <CardTitle className="text-sm font-black uppercase flex items-center gap-2 text-blue-500">
            <Download className="h-4 w-4" /> Chegando
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          {isLoading ? (
            <p className="text-[11px] text-muted-foreground">Carregando…</p>
          ) : arriving.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Nenhuma entrega a caminho desta unidade.</p>
          ) : arriving.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-blue-500/20 shadow-sm">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black font-mono">{t.id.slice(0, 8)}</span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-bold uppercase">{t.branches?.name ?? 'Rede'}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground font-medium">
                  {t.stock_transfer_items.length} item(ns) · {t.current_status.toLowerCase()}
                </p>
              </div>
              <Button size="sm" variant="default" className="bg-blue-600 hover:bg-blue-700 h-7 text-[10px] font-black px-3" onClick={onReceive}>
                CONFERIR
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-primary/10">
        <CardHeader className="p-4 border-b bg-muted/10">
          <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-primary" /> Solicitações ativas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-[11px] text-muted-foreground">Carregando…</p>
          ) : active.length === 0 ? (
            <p className="p-4 text-[11px] text-muted-foreground">Nenhuma solicitação ativa para esta unidade.</p>
          ) : (
            <div className="divide-y divide-primary/5">
              {active.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-xs font-black font-mono">{t.id.slice(0, 8)}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {t.stock_transfer_items.length} item(ns) · de {t.branches?.name ?? 'rede'}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-bold uppercase">{t.current_status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
