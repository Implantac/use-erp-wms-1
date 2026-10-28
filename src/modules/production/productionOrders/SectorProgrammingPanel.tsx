import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, Palette, Play, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { toast } from 'sonner';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { ProductionScheduleRow } from '@/hooks/production/useProductionSchedule';
import {
  cancelProductionSchedule,
  createClientIdempotencyKey,
  scheduleProductionOrder,
} from '@/services/production/textilePcpService';
import {
  buildSectorProgramming,
  dyeingTransitions,
  resequenceWindows,
  suggestDyeingSequence,
  DYEING_TRANSITION_LABEL,
  type DyeingColorLike,
  type ProgrammingQueue,
} from '@/lib/pcp/sectorProgramming';
import type { SectorKind } from '@/lib/pcp/sectorProfiles';
import { formatNumber } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const MACHINE_MATCH: Record<SectorKind, string[]> = {
  fiacao: ['fia'],
  malharia: ['malhar', 'circular'],
  tecelagem: ['tear'],
  tinturaria: ['tintur', 'jet', 'cuba', 'barca'],
  beneficiamento: ['benefici', 'rama'],
};

const SECTOR_NOUN: Record<SectorKind, string> = {
  fiacao: 'Fiação',
  malharia: 'Malharia',
  tecelagem: 'Tecelagem',
  tinturaria: 'Tinturaria',
  beneficiamento: 'Beneficiamento',
};

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

interface SectorProgrammingPanelProps {
  kind: SectorKind;
  orders: ProductionOrderRow[];
  schedules: ProductionScheduleRow[];
  canOperate: boolean;
  onRefetchSchedules: () => Promise<unknown>;
  onChanged?: () => void;
  onSelectOrder?: (orderId: string) => void;
}

/**
 * Programação do setor na própria central: a fila de cada máquina/recurso
 * (o que entra, em que ordem, quando termina), com atraso e conflito
 * sinalizados, re-sequenciamento em um clique (mantendo as durações
 * planejadas) e programação das OPs que ainda não têm janela — sem sair
 * da central do setor para a tela genérica.
 */
