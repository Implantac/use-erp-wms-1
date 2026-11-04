import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { Badge } from '@/ui/base/badge';
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
import { computeEligibleProductIds } from '@/lib/pcp/eligibleProducts';
import { demandIdempotencyKey } from '@/lib/pcp/completionReadiness';
import { formatNumber } from '@/lib/formatters';
import { sectorKindFromSectorText, SECTOR_LABELS } from '@/lib/pcp/sectorProfiles';

const NONE = '__none__';

interface ProductOption {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface SalesOrderOption {
  id: string;
  number: string;
  client_name: string;
  client_id: string | null;
}

interface SalesItemOption {
  id: string;
  product_id: string | null;
  product_name: string;
  product_code: string;
  quantity: number;
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
  const [origin, setOrigin] = useState<'avulsa' | 'pedido'>('avulsa');
  const [salesOrders, setSalesOrders] = useState<SalesOrderOption[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [orderItems, setOrderItems] = useState<SalesItemOption[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
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
      const [productResult, bomResult, routeResult, routeStepResult, stepResult, orderResult] = await Promise.all([
        supabase.from('products').select('id, code, name, unit, production_route_id').eq('company_id', company.id).eq('status', 'active').order('name'),
        supabase.from('production_bom').select('product_id').eq('company_id', company.id),
        supabase.from('production_routes').select('id, product_id, is_active, created_at').eq('company_id', company.id).eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('production_route_steps').select('route_id, step_name, sequence').eq('company_id', company.id).order('sequence'),
        supabase.from('production_steps').select('name, sector, is_active').eq('company_id', company.id).eq('is_active', true),
        supabase.from('orders').select('id, number, client_name, client_id').eq('company_id', company.id).in('status', ['confirmed', 'awaiting_production']).order('created_at', { ascending: false }).limit(50),
      ]);
      if (!orderResult.error) setSalesOrders((orderResult.data ?? []) as SalesOrderOption[]);
      if (cancelled) return;
      setLoadingProducts(false);
      if (productResult.error || bomResult.error || routeResult.error || routeStepResult.error || stepResult.error) {
        toast.error('Erro ao carregar produtos elegíveis para a OP');
        setProducts([]);
        return;
      }

      // Elegibilidade = a conta da RPC (BOM + roteiro começando no
      // setor, operação única por nome), compartilhada com a tecelagem.
      const eligibleIds = computeEligibleProductIds({
        products: productResult.data ?? [],
        bomProductIds: new Set((bomResult.data ?? []).map((line) => line.product_id)),
        routes: routeResult.data ?? [],
        routeSteps: routeStepResult.data ?? [],
        steps: stepResult.data ?? [],
      }, kind);
      setProducts(
        (productResult.data ?? [])
          .filter((product) => eligibleIds.has(product.id))
          .map(({ id, code, name, unit }) => ({ id, code, name, unit })),
      );
    })();
    return () => { cancelled = true; };
  }, [open, company?.id, kind]);

  useEffect(() => {
    if (!selectedOrderId) { setOrderItems([]); return; }
    void (async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('id, product_id, product_name, product_code, quantity')
        .eq('order_id', selectedOrderId);
      if (!error) setOrderItems((data ?? []) as SalesItemOption[]);
    })();
  }, [selectedOrderId]);

  const sectorMachines = useMemo(
    () => machines.filter((machine) => machine.active && machineMatchesSector(machine.sector, kind)),
    [machines, kind],
  );

  const fromOrder = origin === 'pedido';
  const selectedOrder = salesOrders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedItem = orderItems.find((item) => item.id === selectedItemId) ?? null;
  const visibleOrders = useMemo(() => {
    const term = orderSearch.trim().toLowerCase();
    if (!term) return salesOrders;
    return salesOrders.filter((order) => order.number.toLowerCase().includes(term) || order.client_name.toLowerCase().includes(term));
  }, [salesOrders, orderSearch]);

  const pickItem = (item: SalesItemOption) => {
    if (!item.product_id || !selectedOrder) return;
    setSelectedItemId(item.id);
    set({ productId: item.product_id, quantity: String(item.quantity), clientName: selectedOrder.client_name });
  };

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
    if (fromOrder && (!selectedOrder || !selectedItem)) {
      toast.error('Localize o pedido e selecione o item para gerar a OP');
      return;
    }
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
        idempotencyKey: fromOrder && selectedOrder && selectedItem
          ? demandIdempotencyKey(selectedOrder.id, selectedItem.id)
          : createClientIdempotencyKey('op'),
        priority: form.priority,
        dueDate: form.dueDate ? new Date(`${form.dueDate}T23:59:59`).toISOString() : null,
        workCenter: textOrNull(form.workCenter),
        clientName: textOrNull(form.clientName),
        salesOrderId: fromOrder ? selectedOrder?.id ?? null : null,
        orderItemId: fromOrder ? selectedItem?.id ?? null : null,
        clientId: fromOrder ? selectedOrder?.client_id ?? null : null,
        weavingProfile: {},
      });
      const orderId = typeof result.production_order_id === 'string' ? result.production_order_id : '';
      const orderNumber = typeof result.order_number === 'string' ? result.order_number : '';
      const replay = result.idempotent_replay === true;

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

      toast.success(replay
        ? `Este item já tinha a OP ${orderNumber} — nada foi duplicado.`
        : orderNumber ? `OP ${orderNumber} de ${noun} criada com snapshot técnico` : `OP de ${noun} criada com snapshot técnico`);
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
            A OP pode nascer de um pedido confirmado ou avulsa. Só entram produtos com BOM e roteiro ativo cuja primeira operação é de {noun} — a OP nasce no setor do roteiro,
            com snapshot técnico congelado. Parâmetros de processo são os configurados pela empresa; nenhum é presumido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Origem da OP</Label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={origin === 'pedido' ? 'default' : 'outline'} onClick={() => setOrigin('pedido')}>A partir de pedido</Button>
            <Button type="button" size="sm" variant={origin === 'avulsa' ? 'default' : 'outline'} onClick={() => setOrigin('avulsa')}>Avulsa (manual)</Button>
          </div>
        </div>

        {fromOrder ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Localizar pedido (número ou cliente)</Label>
                <Input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Ex.: 1024 ou o nome do cliente" />
              </div>
              <div className="space-y-1">
                <Label>Pedidos confirmados aguardando produção</Label>
                <Select value={selectedOrderId} onValueChange={(value) => { setSelectedOrderId(value); setSelectedItemId(''); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o pedido" /></SelectTrigger>
                  <SelectContent>{visibleOrders.map((order) => <SelectItem key={order.id} value={order.id}>{order.number} — {order.client_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {salesOrders.length === 0 ? (
              <p className="text-sm text-amber-700">Nenhum pedido confirmado aguardando produção nesta empresa. Confirme o pedido no Comercial ou crie a OP como Avulsa.</p>
            ) : null}
            {selectedOrder ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Itens do pedido {selectedOrder.number} — selecione o item</p>
                {orderItems.length === 0 ? <p className="text-sm text-muted-foreground">Pedido sem itens.</p> : orderItems.map((item) => {
                  const eligible = item.product_id ? products.some((product) => product.id === item.product_id) : false;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!item.product_id}
                      onClick={() => pickItem(item)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${selectedItemId === item.id ? 'border-primary bg-primary/5' : ''} disabled:opacity-50`}
                    >
                      <span>{item.product_code ? `${item.product_code} — ` : ''}{item.product_name}</span>
                      <span className="flex items-center gap-2">
                        {!item.product_id ? <Badge variant="outline">sem produto vinculado</Badge> : !eligible ? <Badge variant="outline">sem BOM/roteiro de {noun}</Badge> : null}
                        <span className="text-muted-foreground">{formatNumber(item.quantity)}</span>
                      </span>
                    </button>
                  );
                })}
                {selectedItem && selectedItem.product_id && !products.some((product) => product.id === selectedItem.product_id) ? (
                  <p className="text-sm text-amber-700">Este item não tem BOM/roteiro de {noun}: a OP nascerá no setor do roteiro dele (sem o perfil de {noun}) ou será recusada se faltar estrutura. Cadastre antes (Fichas/Roteiros) se ele deveria ser de {noun}.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {loadingProducts ? (
          <p className="text-sm text-muted-foreground">Carregando produtos elegíveis…</p>
        ) : !fromOrder && products.length === 0 ? (
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
            <Label>Produto da OP {fromOrder ? '(do item selecionado)' : ''}</Label>
            {fromOrder ? (
              <Input value={selectedItem ? `${selectedItem.product_code ? `${selectedItem.product_code} — ` : ''}${selectedItem.product_name}` : ''} placeholder="Selecione o item do pedido acima" disabled />
            ) : (
              <Select value={form.productId} onValueChange={(value) => set({ productId: value })}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.code} — {product.name} ({product.unit})</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1"><Label>Quantidade planejada</Label><Input type="number" min="0" step="0.0001" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} disabled={fromOrder} /></div>
          <div className="space-y-1">
            <Label>Prioridade</Label>
            <Select value={form.priority} onValueChange={(value) => set({ priority: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="urgent">Urgente</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="low">Baixa</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1"><Label>Data necessária</Label><Input type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></div>
          <div className="space-y-1"><Label>Centro de trabalho</Label><Input value={form.workCenter} onChange={(e) => set({ workCenter: e.target.value })} /></div>
          <div className="space-y-1 md:col-span-2"><Label>Cliente (opcional)</Label><Input value={form.clientName} onChange={(e) => set({ clientName: e.target.value })} disabled={fromOrder} /></div>

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
          <Button onClick={handleSubmit} disabled={submitting || (!fromOrder && products.length === 0)}>{submitting ? 'Criando…' : `Criar OP de ${noun}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
