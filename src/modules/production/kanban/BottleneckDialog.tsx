import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { ScrollArea } from '@/ui/base/scroll-area';
import { Card, CardContent } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { cn } from '@/lib/utils';
import { Activity, AlertTriangle, Clock, Factory, PackageX } from 'lucide-react';

export interface BottleneckWorkCenter {
  name: string;
  entries: number;
  avgMinutes: number;
  rejectRate: number;
}

export interface BottleneckStep {
  name: string;
  entries: number;
  avgOverrunMin: number;
}

export interface BottleneckQueue {
  name: string;
  queueSize: number;
}

export interface BottleneckAnalysis {
  summary: string;
  totalEntriesAnalyzed: number;
  totalStepsAnalyzed: number;
  totalOrdersActive: number;
  workCenterBottlenecks?: BottleneckWorkCenter[];
  stepBottlenecks?: BottleneckStep[];
  queueBottlenecks?: BottleneckQueue[];
}

interface BottleneckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: BottleneckAnalysis | null;
}

export function BottleneckDialog({ open, onOpenChange, data }: BottleneckDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-destructive" /> Gargalos da Produção
          </DialogTitle>
          <DialogDescription>
            Análise automática baseada em tempo real, etapas e filas de produção.
          </DialogDescription>
        </DialogHeader>
        {data && (
          <ScrollArea className="max-h-[55vh] pr-4">
            <div className="space-y-4">
              <p className="text-sm font-medium">{data.summary}</p>

              <div className="grid grid-cols-3 gap-3 text-center">
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="py-3 px-2">
                    <p className="text-2xl font-bold text-primary">{data.totalEntriesAnalyzed}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Apontamentos</p>
                  </CardContent>
                </Card>
                <Card className="border-warning/30 bg-warning/5">
                  <CardContent className="py-3 px-2">
                    <p className="text-2xl font-bold text-warning-text">{data.totalStepsAnalyzed}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Etapas</p>
                  </CardContent>
                </Card>
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="py-3 px-2">
                    <p className="text-2xl font-bold text-destructive">{data.totalOrdersActive}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">OPs Ativas</p>
                  </CardContent>
                </Card>
              </div>

              {(data.workCenterBottlenecks?.length ?? 0) > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <Factory className="h-4 w-4 text-destructive" /> Centros com Maior Tempo Médio
                  </h4>
                  <div className="space-y-1.5">
                    {data.workCenterBottlenecks?.map((b, i) => (
                      <div key={i} className={cn(
                        'p-2.5 rounded-lg text-xs flex items-center justify-between',
                        i === 0 ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted/50'
                      )}>
                        <div>
                          <span className="font-medium">{b.name}</span>
                          <span className="text-muted-foreground ml-2">({b.entries} registros)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={i === 0 ? 'destructive' : 'outline'} className="text-[10px]">
                            <Clock className="h-2.5 w-2.5 mr-0.5" /> {b.avgMinutes}min
                          </Badge>
                          {b.rejectRate > 0 && (
                            <Badge className="text-[10px] bg-warning/20 text-warning-text">
                              {b.rejectRate}% refugo
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(data.stepBottlenecks?.length ?? 0) > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-warning-text" /> Etapas que Excedem Estimativa
                  </h4>
                  <div className="space-y-1.5">
                    {data.stepBottlenecks?.map((s, i) => (
                      <div key={i} className={cn(
                        'p-2.5 rounded-lg text-xs flex items-center justify-between',
                        i === 0 ? 'bg-warning/10 border border-warning/20' : 'bg-muted/50'
                      )}>
                        <div>
                          <span className="font-medium">{s.name}</span>
                          <span className="text-muted-foreground ml-2">({s.entries} vezes)</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          +{s.avgOverrunMin}min excedido
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(data.queueBottlenecks?.length ?? 0) > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <PackageX className="h-4 w-4 text-primary" /> Filas por Setor/Status
                  </h4>
                  <div className="space-y-1.5">
                    {data.queueBottlenecks?.map((q, i) => (
                      <div key={i} className="p-2.5 rounded-lg text-xs flex items-center justify-between bg-muted/50">
                        <span className="font-medium">{q.name}</span>
                        <Badge variant="outline" className="text-[10px]">{q.queueSize} OPs</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
