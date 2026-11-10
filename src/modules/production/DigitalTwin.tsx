import { useState, useMemo } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Input } from '@/ui/base/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useProductionCapacity } from '@/hooks/production/useProductionCapacity';
import { Cpu, Zap, Clock, Package, AlertTriangle, TrendingUp, Shuffle, BarChart3, Layers } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Progress } from '@/ui/base/progress';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, AreaChart, Area, ReferenceLine } from 'recharts';

import { formatNumber } from '@/lib/formatters';
import { toSafeNumber } from '@/lib/numericValidation';
export default function DigitalTwinPage() {
  const { orders } = useProductionOrders();
  const { capacities } = useProductionCapacity();

  const [simNewOrders, setSimNewOrders] = useState(0);
  const [simQtyPerOrder, setSimQtyPerOrder] = useState(100);
  const [simTimePerUnit, setSimTimePerUnit] = useState(5);
  const [scenario, setScenario] = useState<'normal' | 'optimistic' | 'pessimistic'>('normal');

  const scenarioFactors = { normal: 1, optimistic: 0.85, pessimistic: 1.2 };
  const factor = scenarioFactors[scenario];

  const activeOPs = orders.filter(o => ['planned', 'in_progress', 'paused'].includes(o.status));
  const totalPendingQty = activeOPs.reduce((s, o) => s + Math.max(0, o.quantity - o.produced_quantity), 0);
  const totalPendingMinutes = activeOPs.reduce((s, o) => {
    const remaining = Math.max(0, o.quantity - o.produced_quantity);
    const avgTimePerUnit = o.produced_quantity > 0 && o.realized_time_minutes > 0
      ? o.realized_time_minutes / o.produced_quantity : o.estimated_time_minutes / Math.max(o.quantity, 1);
    return s + remaining * avgTimePerUnit;
  }, 0);

  const totalCapacityPerHour = capacities.reduce((s, c) => s + (c.capacity_per_hour || 0), 0);
  const totalCapacityPerDay = totalCapacityPerHour * 8;
  const daysToComplete = totalCapacityPerDay > 0 ? Math.ceil((totalPendingQty * factor) / totalCapacityPerDay) : 0;

  const simTotalNewQty = simNewOrders * simQtyPerOrder;
  const simTotalNewMinutes = simTotalNewQty * simTimePerUnit * factor;
  const simTotalPendingQty = totalPendingQty + simTotalNewQty;
  const simTotalPendingMinutes = (totalPendingMinutes * factor) + simTotalNewMinutes;
  const simDaysToComplete = totalCapacityPerDay > 0 ? Math.ceil(simTotalPendingQty / totalCapacityPerDay * factor) : 0;
  const simCompletionDate = addDays(new Date(), simDaysToComplete);
  const capacityUtilization = totalCapacityPerDay > 0 ? Math.min((simTotalPendingQty / (totalCapacityPerDay * 30)) * 100, 100) : 0;

  // Monte Carlo Simulation
  const monteCarloResults = useMemo(() => {
    if (simTotalPendingQty <= 0 || totalCapacityPerDay <= 0) return [];
    const iterations = 500;
    const results: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const efficiencyVariation = 0.7 + Math.random() * 0.5;
      const demandVariation = 0.9 + Math.random() * 0.2;
      const adjQty = simTotalPendingQty * demandVariation;
      const adjCap = totalCapacityPerDay * efficiencyVariation;
      const days = Math.ceil(adjQty / adjCap);
      results.push(days);
    }
    results.sort((a, b) => a - b);

    const buckets: Record<number, number> = {};
    results.forEach(d => { const b = Math.round(d); buckets[b] = (buckets[b] || 0) + 1; });

    const p10 = results[Math.floor(iterations * 0.1)];
    const p50 = results[Math.floor(iterations * 0.5)];
    const p90 = results[Math.floor(iterations * 0.9)];
    const avg = results.reduce((s, v) => s + v, 0) / iterations;

    const distribution = Object.entries(buckets).map(([days, count]) => ({
      days: +days,
      count,
      pct: +((count / iterations) * 100).toFixed(1),
    })).sort((a, b) => a.days - b.days);

    return { distribution, p10, p50, p90, avg: +avg.toFixed(1), min: results[0], max: results[results.length - 1] };
  }, [simTotalPendingQty, totalCapacityPerDay]);

  // Sector load
  const sectorLoad = useMemo(() => {
    const sectors: Record<string, { current: number; capacity: number }> = {};
    activeOPs.forEach(o => {
      const sector = o.sector || o.work_center || 'Geral';
      if (!sectors[sector]) sectors[sector] = { current: 0, capacity: 0 };
      sectors[sector].current += Math.max(0, o.quantity - o.produced_quantity);
    });
    capacities.forEach(c => {
      const sector = c.sector || 'Geral';
      if (!sectors[sector]) sectors[sector] = { current: 0, capacity: 0 };
      sectors[sector].capacity += (c.capacity_per_hour || 0) * 8 * 22;
    });
    const numSectors = Math.max(Object.keys(sectors).length, 1);
    return Object.entries(sectors).map(([sector, v]) => ({
      sector,
      current: v.current,
      simulated: v.current + Math.round(simTotalNewQty / numSectors),
      capacity: v.capacity,
      loadPct: v.capacity > 0 ? (v.current / v.capacity) * 100 : 0,
      simLoadPct: v.capacity > 0 ? ((v.current + Math.round(simTotalNewQty / numSectors)) / v.capacity) * 100 : 0,
    }));
  }, [activeOPs, capacities, simTotalNewQty]);

  // Bottleneck heatmap
  const bottleneckData = sectorLoad.map(s => ({
    sector: s.sector,
    currentLoad: +s.loadPct.toFixed(0),
    simLoad: +s.simLoadPct.toFixed(0),
    slack: Math.max(0, s.capacity - (s.simulated || s.current)),
    isBottleneck: s.simLoadPct > 90,
  }));

  return (
    <PageContainer>
      <PageHeader title="🔮 Digital Twin — Simulação Avançada" description="Monte Carlo, cenários múltiplos, análise de capacidade e gargalos" />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard title="OPs Ativas" value={activeOPs.length} icon={<Package className="h-4 w-4" />} accentColor="primary" index={0} />
        <KPICard title="Peças Pendentes" value={formatNumber(totalPendingQty)} icon={<Clock className="h-4 w-4" />} accentColor="warning" index={1} />
        <KPICard title="Capacidade/Dia" value={formatNumber(totalCapacityPerDay)} icon={<Zap className="h-4 w-4" />} accentColor="success" index={2} />
        <KPICard title="Dias p/ Concluir" value={daysToComplete} icon={<TrendingUp className="h-4 w-4" />} accentColor={daysToComplete > 15 ? 'danger' : 'primary'} index={3} />
        <KPICard title="Gargalos" value={bottleneckData.filter(b => b.isBottleneck).length} icon={<AlertTriangle className="h-4 w-4" />} accentColor={bottleneckData.filter(b => b.isBottleneck).length > 0 ? 'danger' : 'success'} index={4} />
      </div>

      <Tabs defaultValue="simulator" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="simulator">⚙️ Simulador</TabsTrigger>
          <TabsTrigger value="montecarlo">🎲 Monte Carlo</TabsTrigger>
          <TabsTrigger value="bottleneck">🔥 Gargalos</TabsTrigger>
          <TabsTrigger value="timeline">📅 Previsão Entrega</TabsTrigger>
        </TabsList>

        <TabsContent value="simulator" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cpu className="h-4 w-4" /> Configurar Simulação</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium">Novos Pedidos</label>
                  <Input type="number" min={0} value={simNewOrders} onChange={e => setSimNewOrders(toSafeNumber(e.target.value))} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Qtd por Pedido</label>
                  <Input type="number" min={1} value={simQtyPerOrder} onChange={e => setSimQtyPerOrder(toSafeNumber(e.target.value))} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Tempo/Unidade (min)</label>
                  <Input type="number" min={0.1} step={0.1} value={simTimePerUnit} onChange={e => setSimTimePerUnit(toSafeNumber(e.target.value))} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Cenário</label>
                  <Select value={scenario} onValueChange={v => setScenario(v as 'normal' | 'optimistic' | 'pessimistic')}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="optimistic">🟢 Otimista (-15%)</SelectItem>
                      <SelectItem value="normal">🔵 Normal</SelectItem>
                      <SelectItem value="pessimistic">🔴 Pessimista (+20%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">📊 Cenário Atual</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Peças pendentes</span><span className="font-bold">{formatNumber(totalPendingQty)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tempo estimado</span><span className="font-bold">{(totalPendingMinutes / 60).toFixed(0)}h</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Dias para concluir</span><span className="font-bold">{daysToComplete} dias</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Previsão</span><span className="font-bold">{format(addDays(new Date(), daysToComplete), 'dd/MM/yyyy')}</span></div>
              </CardContent>
            </Card>

            <Card className={cn('border-2', simNewOrders > 0 ? 'border-primary' : 'border-border')}>
              <CardHeader className="pb-2"><CardTitle className="text-base">🔮 Cenário Simulado ({scenario === 'optimistic' ? 'Otimista' : scenario === 'pessimistic' ? 'Pessimista' : 'Normal'})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Peças pendentes</span><span className="font-bold">{formatNumber(simTotalPendingQty)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tempo estimado</span><span className="font-bold">{(simTotalPendingMinutes / 60).toFixed(0)}h</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Dias para concluir</span><span className={cn('font-bold', simDaysToComplete > daysToComplete + 5 ? 'text-destructive' : '')}>{simDaysToComplete} dias</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Previsão</span><span className="font-bold">{format(simCompletionDate, 'dd/MM/yyyy')}</span></div>
                {simNewOrders > 0 && (
                  <div className="pt-2 border-t space-y-2">
                    <div className="flex justify-between"><span className="text-muted-foreground">Impacto</span><span className={cn('font-bold', simDaysToComplete - daysToComplete > 0 ? 'text-warning-text' : 'text-success')}>+{simDaysToComplete - daysToComplete} dias</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Utilização Mensal</span><span className="font-bold">{capacityUtilization.toFixed(0)}%</span></div>
                    <Progress value={capacityUtilization} className={cn('h-2', capacityUtilization > 90 && '[&>div]:bg-destructive')} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="montecarlo" className="space-y-4">
          {monteCarloResults && 'distribution' in monteCarloResults ? (
            <>
              <div className="grid md:grid-cols-4 gap-4">
                {[
                  { label: 'P10 (Otimista)', value: `${monteCarloResults.p10}d`, desc: '90% chance de ficar acima' },
                  { label: 'P50 (Mediana)', value: `${monteCarloResults.p50}d`, desc: '50% de probabilidade' },
                  { label: 'P90 (Conservador)', value: `${monteCarloResults.p90}d`, desc: '90% chance de concluir até' },
                  { label: 'Média', value: `${monteCarloResults.avg}d`, desc: `Min: ${monteCarloResults.min}d / Max: ${monteCarloResults.max}d` },
                ].map((item, i) => (
                  <Card key={i}>
                    <CardContent className="pt-6 text-center space-y-1">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-3xl font-black">{item.value}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shuffle className="h-4 w-4" /> Distribuição Monte Carlo (500 iterações)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <ComposedChart data={monteCarloResults.distribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="days" fontSize={11} label={{ value: 'Dias', position: 'bottom' }} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <ReferenceLine x={monteCarloResults.p10} stroke="hsl(var(--success))" strokeDasharray="5 5" label="P10" />
                      <ReferenceLine x={monteCarloResults.p50} stroke="hsl(var(--primary))" strokeDasharray="5 5" label="P50" />
                      <ReferenceLine x={monteCarloResults.p90} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label="P90" />
                      <Bar dataKey="count" name="Frequência" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.7} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-muted-foreground mt-2">Simulação com variação aleatória de eficiência (70-120%) e demanda (90-110%)</p>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Configure pedidos no simulador para executar Monte Carlo</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="bottleneck" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Mapa de Gargalos por Setor</CardTitle></CardHeader>
            <CardContent>
              {bottleneckData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={bottleneckData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="sector" fontSize={11} />
                      <YAxis fontSize={11} domain={[0, 150]} />
                      <Tooltip />
                      <Legend />
                      <ReferenceLine y={90} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label="Limite 90%" />
                      <Bar dataKey="currentLoad" name="Carga Atual %" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      {simNewOrders > 0 && <Bar dataKey="simLoad" name="Carga Simulada %" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />}
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="mt-4 space-y-2">
                    {bottleneckData.filter(b => b.isBottleneck).map((b, i) => (
                      <div key={i} className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        <div>
                          <p className="font-medium text-sm">{b.sector}: Gargalo detectado</p>
                          <p className="text-xs text-muted-foreground">Carga: {b.simLoad}% — Folga: {formatNumber(b.slack)} un/mês</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="text-center text-muted-foreground py-8">Cadastre capacidades para simular gargalos</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Previsão de Entrega das OPs Ativas</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>OP</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Pendente</TableHead>
                  <TableHead>Prazo</TableHead><TableHead>Previsão</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {activeOPs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sem OPs ativas</TableCell></TableRow>
                  ) : activeOPs.slice(0, 20).map(o => {
                    const remaining = Math.max(0, o.quantity - o.produced_quantity);
                    const estDays = totalCapacityPerDay > 0 ? Math.ceil((remaining * factor) / totalCapacityPerDay) : 0;
                    const estDate = addDays(new Date(), estDays);
                    const isLate = o.due_date ? estDate > new Date(o.due_date) : false;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                        <TableCell className="font-medium">{o.product_name}</TableCell>
                        <TableCell className="text-right">{remaining}</TableCell>
                        <TableCell>{o.due_date ? format(new Date(o.due_date), 'dd/MM') : '-'}</TableCell>
                        <TableCell className={cn(isLate && 'text-destructive font-medium')}>{format(estDate, 'dd/MM')}</TableCell>
                        <TableCell>
                          <Badge variant={isLate ? 'destructive' : 'default'} className="text-xs">
                            {isLate ? '⚠ Atraso previsto' : '✓ No prazo'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
