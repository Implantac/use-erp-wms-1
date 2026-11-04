import { useCallback, useEffect, useState } from 'react';
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
import {
  describeSizingRecipeParameters,
  formatSizingRecipeLabel,
  type SizingRecipe,
} from '@/lib/production/sizingRecipes';
import { fetchSizingRecipes } from '@/services/production/sizingRecipes';
import { SizingRecipeManagerDialog } from './SizingRecipeManagerDialog';
import { describeArticleSheet, type ArticleSheet } from '@/lib/production/articleSheets';
import {
  fetchArticleSheetsForProduct,
  fetchOrderArticleSheetId,
  setOrderArticleSheet,
} from '@/services/production/articleSheets';
import { ArticleSheetManagerDialog } from './ArticleSheetManagerDialog';

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
  const [sizingRecipes, setSizingRecipes] = useState<SizingRecipe[]>([]);
  const [recipeManagerOpen, setRecipeManagerOpen] = useState(false);
  const [articleSheets, setArticleSheets] = useState<ArticleSheet[]>([]);
  const [articleSheetManagerOpen, setArticleSheetManagerOpen] = useState(false);
  const [articleSheetVersionId, setArticleSheetVersionId] = useState(NONE);
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
    warpPreparationStatus: 'not_informed',
    warperMachineId: NONE,
    warperResourceId: NONE,
    sizingApplicable: NONE,
    sizeProductId: NONE,
    sizeLotId: NONE,
    sizeRecipeCode: '',
    sizingRecipeVersionId: NONE,
    sizeConcentrationPct: '',
    sizingTemperatureC: '',
    sizingSpeedMMin: '',
    dryingTemperatureC: '',
    warpMoisturePct: '',
    warpPreparationNotes: '',
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

  const loadSizingRecipes = useCallback(async () => {
    try {
      setSizingRecipes(await fetchSizingRecipes(order.company_id));
    } catch {
      setSizingRecipes([]);
    }
  }, [order.company_id]);
  useEffect(() => { void loadSizingRecipes(); }, [loadSizingRecipes]);

  const loadArticleSheets = useCallback(async () => {
    try {
      const [sheets, boundId] = await Promise.all([
        fetchArticleSheetsForProduct(order.product_id),
        fetchOrderArticleSheetId(order.id),
      ]);
      setArticleSheets(sheets);
      setArticleSheetVersionId(boundId ?? NONE);
    } catch {
      setArticleSheets([]);
    }
  }, [order.id, order.product_id]);
  useEffect(() => { void loadArticleSheets(); }, [loadArticleSheets]);

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
      warpPreparationStatus: profile?.warp_preparation_status ?? 'not_informed',
      warperMachineId: profile?.warper_machine_id ?? NONE,
      warperResourceId: profile?.warper_resource_id ?? NONE,
      sizingApplicable: profile?.sizing_applicable === null || profile?.sizing_applicable === undefined ? NONE : profile.sizing_applicable ? 'yes' : 'no',
      sizeProductId: profile?.size_product_id ?? NONE,
      sizeLotId: profile?.size_lot_id ?? NONE,
      sizeRecipeCode: profile?.size_recipe_code ?? '',
      sizingRecipeVersionId: profile?.sizing_recipe_version_id ?? NONE,
      sizeConcentrationPct: profile?.size_concentration_pct !== null && profile?.size_concentration_pct !== undefined ? String(profile.size_concentration_pct) : '',
      sizingTemperatureC: profile?.sizing_temperature_c !== null && profile?.sizing_temperature_c !== undefined ? String(profile.sizing_temperature_c) : '',
      sizingSpeedMMin: profile?.sizing_speed_m_min !== null && profile?.sizing_speed_m_min !== undefined ? String(profile.sizing_speed_m_min) : '',
      dryingTemperatureC: profile?.drying_temperature_c !== null && profile?.drying_temperature_c !== undefined ? String(profile.drying_temperature_c) : '',
      warpMoisturePct: profile?.warp_moisture_pct !== null && profile?.warp_moisture_pct !== undefined ? String(profile.warp_moisture_pct) : '',
      warpPreparationNotes: profile?.warp_preparation_notes ?? '',
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
        warp_preparation_status: form.warpPreparationStatus,
        warper_machine_id: form.warperMachineId === NONE ? null : form.warperMachineId,
        warper_resource_id: form.warperResourceId === NONE ? null : form.warperResourceId,
        sizing_applicable: form.sizingApplicable === NONE ? null : form.sizingApplicable === 'yes',
        size_product_id: form.sizeProductId === NONE ? null : form.sizeProductId,
        size_lot_id: form.sizeLotId === NONE ? null : form.sizeLotId,
        size_recipe_code: form.sizeRecipeCode.trim() || null,
        sizing_recipe_version_id: form.sizingRecipeVersionId === NONE ? null : form.sizingRecipeVersionId,
        size_concentration_pct: numberOrNull(form.sizeConcentrationPct),
        sizing_temperature_c: numberOrNull(form.sizingTemperatureC),
        sizing_speed_m_min: numberOrNull(form.sizingSpeedMMin),
        drying_temperature_c: numberOrNull(form.dryingTemperatureC),
        warp_moisture_pct: numberOrNull(form.warpMoisturePct),
        warp_preparation_notes: form.warpPreparationNotes.trim() || null,
      });
      await setOrderArticleSheet(order.id, articleSheetVersionId === NONE ? null : articleSheetVersionId);
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
        <CardTitle className="text-base">Montagem do tear desta OP</CardTitle>
        <CardDescription>Confira na ordem: onde vai tecer, quais fios/lotes serão usados e os parâmetros do artigo. Urdume e trama listam apenas produtos classificados como fio; nenhum valor é sugerido automaticamente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm md:grid-cols-4">
          <p><span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tear</span><strong>{machines.find((machine) => machine.id === form.machineId)?.code || form.workCenter || 'não definido'}</strong></p>
          <p><span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rolo de urdume</span><strong>{form.beamCode || 'não informado'}</strong></p>
          <p><span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fios</span><strong>{products.find((product) => product.id === form.warpProductId)?.code || 'urdume ?'} / {products.find((product) => product.id === form.weftProductId)?.code || 'trama ?'}</strong></p>
          <p><span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comprimento</span><strong>{form.plannedLengthM ? `${form.plannedLengthM} m` : 'não informado'}</strong></p>
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-bold">1. Montar o tear</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1"><Label>Tear cadastrado</Label><Select value={form.machineId} onValueChange={(value) => setForm({ ...form, machineId: value })}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{machines.filter((machine) => machine.active && machineMatchesSector(machine.sector, 'tecelagem')).map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.code} — {machine.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Recurso de capacidade</Label><Select value={form.resourceId} onValueChange={(value) => setForm({ ...form, resourceId: value })}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{resources.filter((resource) => resource.is_active && machineMatchesSector(resource.sector_name, 'tecelagem')).map((resource) => <SelectItem key={resource.id} value={resource.id}>{resource.code} — {resource.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Centro/tear (texto)</Label><Input value={form.workCenter} onChange={(event) => setForm({ ...form, workCenter: event.target.value })} placeholder="Só se não usar o cadastro" /></div>
            <div className="space-y-1"><Label>Rolo de urdume</Label><Input value={form.beamCode} onChange={(event) => setForm({ ...form, beamCode: event.target.value })} /></div>
            <div className="space-y-1"><Label>Pente</Label><Input value={form.reedCode} onChange={(event) => setForm({ ...form, reedCode: event.target.value })} /></div>
            <div className="space-y-1"><Label>Setup previsto (min)</Label><Input type="number" min="0" step="0.01" value={form.setupMinutes} onChange={(event) => setForm({ ...form, setupMinutes: event.target.value })} /></div>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-bold">2. Separar fios e lotes</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Fio de urdume</Label>{productOptions(form.warpProductId, (value) => setForm({ ...form, warpProductId: value, warpLotId: NONE }))}</div>
            <div className="space-y-1"><Label>Lote de urdume</Label>{lotOptions(form.warpLotId, (value) => setForm({ ...form, warpLotId: value }), form.warpProductId)}</div>
            <div className="space-y-1"><Label>Fio de trama</Label>{productOptions(form.weftProductId, (value) => setForm({ ...form, weftProductId: value, weftLotId: NONE }))}</div>
            <div className="space-y-1"><Label>Lote de trama</Label>{lotOptions(form.weftLotId, (value) => setForm({ ...form, weftLotId: value }), form.weftProductId)}</div>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-bold">3. Preparar urdume e engomagem</h4>
          <p className="text-xs text-muted-foreground">Registre a preparação como operação própria da OP. Receita, concentração, temperaturas e velocidade só entram quando a empresa os informar.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1"><Label>Estado da preparação</Label><Select value={form.warpPreparationStatus} onValueChange={(value) => setForm({ ...form, warpPreparationStatus: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="not_informed">Não informado</SelectItem><SelectItem value="warped">Urdido</SelectItem><SelectItem value="sized">Engomado</SelectItem><SelectItem value="ready">Pronto para montar</SelectItem><SelectItem value="not_applicable">Não aplicável</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Urdideira</Label><Select value={form.warperMachineId} onValueChange={(value) => setForm({ ...form, warperMachineId: value })}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{machines.filter((machine) => machine.active && machineMatchesSector(machine.sector, 'tecelagem')).map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.code} — {machine.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Recurso da urdideira</Label><Select value={form.warperResourceId} onValueChange={(value) => setForm({ ...form, warperResourceId: value })}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{resources.filter((resource) => resource.is_active && machineMatchesSector(resource.sector_name, 'tecelagem')).map((resource) => <SelectItem key={resource.id} value={resource.id}>{resource.code} — {resource.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Engomagem aplicável?</Label><Select value={form.sizingApplicable} onValueChange={(value) => setForm({ ...form, sizingApplicable: value, sizeProductId: value === 'no' ? NONE : form.sizeProductId, sizeLotId: value === 'no' ? NONE : form.sizeLotId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem><SelectItem value="yes">Sim</SelectItem><SelectItem value="no">Não</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Umidade do urdume (%)</Label><Input type="number" min="0" max="100" step="0.01" value={form.warpMoisturePct} onChange={(event) => setForm({ ...form, warpMoisturePct: event.target.value })} /></div>
            <div className="space-y-1"><Label>Observações da preparação</Label><Input value={form.warpPreparationNotes} onChange={(event) => setForm({ ...form, warpPreparationNotes: event.target.value })} /></div>
          </div>
          {form.sizingApplicable === 'yes' && (
            <div className="grid gap-3 rounded-md border p-3 md:grid-cols-3">
              <div className="space-y-1"><Label>Produto de goma</Label><Select value={form.sizeProductId} onValueChange={(value) => setForm({ ...form, sizeProductId: value, sizeLotId: NONE })}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.code} — {product.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Lote da goma</Label>{lotOptions(form.sizeLotId, (value) => setForm({ ...form, sizeLotId: value }), form.sizeProductId)}</div>
              <div className="space-y-1 md:col-span-2"><Label>Receita aprovada (versionada)</Label><Select value={form.sizingRecipeVersionId} onValueChange={(value) => { const recipe = sizingRecipes.find((item) => item.id === value); setForm({ ...form, sizingRecipeVersionId: value, sizingApplicable: value === NONE ? form.sizingApplicable : 'yes', sizeRecipeCode: recipe ? `${recipe.recipe_code} v${recipe.version}` : form.sizeRecipeCode, sizeProductId: recipe?.size_product_id ?? form.sizeProductId, sizeConcentrationPct: recipe?.parameters.concentration_pct !== undefined && recipe?.parameters.concentration_pct !== null ? String(recipe.parameters.concentration_pct) : form.sizeConcentrationPct, sizingTemperatureC: recipe?.parameters.bath_temperature_c !== undefined && recipe?.parameters.bath_temperature_c !== null ? String(recipe.parameters.bath_temperature_c) : form.sizingTemperatureC, sizingSpeedMMin: recipe?.parameters.speed_m_min !== undefined && recipe?.parameters.speed_m_min !== null ? String(recipe.parameters.speed_m_min) : form.sizingSpeedMMin, dryingTemperatureC: recipe?.parameters.drying_temperature_c !== undefined && recipe?.parameters.drying_temperature_c !== null ? String(recipe.parameters.drying_temperature_c) : form.dryingTemperatureC, warpMoisturePct: recipe?.parameters.warp_moisture_pct !== undefined && recipe?.parameters.warp_moisture_pct !== null ? String(recipe.parameters.warp_moisture_pct) : form.warpMoisturePct }); }}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{sizingRecipes.filter((recipe) => recipe.status === 'approved').map((recipe) => <SelectItem key={recipe.id} value={recipe.id}>{formatSizingRecipeLabel(recipe)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Receitas da empresa</Label><Button type="button" variant="outline" className="w-full" onClick={() => setRecipeManagerOpen(true)}>Gerenciar receitas</Button></div>
              <div className="space-y-1"><Label>Código legado (sem versão)</Label><Input value={form.sizeRecipeCode} disabled={form.sizingRecipeVersionId !== NONE} onChange={(event) => setForm({ ...form, sizeRecipeCode: event.target.value })} /></div>
              <div className="space-y-1"><Label>Concentração (%)</Label><Input type="number" min="0" max="100" step="0.01" value={form.sizeConcentrationPct} onChange={(event) => setForm({ ...form, sizeConcentrationPct: event.target.value })} /></div>
              <div className="space-y-1"><Label>Temperatura do banho (°C)</Label><Input type="number" min="0" step="0.01" value={form.sizingTemperatureC} onChange={(event) => setForm({ ...form, sizingTemperatureC: event.target.value })} /></div>
              <div className="space-y-1"><Label>Velocidade (m/min)</Label><Input type="number" min="0" step="0.01" value={form.sizingSpeedMMin} onChange={(event) => setForm({ ...form, sizingSpeedMMin: event.target.value })} /></div>
              <div className="space-y-1"><Label>Temperatura de secagem (°C)</Label><Input type="number" min="0" step="0.01" value={form.dryingTemperatureC} onChange={(event) => setForm({ ...form, dryingTemperatureC: event.target.value })} /></div>
              {form.sizingRecipeVersionId !== NONE && (
                <p className="text-xs text-muted-foreground md:col-span-3">
                  Ao salvar, o servidor usa os parâmetros da versão aprovada selecionada
                  {describeSizingRecipeParameters(sizingRecipes.find((recipe) => recipe.id === form.sizingRecipeVersionId)?.parameters)
                    ? `: ${describeSizingRecipeParameters(sizingRecipes.find((recipe) => recipe.id === form.sizingRecipeVersionId)?.parameters)}`
                    : '.'}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-bold">4. Conferir os parâmetros do artigo</h4>
          <div className="grid gap-3 rounded-md border p-3 md:grid-cols-3">
            <div className="space-y-1 md:col-span-2"><Label>Ficha técnica do artigo aprovada (versionada)</Label><Select value={articleSheetVersionId} onValueChange={setArticleSheetVersionId}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{articleSheets.filter((sheet) => sheet.status === 'approved').map((sheet) => <SelectItem key={sheet.id} value={sheet.id}>v{sheet.version} — {describeArticleSheet(sheet) || 'construção informada'}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Fichas do artigo</Label><Button type="button" variant="outline" className="w-full" onClick={() => setArticleSheetManagerOpen(true)}>Gerenciar fichas</Button></div>
            {articleSheetVersionId !== NONE && (
              <p className="text-xs text-muted-foreground md:col-span-3">
                Ao salvar, a OP guarda um snapshot desta versão da ficha
                ({describeArticleSheet(articleSheets.find((sheet) => sheet.id === articleSheetVersionId) ?? {
                  composition: null, construction: null, target_gsm: null, gsm_tolerance_pct: null,
                  target_width_cm: null, width_tolerance_cm: null, warp_density_per_cm: null, weft_density_per_cm: null,
                }) || 'construção informada'}); aprovar outra versão depois não altera esta OP.
              </p>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1"><Label>Batidas/cm da ficha</Label><Input type="number" min="0" step="0.01" value={form.picksPerCm} onChange={(event) => setForm({ ...form, picksPerCm: event.target.value })} /></div>
            <div className="space-y-1"><Label>Quantidade de fios de urdume</Label><Input type="number" min="0" step="1" value={form.warpThreadCount} onChange={(event) => setForm({ ...form, warpThreadCount: event.target.value })} /></div>
            <div className="space-y-1"><Label>Largura planejada (cm)</Label><Input type="number" min="0" step="0.01" value={form.plannedWidthCm} onChange={(event) => setForm({ ...form, plannedWidthCm: event.target.value })} /></div>
            <div className="space-y-1"><Label>Comprimento planejado (m)</Label><Input type="number" min="0" step="0.01" value={form.plannedLengthM} onChange={(event) => setForm({ ...form, plannedLengthM: event.target.value })} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Observações da montagem</Label><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">Salve a montagem antes de apontar as passagens para a equipe trabalhar com os mesmos dados.</p>
          <Button onClick={save} disabled={saving || ['completed', 'cancelled'].includes(order.status)}>{saving ? 'Salvando…' : 'Salvar montagem do tear'}</Button>
        </div>
      </CardContent>
      <SizingRecipeManagerDialog
        open={recipeManagerOpen}
        onOpenChange={setRecipeManagerOpen}
        products={products}
        recipes={sizingRecipes}
        onChanged={loadSizingRecipes}
      />
      <ArticleSheetManagerDialog
        open={articleSheetManagerOpen}
        onOpenChange={setArticleSheetManagerOpen}
        products={products}
        sheets={articleSheets}
        onChanged={loadArticleSheets}
      />
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
  profileMachineId?: string | null;
  onChanged: () => Promise<void> | void;
}

export function WeavingEventsPanel({ order, events, profileMachineId, onChanged }: EventsProps) {
  const { machines } = useProductionMachines();
  const { resources } = useProductionResources();
  const operatorNames = resources
    .filter((resource) => resource.resource_type === 'operator' && resource.is_active)
    .map((resource) => resource.name);
  const [eventType, setEventType] = useState('note');
  const [machineId, setMachineId] = useState(NONE);
  useEffect(() => { setMachineId(profileMachineId ?? NONE); }, [profileMachineId, order.id]);
  const [quantityM, setQuantityM] = useState('');
  const [downtimeMinutes, setDowntimeMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [deviationCategory, setDeviationCategory] = useState(NONE);
  const [causeStatus, setCauseStatus] = useState('em_investigacao');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsedQuantity = quantityM ? Number(quantityM) : null;
    const parsedDowntime = downtimeMinutes ? Number(downtimeMinutes) : null;
    if ((parsedQuantity !== null && (!Number.isFinite(parsedQuantity) || parsedQuantity < 0))
      || (parsedDowntime !== null && (!Number.isFinite(parsedDowntime) || parsedDowntime < 0))) {
      toast.error('Informe metros e minutos de parada válidos, sem valores negativos');
      return;
    }
    setSaving(true);
    try {
      await recordWeavingEvent({
        productionOrderId: order.id,
        eventType,
        machineId: machineId === NONE ? null : machineId,
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
        <CardTitle className="text-base">Paradas, rupturas e registros do tear</CardTitle>
        <CardDescription>Toque no que aconteceu, informe apenas os dados que tiver e registre. Sem sensor integrado configurado, este é o apontamento oficial do tear.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>O que aconteceu?</Label>
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.filter(([value]) => ['start', 'pause', 'resume', 'warp_break', 'weft_break', 'beam_change', 'stop'].includes(value)).map(([value, label]) => (
              <Button key={value} type="button" size="sm" variant={eventType === value ? 'default' : 'outline'} onClick={() => setEventType(value)}>{label}</Button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1"><Label>Tipo de registro</Label><Select value={eventType} onValueChange={setEventType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENT_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Tear</Label><Select value={machineId} onValueChange={setMachineId}><SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{machines.filter((machine) => machine.active && machineMatchesSector(machine.sector, 'tecelagem')).map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.code} — {machine.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Operador</Label><Input value={operatorName} list="weaving-operator-names" onChange={(event) => setOperatorName(event.target.value)} placeholder="Quem registrou" /></div>
          <div className="space-y-1"><Label>Metros produzidos neste registro</Label><Input type="number" min="0" step="0.01" value={quantityM} onChange={(event) => setQuantityM(event.target.value)} /></div>
          <div className="space-y-1"><Label>Tempo parado (min)</Label><Input type="number" min="0" step="0.01" value={downtimeMinutes} onChange={(event) => setDowntimeMinutes(event.target.value)} /></div>
          <div className="space-y-1"><Label>O que o operador observou?</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: fio arrebentou próximo ao pente" /></div>
        </div>
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-bold">Classificar a causa (opcional, pode fazer depois)</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Classificação do desvio</Label><Select value={deviationCategory} onValueChange={setDeviationCategory}><SelectTrigger><SelectValue placeholder="Não classificado" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não classificado</SelectItem>{SECTOR_DEVIATION_CATEGORIES.tecelagem.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Situação da causa</Label><Select value={causeStatus} onValueChange={setCauseStatus} disabled={deviationCategory === NONE}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DEVIATION_CAUSE_STATUSES.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">A causa nasce “em investigação” e só vira confirmada com a análise do responsável.</p>
        </details>
        <datalist id="weaving-operator-names">
          {operatorNames.map((name) => <option key={name} value={name} />)}
        </datalist>
        <Button size="sm" onClick={save} disabled={saving || ['completed', 'cancelled'].includes(order.status)}>{saving ? 'Registrando…' : 'Registrar no tear'}</Button>
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
