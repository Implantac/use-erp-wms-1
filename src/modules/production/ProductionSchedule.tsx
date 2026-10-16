import { useState, useMemo } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { useProductionSchedule, type ProductionScheduleRow } from '@/hooks/production/useProductionSchedule';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { Calendar, Clock, Factory, Plus, AlertTriangle } from 'lucide-react';
import { format, parseISO, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export default function ProductionSchedulePage() {
  const { schedules, loading, loadError, hasCompany, create, update } = useProductionSchedule();
  const { orders } = useProductionOrders();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [sector, setSector] = useState('');
  const [shift, setShift] = useState('diurno');

  const unscheduledOrders = orders.filter(
    o => ['planned', 'in_progress'].includes(o.status) && !schedules.some(s => s.production_order_id === o.id)
  );

  const enriched = useMemo(() => {
    return schedules.map(s => ({ ...s, order: orders.find(o => o.id === s.production_order_id) }))
      .sort((a, b) => new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime());
  }, [schedules, orders]);

  const now = new Date();
  const lateCount = enriched.filter(s => s.status !== 'completed' && isAfter(now, new Date(s.planned_end))).length;
  const inExecution = enriched.filter(s => s.actual_start && !s.actual_end).length;

  const handleCreate = async () => {
    if (!selectedOrderId || !plannedStart || !plannedEnd) { toast.error('Preencha todos os campos obrigatórios'); return; }
    const start = new Date(plannedStart).getTime();
    const end = new Date(plannedEnd).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      toast.error('O fim planejado deve ser posterior ao início'); return;
    }
    if (!await create({ production_order_id: selectedOrderId, planned_start: plannedStart, planned_end: plannedEnd, sector, shift })) return;
    setShowCreate(false); setSelectedOrderId(''); setPlannedStart(''); setPlannedEnd(''); setSector('');
  };

  const getStatusBadge = (s: ProductionScheduleRow) => {
    const isLate = s.status !== 'completed' && isAfter(now, new Date(s.planned_end));
    if (isLate) return <Badge variant="destructive">Atrasado</Badge>;
    if (s.status === 'completed') return <Badge className="bg-success/15 text-success border-success/30">Janela encerrada</Badge>;
    if (s.actual_start) return <Badge className="bg-warning/15 text-warning border-warning/30">Janela iniciada</Badge>;
    return <Badge variant="outline">Agendado</Badge>;
  };

  return (
    <PageContainer loading={loading}>
      <PageHeader title="Agendamento de Produção" description="Janelas planejadas por empresa. Não reserva capacidade nem sincroniza automaticamente o estado da OP.">
        <Button disabled={loadError || !hasCompany} onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" /> Agendar OP</Button>
      </PageHeader>

      {!hasCompany && <p role="alert" className="text-sm text-muted-foreground">Selecione uma empresa para consultar a programação.</p>}
      {loadError && <p role="alert" className="text-sm text-destructive">Falha na leitura da programação; não interprete a lista vazia como ausência de agendamentos.</p>}
      {hasCompany && !loadError && <>
      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="Total Agendados" value={enriched.length} icon={<Calendar className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Janelas iniciadas" value={inExecution} icon={<Factory className="h-5 w-5" />} accentColor="warning" index={1} />
        <KPICard title="Atrasados" value={lateCount} icon={<AlertTriangle className="h-5 w-5" />} accentColor="danger" index={2} />
        <KPICard title="Sem Agendamento" value={unscheduledOrders.length} icon={<Clock className="h-5 w-5" />} accentColor="info" index={3} />
      </div>

      <Card>
        <CardHeader><CardTitle>Programação</CardTitle></CardHeader>
        <CardContent>
          {enriched.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="Nenhum agendamento criado"
              description={loadError ? 'Consulta indisponível; atualize antes de agendar.' : unscheduledOrders.length > 0
                ? `Você tem ${unscheduledOrders.length} ordem(ns) aguardando agendamento.`
                : 'Crie uma ordem de produção primeiro para poder agendá-la.'}
              action={unscheduledOrders.length > 0
                ? { label: 'Agendar OP', onClick: () => setShowCreate(true), icon: Plus }
                : undefined}
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>OP</TableHead><TableHead>Produto</TableHead><TableHead>Início Plan.</TableHead>
                <TableHead>Fim Plan.</TableHead><TableHead>Setor</TableHead><TableHead>Turno</TableHead>
                <TableHead>Status</TableHead><TableHead>Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {enriched.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.order?.order_number || '—'}</TableCell>
                    <TableCell>{s.order?.product_name || '—'}</TableCell>
                    <TableCell>{format(parseISO(s.planned_start), 'dd/MM HH:mm', { locale: ptBR })}</TableCell>
                    <TableCell>{format(parseISO(s.planned_end), 'dd/MM HH:mm', { locale: ptBR })}</TableCell>
                    <TableCell>{s.sector || '—'}</TableCell>
                    <TableCell><Badge variant="outline">{s.shift}</Badge></TableCell>
                    <TableCell>{getStatusBadge(s)}</TableCell>
                    <TableCell>
                      {!s.actual_start && <Button size="sm" variant="outline" onClick={() => void update(s.id, 'start')}>Iniciar</Button>}
                      {s.actual_start && !s.actual_end && <Button size="sm" variant="outline" onClick={() => void update(s.id, 'end')} title="Encerra somente esta janela; não conclui a OP">Encerrar janela</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      </>}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agendar Ordem de Produção</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Ordem de Produção</label>
              <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                <SelectTrigger><SelectValue placeholder="Selecione a OP" /></SelectTrigger>
                <SelectContent>{unscheduledOrders.map(o => <SelectItem key={o.id} value={o.id}>{o.order_number} — {o.product_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Início Planejado</label><Input type="datetime-local" value={plannedStart} onChange={e => setPlannedStart(e.target.value)} /></div>
              <div><label className="text-sm font-medium">Fim Planejado</label><Input type="datetime-local" value={plannedEnd} onChange={e => setPlannedEnd(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Setor</label><Input value={sector} onChange={e => setSector(e.target.value)} placeholder="Ex: Costura" /></div>
              <div><label className="text-sm font-medium">Turno</label>
                <Select value={shift} onValueChange={setShift}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="diurno">Diurno</SelectItem><SelectItem value="noturno">Noturno</SelectItem><SelectItem value="misto">Misto</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Agendar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