export function SectorProgrammingPanel({
  kind,
  orders,
  schedules,
  canOperate,
  onRefetchSchedules,
  onChanged,
  onSelectOrder,
}: SectorProgrammingPanelProps) {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, { machineId: string; start: string; hours: string }>>({});

  const machinesQuery = useQuery({
    queryKey: ['programming-machines', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('production_machines')
        .select('id, code, name, sector, status, active')
        .eq('company_id', companyId)
        .order('code');
      return (data || []) as any[];
    },
    staleTime: 60_000,
  });
  const allMachines = machinesQuery.data || [];
  const sectorMachines = useMemo(() => {
    const needles = MACHINE_MATCH[kind];
    return allMachines.filter((m) => needles.some((n) => normalize(String(m.sector || '')).includes(n)));
  }, [allMachines, kind]);
  const schedulableMachines = sectorMachines.filter(
    (m) => m.active && !['maintenance', 'inactive', 'down'].includes(String(m.status || '').toLowerCase()),
  );

  const dyeingQuery = useQuery({
    queryKey: ['programming-dyeing-colors', companyId],
    enabled: !!companyId && kind === 'tinturaria',
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('dyeing_order_profiles')
        .select('production_order_id, color_name, color_code, lab_l')
        .eq('company_id', companyId);
      return (data || []) as any[];
    },
    staleTime: 60_000,
  });
  const dyeByOrder = useMemo(() => {
    const map = new Map<string, DyeingColorLike>();
    for (const p of dyeingQuery.data || []) {
      map.set(p.production_order_id, {
        orderId: p.production_order_id,
        colorName: p.color_name,
        colorCode: p.color_code,
        labL: p.lab_l != null ? Number(p.lab_l) : null,
      });
    }
    return map;
  }, [dyeingQuery.data]);

  const prog = useMemo(
    () =>
      buildSectorProgramming({
        orders,
        schedules,
        machines: allMachines.map((m) => ({ id: m.id, code: m.code, name: m.name })),
      }),
    [orders, schedules, allMachines],
  );
  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);

  const refresh = async () => {
    await onRefetchSchedules();
    onChanged?.();
  };

  const applyResequence = async (queue: ProgrammingQueue, orderedIds: string[]) => {
    const changes = resequenceWindows(
      queue.slots.map((s) => ({
        scheduleId: s.scheduleId,
        orderId: s.order.id,
        plannedStart: s.plannedStart,
        plannedEnd: s.plannedEnd,
        started: s.started,
      })),
      orderedIds,
    );
    if (changes.length === 0) {
      toast.info('A fila já está nessa ordem e horários.');
      return;
    }
    setBusyKey(queue.key);
    try {
      for (const c of changes) await cancelProductionSchedule(c.scheduleId);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao liberar as janelas para re-sequenciar');
      setBusyKey(null);
      return;
    }
    let created = 0;
    const failed: string[] = [];
    for (const c of [...changes].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))) {
      const orig = scheduleById.get(c.scheduleId);
      try {
        await scheduleProductionOrder({
          productionOrderId: c.orderId,
          plannedStart: c.plannedStart,
          plannedEnd: c.plannedEnd,
          idempotencyKey: createClientIdempotencyKey('resequence'),
          machineId: orig?.machine_id ?? null,
          resourceId: orig?.resource_id ?? null,
          workCenter: orig?.work_center ?? null,
          sector: orig?.sector ?? null,
          shift: orig?.shift || 'diurno',
        });
        created += 1;
      } catch {
        failed.push(queue.slots.find((s) => s.order.id === c.orderId)?.order.order_number || c.orderId.slice(0, 8));
      }
    }
    await refresh();
    if (created > 0) toast.success(`Fila reordenada: ${created} janela(s) recalculadas mantendo as durações planejadas.`);
    if (failed.length > 0) toast.error(`Não reprogramei ${failed.join(', ')} — ficaram em "Sem programação" para você decidir.`);
    setBusyKey(null);
  };

  const move = (queue: ProgrammingQueue, index: number, dir: -1 | 1) => {
    const ids = queue.slots.map((s) => s.order.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void applyResequence(queue, ids);
  };

  const cancelSlot = async (queue: ProgrammingQueue, scheduleId: string, orderNumber: string) => {
    setBusyKey(queue.key);
    try {
      await cancelProductionSchedule(scheduleId);
      toast.success(`Janela da ${orderNumber} cancelada — capacidade liberada.`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao cancelar a janela');
    }
    setBusyKey(null);
  };

  const applyColorOrder = (queue: ProgrammingQueue) => {
    const startedIds = queue.slots.filter((s) => s.started).map((s) => s.order.id);
    const movable = queue.slots.filter((s) => !s.started);
    const suggestion = suggestDyeingSequence(movable.map((s) => dyeByOrder.get(s.order.id) || { orderId: s.order.id }));
    void applyResequence(queue, [...startedIds, ...suggestion.orderedIds]);
  };

  const formOf = (order: { id: string; estimated_time_minutes?: number | null }) =>
    forms[order.id] || {
      machineId: '',
      start: '',
      hours: (order.estimated_time_minutes ?? 0) > 0 ? String(Math.max(1, Math.ceil((order.estimated_time_minutes ?? 0) / 60))) : '',
    };

  const programOrder = async (order: { id: string; order_number: string; estimated_time_minutes?: number | null }) => {
    const f = formOf(order);
    const start = new Date(f.start);
    const hours = Number(f.hours);
    if (!f.machineId) return toast.error('Escolha a máquina/recurso da OP.');
    if (!Number.isFinite(start.getTime())) return toast.error('Informe o início planejado.');
    if (!Number.isFinite(hours) || hours <= 0) return toast.error('Informe a duração em horas.');
    setBusyKey(`unscheduled-${order.id}`);
    try {
      await scheduleProductionOrder({
        productionOrderId: order.id,
        plannedStart: start.toISOString(),
        plannedEnd: new Date(start.getTime() + hours * 3_600_000).toISOString(),
        idempotencyKey: createClientIdempotencyKey('schedule'),
        machineId: f.machineId,
        sector: SECTOR_NOUN[kind],
      });
      toast.success(`${order.order_number} programada.`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao programar a OP');
    }
    setBusyKey(null);
  };

  const unscheduledDisplay = useMemo(() => {
    if (kind !== 'tinturaria') return prog.unscheduled;
    const suggestion = suggestDyeingSequence(prog.unscheduled.map((o) => dyeByOrder.get(o.id) || { orderId: o.id }));
    const rank = new Map(suggestion.orderedIds.map((id, i) => [id, i]));
    return [...prog.unscheduled].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
  }, [prog.unscheduled, kind, dyeByOrder]);

  const dyeChip = (orderId: string) => {
    const dye = dyeByOrder.get(orderId);
    if (!dye || (!dye.colorName && !dye.colorCode && dye.labL == null)) return null;
    return (
      <Badge variant="outline" className="gap-1 text-[9px] font-bold">
        <Palette className="h-3 w-3" />
        {dye.colorName || dye.colorCode}
        {dye.labL != null ? ` · L* ${dye.labL}` : ''}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <CalendarClock className="h-4 w-4" /> Programação do setor — fila por máquina
        </CardTitle>
        <CardDescription>
          O que entra em cada máquina, em que ordem e quando termina. ↑↓ reordena a fila recalculando as
          janelas <strong>mantendo as durações planejadas</strong>; quem já começou não sai do lugar.
          {!canOperate && ' Seu nível neste setor é de consulta: a programação é do operador/gerente do setor.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {prog.queues.length === 0 && prog.unscheduled.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma OP programável neste setor agora. Crie a OP e ela aparece aqui para entrar na fila.
          </p>
        )}

        {prog.queues.map((queue) => {
          const busy = busyKey === queue.key;
          const movableCount = queue.slots.filter((s) => !s.started).length;
          const queueTransitions =
            kind === 'tinturaria'
              ? dyeingTransitions(queue.slots.filter((s) => !s.started).map((s) => dyeByOrder.get(s.order.id) || { orderId: s.order.id }))
              : [];
          const lightening = queueTransitions.filter((t) => t.kind === 'mais-clara').length;
          const transitionByOrder = new Map(queueTransitions.map((t) => [t.orderId, t.kind]));
          return (
            <div key={queue.key} className="rounded-lg border">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
                <p className="text-xs font-black uppercase tracking-widest flex-1">{queue.label}</p>
                <Badge variant="outline" className="text-[9px] font-bold">{queue.slots.length} na fila</Badge>
                {kind === 'tinturaria' && lightening > 0 && (
                  <Badge className="bg-amber-500/10 text-amber-600 text-[9px] font-black uppercase">
                    {lightening} clareamento(s) na sequência — lavagem extra provável
                  </Badge>
                )}
                {kind === 'tinturaria' && canOperate && movableCount >= 2 && (
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px] font-bold" disabled={busy} onClick={() => applyColorOrder(queue)}>
                    <Palette className="h-3 w-3" /> Ordenar por cor (claro→escuro)
                  </Button>
                )}
              </div>
              <div className="divide-y">
                {queue.slots.map((slot, idx) => (
                  <div key={slot.scheduleId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="w-6 text-center text-xs font-black text-muted-foreground">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="text-xs font-bold hover:underline"
                        onClick={() => onSelectOrder?.(slot.order.id)}
                        title="Abrir esta OP na central"
                      >
                        {slot.order.order_number} — {slot.order.product_name}
                      </button>
                      <p className="text-[11px] text-muted-foreground">
                        {fmtDT(slot.plannedStart)} → {fmtDT(slot.plannedEnd)} · falta{' '}
                        {formatNumber(Math.max(0, slot.order.quantity - slot.order.produced_quantity))} {slot.order.unit}
                        {slot.order.due_date ? ` · entrega ${new Date(slot.order.due_date).toLocaleDateString('pt-BR')}` : ''}
                      </p>
                    </div>
                    {kind === 'tinturaria' && dyeChip(slot.order.id)}
                    {kind === 'tinturaria' && transitionByOrder.get(slot.order.id) && (
                      <span
                        className={cn(
                          'text-[10px] font-bold',
                          transitionByOrder.get(slot.order.id) === 'mais-clara' ? 'text-amber-600' : 'text-muted-foreground',
                        )}
                      >
                        {DYEING_TRANSITION_LABEL[transitionByOrder.get(slot.order.id) as keyof typeof DYEING_TRANSITION_LABEL]}
                      </span>
                    )}
                    {slot.started && <Badge className="bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase"><Play className="mr-1 h-3 w-3" />Em execução</Badge>}
                    {slot.isLate && !slot.started && <Badge className="bg-red-500/10 text-red-600 text-[9px] font-black uppercase">Atrasada</Badge>}
                    {slot.hasConflict && (
                      <Badge className="bg-amber-500/10 text-amber-600 text-[9px] font-black uppercase">
                        <AlertTriangle className="mr-1 h-3 w-3" />Conflito
                      </Badge>
                    )}
                    {canOperate && (
                      <span className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={busy || idx === 0 || slot.started} onClick={() => move(queue, idx, -1)} title="Subir na fila">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={busy || idx === queue.slots.length - 1 || slot.started} onClick={() => move(queue, idx, 1)} title="Descer na fila">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        {!slot.started && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" disabled={busy} onClick={() => void cancelSlot(queue, slot.scheduleId, slot.order.order_number)} title="Cancelar janela">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {prog.unscheduled.length > 0 && (
          <div className="rounded-lg border border-dashed">
            <div className="border-b bg-muted/20 px-3 py-2">
              <p className="text-xs font-black uppercase tracking-widest">
                Sem programação ({prog.unscheduled.length})
              </p>
              <p className="text-[11px] text-muted-foreground">
                {kind === 'tinturaria'
                  ? 'Ordenadas pela sequência econômica de cor (claro→escuro). Escolha máquina, início e duração para entrar na fila.'
                  : 'Por prioridade e prazo. Escolha máquina, início e duração para entrar na fila.'}
              </p>
            </div>
            <div className="divide-y">
              {unscheduledDisplay.map((order) => {
                const f = formOf(order);
                const busy = busyKey === `unscheduled-${order.id}`;
                return (
                  <div key={order.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-[180px] flex-1">
                      <button type="button" className="text-xs font-bold hover:underline" onClick={() => onSelectOrder?.(order.id)}>
                        {order.order_number} — {order.product_name}
                      </button>
                      <p className="text-[11px] text-muted-foreground">
                        {formatNumber(order.quantity)} {order.unit} · prioridade {order.priority || '—'}
                        {order.due_date ? ` · entrega ${new Date(order.due_date).toLocaleDateString('pt-BR')}` : ''}
                      </p>
                    </div>
                    {kind === 'tinturaria' && dyeChip(order.id)}
                    {canOperate && (
                      <>
                        <Select
                          value={f.machineId}
                          onValueChange={(v) => setForms((prev) => ({ ...prev, [order.id]: { ...formOf(order), machineId: v } }))}
                        >
                          <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Máquina" /></SelectTrigger>
                          <SelectContent>
                            {schedulableMachines.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="datetime-local"
                          className="h-8 w-[180px] text-xs"
                          value={f.start}
                          onChange={(e) => setForms((prev) => ({ ...prev, [order.id]: { ...formOf(order), start: e.target.value } }))}
                        />
                        <span className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0.5}
                            step="0.5"
                            className="h-8 w-[70px] text-xs"
                            value={f.hours}
                            onChange={(e) => setForms((prev) => ({ ...prev, [order.id]: { ...formOf(order), hours: e.target.value } }))}
                          />
                          <span className="text-[11px] text-muted-foreground">h</span>
                        </span>
                        <Button size="sm" className="h-8 text-xs font-bold" disabled={busy} onClick={() => void programOrder(order)}>
                          Programar
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {canOperate && prog.unscheduled.length > 0 && schedulableMachines.length === 0 && (
          <p className="text-[11px] text-amber-600">
            Nenhuma máquina ativa deste setor para programar. Cadastre/ative em Produção → Máquinas (com o setor
            da máquina preenchido).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
