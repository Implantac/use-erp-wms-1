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
import { useProductionResources } from '@/hooks/production/useProductionResources';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import { Calendar, Clock, Factory, Plus, AlertTriangle } from 'lucide-react';
import { format, parseISO, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { detectScheduleConflicts, findCandidateScheduleConflicts, type ScheduleSlotLike } from '@/lib/pcp/capacityConflicts';

function scheduleResourceKey(schedule: Pick<ProductionScheduleRow, 'resource_id' | 'machine_id' | 'work_center' | 'sector' | 'shift'>): string | null {
  if (schedule.machine_id) return `machine:${schedule.machine_id}`;
  if (schedule.resource_id) return `resource:${schedule.resource_id}`;
  const workCenter = schedule.work_center?.trim();
  if (workCenter) return workCenter;
  const sector = schedule.sector?.trim();
  return sector ? `${sector} · ${schedule.shift?.trim() || 'sem turno'}` : null;
}

export default function ProductionSchedulePage() {
  const { schedules, loading, loadError, hasCompany, create, update, cancel } = useProductionSchedule();
  const { orders } = useProductionOrders();
  const { resources } = useProductionResources();
  const { machines } = useProductionMachines();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [sector, setSector] = useState('');
  const [workCenter, setWorkCenter] = useState('');
  const [resourceId, setResourceId] = useState('__none__');
  const [machineId, setMachineId] = useState('__none__');
  const [shift, setShift] = useState('diurno');

  const unscheduledOrders = orders.filter(
    o => ['planned', 'in_progress', 'waiting_material', 'paused'].includes(o.status)
      && !schedules.some(s => s.production_order_id === o.id && ['scheduled', 'in_progress'].includes(s.status ?? ''))
  );

  const enriched = useMemo(() => {
    return schedules.map(s => ({ ...s, order: orders.find(o => o.id === s.production_order_id) }))
      .sort((a, b) => new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime());
  }, [schedules, orders]);

  const scheduleSlots = useMemo<ScheduleSlotLike[]>(() => enriched.map(s => ({
    id: s.id,
    orderNumber: s.order?.order_number,
    resourceKey: scheduleResourceKey(s),
    plannedStart: s.planned_start,
    plannedEnd: s.planned_end,
    status: s.status,
  })), [enriched]);
  const conflicts = useMemo(() => detectScheduleConflicts(scheduleSlots), [scheduleSlots]);
  const conflictIds = useMemo(() => new Set(conflicts.flatMap(c => [c.firstId, c.secondId])), [conflicts]);
  const slotsWithoutResource = enriched.filter(s => !['completed', 'cancelled'].includes(s.status || '') && !scheduleResourceKey(s)).length;

  const now = new Date();
  const lateCount = enriched.filter(s => !['completed', 'cancelled'].includes(s.status || '') && isAfter(now, new Date(s.planned_end))).length;
  const inExecution = enriched.filter(s => s.actual_start && !s.actual_end && s.status !== 'cancelled').length;

  const resourceLabel = (s: ProductionScheduleRow) => {
    if (s.machine_id) {
      const machine = machines.find(m => m.id === s.machine_id);
      return machine ? `${machine.code} — ${machine.name}` : `Máquina ${s.machine_id.slice(0, 8)}`;
    }
    if (s.resource_id) {
      const resource = resources.find(r => r.id === s.resource_id);
      return resource ? `${resource.code} — ${resource.name}` : `Recurso ${s.resource_id.slice(0, 8)}`;
    }
    return s.work_center || '—';
  };

  const handleCreate = async () => {
    if (!selectedOrderId || !plannedStart || !plannedEnd) { toast.error('Preencha OP, início e fim planejados'); return; }
    const start = new Date(plannedStart).getTime();
    const end = new Date(plannedEnd).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      toast.error('O fim planejado deve ser posterior ao início'); return;
    }
    const selectedOrder = orders.find(o => o.id === selectedOrderId);
    const selectedMachine = machineId !== '__none__' ? machines.find(m => m.id === machineId) : null;
    const selectedResource = resourceId !== '__none__' ? resources.find(r => r.id === resourceId) : null;
    const candidateResource = selectedMachine
      ? `machine:${selectedMachine.id}`
      : selectedResource
        ? `resource:${selectedResource.id}`
        : workCenter.trim() || (sector.trim() ? `${sector.trim()} · ${shift}` : null);
    const candidateConflicts = findCandidateScheduleConflicts(scheduleSlots, {
      id: '__candidate__',
      orderNumber: selectedOrder?.order_number,
      resourceKey: candidateResource,
      plannedStart: new Date(start).toISOString(),
      plannedEnd: new Date(end).toISOString(),
      status: 'scheduled',
    });
    if (candidateConflicts.length) {
      toast.error('Conflito de programação: já existe janela sobreposta para este recurso/máquina/centro. Ajuste o recurso ou o horário.');
      return;
    }
    if (!await create({
      production_order_id: selectedOrderId,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      sector,
      work_center: workCenter,
      resource_id: resourceId === '__none__' ? null : resourceId,
      machine_id: machineId === '__none__' ? null : machineId,
      shift,
    })) return;
    setShowCreate(false); setSelectedOrderId(''); setPlannedStart(''); setPlannedEnd('');
    setSector(''); setWorkCenter(''); setResourceId('__none__'); setMachineId('__none__'); setShift('diurno');
  };

  const getStatusBadge = (s: ProductionScheduleRow) => {
    const isLate = !['completed', 'cancelled'].includes(s.status || '') && isAfter(now, new Date(s.planned_end));
    if (s.status === 'cancelled') return <Badge variant="secondary">Cancelado</Badge>;
    if (isLate) return <Badge variant="destructive">Atrasado</Badge>;
    if (s.status === 'completed') return <Badge className="bg-success/15 text-success border-success/30">Janela encerrada</Badge>;
    if (s.actual_start) return <Badge className="bg-warning/15 text-warning border-warning/30">Janela iniciada</Badge>;
    return <Badge variant="outline">Agendado</Badge>;
  };

  return (
    <PageContainer loading={loading}>
      <PageHeader title="Agendamento de Produção" description="Capacidade finita validada no banco por recurso, máquina/tear ou centro. Agendar não conclui a OP.">
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

      {(conflicts.length > 0 || slotsWithoutResource > 0) && (
        <Card className={conflicts.length ? 'border-destructive/50' : 'border-warning/50'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4" />
              {conflicts.length > 0
                ? `${conflicts.length} conflito(s) de capacidade visível(is) na programação atual`
                : 'Capacidade não verificável em parte da programação'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {conflicts.slice(0, 5).map(conflict => (
              <p key={`${conflict.firstId}-${conflict.secondId}`}>
                <strong>{conflict.resourceKey}</strong>: {conflict.firstOrderNumber || conflict.firstId} × {conflict.secondOrderNumber || conflict.secondId}
                {' '}— sobreposição de {conflict.overlapMinutes} min. Reprograme ou cancele uma janela; a RPC também rejeita nova dupla alocação para o mesmo recurso/máquina/centro.
              </p>
            ))}
            {slotsWithoutResource > 0 && (
              <p className="text-muted-foreground">{slotsWithoutResource} janela(s) sem recurso, máquina, centro ou setor registrado não puderam ser validadas visualmente.</p>
            )}
          </CardContent>
        </Card>
      )}

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
                <TableHead>Fim Plan.</TableHead><TableHead>Setor</TableHead><TableHead>Recurso/Máquina/Centro</TableHead><TableHead>Turno</TableHead>
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
                    <TableCell>{resourceLabel(s)}</TableCell>
                    <TableCell><Badge variant="outline">{s.shift}</Badge></TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{getStatusBadge(s)}{conflictIds.has(s.id) && <Badge variant="destructive">Conflito</Badge>}</div></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {!s.actual_start && s.status === 'scheduled' && <Button size="sm" variant="outline" onClick={() => void update(s.id, 'start')}>Iniciar</Button>}
                        {s.actual_start && !s.actual_end && s.status === 'in_progress' && <Button size="sm" variant="outline" onClick={() => void update(s.id, 'end')} title="Encerra somente esta janela; não conclui a OP">Encerrar janela</Button>}
                        {!s.actual_end && !['completed', 'cancelled'].includes(s.status || '') && <Button size="sm" variant="ghost" onClick={() => void cancel(s.id)}>Cancelar</Button>}
                      </div>
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
              <div><label className="text-sm font-medium">Setor</label><Input value={sector} onChange={e => setSector(e.target.value)} placeholder="Ex: Tecelagem" /></div>
              <div><label className="text-sm font-medium">Centro/Recurso (texto, se não usar cadastro)</label><Input value={workCenter} onChange={e => setWorkCenter(e.target.value)} placeholder="Ex: Tear 01" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Recurso/tear cadastrado</label>
                <Select value={resourceId} onValueChange={setResourceId}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">Usar centro/setor</SelectItem>{resources.filter(r => r.is_active).map(r => <SelectItem key={r.id} value={r.id}>{r.code} — {r.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Máquina/tear cadastrada</label>
                <Select value={machineId} onValueChange={setMachineId}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">Usar centro/setor</SelectItem>{machines.filter(m => m.active).map(m => <SelectItem key={m.id} value={m.id}>{m.code} — {m.name} ({m.status})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Turno</label>
              <Select value={shift} onValueChange={setShift}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="diurno">Diurno</SelectItem><SelectItem value="noturno">Noturno</SelectItem><SelectItem value="misto">Misto</SelectItem></SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">A RPC bloqueia a janela contra dupla alocação do mesmo recurso, máquina/tear ou centro no período. Se nenhum recurso for informado, a validação usa setor/turno apenas como chave operacional informada.</p>
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
