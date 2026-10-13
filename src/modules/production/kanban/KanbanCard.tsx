import { Card, CardContent } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Progress } from '@/ui/base/progress';
import { Button } from '@/ui/base/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/base/tooltip';
import { priorityConfig } from '@/config/production';
import type { useProductionTimeLogs } from '@/hooks/production/useProductionTimeLogs';
import { formatElapsed } from '@/hooks/production/useProductionTimeLogs';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { OutsourcingOrderRow } from '@/hooks/production/useOutsourcingOrders';
import type { LucideIcon } from 'lucide-react';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { format, parseISO, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Calendar, CheckCircle, Clock, GripVertical, Pause, Play, Square, Timer,
  Truck, User, Wrench, PackageX, AlertTriangle, Shield,
} from 'lucide-react';

interface KanbanCardProps {
  order: ProductionOrderRow;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  isDragging: boolean;
  columnKey: string;
  onMove: (id: string, status: string) => void;
  outsourcingData?: OutsourcingOrderRow[];
  timeLogs: ReturnType<typeof useProductionTimeLogs>;
}

const PRIORITY_INDICATOR: Record<string, string> = {
  urgent: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-blue-500',
  low: 'border-l-gray-400',
};

const NEXT_ACTIONS: Record<string, { label: string; status: string; icon: LucideIcon }[]> = {
  planned: [
    { label: 'Produzir', status: 'in_progress', icon: ArrowRight },
    { label: 'Aguardar Mat.', status: 'waiting_material', icon: PackageX },
  ],
  waiting_material: [{ label: 'Produzir', status: 'in_progress', icon: ArrowRight }],
  in_progress: [
    { label: 'Pausar', status: 'paused', icon: Pause },
    { label: 'Finalizar', status: 'finishing', icon: Wrench },
  ],
  outsourced: [
    { label: 'Retornou', status: 'in_progress', icon: ArrowRight },
    { label: 'Finalizar', status: 'finishing', icon: Wrench },
  ],
  paused: [{ label: 'Retomar', status: 'in_progress', icon: ArrowRight }],
  finishing: [],
  completed: [],
};

