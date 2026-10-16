import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Badge } from '@/ui/base/badge';
import { cn } from '@/lib/utils';
import { KanbanCard } from './KanbanCard';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { OutsourcingOrderRow } from '@/hooks/production/useOutsourcingOrders';
import type { useProductionTimeLogs } from '@/hooks/production/useProductionTimeLogs';

export type KanbanColumn = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  border: string;
  badge: string;
  items: ProductionOrderRow[];
  wipLimit: number;
};

interface KanbanBoardProps {
  columns: KanbanColumn[];
  onDragEnd: (result: DropResult) => void;
  onMove: (orderId: string, newStatus: string) => Promise<unknown>;
  outsourcingByOP: Record<string, OutsourcingOrderRow[]>;
  timeLogs: ReturnType<typeof useProductionTimeLogs>;
}

export function KanbanBoard({ columns, onDragEnd, onMove, outsourcingByOP, timeLogs }: KanbanBoardProps) {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {columns.map(col => {
          const Icon = col.icon;
          const isOverWip = col.wipLimit > 0 && col.items.length >= col.wipLimit;
          const isNearWip = col.wipLimit > 0 && col.items.length >= col.wipLimit * 0.9 && !isOverWip;
          return (
            <div key={col.key} className="space-y-2">
              <div className={cn(
                'flex items-center gap-2 p-2.5 rounded-xl border-t-2 bg-gradient-to-b',
                col.gradient, col.border,
                isOverWip && 'ring-2 ring-destructive/40'
              )}>
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-xs">{col.label}</span>
                <Badge className={cn('ml-auto text-[10px] font-bold', col.badge)}>
                  {col.items.length}
                  {col.wipLimit > 0 && <span className="opacity-60">/{col.wipLimit}</span>}
                </Badge>
                {isOverWip && <span className="text-[10px] text-destructive">⚠</span>}
                {isNearWip && <span className="text-[10px] text-warning">⚡</span>}
              </div>

              <Droppable droppableId={col.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'space-y-2 min-h-[200px] rounded-xl p-1.5 transition-colors duration-200',
                      snapshot.isDraggingOver && 'bg-primary/5 ring-2 ring-primary/20 ring-dashed',
                      isOverWip && snapshot.isDraggingOver && 'ring-destructive/30 bg-destructive/5'
                    )}
                  >
                    {col.items.map((order, index) => (
                      <Draggable key={order.id} draggableId={order.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={cn('transition-shadow', snapshot.isDragging && 'z-50')}
                          >
                            <KanbanCard
                              order={order}
                              dragHandleProps={provided.dragHandleProps}
                              isDragging={snapshot.isDragging}
                              columnKey={col.key}
                              onMove={onMove}
                              outsourcingData={outsourcingByOP[order.id]}
                              timeLogs={timeLogs}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {col.items.length === 0 && !snapshot.isDraggingOver && (
                      <div className="text-center text-[11px] text-muted-foreground py-10 border border-dashed rounded-xl opacity-50">
                        Arraste OPs aqui
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
