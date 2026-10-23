import { useState } from 'react';
import { Button } from "@/ui/base/button";
import { Truck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/ui/base/dialog";
import { Input } from "@/ui/base/input";
import { Badge } from "@/ui/base/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/ui/base/select";
import { useStoreReplenishment } from '@/hooks/operational/store/useStoreReplenishment';

/**
 * Solicitação de mercadoria da loja (fluxo real): as recomendações vêm do
 * motor de reposição (cobertura x política da unidade); ao confirmar, a RPC
 * atômica cria a solicitação SUGERIDA para o gestor da rede decidir.
 */
export function RequestDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { recommendations, isLoading, createRequest, isSubmitting } = useStoreReplenishment();
  const [qtyById, setQtyById] = useState<Record<string, string>>({});

  const submit = async (rec: (typeof recommendations)[number]) => {
    const qty = Number(qtyById[rec.productId] ?? rec.suggestedQty);
    if (!(qty > 0)) return;
    await createRequest({ recommendation: rec, quantity: qty });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="uppercase text-sm font-black flex items-center gap-2">
            <Truck className="h-4 w-4" /> Nova solicitação de mercadoria
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Calculando necessidades da loja…</p>
        ) : recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma necessidade de reposição agora: a cobertura da loja está dentro da
            política (estoque mínimo/cobertura-alvo) para todos os produtos acompanhados.
          </p>
        ) : (
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {recommendations.map((rec) => (
              <div key={rec.productId} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{rec.productCode} — {rec.productName}</p>
                    <p className="text-[11px] text-muted-foreground">{rec.reason}</p>
                  </div>
                  <Badge variant={rec.urgency === 'critical' ? 'destructive' : 'outline'} className="uppercase text-[9px]">
                    {rec.urgency === 'critical' ? 'Ruptura' : rec.urgency}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase text-muted-foreground">Onde há saldo</span>
                    <p className="text-[11px] text-muted-foreground">
                      {rec.sourceOptions.length > 0
                        ? rec.sourceOptions.map((o) => `${o.branchName} (${o.availableQty})`).join(' · ')
                        : 'Sem saldo na rede — análise decide (fábrica/produção)'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase text-muted-foreground">Qtd ({rec.unit})</span>
                    <Input
                      type="number" min="0" step="any" className="w-[110px]"
                      value={qtyById[rec.productId] ?? String(rec.suggestedQty)}
                      onChange={(e) => setQtyById((s) => ({ ...s, [rec.productId]: e.target.value }))}
                    />
                  </div>
                  <Button size="sm" className="font-black text-[11px]" disabled={isSubmitting}
                    onClick={() => submit(rec)}>
                    SOLICITAR
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
