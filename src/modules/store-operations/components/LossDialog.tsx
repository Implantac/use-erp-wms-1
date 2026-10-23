import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { toastError, toastSuccess } from '@/lib/toastHelpers';
import { Button } from "@/ui/base/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/ui/base/dialog";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/ui/base/select";
import { AlertTriangle } from 'lucide-react';

const REASONS = ['AVARIA', 'QUEBRA', 'VALIDADE', 'FURTO', 'PRODUTO_ERRADO'] as const;

/**
 * Perda/ocorrência da loja (fluxo real): vira documento de estoque pela RPC
 * register_stock_loss — baixa no ledger com motivo, nunca ajuste solto.
 */
export function LossDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { currentBranch } = useEnterprise();
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<string>('AVARIA');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: stock = [] } = useQuery({
    queryKey: ['store-loss-stock', currentBranch?.id],
    enabled: isOpen && !!currentBranch?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('stock_balances')
        .select('product_id, product_code, product_name, quantity')
        .eq('branch_id', currentBranch!.id)
        .gt('quantity', 0)
        .order('product_name')
        .limit(500);
      if (error) throw error;
      return (data ?? []) as { product_id: string; product_code: string; product_name: string; quantity: number }[];
    },
  });

  const submit = async () => {
    try {
      setBusy(true);
      const { error } = await (supabase as any).rpc('register_stock_loss', {
        p_product_id: productId,
        p_branch_id: currentBranch!.id,
        p_quantity: Number(quantity),
        p_reason: reason,
        p_notes: notes || null,
      });
      if (error) throw new Error(error.message);
      toastSuccess('Perda registrada', 'A baixa foi lançada no ledger de estoque com o motivo.');
      queryClient.invalidateQueries({ queryKey: ['store-kpis'] });
      onClose();
    } catch (e) {
      toastError(e, 'Não foi possível registrar a perda.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="uppercase text-sm font-black flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Registrar perda / ocorrência
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[10px] font-black uppercase">Produto (estoque desta unidade)</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {stock.map((s) => (
                  <SelectItem key={s.product_id} value={s.product_id}>
                    {s.product_code} — {s.product_name} ({s.quantity} em estoque)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase">Quantidade</Label>
              <Input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase">Motivo</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-black uppercase">Observações</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhes da ocorrência" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !productId || !(Number(quantity) > 0)}>
            Registrar perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
