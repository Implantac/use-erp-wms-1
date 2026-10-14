import type { SequenceResult } from './types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { ScrollArea } from '@/ui/base/scroll-area';
import { Card, CardContent } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { ListOrdered, Shield } from 'lucide-react';

interface SequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: SequenceResult | null;
  applying: boolean;
  onApply: () => void;
}

export function SequenceDialog({ open, onOpenChange, result, applying, onApply }: SequenceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-primary" /> Sequência Otimizada — Sugestão
          </DialogTitle>
          <DialogDescription>
            Sugestão heurística de agrupamento; não mede tempo ou economia de setup.
          </DialogDescription>
        </DialogHeader>
        {result && (
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="py-3 px-4 text-center">
                    <p className="text-2xl font-bold text-primary">{result.totalOrders}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">OPs Sequenciadas</p>
                  </CardContent>
                </Card>
                <Card className="border-emerald-500/30 bg-emerald-500/5">
                  <CardContent className="py-3 px-4 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{result.totalGroups}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Grupos Similares</p>
                  </CardContent>
                </Card>
                <Card className="border-warning/30 bg-warning/5">
                  <CardContent className="py-3 px-4 text-center">
                    <p className="text-2xl font-bold text-warning">{result.setupChanges ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mudanças de grupo</p>
                  </CardContent>
                </Card>
              </div>

              <p className="text-sm font-medium">{result.summary}</p>

              <div className="space-y-1.5">
                {result.sequence?.map((s) => (
                  <div key={s.id} className={cn(
                    'p-2.5 rounded-lg text-xs flex items-center gap-3',
                    s.setup_change ? 'bg-warning/10 border border-warning/20' : 'bg-muted/50'
                  )}>
                    <span className="font-mono font-bold text-primary w-8 text-center">{s.sequence}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{s.order_number}</span>
                        <span className="text-muted-foreground truncate">{s.product_name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        {s.color && <span>Cor: {s.color}</span>}
                        {s.model_variant && <span>Modelo: {s.model_variant}</span>}
                        {s.sector && <span>Setor: {s.sector}</span>}
                        {s.due_date && <span>Prazo: {format(parseISO(s.due_date), 'dd/MM')}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[9px] font-mono">{s.priority}</Badge>
                      <Badge variant="outline" className="text-[9px] font-mono">
                        <Shield className="h-2.5 w-2.5 mr-0.5" />{s.sequence_score}
                      </Badge>
                    </div>
                    {s.setup_change && (
                      <Badge className="text-[9px] bg-warning/20 text-warning shrink-0">🔧 Setup</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={onApply} disabled={applying || !result?.snapshot || !result?.sequence?.length}>
            <ListOrdered className="h-4 w-4 mr-1" />
            {applying ? 'Aplicando...' : 'Aplicar Sequência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
