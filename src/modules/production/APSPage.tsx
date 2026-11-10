import { useState, useMemo } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useProductionCapacity } from '@/hooks/production/useProductionCapacity';
import { Zap, ArrowUpDown, Target, Clock, Calendar, AlertTriangle, CheckCircle, ListOrdered, Layers, BarChart3, GanttChart } from 'lucide-react';
import { differenceInDays, format, parseISO, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Progress } from '@/ui/base/progress';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ComposedChart, Line, ReferenceLine } from 'recharts';
import { toast } from 'sonner';

import { formatNumber } from '@/lib/formatters';
type SortCriteria = 'priority_due' | 'due_date' | 'shortest_first' | 'longest_first' | 'critical_ratio';

export default function APSPage() {
  const { orders, update } = useProductionOrders();
  const { capacities } = useProductionCapacity();
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>('priority_due');

  const activeOPs = orders.filter(o => ['planned', 'in_progress', 'paused'].includes(o.status));
  const totalCapPerDay = capacities.reduce((s, c) => s + (c.capacity_per_hour || 0) * 8, 0);

  const sequencedOPs = useMemo(() => {
    const priorityMap: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

    return [...activeOPs].map(o => {
      const remaining = Math.max(0, o.quantity - o.produced_quantity);
      const avgTime = o.produced_quantity > 0 && o.realized_time_minutes > 0
        ? o.realized_time_minutes / o.produced_quantity
        : o.estimated_time_minutes / Math.max(o.quantity, 1);
      const estMinutes = remaining * avgTime;
      const estDays = totalCapPerDay > 0 ? remaining / totalCapPerDay : 999;
      const dueIn = o.due_date ? differenceInDays(parseISO(o.due_date), new Date()) : 999;
      const criticalRatio = dueIn > 0 ? estDays / dueIn : 999;
      const isLate = o.due_date ? new Date() > new Date(o.due_date) : false;
      const willBeLate = dueIn < estDays;
      const sector = o.sector || o.work_center || 'Geral';

      return { ...o, remaining, estMinutes, estDays, dueIn, criticalRatio, isLate, willBeLate, priorityNum: priorityMap[o.priority] ?? 9, sector };
    }).sort((a, b) => {
      switch (sortCriteria) {
        case 'due_date': return a.dueIn - b.dueIn;
        case 'shortest_first': return a.estMinutes - b.estMinutes;
        case 'longest_first': return b.estMinutes - a.estMinutes;
        case 'critical_ratio': return b.criticalRatio - a.criticalRatio;
        case 'priority_due':
        default: {
          if (a.isLate !== b.isLate) return a.isLate ? -1 : 1;
          if (a.willBeLate !== b.willBeLate) return a.willBeLate ? -1 : 1;
          const pDiff = a.priorityNum - b.priorityNum;
          if (pDiff !== 0) return pDiff;
          return a.dueIn - b.dueIn;
        }
      }
    });
  }, [activeOPs, sortCriteria, totalCapPerDay]);

  const lateCount = sequencedOPs.filter(o => o.isLate).length;
  const willBeLateCount = sequencedOPs.filter(o => o.willBeLate && !o.isLate).length;
  const onTrack = sequencedOPs.filter(o => !o.isLate && !o.willBeLate).length;

  let cumulativeHours = 0;
  const timeline = sequencedOPs.map((o, idx) => {
    const hours = o.estMinutes / 60;
    cumulativeHours += hours;
    const startDate = addDays(new Date(), idx === 0 ? 0 : Math.ceil((cumulativeHours - hours) / 8));
    const endDate = addDays(new Date(), Math.ceil(cumulativeHours / 8));
    return { ...o, seq: idx + 1, cumHours: cumulativeHours, startDate, endDate };
  });

  // Resource leveling
  const resourceLoad = useMemo(() => {
    const sectorLoad: Record<string, { ops: number; hours: number; capacity: number }> = {};
    capacities.forEach(c => {
      const s = c.sector || 'Geral';
      if (!sectorLoad[s]) sectorLoad[s] = { ops: 0, hours: 0, capacity: (c.capacity_per_hour || 0) * 8 * 22 };
      else sectorLoad[s].capacity += (c.capacity_per_hour || 0) * 8 * 22;
    });
    sequencedOPs.forEach(o => {
      const s = o.sector;
      if (!sectorLoad[s]) sectorLoad[s] = { ops: 0, hours: 0, capacity: 0 };
      sectorLoad[s].ops += 1;
      sectorLoad[s].hours += o.estMinutes / 60;
    });
    return Object.entries(sectorLoad).map(([sector, v]) => ({
      sector,
      ops: v.ops,
      hours: +v.hours.toFixed(1),
      capacity: v.capacity,
      loadPct: v.capacity > 0 ? +((v.hours / (v.capacity / 22 * 8)) * 100).toFixed(0) : 0,
      isOverloaded: v.capacity > 0 && (v.hours / (v.capacity / 22 * 8)) * 100 > 100,
    }));
  }, [sequencedOPs, capacities]);

  // Gantt-like data
  const ganttData = useMemo(() => {
    return timeline.slice(0, 20).map(o => {
      const startDay = differenceInDays(o.startDate, new Date());
      const endDay = differenceInDays(o.endDate, new Date());
      const dueDay = o.due_date ? differenceInDays(new Date(o.due_date), new Date()) : null;
      return {
        op: o.order_number,
        start: startDay,
        duration: Math.max(1, endDay - startDay),
        due: dueDay,
        isLate: o.isLate,
        willBeLate: o.willBeLate,
        priority: o.priority,
        product: o.product_name.slice(0, 20),
      };
    });
  }, [timeline]);

  const handleApplySequence = async () => {
    for (let i = 0; i < Math.min(timeline.length, 5); i++) {
      const op = timeline[i];
      if (op.priority !== 'urgent' && (op.isLate || op.willBeLate)) {
        await update(op.id, { priority: 'urgent' });
      }
    }
    toast.success(`Sequenciamento aplicado — ${timeline.length} OPs priorizadas`);
  };

  return (
    <PageContainer>
      <PageHeader title="🚀 APS — Planejamento Avançado de Produção" description="Sequenciamento automático, Gantt visual, balanceamento de recursos e otimização">
        <Button onClick={handleApplySequence} disabled={timeline.length === 0}>
          <Zap className="h-4 w-4 mr-2" /> Aplicar Sequenciamento
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard title="OPs para Sequenciar" value={activeOPs.length} icon={<ListOrdered className="h-4 w-4" />} accentColor="primary" index={0} />
        <KPICard title="No Prazo" value={onTrack} icon={<CheckCircle className="h-4 w-4" />} accentColor="success" index={1} />
        <KPICard title="Risco Atraso" value={willBeLateCount} icon={<Clock className="h-4 w-4" />} accentColor="warning" index={2} />
        <KPICard title="Atrasadas" value={lateCount} icon={<AlertTriangle className="h-4 w-4" />} accentColor="danger" index={3} />
        <KPICard title="Setores Sobrecarga" value={resourceLoad.filter(r => r.isOverloaded).length} icon={<Layers className="h-4 w-4" />} accentColor={resourceLoad.filter(r => r.isOverloaded).length > 0 ? 'danger' : 'success'} index={4} />
      </div>

      <Tabs defaultValue="sequence" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="sequence">📋 Sequenciamento</TabsTrigger>
          <TabsTrigger value="gantt">📊 Gantt Visual</TabsTrigger>
          <TabsTrigger value="resources">⚖️ Balanceamento</TabsTrigger>
          <TabsTrigger value="summary">📈 Resumo</TabsTrigger>
        </TabsList>

        <TabsContent value="sequence">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2"><ArrowUpDown className="h-4 w-4" /> Sequenciamento de Produção</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Algoritmo:</span>
                  <Select value={sortCriteria} onValueChange={v => setSortCriteria(v as SortCriteria)}>
                    <SelectTrigger className="w-[250px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority_due">🎯 Prioridade + Prazo (Recomendado)</SelectItem>
                      <SelectItem value="due_date">📅 EDD — Menor Prazo</SelectItem>
                      <SelectItem value="shortest_first">⚡ SPT — Menor Tempo Processamento</SelectItem>
                      <SelectItem value="longest_first">🔄 LPT — Maior Tempo Processamento</SelectItem>
                      <SelectItem value="critical_ratio">📊 CR — Razão Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>OP</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead className="text-right">Pendente</TableHead>
                  <TableHead className="text-right">Est. (h)</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Prev. Início</TableHead>
                  <TableHead>Prev. Fim</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {timeline.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Nenhuma OP para sequenciar</TableCell></TableRow>
                  ) : timeline.slice(0, 30).map(o => (
                    <TableRow key={o.id} className={cn(o.isLate && 'bg-destructive/5', o.willBeLate && !o.isLate && 'bg-warning/5')}>
                      <TableCell className="font-bold text-center">{o.seq}</TableCell>
                      <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                      <TableCell className="font-medium max-w-[120px] truncate">{o.product_name}</TableCell>
                      <TableCell className="text-sm">{o.sector}</TableCell>
                      <TableCell>
                        <Badge variant={o.priority === 'urgent' ? 'destructive' : o.priority === 'high' ? 'default' : 'outline'} className="text-xs">
                          {o.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{o.remaining}</TableCell>
                      <TableCell className="text-right font-mono">{(o.estMinutes / 60).toFixed(1)}</TableCell>
                      <TableCell className={cn(o.isLate && 'text-destructive font-medium')}>{o.due_date ? format(new Date(o.due_date), 'dd/MM') : '-'}</TableCell>
                      <TableCell>{format(o.startDate, 'dd/MM')}</TableCell>
                      <TableCell className={cn(o.willBeLate && 'text-warning-text font-medium')}>{format(o.endDate, 'dd/MM')}</TableCell>
                      <TableCell>
                        {o.isLate ? <Badge variant="destructive" className="text-xs">⚠ Atrasada</Badge>
                          : o.willBeLate ? <Badge variant="secondary" className="text-xs">⏳ Risco</Badge>
                          : <Badge variant="outline" className="text-xs text-success">✓ OK</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gantt">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><GanttChart className="h-4 w-4" /> Gantt Visual de Produção</CardTitle></CardHeader>
            <CardContent>
              {ganttData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(300, ganttData.length * 35)}>
                  <BarChart data={ganttData} layout="vertical" barCategoryGap={4}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" fontSize={11} label={{ value: 'Dias a partir de hoje', position: 'bottom' }} />
                    <YAxis dataKey="op" type="category" width={100} fontSize={10} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-background border rounded p-2 text-xs shadow-lg">
                          <p className="font-bold">{d.op}</p>
                          <p>{d.product}</p>
                          <p>Início: dia {d.start} | Duração: {d.duration}d</p>
                          {d.due !== null && <p>Prazo: dia {d.due}</p>}
                          <p>Prioridade: {d.priority}</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="start" stackId="a" fill="transparent" />
                    <Bar dataKey="duration" stackId="a" name="Duração (dias)" radius={[0, 4, 4, 0]}>
                      {ganttData.map((entry, i) => (
                        <Cell key={i} fill={entry.isLate ? 'hsl(var(--destructive))' : entry.willBeLate ? 'hsl(var(--warning))' : 'hsl(var(--primary))'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Sem OPs para visualizar</p>}
              <div className="flex gap-4 mt-3 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary" /> No prazo</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning" /> Risco</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive" /> Atrasada</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" /> Balanceamento de Recursos por Setor</CardTitle></CardHeader>
            <CardContent>
              {resourceLoad.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={resourceLoad}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="sector" fontSize={11} />
                      <YAxis fontSize={11} domain={[0, 150]} />
                      <Tooltip />
                      <ReferenceLine y={100} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label="Capacidade máxima" />
                      <Bar dataKey="loadPct" name="Carga %" radius={[4, 4, 0, 0]}>
                        {resourceLoad.map((entry, i) => (
                          <Cell key={i} fill={entry.isOverloaded ? 'hsl(var(--destructive))' : entry.loadPct > 80 ? 'hsl(var(--warning))' : 'hsl(var(--primary))'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="mt-4 space-y-2">
                    {resourceLoad.map(r => (
                      <div key={r.sector} className={cn('p-3 rounded-lg', r.isOverloaded ? 'bg-destructive/10' : 'bg-muted')}>
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-medium">{r.sector}</span>
                            <span className="text-sm text-muted-foreground ml-2">({r.ops} OPs • {r.hours}h)</span>
                          </div>
                          <Badge variant={r.isOverloaded ? 'destructive' : r.loadPct > 80 ? 'secondary' : 'outline'}>{r.loadPct}%</Badge>
                        </div>
                        <Progress value={Math.min(r.loadPct, 100)} className={cn('h-2 mt-2', r.isOverloaded && '[&>div]:bg-destructive')} />
                        {r.isOverloaded && <p className="text-xs text-destructive mt-1">⚠ Setor sobrecarregado — redistribuir OPs ou aumentar turno</p>}
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="text-center text-muted-foreground py-8">Cadastre capacidades para balanceamento</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 text-center space-y-2">
                <Calendar className="h-8 w-8 mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Previsão Final do Backlog</p>
                <p className="text-3xl font-extrabold">{timeline.length > 0 ? format(timeline[timeline.length - 1].endDate, 'dd/MM/yyyy') : '-'}</p>
                <p className="text-xs text-muted-foreground">{cumulativeHours.toFixed(0)}h de produção acumulada</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center space-y-2">
                <Target className="h-8 w-8 mx-auto text-success" />
                <p className="text-sm text-muted-foreground">Taxa de Cumprimento</p>
                <p className={cn('text-5xl font-extrabold', onTrack / Math.max(sequencedOPs.length, 1) >= 0.8 ? 'text-success' : 'text-warning-text')}>
                  {sequencedOPs.length > 0 ? ((onTrack / sequencedOPs.length) * 100).toFixed(0) : 0}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center space-y-2">
                <Zap className="h-8 w-8 mx-auto text-warning-text" />
                <p className="text-sm text-muted-foreground">Capacidade Diária</p>
                <p className="text-3xl font-extrabold">{formatNumber(totalCapPerDay)}</p>
                <p className="text-xs text-muted-foreground">unidades/dia ({capacities.length} recursos)</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
