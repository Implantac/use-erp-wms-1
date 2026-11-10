import { useCallback, useState } from 'react';
import { Card, CardContent } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/ui/base/dropdown-menu';
import { AlertTriangle, ArrowRight, Clock, MoreHorizontal, Pencil, Plus, Target, Trophy, XCircle } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { formatBRL, formatDate } from '@/lib/formatters';
import { EmptyState } from '@/shared/components/EmptyState';
import { PlaybookTips } from '@/components/commercial/PlaybookTips';
import type { DbFunnelItem } from '@/hooks/commercial/useSalesFunnel';
import { KANBAN_STAGES } from './useFunnelMetrics';

export function FunnelKanban({
  grouped, stageMetrics, onNew, onEdit, onAdvance, onWin, onLose, onMove,
}: {
  grouped: Record<string, DbFunnelItem[]>;
  stageMetrics: Array<{ value: string; avgDays: number }>;
  onNew: (stage?: string) => void;
  onEdit: (item: DbFunnelItem) => void;
  onAdvance: (item: DbFunnelItem) => void;
  onWin: (item: DbFunnelItem) => void;
  onLose: (item: DbFunnelItem) => void;
  onMove: (item: DbFunnelItem, targetStage: string) => void;
}) {
  const [draggedItem, setDraggedItem] = useState<DbFunnelItem | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, item: DbFunnelItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (draggedItem && draggedItem.stage !== targetStage) onMove(draggedItem, targetStage);
    setDraggedItem(null);
  }, [draggedItem, onMove]);

  return (
    <div className="grid gap-3 overflow-x-auto" style={{ gridTemplateColumns: `repeat(${KANBAN_STAGES.length}, minmax(220px, 1fr))` }}>
      {KANBAN_STAGES.map(stage => {
        const items = grouped[stage.value] || [];
        const stageValue = items.reduce((s, i) => s + i.value, 0);
        const isOver = dragOverStage === stage.value;
        const metric = stageMetrics.find(m => m.value === stage.value);
        return (
          <div
            key={stage.value}
            className={`flex flex-col min-h-[400px] rounded-lg transition-colors ${isOver ? 'bg-primary/5 ring-2 ring-primary/20' : ''}`}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverStage(stage.value); }}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={e => handleDrop(e, stage.value)}
          >
            <div className="flex items-center justify-between mb-1 px-1">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                <span className="text-xs font-semibold uppercase tracking-wide">{stage.label}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5">{items.length}</Badge>
                <PlaybookTips stage={stage.value} compact />
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onNew(stage.value)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-[10px] text-muted-foreground">{formatBRL(stageValue)}</span>
              {metric && metric.avgDays > 0 && (
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  <Clock className="h-2.5 w-2.5 mr-0.5" />{metric.avgDays}d
                </Badge>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {items.map(item => {
                const daysInStage = differenceInDays(new Date(), new Date(item.updated_at || item.created_at));
                const isStagnant = daysInStage > 14;
                return (
                  <Card
                    key={item.id}
                    draggable
                    onDragStart={e => handleDragStart(e, item)}
                    className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${draggedItem?.id === item.id ? 'opacity-40' : ''} ${isStagnant ? 'border-warning/50' : ''}`}
                  >
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-medium line-clamp-2 flex-1">{item.title}</p>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"><MoreHorizontal className="h-3 w-3" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(item)}><Pencil className="h-3.5 w-3.5 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onAdvance(item)}><ArrowRight className="h-3.5 w-3.5 mr-2" />Avançar Etapa</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onWin(item)} className="text-emerald-600"><Trophy className="h-3.5 w-3.5 mr-2" />Marcar como Ganha</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onLose(item)} className="text-destructive"><XCircle className="h-3.5 w-3.5 mr-2" />Marcar como Perdida</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="text-xs text-primary font-semibold">{formatBRL(item.value)}</p>
                      {item.contact_name && <p className="text-[11px] text-muted-foreground">{item.contact_name}</p>}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">{item.probability}%</Badge>
                          {isStagnant && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 text-warning-text">
                              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{daysInStage}d
                            </Badge>
                          )}
                        </div>
                        {item.expected_close_date && (
                          <span className="text-[10px] text-muted-foreground">{formatDate(item.expected_close_date)}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {items.length === 0 && (
                <EmptyState compact icon={Target} title="Nenhuma oportunidade" className="min-h-[96px]" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
