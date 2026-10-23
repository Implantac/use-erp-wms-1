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
import { ClipboardList } from 'lucide-react';

/**
 * Contagem de inventário da loja (fluxo real): informa o físico e a RPC
 * register_inventory_count lança só a diferença no ledger, devolvendo
 * sistema x contado x delta para conferência na tela.
 */
export function InventoryDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { currentBranch } = useEnterprise();
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState('');
  const [counted, setCounted] = useState('');
  const [result, setResult] = useState<{ system: number; counted: number; delta: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: stock = [] } = useQuery({
    queryKey: ['store-count-stock', currentBranch?.id],
    enabled: isOpen && !!currentBranch?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('stock_balances')
        .select('product_id, product_code, product_name, quantity')
        .eq('branch_id', currentBranch!.id)
        .order('product_name')
        .limit(500);
      if (error) throw error;
      return (data ?? []) as { product_id: string; product_code: string; product_name: string; quantity: number }[];
    },
  });

  const submit = async () => {
    try {
      setBusy(true);
      const { data, error } = await (supabase as any).rpc('register_inventory_count', {
        p_product_id: productId,
        p_branch_id: currentBranch!.id,
        p_counted_quantity: Number(counted),
        p_notes: 'contagem física da loja',
      });
      if (error) throw new Error(error.message);
      const r = data as { system_quantity: number; counted_quantity: number; delta: number };
      setResult({ system: Number(r.system_quantity), counted: Number(r.counted_quantity), delta: Number(r.delta) });
      toastSuccess('Inventário registrado', 'A diferença foi lançada no ledger de estoque.');
      queryClient.invalidateQueries({ queryKey: ['store-kpis'] });
    } catch (e) {
      toastError(e, 'Não foi possível registrar a contagem.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="uppercase text-sm font-black flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Contagem de inventário
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[10px] font-black uppercase">Produto</Label>
            <Select value={productId} onValueChange={(v) => { setProductId(v); setResult(null); }}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {stock.map((s) => (
                  <SelectItem key={s.product_id} value={s.product_id}>
                    {s.product_code} — {s.product_name} (sistema: {s.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-black uppercase">Quantidade contada (físico)</Label>
            <Input type="number" min="0" step="any" value={counted} onChange={(e) => setCounted(e.target.value)} />
          </div>
          {result && (
            <p className="rounded-md bg-muted/40 p-3 text-xs">
              Sistema: <strong>{result.system}</strong> · Contado: <strong>{result.counted}</strong> ·
              Diferença lançada: <strong>{result.delta > 0 ? `+${result.delta}` : result.delta}</strong>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button onClick={submit} disabled={busy || !productId || counted === ''}>
            Registrar contagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
