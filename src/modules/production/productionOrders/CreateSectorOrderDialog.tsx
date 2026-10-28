import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import {
  createClientIdempotencyKey,
  createTextileProductionOrder,
  upsertSectorOrderProfile,
  type SectorProfileKind,
} from '@/services/production/textilePcpService';
import { machineMatchesSector } from '@/lib/pcp/productFilters';
import { sectorKindFromSectorText, SECTOR_LABELS } from '@/lib/pcp/sectorProfiles';

const NONE = '__none__';

interface ProductOption {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
  kind: SectorProfileKind;
  noun: string;
}

const optionalNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const textOrNull = (value: string) => value.trim() || null;

/**
 * Criação de OP dos setores com perfil próprio (fiação, malharia e
 * tinturaria). A OP nasce no setor da primeira operação do roteiro do
 * produto (regra da RPC `create_textile_production_order`) — por isso o
 * diálogo só oferece produtos cujo roteiro ativo começa neste setor e
 * com BOM cadastrada. O perfil técnico do setor é gravado na sequência
 * somente se o setor criado conferir; nunca grava perfil de um setor
 * numa OP de outro.
 */
export function CreateSectorOrderDialog({ open, onOpenChange, onCreated, kind, noun }: Props) {
  const { company } = useActiveTenant();
  const { machines } = useProductionMachines();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    productId: '',
    quantity: '',
    priority: 'medium',
    dueDate: '',
    workCenter: '',
    clientName: '',
    machineId: NONE,
    targetTitle: '',
    twistPerM: '',
    gauge: '',
    diameterCm: '',
    colorName: '',
    colorCode: '',
    bathRatio: '',
    batchCode: '',
    labL: '',
    labA: '',
    labB: '',
    plannedOutputKg: '',
    processType: '',
    targetWidthCm: '',
    targetGsm: '',
    targetShrinkagePct: '',
    temperatureC: '',
    speedMMin: '',
    plannedOutputM: '',
    notes: '',
  });

  useEffect(() => {
    if (!open || !company?.id) return;
    let cancelled = false;
    setLoadingProducts(true);
    void (async () => {
      const [productResult, bomResult, routeResult, routeStepResult, stepResult] = await Promise.all([
        supabase.from('products').select('id, code, name, unit, production_route_id').eq('company_id', company.id).eq('status', 'active').order('name'),
        supabase.from('production_bom').select('product_id').eq('company_id', company.id),
        supabase.from('production_routes').select('id, product_id, is_active, created_at').eq('company_id', company.id).eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('production_route_steps').select('route_id, step_name, sequence').eq('company_id', company.id).order('sequence'),
        supabase.from('production_steps').select('name, sector, is_active').eq('company_id', company.id).eq('is_active', true),
      ]);
      if (cancelled) return;
      setLoadingProducts(false);
      if (productResult.error || bomResult.error || routeResult.error || routeStepResult.error || stepResult.error) {
        toast.error('Erro ao carregar produtos elegíveis para a OP');
        setProducts([]);
        return;
      }

      // Setor por nome de operação: a RPC exige exatamente uma operação
      // ativa por nome; duplicidade torna o produto inelegível aqui.
      const sectorByStepName = new Map<string, string | null>();
      const stepNameCounts = new Map<string, number>();
      for (const step of stepResult.data ?? []) {
        stepNameCounts.set(step.name, (stepNameCounts.get(step.name) ?? 0) + 1);
        if (!sectorByStepName.has(step.name)) sectorByStepName.set(step.name, step.sector);
      }

      const firstStepByRoute = new Map<string, string>();
      for (const routeStep of routeStepResult.data ?? []) {
        if (!firstStepByRoute.has(routeStep.route_id)) firstStepByRoute.set(routeStep.route_id, routeStep.step_name);
      }
      const routeKind = new Map<string, string | null>();
      for (const route of routeResult.data ?? []) {
        const firstStep = firstStepByRoute.get(route.id);
        const sector = firstStep && stepNameCounts.get(firstStep) === 1 ? sectorByStepName.get(firstStep) : null;
        routeKind.set(route.id, sectorKindFromSectorText(sector));
      }

      const bomProductIds = new Set((bomResult.data ?? []).map((line) => line.product_id));
      const routesByProduct = new Map<string, Array<{ id: string }>>();
      for (const route of routeResult.data ?? []) {
        if (!route.product_id) continue;
        const list = routesByProduct.get(route.product_id) ?? [];
        list.push({ id: route.id });
        routesByProduct.set(route.product_id, list);
      }

      const eligible = (productResult.data ?? []).filter((product) => {
        if (!bomProductIds.has(product.id)) return false;
        const preferred = product.production_route_id && routeKind.has(product.production_route_id)
          ? product.production_route_id
          : routesByProduct.get(product.id)?.[0]?.id;
        return preferred ? routeKind.get(preferred) === kind : false;
      });
      setProducts(eligible.map(({ id, code, name, unit }) => ({ id, code, name, unit })));
    })();
    return () => { cancelled = true; };
  }, [open, company?.id, kind]);

  const sectorMachines = useMemo(
    () => machines.filter((machine) => machine.active && machineMatchesSector(machine.sector, kind)),
    [machines, kind],
  );

  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const profilePayload = (): Record<string, unknown> => {
    const base = {
      machine_id: form.machineId === NONE ? null : form.machineId,
      work_center: textOrNull(form.workCenter),
      planned_output_kg: optionalNumber(form.plannedOutputKg),
      notes: textOrNull(form.notes),
    };
    if (kind === 'fiacao') {
      return { ...base, target_title: textOrNull(form.targetTitle), twist_per_m: optionalNumber(form.twistPerM) };
    }
    if (kind === 'malharia') {
      return { ...base, gauge: textOrNull(form.gauge), diameter_cm: optionalNumber(form.diameterCm) };
    }
    if (kind === 'beneficiamento') {
      return {
        machine_id: form.machineId === NONE ? null : form.machineId,
        work_center: textOrNull(form.workCenter),
        process_type: textOrNull(form.processType),
        target_width_cm: optionalNumber(form.targetWidthCm),
        target_grammage_g_m2: optionalNumber(form.targetGsm),
        target_shrinkage_pct: optionalNumber(form.targetShrinkagePct),
        temperature_c: optionalNumber(form.temperatureC),
        speed_m_min: optionalNumber(form.speedMMin),
        planned_output_m: optionalNumber(form.plannedOutputM),
        notes: textOrNull(form.notes),
      };
    }
    return {
      ...base,
      color_name: textOrNull(form.colorName),
      color_code: textOrNull(form.colorCode),
      bath_ratio: optionalNumber(form.bathRatio),
      batch_code: textOrNull(form.batchCode),
      lab_l: optionalNumber(form.labL),
      lab_a: optionalNumber(form.labA),
      lab_b: optionalNumber(form.labB),
    };
  };

  const hasProfileData = () => Object.values(profilePayload()).some((value) => value !== null && value !== '');

  const handleSubmit = async () => {
    const parsedQuantity = Number(form.quantity);
    if (!form.productId || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error('Selecione o produto e informe uma quantidade positiva');
      return;
    }
    setSubmitting(true);
    try {
      const result = await createTextileProductionOrder({
        productId: form.productId,
        quantity: parsedQuantity,
        idempotencyKey: createClientIdempotencyKey('op'),
        priority: form.priority,
        dueDate: form.dueDate ? new Date(`${form.dueDate}T23:59:59`).toISOString() : null,
        workCenter: textOrNull(form.workCenter),
        clientName: textOrNull(form.clientName),
        weavingProfile: {},
      });
      const orderId = typeof result.production_order_id === 'string' ? result.production_order_id : '';
      const orderNumber = typeof result.order_number === 'string' ? result.order_number : '';

      if (orderId && hasProfileData()) {
        const { data: createdOrder } = await supabase
          .from('production_orders')
          .select('sector')
          .eq('id', orderId)
          .single();
        const createdKind = sectorKindFromSectorText(createdOrder?.sector);
        if (createdKind !== kind) {
          toast.warning(
            `OP ${orderNumber || ''} criada no setor ${createdOrder?.sector || 'não identificado'}; o perfil de ${noun} NÃO foi aplicado. Selecione-a na central do setor criado para completar o perfil.`,
          );
          onOpenChange(false);
          await onCreated();
          return;
        }
        await upsertSectorOrderProfile(orderId, kind, profilePayload());
      }

      toast.success(orderNumber ? `OP ${orderNumber} de ${noun} criada com snapshot técnico` : `OP de ${noun} criada com snapshot técnico`);
      onOpenChange(false);
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Erro ao criar OP de ${noun}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova OP de {noun}</DialogTitle>
          <DialogDescription>
            Só entram produtos com BOM e roteiro ativo cuja primeira operação é de {noun} — a OP nasce no setor do roteiro,
            com snapshot técnico congelado. Parâmetros de processo são os configurados pela empresa; nenhum é presumido.
          </DialogDescription>
        </DialogHeader>

        {loadingProducts ? (
          <p className="text-sm text-muted-foreground">Carregando produtos elegíveis…</p>
        ) : products.length === 0 ? (
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p>
              Nenhum produto elegível para {noun}: cadastre a BOM e um roteiro ativo cuja primeira operação esteja
              classificada no setor de {SECTOR_LABELS[kind]} (operação em Produção → Etapas/roteiros).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><Link to="/producao/fichas">Fichas/BOM</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/producao/roteiros">Roteiros</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/producao/etapas">Operações</Link></Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>Produto da OP</Label>
            <Select value={form.productId} onValueChange={(value) => set({ productId: value })}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.code} — {product.name} ({product.unit})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Quantidade planejada</Label><Input type="number" min="0" step="0.0001" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>Prioridade</Label>
            <Select value={form.priority} onValueChange={(value) => set({ priority: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="urgent">Urgente</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="low">Baixa</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1"><Label>Data necessária</Label><Input type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></div>
          <div className="space-y-1"><Label>Centro de trabalho</Label><Input value={form.workCenter} onChange={(e) => set({ workCenter: e.target.value })} /></div>
          <div className="space-y-1 md:col-span-2"><Label>Cliente (opcional)</Label><Input value={form.clientName} onChange={(e) => set({ clientName: e.target.value })} /></div>

          <div className="space-y-1">
            <Label>{kind === 'fiacao' ? 'Filatório/máquina' : kind === 'malharia' ? 'Tear circular/máquina' : kind === 'beneficiamento' ? 'Rama/máquina de acabamento' : 'Máquina de tingir (JET/barca)'}</Label>
            <Select value={form.machineId} onValueChange={(value) => set({ machineId: value })}>
              <SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informado</SelectItem>
                {sectorMachines.map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.code} — {machine.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {kind !== 'beneficiamento' && (
            <div className="space-y-1"><Label>Produção planejada (kg)</Label><Input type="number" min="0" step="0.01" value={form.plannedOutputKg} onChange={(e) => set({ plannedOutputKg: e.target.value })} /></div>
          )}

          {kind === 'fiacao' && (
            <>
              <div className="space-y-1"><Label>Título do fio alvo (configurado)</Label><Input value={form.targetTitle} onChange={(e) => set({ targetTitle: e.target.value })} placeholder="Ex.: título cadastrado na ficha" /></div>
              <div className="space-y-1"><Label>Torção (voltas/m)</Label><Input type="number" min="0" step="0.01" value={form.twistPerM} onChange={(e) => set({ twistPerM: e.target.value })} /></div>
            </>
          )}
          {kind === 'malharia' && (
            <>
              <div className="space-y-1"><Label>Galga (configurada)</Label><Input value={form.gauge} onChange={(e) => set({ gauge: e.target.value })} /></div>
              <div className="space-y-1"><Label>Diâmetro (cm)</Label><Input type="number" min="0" step="0.01" value={form.diameterCm} onChange={(e) => set({ diameterCm: e.target.value })} /></div>
            </>
          )}
          {kind === 'beneficiamento' && (
            <>
              <div className="space-y-1"><Label>Processo (configurado)</Label><Input value={form.processType} onChange={(e) => set({ processType: e.target.value })} placeholder="Ex.: ramagem, sanforização" /></div>
              <div className="space-y-1"><Label>Largura final alvo (cm)</Label><Input type="number" min="0" step="0.01" value={form.targetWidthCm} onChange={(e) => set({ targetWidthCm: e.target.value })} /></div>
              <div className="space-y-1"><Label>Gramatura alvo (g/m²)</Label><Input type="number" min="0" step="0.01" value={form.targetGsm} onChange={(e) => set({ targetGsm: e.target.value })} /></div>
              <div className="space-y-1"><Label>Encolhimento alvo (%)</Label><Input type="number" min="0" step="0.01" value={form.targetShrinkagePct} onChange={(e) => set({ targetShrinkagePct: e.target.value })} /></div>
              <div className="space-y-1"><Label>Temperatura (ºC, configurada)</Label><Input type="number" min="0" step="0.01" value={form.temperatureC} onChange={(e) => set({ temperatureC: e.target.value })} /></div>
              <div className="space-y-1"><Label>Velocidade (m/min, configurada)</Label><Input type="number" min="0" step="0.01" value={form.speedMMin} onChange={(e) => set({ speedMMin: e.target.value })} /></div>
              <div className="space-y-1"><Label>Saída planejada (m)</Label><Input type="number" min="0" step="0.01" value={form.plannedOutputM} onChange={(e) => set({ plannedOutputM: e.target.value })} /></div>
            </>
          )}
          {kind === 'tinturaria' && (
            <>
              <div className="space-y-1"><Label>Partida/lote de tingimento</Label><Input value={form.batchCode} onChange={(e) => set({ batchCode: e.target.value })} /></div>
              <div className="space-y-1"><Label>Cor</Label><Input value={form.colorName} onChange={(e) => set({ colorName: e.target.value })} /></div>
              <div className="space-y-1"><Label>Código da cor</Label><Input value={form.colorCode} onChange={(e) => set({ colorCode: e.target.value })} /></div>
              <div className="space-y-1"><Label>Relação de banho (configurada)</Label><Input type="number" min="0" step="0.01" value={form.bathRatio} onChange={(e) => set({ bathRatio: e.target.value })} /></div>
              <div className="space-y-1"><Label>Meta L* (CIELAB, se aplicável)</Label><Input type="number" step="0.01" value={form.labL} onChange={(e) => set({ labL: e.target.value })} /></div>
              <div className="space-y-1"><Label>Meta a* (CIELAB, se aplicável)</Label><Input type="number" step="0.01" value={form.labA} onChange={(e) => set({ labA: e.target.value })} /></div>
              <div className="space-y-1"><Label>Meta b* (CIELAB, se aplicável)</Label><Input type="number" step="0.01" value={form.labB} onChange={(e) => set({ labB: e.target.value })} /></div>
            </>
          )}
          <div className="space-y-1 md:col-span-2"><Label>Observações do perfil</Label><Input value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || products.length === 0}>{submitting ? 'Criando…' : `Criar OP de ${noun}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
