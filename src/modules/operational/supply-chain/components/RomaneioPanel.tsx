import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { FileText, Package, Printer, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { supplyChainService } from '@/services/operational/supply-chain/supplyChainService';
import { cn } from '@/lib/utils';

const fmt = (n: any) => Number(n || 0).toLocaleString('pt-BR');

// Estados em que a transferência já foi decidida/preparada e pode entrar
// numa carga. Expedida = já baixou da origem, só falta o embarque.
const READY_STATUSES = ['SUGERIDA', 'APROVADA', 'RESERVADA', 'SEPARAÇÃO', 'CONFERÊNCIA', 'EXPEDIDA'];

const ROMANEIO_STATUS: Record<string, { label: string; color: string }> = {
  EMITIDO: { label: 'Em trânsito — aguardando a Loja', color: 'bg-purple-500/10 text-purple-600' },
  RECEBIDO: { label: 'Recebido pela Loja', color: 'bg-emerald-500/10 text-emerald-600' },
  'RECEBIDO COM DIVERGÊNCIA': { label: 'Recebido com divergência', color: 'bg-red-500/10 text-red-600' },
  CANCELADO: { label: 'Cancelado', color: 'bg-slate-500/10 text-slate-500' },
};

interface ReadyGroup {
  key: string;
  originName: string;
  destinationName: string;
  destinationCompany?: string;
  transfers: any[];
  totalItems: number;
}

interface RomaneioPanelProps {
  movements: any[];
  canManage: boolean;
  onChanged?: () => void;
}

/**
 * Passo "expedir" do gestor: em vez de avançar transferência por
 * transferência, agrupa o que está pronto por destino e gera o ROMANEIO —
 * o documento da carga que a Loja recepciona (estoque entra sozinho).
 */
export function RomaneioPanel({ movements, canManage, onChanged }: RomaneioPanelProps) {
  const queryClient = useQueryClient();
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);

  const readyGroups = useMemo<ReadyGroup[]>(() => {
    const groups = new Map<string, ReadyGroup>();
    for (const m of movements || []) {
      if ((m as any).kind === 'intercompany') continue;
      if (!READY_STATUSES.includes((m as any).raw_status)) continue;
      if ((m as any).romaneio_id) continue;
      const key = `${m.origin_id}->${m.destination_id}`;
      const g = groups.get(key) || {
        key,
        originName: m.origin_name || m.origin_type || 'Origem',
        destinationName: m.destination_name || m.destination_type || 'Destino',
        destinationCompany: m.destination_company,
        transfers: [],
        totalItems: 0,
      };
      g.transfers.push(m);
      g.totalItems += Number(m.items_count || 0);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.destinationName.localeCompare(b.destinationName));
  }, [movements]);

  const romaneiosQuery = useQuery({
    queryKey: ['romaneios'],
    queryFn: () => supplyChainService.listRomaneios(),
  });
  const romaneios = romaneiosQuery.data || [];

  const docQuery = useQuery({
    queryKey: ['romaneio-detail', docId],
    queryFn: () => supplyChainService.getRomaneioDetail(docId as string),
    enabled: !!docId,
  });

  const handleCreate = async (group: ReadyGroup) => {
    setCreatingKey(group.key);
    try {
      const res = await supplyChainService.createRomaneio(group.transfers.map((t) => t.id));
      toast.success(`Romaneio ${res.numero} gerado e expedido — ${res.transfers} transferência(s) em trânsito.`);
      await queryClient.invalidateQueries({ queryKey: ['romaneios'] });
      onChanged?.();
      setDocId(res.id);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao gerar o romaneio');
    } finally {
      setCreatingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" /> Pronto para expedir — agrupado por Loja
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Um romaneio por carga: ao gerar, o sistema aprova/separa/expede as transferências pela máquina oficial,
            baixa o estoque da origem e emite o documento que a Loja vai recepcionar.
          </p>
        </CardHeader>
        <CardContent>
          {readyGroups.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nada aguardando expedição. As solicitações aprovadas aparecem aqui agrupadas por destino.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {readyGroups.map((g) => (
                <div key={g.key} className="rounded-xl border p-4 flex flex-col gap-3 bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Destino</p>
                      <p className="font-black uppercase">{g.destinationName}</p>
                      {g.destinationCompany && (
                        <p className="text-[11px] text-muted-foreground">{g.destinationCompany}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Origem: {g.originName} · {g.transfers.length} transferência(s) · {g.totalItems} item(ns)
                      </p>
                    </div>
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                  {canManage ? (
                    <Button
                      className="font-bold uppercase text-xs"
                      disabled={creatingKey === g.key}
                      onClick={() => void handleCreate(g)}
                    >
                      {creatingKey === g.key ? 'Gerando…' : 'Gerar romaneio e expedir'}
                    </Button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Expedição é do gestor do grupo.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Romaneios
          </CardTitle>
        </CardHeader>
        <CardContent>
          {romaneiosQuery.isLoading ? (
            <p className="py-3 text-sm text-muted-foreground">Carregando romaneios…</p>
          ) : romaneios.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">Nenhum romaneio emitido ainda.</p>
          ) : (
            <div className="divide-y">
              {romaneios.map((r: any) => {
                const st = ROMANEIO_STATUS[r.status] || ROMANEIO_STATUS.EMITIDO;
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-sm">{r.numero}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.origin_name || 'Origem'} → {r.destination_name || 'Destino'} ·{' '}
                        {r.transfers_count} transferência(s) · {fmt(r.total_qty)} un ·{' '}
                        {new Date(r.created_at).toLocaleString('pt-BR')}
                        {r.received_at ? ` · recebido em ${new Date(r.received_at).toLocaleString('pt-BR')}` : ''}
                      </p>
                    </div>
                    <Badge className={cn('text-[9px] font-black uppercase', st.color)}>{st.label}</Badge>
                    <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setDocId(r.id)}>
                      <FileText className="h-3.5 w-3.5" /> Documento
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!docId} onOpenChange={(open) => { if (!open) setDocId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {docQuery.data ? `Romaneio ${docQuery.data.numero}` : 'Romaneio'}
            </DialogTitle>
          </DialogHeader>
          {docQuery.isLoading || !docQuery.data ? (
            <p className="py-6 text-sm text-muted-foreground">Carregando documento…</p>
          ) : (
            <RomaneioDocument doc={docQuery.data} />
          )}
          {docQuery.data && (
            <div className="flex justify-end pt-2">
              <Button className="gap-2" onClick={() => printRomaneio(docQuery.data)}>
                <Printer className="h-4 w-4" /> Imprimir romaneio
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RomaneioDocument({ doc }: { doc: any }) {
  const st = ROMANEIO_STATUS[doc.status] || ROMANEIO_STATUS.EMITIDO;
  const totalUn = (doc.transfers || []).reduce(
    (acc: number, t: any) =>
      acc + (t.items || []).reduce((a: number, i: any) => a + Number(i.shipped_qty || i.requested_qty || 0), 0),
    0,
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Emitido em {new Date(doc.created_at).toLocaleString('pt-BR')}
          {doc.received_at ? ` · Recebido em ${new Date(doc.received_at).toLocaleString('pt-BR')}` : ''}
        </p>
        <Badge className={cn('text-[9px] font-black uppercase', st.color)}>{st.label}</Badge>
      </div>

      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex-1 min-w-[200px] rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-primary">Origem (expedição)</p>
          <p className="mt-1 text-sm font-black uppercase">{doc.origin_name || '—'}</p>
        </div>
        <div className="flex-1 min-w-[200px] rounded-lg border bg-muted/30 p-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Destino (recebimento)</p>
          <p className="mt-1 text-sm font-black uppercase">{doc.destination_name || '—'}</p>
        </div>
      </div>

      {(doc.transfers || []).map((t: any) => (
        <div key={t.id} className="rounded-lg border">
          <p className="border-b bg-muted/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest">
            Transferência #{String(t.id).split('-')[0].toUpperCase()} · {t.current_status}
          </p>
          <div className="divide-y">
            {(t.items || []).map((i: any) => (
              <div key={i.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{i.product_name || i.product_id}</p>
                  <p className="text-[10px] text-muted-foreground">{i.product_code || ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase text-muted-foreground">Expedida</p>
                  <p className="text-xs font-black">{fmt(i.shipped_qty || i.requested_qty)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase text-muted-foreground">Recebida</p>
                  <p className="text-xs font-black">{fmt(i.received_qty)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-sm">
        <strong>Total da carga:</strong> {fmt(totalUn)} un em {(doc.transfers || []).length} transferência(s)
      </p>

      <div className="grid grid-cols-2 gap-6 pt-4 text-xs text-muted-foreground">
        <div className="border-t pt-2">Expedido por (assinatura)</div>
        <div className="border-t pt-2">Recebido por (assinatura e data)</div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        A Loja recepciona este documento na Central da Loja: a conferência alimenta o estoque automaticamente
        e este romaneio é marcado como recebido.
      </p>
    </div>
  );
}

function printRomaneio(doc: any) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) {
    toast.error('Permita pop-ups para imprimir o romaneio.');
    return;
  }
  const esc = (s: any) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const totalUn = (doc.transfers || []).reduce(
    (acc: number, t: any) =>
      acc + (t.items || []).reduce((a: number, i: any) => a + Number(i.shipped_qty || i.requested_qty || 0), 0),
    0,
  );
  const transferHtml = (doc.transfers || [])
    .map(
      (t: any) => `
        <h3>Transferência #${esc(String(t.id).split('-')[0].toUpperCase())} · ${esc(t.current_status)}</h3>
        <table>
          <thead><tr><th>Produto</th><th>Código</th><th>Expedida</th><th>Recebida</th></tr></thead>
          <tbody>
            ${(t.items || [])
              .map(
                (i: any) => `<tr><td>${esc(i.product_name || i.product_id)}</td><td>${esc(i.product_code || '')}</td><td class="n">${fmt(i.shipped_qty || i.requested_qty)}</td><td class="n">${fmt(i.received_qty)}</td></tr>`,
              )
              .join('')}
          </tbody>
        </table>`,
    )
    .join('');
  w.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Romaneio ${esc(doc.numero)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; text-transform: uppercase; }
  h3 { font-size: 12px; margin: 18px 0 6px; text-transform: uppercase; }
  p { font-size: 12px; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #999; padding: 5px 7px; text-align: left; }
  td.n, th.n { text-align: right; }
  .cols { display: flex; gap: 24px; margin: 12px 0; }
  .box { flex: 1; border: 1px solid #999; padding: 8px 10px; }
  .sign { display: flex; gap: 32px; margin-top: 48px; font-size: 12px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 6px; }
</style></head><body>
  <h1>Romaneio ${esc(doc.numero)}</h1>
  <p>Status: ${esc(doc.status)} · Emitido em ${esc(new Date(doc.created_at).toLocaleString('pt-BR'))}</p>
  <div class="cols">
    <div class="box"><strong>Origem (expedição)</strong><br>${esc(doc.origin_name || '—')}</div>
    <div class="box"><strong>Destino (recebimento)</strong><br>${esc(doc.destination_name || '—')}</div>
  </div>
  ${transferHtml}
  <p><strong>Total da carga:</strong> ${fmt(totalUn)} un em ${(doc.transfers || []).length} transferência(s)</p>
  <div class="sign"><div>Expedido por (assinatura)</div><div>Recebido por (assinatura e data)</div></div>
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
