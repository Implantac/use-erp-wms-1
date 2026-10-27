import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { ClipboardCheck, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { nextStatuses, transferWorkflow, type TransferStatus } from '@/services/operational/inventory/transferWorkflow';

/**
 * Fila de trabalho do gestor/CD sobre stock_transfer_orders:
 * decidir solicitações (SUGERIDA -> APROVADA/REJEITADA) e avançar a
 * preparação na origem (RESERVADA -> SEPARACAO -> CONFERENCIA -> EXPEDIDA,
 * que baixa o estoque pelo ledger) ate sair para entrega (EM TRANSITO).
 * Toda regra (quem aprova, ordem das etapas, baixa) e do servidor:
 * a tela so oferece a proxima transicao valida e mostra o erro real.
 */

interface Row {
  id: string;
  current_status: TransferStatus;
  created_at: string;
  origin_unit_id: string;
  destination_unit_id: string;
  stock_transfer_items: { id: string; requested_qty: number; shipped_qty: number; products?: { name: string; code: string } | null }[];
  origin?: { name: string } | null;
  destination?: { name: string } | null;
}

const FINAL: TransferStatus[] = ['ENCERRADA', 'REJEITADA', 'CANCELADA', 'CONFERIDA'];
const RECEIVING_SIDE: TransferStatus[] = ['RECEBIDA', 'RECEBIDA PARCIAL', 'RECEBIDA COM DIVERGÊNCIA'];

const ACTION_LABELS: Partial<Record<TransferStatus, string>> = {
  APROVADA: 'Aprovar',
  REJEITADA: 'Rejeitar',
  RESERVADA: 'Iniciar Reserva',
  'SEPARAÇÃO': 'Iniciar Separação',
  'CONFERÊNCIA': 'Iniciar Conferência',
  EXPEDIDA: 'Expedir (Baixa no Estoque)',
  'EM TRÂNSITO': 'Saiu para Entrega',
  CANCELADA: 'Cancelar',
};


function imprimirRomaneio(r: Row) {
  const itens = (r.stock_transfer_items ?? []).map((i) => `
    <tr>
      <td>${i.products?.name ?? 'Produto'}</td>
      <td>${i.products?.code ?? ''}</td>
      <td style="text-align:right">${Number(i.requested_qty || 0)}</td>
      <td style="text-align:right">${Number(i.shipped_qty || 0)}</td>
      <td style="text-align:center">☐</td>
    </tr>`).join('');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>Romaneio ${String(r.id).slice(0, 8).toUpperCase()}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 4px; text-transform: uppercase; }
      p { margin: 2px 0; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
      th, td { border: 1px solid #999; padding: 6px; text-align: left; }
      th { background: #eee; text-transform: uppercase; font-size: 10px; }
      .assinaturas { display: flex; gap: 40px; margin-top: 48px; font-size: 11px; }
      .assinaturas div { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; }
    </style></head><body>
    <h1>Romaneio de Separação / Transferência</h1>
    <p><strong>Transferência:</strong> #${String(r.id).slice(0, 8).toUpperCase()} · <strong>Status:</strong> ${r.current_status}</p>
    <p><strong>Origem:</strong> ${r.origin?.name ?? ''} &nbsp;→&nbsp; <strong>Destino:</strong> ${r.destination?.name ?? ''}</p>
    <p><strong>Emitido em:</strong> ${new Date().toLocaleString('pt-BR')}</p>
    <table><thead><tr><th>Produto</th><th>Código</th><th>Pedida</th><th>Expedida</th><th>Conferido</th></tr></thead>
    <tbody>${itens}</tbody></table>
    <div class="assinaturas"><div>Separado por</div><div>Conferido por</div><div>Recebido por (Loja)</div></div>
    </body></html>`;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export function TransferDecisionPanel() {
  const { currentBranch } = useEnterprise();
  const queryClient = useQueryClient();
  const [acting, setActing] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['transfer-decision-queue', currentBranch?.id],
    enabled: !!currentBranch?.id,
    queryFn: async () => {
      const unit = currentBranch!.id;
      const { data, error } = await (supabase as any)
        .from('stock_transfer_orders')
        .select('id, current_status, created_at, origin_unit_id, destination_unit_id, stock_transfer_items(id, requested_qty, shipped_qty, products(name, code)), origin:origin_unit_id(name), destination:destination_unit_id(name)')
        .or(`origin_unit_id.eq.${unit},destination_unit_id.eq.${unit}`)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return ((data ?? []) as Row[]).filter((r) => !FINAL.includes(r.current_status) && !RECEIVING_SIDE.includes(r.current_status));
    },
    staleTime: 30_000,
  });

  const act = async (row: Row, to: TransferStatus) => {
    setActing(row.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado.');
      await transferWorkflow.transition({ transferId: row.id, toStatus: to, userId: userData.user.id });
      toast.success(`Transferência movida para ${to}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transfer-decision-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['store-tab-transfers'] }),
        queryClient.invalidateQueries({ queryKey: ['store-transfers-panel'] }),
      ]);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível avançar a transferência.');
    } finally {
      setActing(null);
    }
  };

  return (
    <Card className="border-amber-500/20">
      <CardHeader className="p-4">
        <CardTitle className="text-sm font-black uppercase flex items-center gap-2 text-amber-600">
          <ClipboardCheck className="h-4 w-4" /> Fila de Decisão e Preparação
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-2">
        {isLoading ? (
          <p className="text-[11px] text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Nenhuma transferência aguardando decisão ou preparação.</p>
        ) : rows.map((r) => {
          const actions = nextStatuses(r.current_status).filter((s) => ACTION_LABELS[s]);
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 bg-background rounded-lg border shadow-sm">
              <div className="space-y-0.5">
                <p className="text-xs font-bold uppercase tracking-tight">
                  {r.origin?.name ?? 'Origem'} → {r.destination?.name ?? 'Destino'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {r.stock_transfer_items?.length ?? 0} item(ns) · {new Date(r.created_at).toLocaleDateString('pt-BR')}
                </p>
                <div className="space-y-0.5 pt-0.5">
                  {(r.stock_transfer_items ?? []).map((i) => (
                    <p key={i.id} className="text-[11px] text-foreground/80">
                      • {i.products?.name ?? 'Produto'} <span className="text-muted-foreground">({i.products?.code ?? ''})</span>
                      {' — '}<strong>{Number(i.requested_qty || 0)} un</strong>
                      {Number(i.shipped_qty || 0) > 0 ? ` · expedido ${Number(i.shipped_qty)}` : ''}
                    </p>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{r.current_status}</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] font-black px-3 gap-1"
                  onClick={() => imprimirRomaneio(r)}
                >
                  <Printer className="h-3 w-3" /> ROMANEIO
                </Button>
                {actions.map((to) => (
                  <Button
                    key={to}
                    size="sm"
                    variant={to === 'REJEITADA' || to === 'CANCELADA' ? 'destructive' : 'default'}
                    className="h-7 text-[10px] font-black px-3"
                    disabled={acting === r.id}
                    onClick={() => act(r, to)}
                  >
                    {(ACTION_LABELS[to] ?? to).toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
