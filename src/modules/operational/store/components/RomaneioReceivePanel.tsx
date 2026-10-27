import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { CheckCircle2, FileText, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supplyChainService } from '@/services/operational/supply-chain/supplyChainService';
import { cn } from '@/lib/utils';

const fmt = (n: any) => Number(n || 0).toLocaleString('pt-BR');

interface RomaneioReceivePanelProps {
  branchId?: string;
  onReceived?: () => void;
}

/**
 * A Loja recepciona O ROMANEIO (o documento da carga), não transferência
 * por transferência: confere as quantidades, confirma uma única vez e o
 * estoque da unidade é alimentado pelo fluxo oficial; o documento passa
 * a constar como recebido (com divergência, se faltar item).
 */
export function RomaneioReceivePanel({ branchId, onReceived }: RomaneioReceivePanelProps) {
  const queryClient = useQueryClient();
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const initializedFor = useRef<string | null>(null);

  const romaneiosQuery = useQuery({
    queryKey: ['romaneios'],
    queryFn: () => supplyChainService.listRomaneios(),
    enabled: !!branchId,
  });
  const mine = (romaneiosQuery.data || []).filter((r: any) => r.destination_unit_id === branchId);
  const pending = mine.filter((r: any) => r.status === 'EMITIDO');
  const received = mine.filter((r: any) => r.status !== 'EMITIDO').slice(0, 5);

  const detailQuery = useQuery({
    queryKey: ['romaneio-detail', receivingId],
    queryFn: () => supplyChainService.getRomaneioDetail(receivingId as string),
    enabled: !!receivingId,
  });
  const doc = detailQuery.data;

  useEffect(() => {
    if (doc && initializedFor.current !== doc.id) {
      initializedFor.current = doc.id;
      const initial: Record<string, string> = {};
      for (const t of doc.transfers || []) {
        for (const item of t.items || []) {
          initial[item.id] = String(item.shipped_qty ?? item.requested_qty ?? 0);
        }
      }
      setQty(initial);
    }
  }, [doc]);

  const handleReceive = async () => {
    if (!doc) return;
    const items: { item_id: string; quantity: number }[] = [];
    for (const t of doc.transfers || []) {
      for (const item of t.items || []) {
        items.push({ item_id: item.id, quantity: Number(qty[item.id] ?? item.shipped_qty ?? item.requested_qty ?? 0) });
      }
    }
    setSaving(true);
    try {
      const res = await supplyChainService.receiveRomaneio(doc.id, items);
      toast.success(
        res.status === 'RECEBIDO'
          ? `Romaneio ${res.numero} recebido — estoque da Loja atualizado.`
          : `Romaneio ${res.numero} recebido COM DIVERGÊNCIA — estoque atualizado só com o que chegou.`,
      );
      setReceivingId(null);
      initializedFor.current = null;
      await queryClient.invalidateQueries({ queryKey: ['romaneios'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-in-transit'] });
      await queryClient.invalidateQueries({ queryKey: ['supply-chain-tasks'] });
      onReceived?.();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao recepcionar o romaneio');
    } finally {
      setSaving(false);
    }
  };

  if (!branchId) return null;

  return (
    <>
      <Card className="hover:border-primary/40 transition-colors">
        <CardHeader>
          <CardTitle className="text-md flex items-center gap-2">
            <PackageCheck className="h-4 w-4" /> Romaneios a Receber
          </CardTitle>
          <CardDescription>
            A carga chega com um documento (romaneio). Recepcione o documento: confira os itens,
            confirme uma vez e o estoque da Loja é alimentado automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {romaneiosQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando romaneios…</p>
          ) : pending.length === 0 && received.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum romaneio para esta unidade no momento.</p>
          ) : (
            <>
              {pending.map((r: any) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-accent/30 p-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{r.numero} — de {r.origin_name || 'origem'}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.transfers_count} transferência(s) · {fmt(r.total_qty)} un · emitido em{' '}
                      {new Date(r.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <Badge className="bg-purple-500/10 text-purple-600 text-[9px] font-black uppercase">
                    Em trânsito
                  </Badge>
                  <Button size="sm" onClick={() => setReceivingId(r.id)}>
                    Recepcionar romaneio
                  </Button>
                </div>
              ))}
              {received.map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border p-3 opacity-80">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{r.numero}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Recebido em {r.received_at ? new Date(r.received_at).toLocaleString('pt-BR') : '—'}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      'text-[9px] font-black uppercase',
                      r.status === 'RECEBIDO'
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-red-500/10 text-red-600',
                    )}
                  >
                    {r.status === 'RECEBIDO' ? 'Recebido' : 'Recebido c/ divergência'}
                  </Badge>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!receivingId}
        onOpenChange={(open) => {
          if (!open) {
            setReceivingId(null);
            initializedFor.current = null;
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recepcionar {doc ? `romaneio ${doc.numero}` : 'romaneio'} — conferência</DialogTitle>
          </DialogHeader>
          {!doc ? (
            <p className="text-sm text-muted-foreground">Carregando itens da carga…</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Confira item a item. Se chegar menos que o expedido, o sistema registra{' '}
                <strong>divergência</strong> automaticamente e o saldo da Loja sobe só o recebido.
              </p>
              {(doc.transfers || []).map((t: any) => (
                <div key={t.id} className="rounded-lg border">
                  <p className="border-b bg-muted/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest">
                    Transferência #{String(t.id).split('-')[0].toUpperCase()}
                  </p>
                  <div className="divide-y">
                    {(t.items || []).map((item: any) => {
                      const shipped = Number(item.shipped_qty || item.requested_qty || 0);
                      const receivedQty = Number(qty[item.id] ?? shipped);
                      const missing = shipped - receivedQty;
                      return (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold">{item.product_name || item.product_id}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {item.product_code || ''} · expedido: {fmt(shipped)}
                              {missing > 0 && (
                                <span className="text-destructive font-bold"> · faltam {fmt(missing)}</span>
                              )}
                            </p>
                          </div>
                          <div className="w-24">
                            <Label className="text-[10px]">Recebido</Label>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={qty[item.id] ?? String(shipped)}
                              onChange={(e) => setQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReceivingId(null)}>
                  Cancelar
                </Button>
                <Button onClick={() => void handleReceive()} disabled={saving}>
                  {saving ? 'Recebendo…' : 'Confirmar recebimento do romaneio'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
