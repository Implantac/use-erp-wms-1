import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { TextileBomLine } from '@/hooks/production/useTextilePcpData';
import { bathVolumeLiters, bomComposition, componentTotalsForBatch, deltaE76 } from '@/lib/pcp/sectorCalculations';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import {
  decideDyeingLabApproval,
  recordSectorEvent,
  setDyeingLabApprovalRequirement,
  upsertSectorOrderProfile,
  type SectorEventRow,
  type SectorOrderProfileRow,
  type SectorProfileKind,
} from '@/services/production/textilePcpService';
import {
  dyeingCompletionBlocked,
  validateBlendComponents,
  validateDyeingMachineLoad,
  validateLabDecision,
  validatePhTarget,
  validatePretreatment,
  type BlendComponent,
  type LabDecision,
} from '@/lib/pcp/sectorProcessParameters';
import {
  describeDyeRecipeParameters,
  formatDyeRecipeLabel,
  type DyeRecipe,
} from '@/lib/production/dyeRecipes';
import { fetchDyeRecipes, setDyeingRecipeVersion } from '@/services/production/dyeRecipes';
import { DyeRecipeManagerDialog } from './DyeRecipeManagerDialog';
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
  bomLines?: TextileBomLine[];
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

export function SpinningProfilePanel({ order, profile, onChanged, bomLines = [] }: ProfileProps) {
  const [form, setForm] = useState({ machineId: NONE, workCenter: '', targetTitle: '', twistPerM: '', plannedOutputKg: '', notes: '', rovingTitle: '', draftRatio: '', spindleSpeedRpm: '', deliverySpeedMMin: '', travelerCode: '' });
  const [blend, setBlend] = useState<Array<{ name: string; pct: string }>>([{ name: '', pct: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      machineId: profile?.machine_id ?? NONE,
      workCenter: profile?.work_center ?? order.work_center ?? '',
      targetTitle: profile?.target_title ?? '',
      twistPerM: numStr(profile?.twist_per_m),
      plannedOutputKg: numStr(profile?.planned_output_kg),
      notes: profile?.notes ?? '',
      rovingTitle: profile?.roving_title ?? '',
      draftRatio: numStr(profile?.draft_ratio),
      spindleSpeedRpm: numStr(profile?.spindle_speed_rpm),
      deliverySpeedMMin: numStr(profile?.delivery_speed_m_min),
      travelerCode: profile?.traveler_code ?? '',
    });
    const components = profile?.blend_components ?? [];
    setBlend(components.length
      ? components.map((c) => ({ name: c.name ?? '', pct: c.pct !== null && c.pct !== undefined ? String(c.pct) : '' }))
      : [{ name: '', pct: '' }]);
  }, [profile, order.id, order.work_center]);

  const save = async () => {
    const blendComponents: BlendComponent[] = blend
      .filter((c) => c.name.trim() || c.pct.trim())
      .map((c) => ({ name: c.name.trim(), pct: numberOrNull(c.pct) }));
    const blendError = validateBlendComponents(blendComponents);
    if (blendError) {
      toast.error(blendError);
      return;
    }
    setSaving(true);
    try {
      await upsertSectorOrderProfile(order.id, 'fiacao', {
        machine_id: form.machineId === NONE ? null : form.machineId,
        work_center: form.workCenter.trim() || null,
        target_title: form.targetTitle.trim() || null,
        twist_per_m: numberOrNull(form.twistPerM),
        planned_output_kg: numberOrNull(form.plannedOutputKg),
        notes: form.notes.trim() || null,
        blend_components: blendComponents,
        roving_title: form.rovingTitle.trim() || null,
        draft_ratio: numberOrNull(form.draftRatio),
        spindle_speed_rpm: numberOrNull(form.spindleSpeedRpm),
        delivery_speed_m_min: numberOrNull(form.deliverySpeedMMin),
        traveler_code: form.travelerCode.trim() || null,
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
      <Field label="Título da mecha/pavio"><Input value={form.rovingTitle} onChange={(e) => setForm({ ...form, rovingTitle: e.target.value })} /></Field>
      <Field label="Estiragem (draft)"><Input type="number" min="0" step="0.01" value={form.draftRatio} onChange={(e) => setForm({ ...form, draftRatio: e.target.value })} /></Field>
      <Field label="Velocidade do fuso (rpm)"><Input type="number" min="0" step="0.01" value={form.spindleSpeedRpm} onChange={(e) => setForm({ ...form, spindleSpeedRpm: e.target.value })} /></Field>
      <Field label="Velocidade de saída (m/min)"><Input type="number" min="0" step="0.01" value={form.deliverySpeedMMin} onChange={(e) => setForm({ ...form, deliverySpeedMMin: e.target.value })} /></Field>
      <Field label="Viajante (código)"><Input value={form.travelerCode} onChange={(e) => setForm({ ...form, travelerCode: e.target.value })} /></Field>
      <div className="md:col-span-3 space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Mistura configurada pela empresa</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setBlend((items) => [...items, { name: '', pct: '' }])}>+ Componente</Button>
        </div>
        {blend.map((component, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
            <Input placeholder="Componente (ex.: fibra cadastrada pela empresa)" value={component.name} onChange={(e) => setBlend((items) => items.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
            <Input type="number" min="0" max="100" step="0.01" placeholder="% da mistura" value={component.pct} onChange={(e) => setBlend((items) => items.map((item, i) => i === index ? { ...item, pct: e.target.value } : item))} />
            <Button type="button" size="sm" variant="ghost" onClick={() => setBlend((items) => items.filter((_, i) => i !== index))} disabled={blend.length === 1}>Remover</Button>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">Percentuais apenas quando a empresa os informar; a soma não pode passar de 100%.</p>
      </div>
      {bomComposition(bomLines).length > 0 && (
        <div className="md:col-span-3 rounded-md border bg-muted/40 px-3 py-2">
          <p className="text-xs font-medium">Composição planejada (da BOM/snapshot, por unidade de saída)</p>
          <p className="text-sm text-muted-foreground">
            {bomComposition(bomLines).map((c) => `${c.name} ${formatNumber(c.pct, 1)}%`).join(' · ')}
          </p>
          <p className="text-[11px] text-muted-foreground">É a mistura planejada da ficha — a mistura real é a dos lotes efetivamente consumidos na conclusão.</p>
        </div>
      )}
    </ProfileShell>
  );
}

export function KnittingProfilePanel({ order, profile, onChanged }: ProfileProps) {
  const [form, setForm] = useState({ machineId: NONE, workCenter: '', gauge: '', diameterCm: '', targetGsm: '', targetWidthCm: '', plannedOutputKg: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      machineId: profile?.machine_id ?? NONE,
      workCenter: profile?.work_center ?? order.work_center ?? '',
      gauge: profile?.gauge ?? '',
      diameterCm: numStr(profile?.diameter_cm),
      targetGsm: numStr(profile?.target_grammage_g_m2),
      targetWidthCm: numStr(profile?.target_width_cm),
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
        target_grammage_g_m2: numberOrNull(form.targetGsm),
        target_width_cm: numberOrNull(form.targetWidthCm),
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
      <Field label="Gramatura alvo (g/m², configurada)"><Input type="number" min="0" value={form.targetGsm} onChange={(e) => setForm({ ...form, targetGsm: e.target.value })} /></Field>
      <Field label="Largura alvo (cm, configurada)"><Input type="number" min="0" value={form.targetWidthCm} onChange={(e) => setForm({ ...form, targetWidthCm: e.target.value })} /></Field>
      <Field label="Produção planejada (kg)"><Input type="number" min="0" value={form.plannedOutputKg} onChange={(e) => setForm({ ...form, plannedOutputKg: e.target.value })} /></Field>
      <Field label="Observações"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
    </ProfileShell>
  );
}

export function DyeingProfilePanel({ order, profile, onChanged, bomLines = [] }: ProfileProps) {
  const { machines } = useProductionMachines();
  const [dyeRecipes, setDyeRecipes] = useState<DyeRecipe[]>([]);
  const [recipeManagerOpen, setRecipeManagerOpen] = useState(false);
  const [dyeRecipeVersionId, setDyeRecipeVersionId] = useState(NONE);
  const loadDyeRecipes = useCallback(async () => {
    try {
      setDyeRecipes(await fetchDyeRecipes(order.company_id));
    } catch {
      setDyeRecipes([]);
    }
  }, [order.company_id]);
  useEffect(() => { void loadDyeRecipes(); }, [loadDyeRecipes]);
  const [form, setForm] = useState({
    machineId: NONE, workCenter: '', colorName: '', colorCode: '', bathRatio: '', batchCode: '',
    labL: '', labA: '', labB: '', measuredL: '', measuredA: '', measuredB: '', plannedOutputKg: '', notes: '',
    pretreatmentApplicable: NONE, pretreatmentType: '', pretreatmentRecipeCode: '', pretreatmentTemperatureC: '', pretreatmentTimeMin: '',
    dyeRecipeCode: '', dyeingTemperatureC: '', dyeingTimeMin: '', phTarget: '', labApprovalRequired: 'no',
  });
  const [labDecision, setLabDecision] = useState<Exclude<LabDecision, 'pending'>>('approved');
  const [labNotes, setLabNotes] = useState('');
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
      measuredL: numStr(profile?.measured_lab_l),
      measuredA: numStr(profile?.measured_lab_a),
      measuredB: numStr(profile?.measured_lab_b),
      plannedOutputKg: numStr(profile?.planned_output_kg),
      notes: profile?.notes ?? '',
      pretreatmentApplicable: profile?.pretreatment_applicable === null || profile?.pretreatment_applicable === undefined ? NONE : profile.pretreatment_applicable ? 'yes' : 'no',
      pretreatmentType: profile?.pretreatment_type ?? '',
      pretreatmentRecipeCode: profile?.pretreatment_recipe_code ?? '',
      pretreatmentTemperatureC: numStr(profile?.pretreatment_temperature_c),
      pretreatmentTimeMin: numStr(profile?.pretreatment_time_min),
      dyeRecipeCode: profile?.dye_recipe_code ?? '',
      dyeingTemperatureC: numStr(profile?.dyeing_temperature_c),
      dyeingTimeMin: numStr(profile?.dyeing_time_min),
      phTarget: numStr(profile?.ph_target),
      labApprovalRequired: profile?.lab_approval_required ? 'yes' : 'no',
    });
    setDyeRecipeVersionId(profile?.dye_recipe_version_id ?? NONE);
    setLabNotes(profile?.lab_decision_notes ?? '');
  }, [profile, order.id, order.work_center]);

  const save = async () => {
    const pretreatmentError = validatePretreatment({
      applicable: form.pretreatmentApplicable === NONE ? null : form.pretreatmentApplicable === 'yes',
      type: form.pretreatmentType,
      recipeCode: form.pretreatmentRecipeCode,
      temperatureC: numberOrNull(form.pretreatmentTemperatureC),
      timeMin: numberOrNull(form.pretreatmentTimeMin),
    }) ?? validatePhTarget(numberOrNull(form.phTarget));
    if (pretreatmentError) {
      toast.error(pretreatmentError);
      return;
    }
    const selectedMachine = machines.find((machine) => machine.id === form.machineId);
    const loadError = selectedMachine ? validateDyeingMachineLoad({
      plannedKg: numberOrNull(form.plannedOutputKg),
      bathRatio: numberOrNull(form.bathRatio),
      minLoadKg: selectedMachine.min_load_kg,
      maxLoadKg: selectedMachine.max_load_kg,
      usefulBathVolumeL: selectedMachine.useful_bath_volume_l,
    }) : null;
    if (loadError) {
      toast.error(loadError);
      return;
    }
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
        measured_lab_l: numberOrNull(form.measuredL),
        measured_lab_a: numberOrNull(form.measuredA),
        measured_lab_b: numberOrNull(form.measuredB),
        planned_output_kg: numberOrNull(form.plannedOutputKg),
        notes: form.notes.trim() || null,
        pretreatment_applicable: form.pretreatmentApplicable === NONE ? null : form.pretreatmentApplicable === 'yes',
        pretreatment_type: form.pretreatmentType.trim() || null,
        pretreatment_recipe_code: form.pretreatmentRecipeCode.trim() || null,
        pretreatment_temperature_c: numberOrNull(form.pretreatmentTemperatureC),
        pretreatment_time_min: numberOrNull(form.pretreatmentTimeMin),
        dye_recipe_code: form.dyeRecipeCode.trim() || null,
        dyeing_temperature_c: numberOrNull(form.dyeingTemperatureC),
        dyeing_time_min: numberOrNull(form.dyeingTimeMin),
        ph_target: numberOrNull(form.phTarget),
      });
      await setDyeingLabApprovalRequirement(order.id, form.labApprovalRequired === 'yes');
      await setDyeingRecipeVersion(order.id, dyeRecipeVersionId === NONE ? null : dyeRecipeVersionId);
      toast.success('Perfil de tinturaria salvo');
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar perfil de tinturaria');
    } finally {
      setSaving(false);
    }
  };

  const decideLab = async () => {
    const decisionError = validateLabDecision(labDecision, labNotes);
    if (decisionError) {
      toast.error(decisionError);
      return;
    }
    setSaving(true);
    try {
      await decideDyeingLabApproval(order.id, labDecision, labNotes);
      toast.success('Decisão do laboratório registrada');
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar a decisão do laboratório');
    } finally {
      setSaving(false);
    }
  };

  const labBlocked = dyeingCompletionBlocked({
    labApprovalRequired: form.labApprovalRequired === 'yes',
    labDecision: profile?.lab_decision,
  });
  const labDecisionLabels: Record<string, string> = {
    pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', concession: 'Liberada sob concessão',
  };

  return (
    <>
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
      <Field label="L* medido da partida"><Input type="number" value={form.measuredL} onChange={(e) => setForm({ ...form, measuredL: e.target.value })} /></Field>
      <Field label="a* medido da partida"><Input type="number" value={form.measuredA} onChange={(e) => setForm({ ...form, measuredA: e.target.value })} /></Field>
      <Field label="b* medido da partida"><Input type="number" value={form.measuredB} onChange={(e) => setForm({ ...form, measuredB: e.target.value })} /></Field>
      <Field label="Produção planejada (kg)"><Input type="number" min="0" value={form.plannedOutputKg} onChange={(e) => setForm({ ...form, plannedOutputKg: e.target.value })} /></Field>
      <Field label="Observações"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <Field label="Receita de tingimento aprovada (versionada)">
        <Select value={dyeRecipeVersionId} onValueChange={(value) => { const recipe = dyeRecipes.find((item) => item.id === value); setDyeRecipeVersionId(value); if (recipe) { setForm({ ...form, dyeRecipeCode: `${recipe.recipe_code} v${recipe.version}`, bathRatio: recipe.parameters.bath_ratio !== undefined && recipe.parameters.bath_ratio !== null ? String(recipe.parameters.bath_ratio) : form.bathRatio, dyeingTemperatureC: recipe.parameters.dyeing_temperature_c !== undefined && recipe.parameters.dyeing_temperature_c !== null ? String(recipe.parameters.dyeing_temperature_c) : form.dyeingTemperatureC, dyeingTimeMin: recipe.parameters.dyeing_time_min !== undefined && recipe.parameters.dyeing_time_min !== null ? String(recipe.parameters.dyeing_time_min) : form.dyeingTimeMin, phTarget: recipe.parameters.ph_target !== undefined && recipe.parameters.ph_target !== null ? String(recipe.parameters.ph_target) : form.phTarget }); } }}>
          <SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Não informado</SelectItem>
            {dyeRecipes.filter((recipe) => recipe.status === 'approved').map((recipe) => <SelectItem key={recipe.id} value={recipe.id}>{formatDyeRecipeLabel(recipe)}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Receitas da empresa"><Button type="button" variant="outline" className="w-full" onClick={() => setRecipeManagerOpen(true)}>Gerenciar receitas</Button></Field>
      <Field label="Código legado (sem versão)"><Input value={form.dyeRecipeCode} disabled={dyeRecipeVersionId !== NONE} onChange={(e) => setForm({ ...form, dyeRecipeCode: e.target.value })} /></Field>
      {dyeRecipeVersionId !== NONE && describeDyeRecipeParameters(dyeRecipes.find((recipe) => recipe.id === dyeRecipeVersionId)?.parameters) && (
        <p className="text-[11px] text-muted-foreground md:col-span-3">Parâmetros da versão aprovada: {describeDyeRecipeParameters(dyeRecipes.find((recipe) => recipe.id === dyeRecipeVersionId)?.parameters)}</p>
      )}
      <Field label="Temperatura do tingimento (°C)"><Input type="number" min="0" step="0.01" value={form.dyeingTemperatureC} onChange={(e) => setForm({ ...form, dyeingTemperatureC: e.target.value })} /></Field>
      <Field label="Tempo do tingimento (min)"><Input type="number" min="0" step="0.01" value={form.dyeingTimeMin} onChange={(e) => setForm({ ...form, dyeingTimeMin: e.target.value })} /></Field>
      <Field label="pH alvo (se aplicável)"><Input type="number" min="0" max="14" step="0.01" value={form.phTarget} onChange={(e) => setForm({ ...form, phTarget: e.target.value })} /></Field>
      <div className="md:col-span-3 space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">Pré-tratamento (quando aplicável)</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Pré-tratamento aplicável?">
            <Select value={form.pretreatmentApplicable} onValueChange={(value) => setForm({ ...form, pretreatmentApplicable: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Não informado</SelectItem><SelectItem value="yes">Sim</SelectItem><SelectItem value="no">Não</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="Tipo de pré-tratamento"><Input value={form.pretreatmentType} onChange={(e) => setForm({ ...form, pretreatmentType: e.target.value })} /></Field>
          <Field label="Receita do pré-tratamento"><Input value={form.pretreatmentRecipeCode} onChange={(e) => setForm({ ...form, pretreatmentRecipeCode: e.target.value })} /></Field>
          <Field label="Temperatura do pré-tratamento (°C)"><Input type="number" min="0" step="0.01" value={form.pretreatmentTemperatureC} onChange={(e) => setForm({ ...form, pretreatmentTemperatureC: e.target.value })} /></Field>
          <Field label="Tempo do pré-tratamento (min)"><Input type="number" min="0" step="0.01" value={form.pretreatmentTimeMin} onChange={(e) => setForm({ ...form, pretreatmentTimeMin: e.target.value })} /></Field>
        </div>
        <p className="text-[11px] text-muted-foreground">Só é exigido identificar o pré-tratamento quando ele for aplicável; nenhum processo é presumido.</p>
      </div>
      <div className="md:col-span-3 space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">Laboratório — decisão sobre a cor da partida</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Aprovação do laboratório exigida para concluir?">
            <Select value={form.labApprovalRequired} onValueChange={(value) => setForm({ ...form, labApprovalRequired: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="no">Não</SelectItem><SelectItem value="yes">Sim</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="Decisão registrada">
            <Input value={profile ? (labDecisionLabels[profile.lab_decision ?? 'pending'] ?? 'Pendente') : 'Sem perfil salvo'} readOnly />
          </Field>
          <Field label="Nova decisão">
            <Select value={labDecision} onValueChange={(value) => setLabDecision(value as Exclude<LabDecision, 'pending'>)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Aprovar cor</SelectItem>
                <SelectItem value="rejected">Rejeitar cor</SelectItem>
                <SelectItem value="concession">Liberar sob concessão</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="space-y-2 md:col-span-2">
            <Label>Justificativa/observação da decisão</Label>
            <Input value={labNotes} onChange={(e) => setLabNotes(e.target.value)} placeholder="Obrigatória na liberação sob concessão" />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={decideLab} disabled={saving || !profile}>Registrar decisão</Button>
          </div>
        </div>
        {labBlocked && (
          <p className="text-[11px] font-medium text-destructive">
            Conclusão da OP bloqueada: a empresa exige aprovação do laboratório e a decisão atual é {labDecisionLabels[profile?.lab_decision ?? 'pending']?.toLowerCase()}.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">Salvar a exigência vale ao salvar o perfil; a decisão é registrada pelo botão próprio e fica auditada (quem/quando).</p>
      </div>
      <DyeingCalcBlock form={form} bomLines={bomLines} />
    </ProfileShell>
    <DyeRecipeManagerDialog
      open={recipeManagerOpen}
      onOpenChange={setRecipeManagerOpen}
      recipes={dyeRecipes}
      onChanged={loadDyeRecipes}
    />
    </>
  );
}

function DyeingCalcBlock({ form, bomLines }: { form: { bathRatio: string; plannedOutputKg: string; labL: string; labA: string; labB: string; measuredL: string; measuredA: string; measuredB: string }; bomLines: TextileBomLine[] }) {
  const num = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const volume = bathVolumeLiters(num(form.plannedOutputKg), num(form.bathRatio));
  const totals = componentTotalsForBatch(bomLines, num(form.plannedOutputKg));
  const dE = deltaE76(
    { l: num(form.labL), a: num(form.labA), b: num(form.labB) },
    { l: num(form.measuredL), a: num(form.measuredA), b: num(form.measuredB) },
  );
  if (volume === null && totals.length === 0 && dE === null) return null;
  return (
    <div className="md:col-span-3 rounded-md border bg-muted/40 px-3 py-2 space-y-1">
      <p className="text-xs font-medium">Calculado da receita configurada (BOM/snapshot + perfil)</p>
      {volume !== null && <p className="text-sm text-muted-foreground">Volume do banho: {formatNumber(volume)} L (peso da partida × relação de banho)</p>}
      {totals.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Componentes p/ a partida: {totals.slice(0, 6).map((t) => `${t.name} ${formatNumber(t.total)} ${t.unit}`).join(' · ')}
        </p>
      )}
      {dE !== null && <p className="text-sm text-muted-foreground">ΔE*ab meta × medido: <strong>{formatNumber(dE, 2)}</strong> (a tolerância de aceite é da empresa)</p>}
      <p className="text-[11px] text-muted-foreground">Valores calculados do que está configurado/medido — nada é dosagem sugerida automaticamente.</p>
    </div>
  );
}

export function FinishingProfilePanel({ order, profile, onChanged }: ProfileProps) {
  const [form, setForm] = useState({
    machineId: NONE, workCenter: '', processType: '', targetWidthCm: '', targetGsm: '',
    targetShrinkagePct: '', temperatureC: '', speedMMin: '', plannedOutputM: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      machineId: profile?.machine_id ?? NONE,
      workCenter: profile?.work_center ?? order.work_center ?? '',
      processType: profile?.process_type ?? '',
      targetWidthCm: numStr(profile?.target_width_cm),
      targetGsm: numStr(profile?.target_grammage_g_m2),
      targetShrinkagePct: numStr(profile?.target_shrinkage_pct),
      temperatureC: numStr(profile?.temperature_c),
      speedMMin: numStr(profile?.speed_m_min),
      plannedOutputM: numStr(profile?.planned_output_m),
      notes: profile?.notes ?? '',
    });
  }, [profile, order.id, order.work_center]);

  const save = async () => {
    setSaving(true);
    try {
      await upsertSectorOrderProfile(order.id, 'beneficiamento', {
        machine_id: form.machineId === NONE ? null : form.machineId,
        work_center: form.workCenter.trim() || null,
        process_type: form.processType.trim() || null,
        target_width_cm: numberOrNull(form.targetWidthCm),
        target_grammage_g_m2: numberOrNull(form.targetGsm),
        target_shrinkage_pct: numberOrNull(form.targetShrinkagePct),
        temperature_c: numberOrNull(form.temperatureC),
        speed_m_min: numberOrNull(form.speedMMin),
        planned_output_m: numberOrNull(form.plannedOutputM),
        notes: form.notes.trim() || null,
      });
      toast.success('Perfil de beneficiamento salvo');
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar perfil de beneficiamento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileShell
      title="Perfil técnico de beneficiamento da OP"
      description="Rama/máquina de acabamento e metas configuradas da empresa (largura, gramatura, encolhimento, temperatura, velocidade). Nenhum valor é sugerido automaticamente."
      saving={saving}
      onSave={save}
    >
      <Field label="Rama/máquina de acabamento"><MachineSelect kind="beneficiamento" value={form.machineId} onChange={(v) => setForm({ ...form, machineId: v })} /></Field>
      <Field label="Centro de trabalho"><Input value={form.workCenter} onChange={(e) => setForm({ ...form, workCenter: e.target.value })} /></Field>
      <Field label="Processo (configurado)"><Input value={form.processType} onChange={(e) => setForm({ ...form, processType: e.target.value })} placeholder="Ex.: ramagem, sanforização, calandragem" /></Field>
      <Field label="Largura final alvo (cm)"><Input type="number" min="0" value={form.targetWidthCm} onChange={(e) => setForm({ ...form, targetWidthCm: e.target.value })} /></Field>
      <Field label="Gramatura alvo (g/m²)"><Input type="number" min="0" value={form.targetGsm} onChange={(e) => setForm({ ...form, targetGsm: e.target.value })} /></Field>
      <Field label="Encolhimento alvo (%)"><Input type="number" min="0" value={form.targetShrinkagePct} onChange={(e) => setForm({ ...form, targetShrinkagePct: e.target.value })} /></Field>
      <Field label="Temperatura (ºC, configurada)"><Input type="number" min="0" value={form.temperatureC} onChange={(e) => setForm({ ...form, temperatureC: e.target.value })} /></Field>
      <Field label="Velocidade (m/min, configurada)"><Input type="number" min="0" value={form.speedMMin} onChange={(e) => setForm({ ...form, speedMMin: e.target.value })} /></Field>
      <Field label="Saída planejada (m)"><Input type="number" min="0" value={form.plannedOutputM} onChange={(e) => setForm({ ...form, plannedOutputM: e.target.value })} /></Field>
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
