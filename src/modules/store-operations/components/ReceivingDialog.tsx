import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { transferWorkflow } from '@/services/operational/inventory/transferWorkflow';
import { toastError, toastSuccess } from '@/lib/toastHelpers';
import { Button } from "@/ui/base/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/ui/base/dialog";
import { Input } from "@/ui/base/input";
import { Badge } from "@/ui/base/badge";
import { PackageCheck } from 'lucide-react';

interface IncomingItem {
  id: string;
  product_id: string;
  requested_qty: number;
  shipped_qty: number;
  products?: { name: string; code: string } | null;
}
interface IncomingTransfer {
  id: string;
  current_status: string;
  created_at: string;
  stock_transfer_items: IncomingItem[];
}

/**
 * Conferência de recebimento da loja (fluxo real): lista o que está EM
 * TRÂNSITO para esta unidade e confirma quantidades — a RPC move o estoque
 * pelo ledger e classifica divergência (falta) automaticamente.
 */
export function ReceivingDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { currentBranch } = useEnterprise();
  const queryClient = useQueryClient();
  const [receivedById, setReceivedById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const { data: incoming = [], isLoading } = useQuery({
    queryKey: ['store-incoming', currentBranch?.id],
    enabled: isOpen && !!currentBranch?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('stock_transfer_orders')
        .select('id, current_status, created_at, stock_transfer_items(id, product_id, requested_qty, shipped_qty, products(name, code))')
        .eq('destination_unit_id', currentBranch!.id)
        .eq('current_status', 'EM TRÂNSITO')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as IncomingTransfer[];
    },
  });

  const confirm = async (t: IncomingTransfer) => {
    try {
      setBusy(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado.');
      await transferWorkflow.transition({
        transferId: t.id,
        toStatus: 'RECEBIDA',
        userId: userData.user.id,
        itemQuantities: t.stock_transfer_items.map((i) => ({
          itemId: i.id,
          quantity: Number(receivedById[i.id] ?? i.shipped_qty ?? i.requested_qty),
        })),
      });
      toastSuccess('Recebimento confirmado', 'Estoque atualizado pelo ledger; divergências foram classificadas.');
      queryClient.invalidateQueries({ queryKey: ['store-incoming'] });
      queryClient.invalidateQueries({ queryKey: ['store-kpis'] });
      onClose();
    } catch (e) {
      toastError(e, 'Não foi possível confirmar o recebimento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="uppercase text-sm font-black flex items-center gap-2">
            <PackageCheck className="h-4 w-4" /> Conferir recebimento
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Buscando entregas em trânsito…</p>
        ) : incoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada em trânsito para esta unidade no momento.</p>
        ) : (
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {incoming.map((t) => (
              <div key={t.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black font-mono">{t.id.slice(0, 8)}</span>
                  <Badge variant="outline" className="uppercase text-[9px]">{t.current_status}</Badge>
                </div>
                {t.stock_transfer_items.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm">
                      {i.products?.code} — {i.products?.name}
                      <span className="text-muted-foreground"> (expedido: {i.shipped_qty || i.requested_qty})</span>
                    </span>
                    <Input
                      type="number" min="0" step="any" className="w-[110px]"
                      value={receivedById[i.id] ?? String(i.shipped_qty || i.requested_qty)}
                      onChange={(e) => setReceivedById((s) => ({ ...s, [i.id]: e.target.value }))}
                    />
                  </div>
                ))}
                {(() => {
                  const faltas = t.stock_transfer_items.reduce((acc, i) => {
                    const enviada = Number(i.shipped_qty || i.requested_qty || 0);
                    const recebida = Number(receivedById[i.id] ?? enviada);
                    return acc + Math.max(enviada - recebida, 0);
                  }, 0);
                  return (
                    <p className={`text-[11px] ${faltas > 0 ? 'text-amber-600 font-bold' : 'text-emerald-600'}`}>
                      {faltas > 0
                        ? `Faltam ${faltas} un — será registrado como DIVERGÊNCIA (recebimento parcial).`
                        : 'Recebimento integral: quantidades conferem com o expedido.'}
                    </p>
                  );
                })()}
                <div className="flex justify-end">
                  <Button size="sm" className="font-black text-[11px]" disabled={busy} onClick={() => confirm(t)}>
                    CONFIRMAR RECEBIMENTO
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
