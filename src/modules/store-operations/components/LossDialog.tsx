import { Button } from '@/ui/base/button';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';

export function LossDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Baixa por perda indisponível</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Esta tela não registra perdas. O fluxo anterior gravava ledger e saldo em operações separadas e podia deixar os dados divergentes. Aguarde implementação transacional com autorização e auditoria no servidor.</p>
        <DialogFooter><Button onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