export function KanbanCard({ order, dragHandleProps, isDragging, columnKey, onMove, outsourcingData, timeLogs }: KanbanCardProps) {
  const progress = order.quantity > 0 ? (order.produced_quantity / order.quantity) * 100 : 0;
  const isLate = order.due_date && differenceInDays(new Date(), parseISO(order.due_date)) > 0 && order.status !== 'completed';
  const daysLate = order.due_date ? differenceInDays(new Date(), parseISO(order.due_date)) : 0;
  const pCfg = priorityConfig[order.priority] || { label: order.priority, color: 'bg-gray-100 text-gray-800' };
  const hasOutsourcing = outsourcingData && outsourcingData.length > 0;
  const outsourcingLate = outsourcingData?.some(o => o.expected_return_date && new Date(o.expected_return_date) < new Date() && o.status !== 'returned');
  const hasScore = order.priority_score > 0;
  const actions = NEXT_ACTIONS[columnKey] || [];

  return (
    <Card className={cn(
      'shadow-sm hover:shadow-md transition-all duration-200 border-l-[3px] group',
      PRIORITY_INDICATOR[order.priority] || 'border-l-gray-400',
      isLate && 'ring-1 ring-destructive/30 bg-destructive/5',
      outsourcingLate && 'ring-1 ring-warning/30',
      isDragging && 'shadow-2xl ring-2 ring-primary/40 rotate-[1deg] scale-[1.02]'
    )}>
      <CardContent className="p-2.5 space-y-1.5">
        <div className="flex items-center gap-1">
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity -ml-0.5">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="font-mono text-[10px] text-muted-foreground flex-1">{order.order_number}</span>
          {hasScore && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">
                    <Shield className="h-2.5 w-2.5 mr-0.5" />{order.priority_score}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Score de prioridade: {order.priority_score}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isLate && (
            <Badge variant="destructive" className="text-[9px] gap-0.5 px-1 h-4">
              <AlertTriangle className="h-2.5 w-2.5" /> {daysLate}d
            </Badge>
          )}
          {outsourcingLate && !isLate && (
            <Badge className="text-[9px] gap-0.5 px-1 h-4 bg-warning/20 text-warning">
              <Truck className="h-2.5 w-2.5" /> Terc. atrasado
            </Badge>
          )}
        </div>

        <p className="font-medium text-xs leading-tight truncate">{order.product_name}</p>

        <div className="flex items-center gap-1 flex-wrap">
          <Badge className={cn('text-[9px] h-4', pCfg.color)}>{pCfg.label}</Badge>
          {order.client_name && (
            <span className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5">
              <User className="h-2.5 w-2.5" /> {order.client_name.split(' ')[0]}
            </span>
          )}
          {hasOutsourcing && (
            <Badge variant="outline" className="text-[9px] h-4"><Truck className="h-2.5 w-2.5 mr-0.5" />Terc.</Badge>
          )}
        </div>

        <div className="space-y-0.5">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{order.produced_quantity}/{order.quantity}</span>
            <span className="font-semibold">{progress.toFixed(0)}%</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        {order.due_date && (
          <p className={cn('text-[10px] flex items-center gap-0.5', isLate ? 'text-destructive font-medium' : 'text-muted-foreground')}>
            <Calendar className="h-2.5 w-2.5" />
            {format(parseISO(order.due_date), 'dd/MM')}
          </p>
        )}

        {!['completed', 'cancelled'].includes(columnKey) && (() => {
          const activeLog = timeLogs.getActiveLog(order.id);
          const pausedLog = timeLogs.getPausedLog(order.id);
          const totalFinished = timeLogs.getTotalElapsed(order.id);
          const isRunning = !!activeLog;
          const isPaused = !!pausedLog;

          return (
            <div className="space-y-1 pt-0.5">
              {(isRunning || isPaused || totalFinished > 0) && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Timer className="h-2.5 w-2.5" />
                  {isRunning && <span className="text-emerald-400 font-medium animate-pulse">● Rodando</span>}
                  {isPaused && <span className="text-warning font-medium">⏸ Pausado ({formatElapsed(pausedLog!.elapsed_seconds)})</span>}
                  {totalFinished > 0 && <span className="ml-auto">Total: {formatElapsed(totalFinished)}</span>}
                </div>
              )}
              <div className="flex gap-1">
                {!isRunning && !isPaused && (
                  <Button size="sm" variant="outline" className="text-[10px] h-6 flex-1 px-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                    onClick={() => timeLogs.startTimer(order.id)}>
                    <Play className="h-2.5 w-2.5 mr-0.5" /> Iniciar
                  </Button>
                )}
                {isRunning && (
                  <>
                    <Button size="sm" variant="outline" className="text-[10px] h-6 flex-1 px-1 text-warning border-warning/30 hover:bg-warning/10"
                      onClick={() => timeLogs.pauseTimer(order.id)}>
                      <Pause className="h-2.5 w-2.5 mr-0.5" /> Pausar
                    </Button>
                    <Button size="sm" variant="outline" className="text-[10px] h-6 flex-1 px-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => timeLogs.finishTimer(order.id)}>
                      <Square className="h-2.5 w-2.5 mr-0.5" /> Finalizar
                    </Button>
                  </>
                )}
                {isPaused && (
                  <>
                    <Button size="sm" variant="outline" className="text-[10px] h-6 flex-1 px-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                      onClick={() => timeLogs.resumeTimer(order.id)}>
                      <Play className="h-2.5 w-2.5 mr-0.5" /> Retomar
                    </Button>
                    <Button size="sm" variant="outline" className="text-[10px] h-6 flex-1 px-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => timeLogs.finishTimer(order.id)}>
                      <Square className="h-2.5 w-2.5 mr-0.5" /> Finalizar
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {actions.length > 0 && (
          <div className="flex gap-1 pt-0.5">
            {actions.map(a => {
              const ActionIcon = a.icon;
              return (
                <Button key={a.status} size="sm" variant="outline" className="text-[10px] h-6 flex-1 px-1" onClick={() => onMove(order.id, a.status)}>
                  <ActionIcon className="h-2.5 w-2.5 mr-0.5" /> {a.label}
                </Button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
