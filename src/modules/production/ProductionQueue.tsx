import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '@/shared/components/PageContainer';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { Button } from '@/ui/base/button';
import { Progress } from '@/ui/base/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { productionStatusConfig, priorityConfig } from '@/config/production';
import { ListOrdered, AlertTriangle, Clock, Factory, Play, CheckCircle } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

const priorityWeight: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

export default function ProductionQueuePage() {
  const { orders, loading } = useProductionOrders();
  const [sectorFilter, setSectorFilter] = useState('all');

  const activeOrders = useMemo(() => {
    return orders
      .filter(o => ['planned', 'in_progress', 'paused', 'waiting_material', 'finishing', 'quality_check'].includes(o.status))
      .filter(o => sectorFilter === 'all' || o.work_center === sectorFilter || o.sector === sectorFilter)
      .sort((a, b) => {
        const pw = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        if (pw !== 0) return pw;
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        if (da !== db) return da - db;
        if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
        if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
        return 0;
      });
  }, [orders, sectorFilter]);

  const sectors = [...new Set(orders.map(o => o.work_center || o.sector).filter(Boolean))];
  const today = new Date();

  return (
    <PageContainer loading={loading}>
      <PageHeader title="Fila de Produção" description="Ordenação inteligente por prioridade, prazo e capacidade">
        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Setor" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os Setores</SelectItem>{sectors.map(s => <SelectItem key={s} value={s!}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Na Fila" value={activeOrders.length} icon={<ListOrdered className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Produzindo" value={activeOrders.filter(o => o.status === 'in_progress').length} icon={<Factory className="h-5 w-5" />} accentColor="info" index={1} />
        <KPICard title="Atrasadas" value={activeOrders.filter(o => o.due_date && differenceInDays(today, parseISO(o.due_date)) > 0).length} icon={<AlertTriangle className="h-5 w-5" />} accentColor="danger" index={2} />
        <KPICard title="Urgentes" value={activeOrders.filter(o => o.priority === 'urgent').length} icon={<Clock className="h-5 w-5" />} accentColor="warning" index={3} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ListOrdered className="h-5 w-5" /> Fila Ordenada por Prioridade</CardTitle></CardHeader>
        <CardContent>
          {activeOrders.length === 0 ? (
            <EmptyState
              icon={ListOrdered}
              title={sectorFilter === 'all' ? 'Fila de produção vazia' : 'Nenhuma ordem para este setor'}
              description={sectorFilter === 'all'
                ? 'Não há ordens planejadas, em andamento ou pausadas no momento.'
                : 'Ajuste o filtro de setor ou crie novas ordens de produção.'}
              action={sectorFilter !== 'all' ? { label: 'Limpar filtro', onClick: () => setSectorFilter('all'), variant: 'outline' } : undefined}
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10">#</TableHead><TableHead>Nº OP</TableHead><TableHead>Produto</TableHead>
                <TableHead>Cliente</TableHead><TableHead>Qtde</TableHead><TableHead>Progresso</TableHead>
                <TableHead>Prioridade</TableHead><TableHead>Prazo</TableHead><TableHead>Setor</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {activeOrders.map((o, idx) => {
                  const pct = o.quantity > 0 ? (o.produced_quantity / o.quantity) * 100 : 0;
                  const isDelayed = o.due_date && differenceInDays(today, parseISO(o.due_date)) > 0;
                  return (
                    <TableRow key={o.id} className={cn(isDelayed && 'bg-destructive/5')}>
                      <TableCell className="font-bold text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-mono font-medium">{o.order_number}</TableCell>
                      <TableCell>{o.product_name}</TableCell>
                      <TableCell>{o.client_name || '-'}</TableCell>
                      <TableCell>{o.produced_quantity}/{o.quantity} {o.unit}</TableCell>
                      <TableCell><div className="flex items-center gap-2"><Progress value={pct} className="h-2 w-16" /><span className="text-xs">{pct.toFixed(0)}%</span></div></TableCell>
                      <TableCell><StatusBadge status={o.priority} type="priority" /></TableCell>
                      <TableCell><div className="flex items-center gap-1">{o.due_date ? format(new Date(o.due_date), 'dd/MM/yyyy') : '-'}{isDelayed && <AlertTriangle className="h-3 w-3 text-destructive" />}</div></TableCell>
                      <TableCell>{o.work_center || o.sector || '-'}</TableCell>
                      <TableCell><StatusBadge status={o.status} type="production" /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {o.status === 'planned' && <Button size="sm" variant="outline" className="h-7 text-xs" asChild title="Abrir a execução PCP da OP"><Link to="/producao/ordens"><Play className="h-3 w-3 mr-1" /> Executar</Link></Button>}
                          {['in_progress', 'finishing', 'quality_check'].includes(o.status) && <Button size="sm" className="h-7 text-xs" asChild title="Abrir a execução PCP da OP"><Link to="/producao/ordens"><CheckCircle className="h-3 w-3 mr-1" /> Executar/concluir</Link></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
