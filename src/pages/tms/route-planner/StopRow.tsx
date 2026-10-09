import { ArrowUp, ArrowDown, Trash2, GripVertical } from 'lucide-react';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import type { RouteStop } from '@/hooks/tms/useRoutePlanning';

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  en_route: { label: 'Em rota', variant: 'default' },
  arrived: { label: 'Chegou', variant: 'default' },
  completed: { label: 'Concluída', variant: 'outline' },
  failed: { label: 'Falhou', variant: 'destructive' },
  skipped: { label: 'Pulada', variant: 'secondary' },
};

export const StopRow = ({
  stop, late, canUp, canDown, onUp, onDown, onStatus, onDelete,
  isDragging, isOver, onDragStart, onDragOver, onDragEnd, onDrop,
}: {
  stop: RouteStop;
  late?: boolean;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onStatus: (status: string) => void;
  onDelete: () => void;
  isDragging?: boolean;
  isOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
}) => {
  const s = STATUS_LABEL[stop.status] ?? STATUS_LABEL.pending;
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
        isDragging ? 'opacity-50 border-primary' : isOver ? 'border-primary bg-primary/5' : late ? 'border-destructive/50 bg-destructive/5' : 'border-border/40'
      }`}
    >
      <button
        type="button"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        aria-label="Arrastar para reordenar"
        title="Arrastar para reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-sm">
        {stop.sequence}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{stop.address}</div>
        <div className="text-xs text-muted-foreground">
          {stop.city ?? ''}{stop.state ? ` / ${stop.state}` : ''}
          {Number(stop.weight ?? 0) > 0 && ` · ${Number(stop.weight)} kg`}
          {stop.planned_eta && ` · ETA ${new Date(stop.planned_eta).toLocaleString('pt-BR')}`}
          {stop.time_window_start && stop.time_window_end && (
            ` · Janela ${String(stop.time_window_start).slice(0, 5)}–${String(stop.time_window_end).slice(0, 5)}`
          )}
        </div>
      </div>
      {late && <Badge variant="destructive">Atrasada</Badge>}
      <Badge variant={s.variant}>{s.label}</Badge>
      <Select value={stop.status} onValueChange={onStatus}>
        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="icon" variant="ghost" disabled={!canUp} onClick={onUp}><ArrowUp className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" disabled={!canDown} onClick={onDown}><ArrowDown className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
    </div>
  );
};

export const CostLine = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div className={`rounded-lg border p-3 ${highlight ? 'border-primary/40 bg-primary/5' : 'border-border/40'}`}>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`font-semibold ${highlight ? 'text-primary' : ''}`}>{value}</div>
  </div>
);
