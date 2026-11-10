import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';
import { useMemo, useEffect, useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { useTimeEntries } from '@/hooks/system/useTimeEntries';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import { useProductionEvents } from '@/hooks/production/useProductionEvents';
import { supabase } from '@/integrations/supabase/client';
import { Users, Factory, AlertTriangle, TrendingUp, Activity, Radio, Cpu, Zap } from 'lucide-react';
import { differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Progress } from '@/ui/base/progress';
import ShopFloorEventFeed from '@/components/production/ShopFloorEventFeed';

export default function ShopFloorDashboardPage() {
  const { entries, loading, refetch } = useTimeEntries();
  const { orders, refetch: refetchOrders } = useProductionOrders();
  const { machines, runningMachines, stoppedMachines } = useProductionMachines();
  const { todayEvents, criticalEvents } = useProductionEvents(30);
  const [now, setNow] = useState(new Date());
  const [realtimeActive, setRealtimeActive] = useState(false);

  useEffect(() => { const interval = setInterval(() => setNow(new Date()), 5000); return () => clearInterval(interval); }, []);

  const sfCompanyId = useEnterpriseStore((s) => s.activeCompanyId);
  useEffect(() => {
    if (!sfCompanyId) return;
    const channel = supabase
      .channel(`shopfloor-realtime:${sfCompanyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries', filter: `company_id=eq.${sfCompanyId}` }, () => { refetch(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_orders', filter: `company_id=eq.${sfCompanyId}` }, () => { refetchOrders(); })
      .subscribe((status) => { setRealtimeActive(status === 'SUBSCRIBED'); });
    return () => { supabase.removeChannel(channel); };
  }, [refetch, refetchOrders, sfCompanyId]);

  const activeEntries = entries.filter(e => e.status === 'started');
  const pausedEntries = entries.filter(e => e.status === 'paused');
  const today = new Date().toDateString();
  const todayCompleted = entries.filter(e => e.status === 'completed' && new Date(e.start_time).toDateString() === today);

  const operatorStats = useMemo(() => {
    const allToday = entries.filter(e => new Date(e.start_time).toDateString() === today);
    const operators = [...new Set(allToday.map(e => e.operator))];
    return operators.map(op => {
      const opEntries = allToday.filter(e => e.operator === op);
      const completed = opEntries.filter(e => e.status === 'completed');
      const active = opEntries.find(e => e.status === 'started');
      const totalProduced = completed.reduce((s, e) => s + e.produced_quantity, 0) + (active?.produced_quantity || 0);
      const totalRejected = completed.reduce((s, e) => s + e.rejected_quantity, 0);
      const totalMinutes = completed.reduce((s, e) => { if (e.end_time) return s + differenceInMinutes(new Date(e.end_time), new Date(e.start_time)) - (e.paused_time || 0); return s; }, 0);
      const activeMinutes = active ? differenceInMinutes(now, new Date(active.start_time)) - (active.paused_time || 0) : 0;
      const allMinutes = totalMinutes + activeMinutes;
      const pcsPerHour = allMinutes > 0 ? (totalProduced / (allMinutes / 60)) : 0;
      const isActive = !!active;
      const isPaused = !!opEntries.find(e => e.status === 'paused');
      const currentOP = active?.order_number || opEntries.find(e => e.status === 'paused')?.order_number || '-';
      const currentStep = active?.operation_name || '-';
      return { operator: op, totalProduced, totalRejected, pcsPerHour, isActive, isPaused, currentOP, currentStep, allMinutes };
    }).sort((a, b) => b.pcsPerHour - a.pcsPerHour);
  }, [entries, now, today]);

  const sectorStats = useMemo(() => {
    const allToday = entries.filter(e => new Date(e.start_time).toDateString() === today);
    const sectors = [...new Set(allToday.map(e => e.work_center).filter(Boolean))];
    return sectors.map(sector => {
      const sEntries = allToday.filter(e => e.work_center === sector);
      return { sector: sector!, active: sEntries.filter(e => e.status === 'started').length, produced: sEntries.reduce((s, e) => s + e.produced_quantity, 0), rejected: sEntries.reduce((s, e) => s + e.rejected_quantity, 0) };
    });
  }, [entries, today]);

  // Bottleneck detection
  const bottlenecks = useMemo(() => {
    const list: { type: string; entity: string; message: string; severity: 'warning' | 'error' }[] = [];
    // Sectors with high reject rate
    sectorStats.forEach(s => {
      if (s.produced > 0 && s.rejected > 0) {
        const rejectRate = (s.rejected / (s.produced + s.rejected)) * 100;
        if (rejectRate > 10) list.push({ type: 'quality', entity: s.sector, message: `${s.sector}: ${rejectRate.toFixed(0)}% refugo — possível problema de qualidade`, severity: rejectRate > 20 ? 'error' : 'warning' });
      }
    });
    // Operators with very low productivity compared to average
    const avgPcsH = operatorStats.length > 0 ? operatorStats.reduce((s, o) => s + o.pcsPerHour, 0) / operatorStats.length : 0;
    operatorStats.forEach(op => {
      if (op.pcsPerHour > 0 && avgPcsH > 0 && op.pcsPerHour < avgPcsH * 0.5) {
        list.push({ type: 'productivity', entity: op.operator, message: `${op.operator}: ${op.pcsPerHour.toFixed(1)} peças/h — 50%+ abaixo da média (${avgPcsH.toFixed(1)})`, severity: 'warning' });
      }
    });
    // Machines stopped
    stoppedMachines.forEach(m => {
      list.push({ type: 'machine', entity: m.name, message: `Máquina ${m.name} (${m.code}) — ${m.status === 'maintenance' ? 'em manutenção' : 'parada'}`, severity: m.status === 'maintenance' ? 'error' : 'warning' });
    });
    return list;
  }, [sectorStats, operatorStats, stoppedMachines]);

  const alerts = useMemo(() => {
    const list: { type: string; message: string; severity: 'warning' | 'error' }[] = [];
    operatorStats.forEach(op => { if (op.pcsPerHour > 0 && op.pcsPerHour < 10) list.push({ type: 'low_productivity', message: `${op.operator}: ${op.pcsPerHour.toFixed(1)} peças/h — produtividade baixa`, severity: 'warning' }); });
    pausedEntries.forEach(e => { const pausedMin = differenceInMinutes(now, new Date(e.start_time)); if (pausedMin > 30) list.push({ type: 'long_pause', message: `${e.operator} pausado há ${pausedMin}min na OP ${e.order_number}`, severity: 'error' }); });
    return list;
  }, [operatorStats, pausedEntries, now]);

  const allAlerts = [...alerts, ...bottlenecks.map(b => ({ type: b.type, message: b.message, severity: b.severity }))];

  const chartData = operatorStats.slice(0, 10).map(o => ({ name: o.operator.split(' ')[0], pcsH: Number(o.pcsPerHour.toFixed(1)) }));
  const totalProducedToday = todayCompleted.reduce((s, e) => s + e.produced_quantity, 0);

  const machineStatusColors: Record<string, string> = {
    running: 'bg-success/15 border-success/30',
    available: 'bg-muted border-border',
    stopped: 'bg-warning/15 border-warning/30',
    maintenance: 'bg-destructive/15 border-destructive/30',
  };

  return (
    <PageContainer loading={loading}>
      <PageHeader title="🏭 Chão de Fábrica — Tempo Real" description="Monitoramento de operadores, máquinas, setores e gargalos">
        <Badge variant={realtimeActive ? 'default' : 'secondary'} className="flex items-center gap-1.5">
          <Radio className={cn('h-3 w-3', realtimeActive && 'animate-pulse text-green-400')} />
          {realtimeActive ? 'Ao Vivo' : 'Conectando...'}
        </Badge>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard title="Operadores Ativos" value={activeEntries.length} icon={<Users className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Máquinas Rodando" value={runningMachines.length} icon={<Cpu className="h-5 w-5" />} accentColor="success" index={1} />
        <KPICard title="Pausados" value={pausedEntries.length} icon={<Activity className="h-5 w-5" />} accentColor="warning" index={2} />
        <KPICard title="Peças Hoje" value={totalProducedToday} icon={<TrendingUp className="h-5 w-5" />} accentColor="success" index={3} />
        <KPICard title="Eventos Críticos" value={criticalEvents.length} icon={<Zap className="h-5 w-5" />} accentColor={criticalEvents.length > 0 ? 'danger' : 'success'} index={4} />
      </div>

      {allAlerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Alertas e Gargalos</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {allAlerts.map((a, i) => (
                <div key={i} className={cn('p-3 rounded-lg text-sm', a.severity === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning-text')}>⚠️ {a.message}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {machines.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Cpu className="h-4 w-4" /> Status das Máquinas</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {machines.filter(m => m.active).map(m => (
                <div key={m.id} className={cn('p-3 rounded-lg border-2 text-center', machineStatusColors[m.status] || 'bg-muted')}>
                  <p className="font-bold text-sm truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{m.code}</p>
                  <Badge variant="outline" className="text-xs mt-1">
                    {m.status === 'running' ? '▶ Rodando' : m.status === 'available' ? '● Disponível' : m.status === 'maintenance' ? '🔧 Manutenção' : '⏸ Parada'}
                  </Badge>
                  {m.current_operator && <p className="text-xs mt-1 truncate">{m.current_operator}</p>}
                  {m.capacity_per_hour > 0 && <p className="text-xs text-muted-foreground">{m.capacity_per_hour} un/h</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Produtividade por Operador (peças/h)</CardTitle></CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} /><Tooltip />
                  <Bar dataKey="pcsH" radius={[4, 4, 0, 0]}>{chartData.map((_, i) => <Cell key={i} fill={i === 0 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.4)'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-8">Sem dados hoje</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Factory className="h-4 w-4" /> Setores</CardTitle></CardHeader>
          <CardContent>
            {sectorStats.length > 0 ? (
              <div className="space-y-3">
                {sectorStats.map(s => {
                  const rejectPct = (s.produced + s.rejected) > 0 ? (s.rejected / (s.produced + s.rejected)) * 100 : 0;
                  return (
                    <div key={s.sector} className="p-3 rounded-lg bg-muted">
                      <div className="flex justify-between items-center mb-1"><span className="font-medium">{s.sector}</span><Badge variant="outline" className="text-xs">{s.active} ativos</Badge></div>
                      <p className="text-sm text-muted-foreground">{s.produced} peças • {s.rejected} refugo</p>
                      <Progress value={100 - rejectPct} className="h-1.5 mt-1" />
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-center text-muted-foreground py-8">Sem atividade nos setores</p>}
          </CardContent>
        </Card>
      </div>

      {/* Event Feed */}
      <ShopFloorEventFeed events={todayEvents} />

      <Card>
        <CardHeader><CardTitle className="text-base">Operadores — Detalhamento</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Operador</TableHead><TableHead>Status</TableHead><TableHead>OP Atual</TableHead>
              <TableHead>Etapa</TableHead><TableHead className="text-right">Produzido</TableHead>
              <TableHead className="text-right">Refugo</TableHead><TableHead className="text-right">Peças/h</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {operatorStats.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum operador ativo hoje</TableCell></TableRow>
              ) : operatorStats.map(o => (
                <TableRow key={o.operator}>
                  <TableCell className="font-medium">{o.operator}</TableCell>
                  <TableCell><Badge variant={o.isActive ? 'default' : o.isPaused ? 'secondary' : 'outline'} className="text-xs">{o.isActive ? '▶ Produzindo' : o.isPaused ? '⏸ Pausado' : '✓ Concluído'}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{o.currentOP}</TableCell>
                  <TableCell>{o.currentStep}</TableCell>
                  <TableCell className="text-right font-medium">{o.totalProduced}</TableCell>
                  <TableCell className="text-right text-destructive">{o.totalRejected}</TableCell>
                  <TableCell className="text-right"><span className={cn('font-bold', o.pcsPerHour < 10 ? 'text-destructive' : 'text-success')}>{o.pcsPerHour.toFixed(1)}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
