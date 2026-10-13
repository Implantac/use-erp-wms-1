import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { Button } from '@/ui/base/button';

interface Props {
  order: any;
  onClose: () => void;
}

export function GenerateOPDialog({ order, onClose }: Props) {
  if (!order) return null;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Gerar OPs do Pedido {order.number}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Cliente: <strong>{order.client_name}</strong></p>
          <p className="text-sm text-muted-foreground">Itens: <strong>{order.items?.length || 0}</strong></p>
          <p role="alert" className="text-sm text-warning">Geração indisponível: requer transação única, validação das versões técnicas e prevenção de duplicidade por item.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled title="Geração atômica ainda não homologada">Geração bloqueada</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
