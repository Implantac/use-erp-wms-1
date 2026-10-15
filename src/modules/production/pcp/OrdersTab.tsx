import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { Card, CardContent, CardHeader } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Button } from '@/ui/base/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Progress } from '@/ui/base/progress';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { EmptyState } from '@/shared/components/EmptyState';
import { productionStatusConfig } from '@/config/production';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Factory, Search, Play, Pause, AlertTriangle } from 'lucide-react';

interface Props {
  filtered: ProductionOrderRow[];
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  today: Date;
  onStatusChange: (op: ProductionOrderRow, newStatus: string) => void;
}

export function OrdersTab({ filtered, search, setSearch, statusFilter, setStatusFilter, today, onStatusChange }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar OP..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(productionStatusConfig).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nº OP</TableHead><TableHead>Produto</TableHead><TableHead>Qtde</TableHead>
            <TableHead>Produzido</TableHead><TableHead>%</TableHead><TableHead>Status</TableHead>
            <TableHead>Prioridade</TableHead><TableHead>Prazo</TableHead><TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="p-0"><EmptyState icon={Factory} title="Nenhuma OP encontrada" description="Crie ordens de produção ou ajuste os filtros." /></TableCell></TableRow>
            ) : filtered.map(o => {
              const pct = Number.isFinite(o.quantity) && o.quantity > 0 && Number.isFinite(o.produced_quantity)
                && o.produced_quantity >= 0 && o.produced_quantity <= o.quantity
                ? o.produced_quantity / o.quantity * 100 : null;
              const due = o.due_date ? new Date(o.due_date) : null;
              const hasValidDue = !!due && Number.isFinite(due.getTime());
              const isDelayed = hasValidDue && ['planned', 'in_progress', 'paused', 'waiting_material', 'outsourced', 'finishing'].includes(o.status)
                && due!.getTime() < today.getTime();
              return (
                <TableRow key={o.id} className={cn(isDelayed && 'bg-destructive/5')}>
                  <TableCell className="font-mono font-medium">{o.order_number}</TableCell>
                  <TableCell>{o.product_name}</TableCell>
                  <TableCell>{o.quantity} {o.unit}</TableCell>
                  <TableCell>{o.produced_quantity} {o.unit}</TableCell>
                  <TableCell><div className="flex items-center gap-2">{pct === null ? <span className="text-xs">—</span> : <><Progress value={pct} className="h-2 w-16" /><span className="text-xs">{pct.toFixed(0)}%</span></>}</div></TableCell>
                  <TableCell><StatusBadge status={o.status} type="production" /></TableCell>
                  <TableCell><StatusBadge status={o.priority} type="priority" /></TableCell>
                  <TableCell><div className="flex items-center gap-1">{hasValidDue ? format(due!, 'dd/MM/yyyy') : '—'}{isDelayed && <AlertTriangle className="h-3 w-3 text-destructive" />}</div></TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {o.status === 'planned' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onStatusChange(o, 'in_progress')}><Play className="h-3 w-3 mr-1" /> Iniciar</Button>}
                      {o.status === 'in_progress' && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onStatusChange(o, 'paused')}><Pause className="h-3 w-3 mr-1" /> Pausar</Button>
                          <span className="text-xs text-muted-foreground" title="Conclusão exige inspeção e estoque transacionais">Conclusão indisponível</span>
                        </>
                      )}
                      {o.status === 'paused' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onStatusChange(o, 'in_progress')}><Play className="h-3 w-3 mr-1" /> Retomar</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
