import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import {
  recordSectorEvent,
  upsertSectorOrderProfile,
  type SectorEventRow,
  type SectorOrderProfileRow,
  type SectorProfileKind,
} from '@/services/production/textilePcpService';
import {
  DEVIATION_CAUSE_STATUSES,
  SECTOR_DEVIATION_CATEGORIES,
  SECTOR_EVENT_QUANTITY_UNIT,
  SECTOR_EVENT_TYPES,
  SECTOR_LABELS,
  deviationCategoryLabel,
  sectorEventLabel,
  type SectorKind,
} from '@/lib/pcp/sectorProfiles';
import { machineMatchesSector } from '@/lib/pcp/productFilters';
import { formatNumber } from '@/lib/formatters';

const NONE = '__none__';

const numberOrNull = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const numStr = (value: number | null | undefined) =>
  value !== null && value !== undefined ? String(value) : '';

interface ProfileProps {
  order: ProductionOrderRow;
  profile: SectorOrderProfileRow | null;
  onChanged: () => Promise<void> | void;
}

function MachineSelect({ value, onChange, kind }: { value: string; onChange: (value: string) => void; kind: SectorKind }) {
  const { machines } = useProductionMachines();
  const sectorMachines = machines.filter((machine) => machineMatchesSector(machine.sector, kind));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Não informado</SelectItem>
        {sectorMachines.map((machine) => (
          <SelectItem key={machine.id} value={machine.id}>{machine.code} — {machine.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProfileShell({
  title,
  description,
  saving,
  onSave,
  children,
}: {
  title: string;
  description: string;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">{children}</div>
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar perfil do setor'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

const PROFILE_DESCRIPTION =
  'Campos executáveis da ordem: máquina, centro e parâmetros configurados da empresa. Nenhum valor é sugerido automaticamente.';

export function SpinningProfilePanel({ order, profile, onChanged }: ProfileProps) {
  const [form, setForm] = useState({ machineId: NONE, workCenter: '', targetTitle: '', twistPerM: '', plannedOutputKg: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      machineId: profile?.machine_id ?? NONE,
      workCenter: profile?.work_center ?? order.work_center ?? '',
      targetTitle: profile?.target_title ?? '',
      twistPerM: numStr(profile?.twist_per_m),
      plannedOutputKg: numStr(profile?.planned_output_kg),
      notes: profile?.notes ?? '',
    });
  }, [profile, order.id, order.work_center]);

  const save = async () => {
    setSaving(true);
    try {
      await upsertSectorOrderProfile(order.id, 'fiacao', {
        machine_id: form.machineId === NONE ? null : form.machineId,
        work_center: form.workCenter.trim() || null,
        target_title: form.targetTitle.trim() || null,
        twist_per_m: numberOrNull(form.twistPerM),
        planned_output_kg: numberOrNull(form.plannedOutputKg),
        notes: form.notes.trim() || null,
      });
      toast.success('Perfil de fiação salvo');
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar perfil de fiação');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileShell title="Perfil técnico de fiação da OP" description={PROFILE_DESCRIPTION} saving={saving} onSave={save}>
      <Field label="Filatório/máquina"><MachineSelect kind="fiacao" value={form.machineId} onChange={(v) => setForm({ ...form, machineId: v })} /></Field>
      <Field label="Centro de trabalho"><Input value={form.workCenter} onChange={(e) => setForm({ ...form, workCenter: e.target.value })} /></Field>
      <Field label="Título do fio alvo (configurado)"><Input value={form.targetTitle} onChange={(e) => setForm({ ...form, targetTitle: e.target.value })} placeholder="Ex.: título cadastrado na ficha" /></Field>
      <Field label="Torção (voltas/m)"><Input type="number" min="0" value={form.twistPerM} onChange={(e) => setForm({ ...form, twistPerM: e.target.value })} /></Field>
      <Field label="Produção planejada (kg)"><Input type="number" min="0" value={form.plannedOutputKg} onChange={(e) => setForm({ ...form, plannedOutputKg: e.target.value })} /></Field>
      <Field label="Observações"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
    </ProfileShell>
  );
}

export function KnittingProfilePanel({ order, profile, onChanged }: ProfileProps) {
  const [form, setForm] = useState({ machineId: NONE, workCenter: '', gauge: '', diameterCm: '', plannedOutputKg: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      machineId: profile?.machine_id ?? NONE,
      workCenter: profile?.work_center ?? order.work_center ?? '',
      gauge: profile?.gauge ?? '',
      diameterCm: numStr(profile?.diameter_cm),
      plannedOutputKg: numStr(profile?.planned_output_kg),
      notes: profile?.notes ?? '',
    });
  }, [profile, order.id, order.work_center]);

  const save = async () => {
    setSaving(true);
    try {
      await upsertSectorOrderProfile(order.id, 'malharia', {
        machine_id: form.machineId === NONE ? null : form.machineId,
        work_center: form.workCenter.trim() || null,
        gauge: form.gauge.trim() || null,
        diameter_cm: numberOrNull(form.diameterCm),
        planned_output_kg: numberOrNull(form.plannedOutputKg),
        notes: form.notes.trim() || null,
      });
      toast.success('Perfil de malharia salvo');
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar perfil de malharia');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileShell title="Perfil técnico de malharia da OP" description={PROFILE_DESCRIPTION} saving={saving} onSave={save}>
      <Field label="Tear circular/máquina"><MachineSelect kind="malharia" value={form.machineId} onChange={(v) => setForm({ ...form, machineId: v })} /></Field>
      <Field label="Centro de trabalho"><Input value={form.workCenter} onChange={(e) => setForm({ ...form, workCenter: e.target.value })} /></Field>
      <Field label="Galga (configurada)"><Input value={form.gauge} onChange={(e) => setForm({ ...form, gauge: e.target.value })} /></Field>
      <Field label="Diâmetro (cm)"><Input type="number" min="0" value={form.diameterCm} onChange={(e) => setForm({ ...form, diameterCm: e.target.value })} /></Field>
      <Field label="Produção planejada (kg)"><Input type="number" min="0" value={form.plannedOutputKg} onChange={(e) => setForm({ ...form, plannedOutputKg: e.target.value })} /></Field>
      <Field label="Observações"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
    </ProfileShell>
  );
}

export function DyeingProfilePanel({ order, profile, onChanged }: ProfileProps) {
  const [form, setForm] = useState({
    machineId: NONE, workCenter: '', colorName: '', colorCode: '', bathRatio: '', batchCode: '',
    labL: '', labA: '', labB: '', plannedOutputKg: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      machineId: profile?.machine_id ?? NONE,
      workCenter: profile?.work_center ?? order.work_center ?? '',
      colorName: profile?.color_name ?? '',
      colorCode: profile?.color_code ?? '',
      bathRatio: numStr(profile?.bath_ratio),
      batchCode: profile?.batch_code ?? '',
      labL: numStr(profile?.lab_l),
      labA: numStr(profile?.lab_a),
      labB: numStr(profile?.lab_b),
      plannedOutputKg: numStr(profile?.planned_output_kg),
      notes: profile?.notes ?? '',
    });
  }, [profile, order.id, order.work_center]);

  const save = async () => {
    setSaving(true);
    try {
      await upsertSectorOrderProfile(order.id, 'tinturaria', {
        machine_id: form.machineId === NONE ? null : form.machineId,
        work_center: form.workCenter.trim() || null,
        color_name: form.colorName.trim() || null,
        color_code: form.colorCode.trim() || null,
        bath_ratio: numberOrNull(form.bathRatio),
        batch_code: form.batchCode.trim() || null,
        lab_l: numberOrNull(form.labL),
        lab_a: numberOrNull(form.labA),
        lab_b: numberOrNull(form.labB),
        planned_output_kg: numberOrNull(form.plannedOutputKg),
        notes: form.notes.trim() || null,
      });
      toast.success('Perfil de tinturaria salvo');
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar perfil de tinturaria');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileShell
      title="Perfil técnico de tinturaria da OP"
      description="Máquina de tingir, cor/partida e parâmetros configurados da empresa (receita e dosagens vivem na ficha/snapshot da OP). Metas CIELAB apenas quando aplicável. Nenhum valor é sugerido automaticamente."
      saving={saving}
      onSave={save}
    >
      <Field label="Máquina de tingir (JET/barca)"><MachineSelect kind="tinturaria" value={form.machineId} onChange={(v) => setForm({ ...form, machineId: v })} /></Field>
      <Field label="Centro de trabalho"><Input value={form.workCenter} onChange={(e) => setForm({ ...form, workCenter: e.target.value })} /></Field>
      <Field label="Partida/lote de tingimento"><Input value={form.batchCode} onChange={(e) => setForm({ ...form, batchCode: e.target.value })} /></Field>
      <Field label="Cor"><Input value={form.colorName} onChange={(e) => setForm({ ...form, colorName: e.target.value })} /></Field>
      <Field label="Código da cor"><Input value={form.colorCode} onChange={(e) => setForm({ ...form, colorCode: e.target.value })} /></Field>
      <Field label="Relação de banho (configurada)"><Input type="number" min="0" value={form.bathRatio} onChange={(e) => setForm({ ...form, bathRatio: e.target.value })} /></Field>
      <Field label="Meta L* (CIELAB, se aplicável)"><Input type="number" value={form.labL} onChange={(e) => setForm({ ...form, labL: e.target.value })} /></Field>
      <Field label="Meta a* (CIELAB, se aplicável)"><Input type="number" value={form.labA} onChange={(e) => setForm({ ...form, labA: e.target.value })} /></Field>
      <Field label="Meta b* (CIELAB, se aplicável)"><Input type="number" value={form.labB} onChange={(e) => setForm({ ...form, labB: e.target.value })} /></Field>
      <Field label="Produção planejada (kg)"><Input type="number" min="0" value={form.plannedOutputKg} onChange={(e) => setForm({ ...form, plannedOutputKg: e.target.value })} /></Field>
      <Field label="Observações"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
    </ProfileShell>
  );
}

interface EventsProps {
  order: ProductionOrderRow;
  kind: SectorProfileKind;
  events: SectorEventRow[];
  onChanged: () => Promise<void> | void;
}

export function SectorEventsPanel({ order, kind, events, onChanged }: EventsProps) {
  const [form, setForm] = useState({ eventType: 'start', machineId: NONE, quantity: '', downtimeMinutes: '', reason: '', operatorName: '', deviationCategory: NONE, causeStatus: 'em_investigacao' });
  const [saving, setSaving] = useState(false);
  const unit = SECTOR_EVENT_QUANTITY_UNIT[kind];

  const save = async () => {
    setSaving(true);
    try {
      await recordSectorEvent({
        productionOrderId: order.id,
        sector: kind,
        eventType: form.eventType,
        machineId: form.machineId === NONE ? null : form.machineId,
        quantity: numberOrNull(form.quantity),
        downtimeMinutes: numberOrNull(form.downtimeMinutes),
        reason: form.reason.trim() || null,
        operatorName: form.operatorName.trim() || null,
        deviationCategory: form.deviationCategory === NONE ? null : form.deviationCategory,
        causeStatus: form.deviationCategory === NONE ? null : form.causeStatus,
      });
      toast.success('Evento registrado');
      setForm({ ...form, quantity: '', downtimeMinutes: '', reason: '' });
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar evento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Eventos e paradas — {SECTOR_LABELS[kind]}</CardTitle>
        <CardDescription>Apontamento operacional do setor: inícios, paradas com motivo e duração, quantidades e ocorrências próprias do processo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tipo de evento">
            <Select value={form.eventType} onValueChange={(v) => setForm({ ...form, eventType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SECTOR_EVENT_TYPES[kind].map((type) => (
                  <SelectItem key={type} value={type}>{sectorEventLabel(type)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Máquina"><MachineSelect kind={kind} value={form.machineId} onChange={(v) => setForm({ ...form, machineId: v })} /></Field>
          <Field label={`Quantidade (${unit})`}><Input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
          <Field label="Parada (min)"><Input type="number" min="0" value={form.downtimeMinutes} onChange={(e) => setForm({ ...form, downtimeMinutes: e.target.value })} /></Field>
          <Field label="Motivo"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          <Field label="Operador"><Input value={form.operatorName} onChange={(e) => setForm({ ...form, operatorName: e.target.value })} /></Field>
          <Field label="Classificação do desvio">
            <Select value={form.deviationCategory} onValueChange={(v) => setForm({ ...form, deviationCategory: v })}>
              <SelectTrigger><SelectValue placeholder="Não classificado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não classificado</SelectItem>
                {SECTOR_DEVIATION_CATEGORIES[kind].map((category) => (
                  <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Situação da causa">
            <Select value={form.causeStatus} onValueChange={(v) => setForm({ ...form, causeStatus: v })} disabled={form.deviationCategory === NONE}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEVIATION_CAUSE_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Classifique a parada na taxonomia do setor; a causa nasce “em investigação” e só vira confirmada com a análise do responsável.</p>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? 'Registrando...' : 'Registrar evento'}</Button>
        </div>
        {events.length > 0 && (
          <ul className="divide-y rounded-md border">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="font-medium">{sectorEventLabel(event.event_type)}</span>
                <span className="text-muted-foreground">{new Date(event.occurred_at).toLocaleString('pt-BR')}</span>
                {event.quantity !== null && <span>{formatNumber(event.quantity)} {unit}</span>}
                {event.downtime_minutes !== null && <span>{formatNumber(event.downtime_minutes)} min de parada</span>}
                {deviationCategoryLabel(kind, event.deviation_category) && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">{deviationCategoryLabel(kind, event.deviation_category)}{event.cause_status === 'confirmada' ? ' · causa confirmada' : ' · causa em investigação'}</span>}
                {event.reason && <span className="text-muted-foreground">· {event.reason}</span>}
                {event.operator_name && <span className="text-muted-foreground">· {event.operator_name}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
