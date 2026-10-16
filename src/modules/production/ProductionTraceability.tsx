import { useState, useMemo } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Badge } from '@/ui/base/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { useProductionLogs } from '@/hooks/production/useProductionLogs';
import { Search, History, User, Clock, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

const eventTypeConfig: Record<string, { label: string; color: string; icon: string }> = {
  start: { label: 'Início', color: 'bg-info/15 text-info border-info/30', icon: '▶️' },
  pause: { label: 'Pausa', color: 'bg-warning/15 text-warning border-warning/30', icon: '⏸️' },
  resume: { label: 'Retomada', color: 'bg-success/15 text-success border-success/30', icon: '🔄' },
  complete: { label: 'Finalização', color: 'bg-success/15 text-success border-success/30', icon: '✅' },
  quality_check: { label: 'Qualidade', color: 'bg-primary/15 text-primary border-primary/30', icon: '🔍' },
  defect: { label: 'Defeito', color: 'bg-destructive/15 text-destructive border-destructive/30', icon: '❌' },
  info: { label: 'Info', color: 'bg-muted text-muted-foreground border-border', icon: 'ℹ️' },
  material: { label: 'Material', color: 'bg-warning/15 text-warning border-warning/30', icon: '📦' },
};

export default function ProductionTraceabilityPage() {
  const { logs, loading, loadError, hasCompany } = useProductionLogs();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [operatorFilter, setOperatorFilter] = useState('all');

  const operators = useMemo(() => [...new Set(logs.map(l => l.operator).filter(Boolean))], [logs]);
  const eventTypes = useMemo(() => [...new Set(logs.map(l => l.event_type))], [logs]);

  const filtered = useMemo(() => logs.filter(l => {
    const matchSearch = !search || (l.operator || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.description || '').toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || l.event_type === typeFilter;
    const matchOp = operatorFilter === 'all' || l.operator === operatorFilter;
    return matchSearch && matchType && matchOp;
  }), [logs, search, typeFilter, operatorFilter]);

  // Group by date for timeline
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach(l => {
      const day = format(parseISO(l.created_at), 'yyyy-MM-dd');
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(l);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const defects = logs.filter(l => l.event_type === 'defect').length;

  return (
    <PageContainer loading={loading}>
      <PageHeader title="Rastreabilidade de Produção" description="Últimos 200 logs da empresa ativa. Não é genealogia de lotes nem prova de recall completo." />

      {!hasCompany && <p role="alert" className="text-sm text-muted-foreground">Selecione uma empresa para consultar os registros.</p>}
      {loadError && <p role="alert" className="text-sm text-destructive">Falha ao consultar logs; não é possível confirmar os eventos.</p>}
      {hasCompany && !loadError && <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard title="Logs na amostra (até 200)" value={logs.length} icon={<History className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Nomes informados" value={operators.length} icon={<User className="h-5 w-5" />} accentColor="info" index={1} />
        <KPICard title="Defeitos" value={defects} icon={<Clock className="h-5 w-5" />} accentColor={defects > 0 ? 'danger' : 'success'} index={2} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar operador, descrição..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Tipos</SelectItem>
                {eventTypes.map(t => (
                  <SelectItem key={t} value={t}>{eventTypeConfig[t]?.icon || ''} {eventTypeConfig[t]?.label || t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={operatorFilter} onValueChange={setOperatorFilter}>
              <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Operador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Operadores</SelectItem>
                {operators.map(o => <SelectItem key={o!} value={o!}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">📍 Timeline</TabsTrigger>
          <TabsTrigger value="table">📋 Tabela</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4 space-y-6">
          {grouped.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum evento encontrado</CardContent></Card>
          ) : grouped.map(([day, events]) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="outline" className="text-xs font-mono">{format(parseISO(day), 'dd/MM/yyyy')}</Badge>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">{events.length} eventos</span>
              </div>
              <div className="relative ml-4 border-l-2 border-border pl-6 space-y-3">
                {events.slice(0, 50).map(l => {
                  const cfg = eventTypeConfig[l.event_type] || { label: l.event_type, color: 'bg-muted text-muted-foreground border-border', icon: '📌' };
                  return (
                    <div key={l.id} className="relative">
                      <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-background border-2 border-primary flex items-center justify-center text-[8px]">
                        {cfg.icon.length > 2 ? '' : cfg.icon}
                      </div>
                      <div className={cn('p-3 rounded-lg border', cfg.color)}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{cfg.icon}</span>
                            <Badge variant="outline" className="text-[10px]">{cfg.label}</Badge>
                            {l.operator && <span className="text-xs font-medium">{l.operator}</span>}
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">{format(parseISO(l.created_at), 'HH:mm:ss')}</span>
                        </div>
                        {l.description && <p className="text-sm mt-1">{l.description}</p>}
                        {l.quantity && l.quantity > 0 && (
                          <span className="text-xs mt-1 inline-block">Quantidade: <strong>{l.quantity}</strong></span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data/Hora</TableHead><TableHead>Tipo</TableHead><TableHead>Operador</TableHead>
                  <TableHead>Quantidade</TableHead><TableHead>Descrição</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum evento registrado</TableCell></TableRow>
                  ) : filtered.slice(0, 200).map(l => {
                    const cfg = eventTypeConfig[l.event_type] || { label: l.event_type, color: 'bg-muted text-muted-foreground', icon: '📌' };
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs font-mono">{format(parseISO(l.created_at), 'dd/MM HH:mm')}</TableCell>
                        <TableCell><Badge className={cn('text-xs', cfg.color)}>{cfg.icon} {cfg.label}</Badge></TableCell>
                        <TableCell>{l.operator || '-'}</TableCell>
                        <TableCell>{l.quantity ?? '—'} (unidade não registrada)</TableCell>
                        <TableCell className="max-w-xs truncate">{l.description || '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </>}
    </PageContainer>
  );
}
