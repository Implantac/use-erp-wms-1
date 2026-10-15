import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { ScrollArea } from '@/ui/base/scroll-area';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { AlertTriangle, ArrowRight, Swords, Zap } from 'lucide-react';
import type { WarModeResult } from '@/lib/pcp/warmode';

interface WarModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: WarModeResult | null;
  loading: boolean;
  onConfirm: () => void;
}

export function WarModeDialog({ open, onOpenChange, result, loading, onConfirm }: WarModeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Swords className="h-5 w-5" /> Modo Guerra — Resultado da Análise
          </DialogTitle>
          <DialogDescription>
            Prévia sem gravação. A confirmação altera prioridades; movimentações no Kanban são apenas sugestões. A aplicação requer a função transacional no banco; falhas devem reverter todas as OPs.
          </DialogDescription>
        </DialogHeader>
        {result && (
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-4">
              <p className="text-sm font-medium">{result.summary}</p>

              {result.criticalAlerts?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-4 w-4" /> Alertas Críticos
                  </h4>
                  <div className="space-y-1">
                    {result.criticalAlerts.map((alert: string, i: number) => (
                      <p key={i} className="text-xs text-destructive bg-destructive/10 p-2 rounded">🔴 {alert}</p>
                    ))}
                  </div>
                </div>
              )}

              {result.priorityChanges?.length > 0 ? (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <Zap className="h-4 w-4 text-warning" /> Repriorização ({result.priorityChanges.length})
                  </h4>
                  <div className="space-y-1.5">
                    {result.priorityChanges.map((c, i) => (
                      <div key={i} className="p-2 rounded-lg bg-muted text-xs flex items-center justify-between">
                        <div>
                          <span className="font-mono font-medium">{c.opNumber}</span>
                          <span className="text-muted-foreground ml-2">Score: {c.score}</span>
                          {c.factors?.length > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{c.factors.join(' · ')}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">{c.oldPriority}</Badge>
                          <ArrowRight className="h-3 w-3" />
                          <Badge variant={c.newPriority === 'urgent' ? 'destructive' : 'default'} className="text-[10px]">{c.newPriority}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">✅ Todas as prioridades já estão corretas.</p>
              )}

              {result.kanbanReorg?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <ArrowRight className="h-4 w-4 text-primary" /> Movimentações Sugeridas ({result.kanbanReorg.length})
                  </h4>
                  <div className="space-y-1.5">
                    {result.kanbanReorg.map((r, i) => (
                      <div key={i} className="p-2 rounded-lg bg-primary/5 text-xs flex items-center justify-between">
                        <div>
                          <span className="font-mono font-medium">{r.opNumber}</span>
                          <span className="text-muted-foreground ml-2">→ {r.suggestedStatus}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{r.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading || !result?.snapshot || !result?.priorityChanges?.length}>
            <Swords className="h-4 w-4 mr-1" />
            {loading ? 'Aplicando...' : 'Confirmar e Aplicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
