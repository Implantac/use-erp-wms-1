import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { supabase } from '@/integrations/supabase/client';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import { useProductionResources } from '@/hooks/production/useProductionResources';
import type { TextileLotOption } from '@/hooks/production/useTextilePcpData';
import {
  recordWeavingEvent,
  upsertWeavingOrderProfile,
  type WeavingEventRow,
  type WeavingOrderProfileRow,
} from '@/services/production/textilePcpService';
import { filterYarnProducts, machineMatchesSector, type YarnProductLike } from '@/lib/pcp/productFilters';
import { DEVIATION_CAUSE_STATUSES, SECTOR_DEVIATION_CATEGORIES, deviationCategoryLabel } from '@/lib/pcp/sectorProfiles';
import { formatNumber } from '@/lib/formatters';

const NONE = '__none__';

interface ProductOption extends YarnProductLike {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface ProfileProps {
  order: ProductionOrderRow;
  profile: WeavingOrderProfileRow | null;
  lots: TextileLotOption[];
  onChanged: () => Promise<void> | void;
}

export function WeavingProfilePanel({ order, profile, lots, onChanged }: ProfileProps) {
  const { resources } = useProductionResources();
  const { machines } = useProductionMachines();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [form, setForm] = useState({
    warpProductId: NONE,
    weftProductId: NONE,
    warpLotId: NONE,
    weftLotId: NONE,
    resourceId: NONE,
    machineId: NONE,
    workCenter: '',
    beamCode: '',
    reedCode: '',
    picksPerCm: '',
    warpThreadCount: '',
    plannedWidthCm: '',
    plannedLengthM: '',
    setupMinutes: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [productResult, categoryResult] = await Promise.all([
        supabase.from('products').select('id, code, name, unit, category_id, subcategory').eq('company_id', order.company_id).eq('status', 'active').order('name'),
        supabase.from('categories').select('id, name'),
      ]);
      if (productResult.error) return;
      const categoryNames = new Map((categoryResult.data ?? []).map((category) => [category.id, category.name]));
      setProducts((productResult.data ?? []).map((product) => ({
        ...product,
        category_name: product.category_id ? categoryNames.get(product.category_id) ?? null : null,
      })));
    })();
  }, [order.company_id]);

  useEffect(() => {
    setForm({
      warpProductId: profile?.warp_product_id ?? NONE,
      weftProductId: profile?.weft_product_id ?? NONE,
      warpLotId: profile?.warp_lot_id ?? NONE,
      weftLotId: profile?.weft_lot_id ?? NONE,
      resourceId: profile?.loom_resource_id ?? NONE,
      machineId: profile?.machine_id ?? NONE,
      workCenter: profile?.work_center ?? order.work_center ?? '',
      beamCode: profile?.beam_code ?? '',
      reedCode: profile?.reed_code ?? '',
      picksPerCm: profile?.picks_per_cm !== null && profile?.picks_per_cm !== undefined ? String(profile.picks_per_cm) : '',
      warpThreadCount: profile?.warp_thread_count !== null && profile?.warp_thread_count !== undefined ? String(profile.warp_thread_count) : '',
      plannedWidthCm: profile?.planned_width_cm !== null && profile?.planned_width_cm !== undefined ? String(profile.planned_width_cm) : '',
      plannedLengthM: profile?.planned_length_m !== null && profile?.planned_length_m !== undefined ? String(profile.planned_length_m) : '',
      setupMinutes: profile?.setup_minutes !== null && profile?.setup_minutes !== undefined ? String(profile.setup_minutes) : '',
      notes: profile?.notes ?? '',
    });
  }, [profile, order.id, order.work_center]);

  const numberOrNull = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const save = async () => {
    setSaving(true);
    try {
      await upsertWeavingOrderProfile(order.id, {
        warp_product_id: form.warpProductId === NONE ? null : form.warpProductId,
        weft_product_id: form.weftProductId === NONE ? null : form.weftProductId,
        warp_lot_id: form.warpLotId === NONE ? null : form.warpLotId,
        weft_lot_id: form.weftLotId === NONE ? null : form.weftLotId,
        loom_resource_id: form.resourceId === NONE ? null : form.resourceId,
        machine_id: form.machineId === NONE ? null : form.machineId,
        work_center: form.workCenter.trim() || null,
        beam_code: form.beamCode.trim() || null,
        reed_code: form.reedCode.trim() || null,
        picks_per_cm: numberOrNull(form.picksPerCm),
        warp_thread_count: numberOrNull(form.warpThreadCount),
        planned_width_cm: numberOrNull(form.plannedWidthCm),
        planned_length_m: numberOrNull(form.plannedLengthM),
        setup_minutes: numberOrNull(form.setupMinutes),
        notes: form.notes.trim() || null,
      });
      toast.success('Perfil de tecelagem salvo');
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar perfil de tecelagem');
    } finally {
      setSaving(false);
    }
  };

  // Urdume/trama só aceitam fio: produtos classificados como fio
  // (categoria/subcategoria de fio ou código/nome iniciado por "Fio").
  const productOptions = (value: string, onChange: (value: string) => void) => (
    <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{filterYarnProducts(products, value === NONE ? null : value).map((product) => <SelectItem key={product.id} value={product.id}>{product.code} — {product.name}</SelectItem>)}</SelectContent></Select>
  );
  const lotOptions = (value: string, onChange: (value: string) => void, productId: string) => {
    const options = lots.filter((lot) => productId === NONE || lot.productId === productId);
    return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{options.map((lot) => <SelectItem key={lot.id} value={lot.id}>{lot.lotNumber} · {formatNumber(lot.remainingQty)} · {lot.qualityStatus}</SelectItem>)}</SelectContent></Select>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Perfil técnico de tecelagem da OP</CardTitle>
        <CardDescription>Campos executáveis da ordem: tear, urdume, trama, rolo, pente e parâmetros configurados. Urdume/trama listam apenas produtos classificados como fio. Nenhum valor é sugerido automaticamente.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1"><Label>Fio de urdume</Label>{productOptions(form.warpProductId, (value) => setForm({ ...form, warpProductId: value, warpLotId: NONE }))}</div>
        <div className="space-y-1"><Label>Fio de trama</Label>{productOptions(form.weftProductId, (value) => setForm({ ...form, weftProductId: value, weftLotId: NONE }))}</div>
        <div className="space-y-1"><Label>Centro/tear</Label><Input value={form.workCenter} onChange={(event) => setForm({ ...form, workCenter: event.target.value })} /></div>
        <div className="space-y-1"><Label>Lote de urdume</Label>{lotOptions(form.warpLotId, (value) => setForm({ ...form, warpLotId: value }), form.warpProductId)}</div>
        <div className="space-y-1"><Label>Lote de trama</Label>{lotOptions(form.weftLotId, (value) => setForm({ ...form, weftLotId: value }), form.weftProductId)}</div>
        <div className="space-y-1"><Label>Recurso/tear</Label><Select value={form.resourceId} onValueChange={(value) => setForm({ ...form, resourceId: value })}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{resources.filter((resource) => resource.is_active && machineMatchesSector(resource.sector_name, 'tecelagem')).map((resource) => <SelectItem key={resource.id} value={resource.id}>{resource.code} — {resource.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Máquina/tear</Label><Select value={form.machineId} onValueChange={(value) => setForm({ ...form, machineId: value })}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{machines.filter((machine) => machine.active && machineMatchesSector(machine.sector, 'tecelagem')).map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.code} — {machine.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Rolo de urdume</Label><Input value={form.beamCode} onChange={(event) => setForm({ ...form, beamCode: event.target.value })} /></div>
        <div className="space-y-1"><Label>Pente</Label><Input value={form.reedCode} onChange={(event) => setForm({ ...form, reedCode: event.target.value })} /></div>
        <div className="space-y-1"><Label>Batidas/cm</Label><Input type="number" min="0" step="0.01" value={form.picksPerCm} onChange={(event) => setForm({ ...form, picksPerCm: event.target.value })} /></div>
        <div className="space-y-1"><Label>Fios de urdume</Label><Input type="number" min="0" step="1" value={form.warpThreadCount} onChange={(event) => setForm({ ...form, warpThreadCount: event.target.value })} /></div>
        <div className="space-y-1"><Label>Largura (cm)</Label><Input type="number" min="0" step="0.01" value={form.plannedWidthCm} onChange={(event) => setForm({ ...form, plannedWidthCm: event.target.value })} /></div>
        <div className="space-y-1"><Label>Comprimento (m)</Label><Input type="number" min="0" step="0.01" value={form.plannedLengthM} onChange={(event) => setForm({ ...form, plannedLengthM: event.target.value })} /></div>
        <div className="space-y-1"><Label>Setup (min)</Label><Input type="number" min="0" step="0.01" value={form.setupMinutes} onChange={(event) => setForm({ ...form, setupMinutes: event.target.value })} /></div>
        <div className="space-y-1"><Label>Observações</Label><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
        <div className="flex items-end"><Button onClick={save} disabled={saving || ['completed', 'cancelled'].includes(order.status)}>{saving ? 'Salvando…' : 'Salvar perfil'}</Button></div>
      </CardContent>
    </Card>
  );
}

const EVENT_TYPES = [
  ['setup', 'Setup'], ['start', 'Início'], ['pause', 'Pausa'], ['resume', 'Retomada'], ['stop', 'Parada'],
  ['yarn_break', 'Ruptura de fio'], ['warp_break', 'Ruptura de urdume'], ['weft_break', 'Ruptura de trama'],
  ['beam_change', 'Troca de rolo'], ['quality_hold', 'Bloqueio de qualidade'], ['quality_release', 'Liberação de qualidade'],
  ['inspection', 'Inspeção'], ['note', 'Observação'],
] as const;

interface EventsProps {
  order: ProductionOrderRow;
  events: WeavingEventRow[];
  onChanged: () => Promise<void> | void;
}

export function WeavingEventsPanel({ order, events, onChanged }: EventsProps) {
  const [eventType, setEventType] = useState('note');
  const [quantityM, setQuantityM] = useState('');
  const [downtimeMinutes, setDowntimeMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [deviationCategory, setDeviationCategory] = useState(NONE);
  const [causeStatus, setCauseStatus] = useState('em_investigacao');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await recordWeavingEvent({
        productionOrderId: order.id,
        eventType,
        quantityM: quantityM ? Number(quantityM) : null,
        downtimeMinutes: downtimeMinutes ? Number(downtimeMinutes) : null,
        reason: reason.trim() || null,
        operatorName: operatorName.trim() || null,
        deviationCategory: deviationCategory === NONE ? null : deviationCategory,
        causeStatus: deviationCategory === NONE ? null : causeStatus,
      });
      toast.success('Evento de tecelagem registrado');
      setQuantityM('');
      setDowntimeMinutes('');
      setReason('');
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
        <CardTitle className="text-base">Eventos e paradas do tear</CardTitle>
        <CardDescription>Registro manual auditável de setup, rupturas, troca de rolo, paradas e bloqueios. Sem integração de sensor configurada, a origem é sempre este apontamento manual.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1"><Label>Evento</Label><Select value={eventType} onValueChange={setEventType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENT_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Metros no evento</Label><Input type="number" min="0" step="0.01" value={quantityM} onChange={(event) => setQuantityM(event.target.value)} /></div>
          <div className="space-y-1"><Label>Parada (min)</Label><Input type="number" min="0" step="0.01" value={downtimeMinutes} onChange={(event) => setDowntimeMinutes(event.target.value)} /></div>
          <div className="space-y-1"><Label>Operador</Label><Input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} /></div>
          <div className="space-y-1"><Label>Motivo</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} /></div>
          <div className="space-y-1"><Label>Classificação do desvio</Label><Select value={deviationCategory} onValueChange={setDeviationCategory}><SelectTrigger><SelectValue placeholder="Não classificado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não classificado</SelectItem>{SECTOR_DEVIATION_CATEGORIES.tecelagem.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Situação da causa</Label><Select value={causeStatus} onValueChange={setCauseStatus} disabled={deviationCategory === NONE}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DEVIATION_CAUSE_STATUSES.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <p className="text-xs text-muted-foreground">Classifique a parada (fio de urdume/trama, tear, preparação...); a causa nasce “em investigação” e só vira confirmada com a análise do responsável.</p>
        <Button size="sm" onClick={save} disabled={saving || ['completed', 'cancelled'].includes(order.status)}>{saving ? 'Registrando…' : 'Registrar evento'}</Button>
        {events.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum evento registrado para esta OP.</p> : (
          <ul className="space-y-2 text-sm">
            {events.slice(0, 12).map((event) => (
              <li key={event.id} className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                <span><strong>{EVENT_TYPES.find(([value]) => value === event.event_type)?.[1] ?? event.event_type}</strong>{deviationCategoryLabel('tecelagem', event.deviation_category) ? ` · ${deviationCategoryLabel('tecelagem', event.deviation_category)}${event.cause_status === 'confirmada' ? ' (causa confirmada)' : ' (causa em investigação)'}` : ''}{event.reason ? ` — ${event.reason}` : ''}</span>
                <span className="text-muted-foreground">{new Date(event.occurred_at).toLocaleString('pt-BR')}{event.downtime_minutes ? ` · ${formatNumber(event.downtime_minutes)} min` : ''}{event.quantity_m ? ` · ${formatNumber(event.quantity_m)} m` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
