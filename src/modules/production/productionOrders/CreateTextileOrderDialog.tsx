import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import { useProductionResources } from '@/hooks/production/useProductionResources';
import { createClientIdempotencyKey, createTextileProductionOrder } from '@/services/production/textilePcpService';
import { filterYarnProducts } from '@/lib/pcp/productFilters';
import { computeEligibleProductIds } from '@/lib/pcp/eligibleProducts';
import { demandIdempotencyKey } from '@/lib/pcp/completionReadiness';
import { formatNumber } from '@/lib/formatters';

interface ProductOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  category_id?: string | null;
  subcategory?: string | null;
  category_name?: string | null;
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
}

const NONE = '__none__';

/**
 * Nova OP de tecelagem com origem: PEDIDO (localiza o pedido confirmado
 * aguardando produção e escolhe o item — a OP nasce vinculada, sem
 * duplicar para o mesmo item) ou AVULSA (manual). Nos dois caminhos a
 * RPC valida BOM e roteiro de tecelagem, gera as etapas, numera a OP e
 * congela o snapshot técnico; parâmetro de tear nunca é presumido.
 */
export function CreateTextileOrderDialog({ open, onOpenChange, onCreated }: Props) {
  const { company } = useActiveTenant();
  const { resources } = useProductionResources();
  const { machines } = useProductionMachines();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [eligibleIds, setEligibleIds] = useState<ReadonlySet<string>>(new Set());
  const [origin, setOrigin] = useState<'avulsa' | 'pedido'>('avulsa');
  const [salesOrders, setSalesOrders] = useState<SalesOrderOption[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [orderItems, setOrderItems] = useState<SalesItemOption[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [workCenter, setWorkCenter] = useState('');
  const [clientName, setClientName] = useState('');
  const [warpProductId, setWarpProductId] = useState(NONE);
  const [weftProductId, setWeftProductId] = useState(NONE);
  const [resourceId, setResourceId] = useState(NONE);
  const [machineId, setMachineId] = useState(NONE);
  const [beamCode, setBeamCode] = useState('');
  const [reedCode, setReedCode] = useState('');
  const [picksPerCm, setPicksPerCm] = useState('');
  const [warpThreadCount, setWarpThreadCount] = useState('');
  const [plannedWidthCm, setPlannedWidthCm] = useState('');
  const [plannedLengthM, setPlannedLengthM] = useState('');
  const [setupMinutes, setSetupMinutes] = useState('');
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !company?.id) return;
    void (async () => {
      const [productResult, categoryResult, bomResult, routeResult, routeStepResult, stepResult, orderResult] = await Promise.all([
        supabase.from('products').select('id, code, name, unit, category_id, subcategory, production_route_id').eq('company_id', company.id).eq('status', 'active').order('name'),
        supabase.from('categories').select('id, name'),
        supabase.from('production_bom').select('product_id').eq('company_id', company.id),
        supabase.from('production_routes').select('id, product_id').eq('company_id', company.id).eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('production_route_steps').select('route_id, step_name').eq('company_id', company.id).order('sequence'),
        supabase.from('production_steps').select('name, sector').eq('company_id', company.id).eq('is_active', true),
        supabase.from('orders').select('id, number, client_name, client_id').eq('company_id', company.id).in('status', ['confirmed', 'awaiting_production']).order('created_at', { ascending: false }).limit(50),
      ]);
      if (productResult.error) { toast.error('Erro ao carregar produtos para a OP'); return; }
      const categoryNames = new Map((categoryResult.data ?? []).map((c) => [c.id, c.name]));
      setProducts((productResult.data ?? []).map((product) => ({
        ...product,
        category_name: product.category_id ? categoryNames.get(product.category_id) ?? null : null,
      })));
      if (!bomResult.error && !routeResult.error && !routeStepResult.error && !stepResult.error) {
        setEligibleIds(computeEligibleProductIds({
          products: productResult.data ?? [],
          bomProductIds: new Set((bomResult.data ?? []).map((line) => line.product_id)),
          routes: routeResult.data ?? [],
          routeSteps: routeStepResult.data ?? [],
          steps: stepResult.data ?? [],
        }, 'tecelagem'));
      }
      if (!orderResult.error) setSalesOrders((orderResult.data ?? []) as SalesOrderOption[]);
    })();
  }, [open, company?.id]);

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

  useEffect(() => {
    if (open) {
      setStep(0);
      setStepError('');
    }
  }, [open ]);

  const eligibleProducts = useMemo(
    () => products.filter((product) => eligibleIds.has(product.id)),
    [products, eligibleIds],
  );
  const visibleOrders = useMemo(() => {
    const term = orderSearch.trim().toLowerCase();
    if (!term) return salesOrders;
    return salesOrders.filter((order) => order.number.toLowerCase().includes(term) || order.client_name.toLowerCase().includes(term));
  }, [salesOrders, orderSearch]);
  const selectedOrder = salesOrders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedItem = orderItems.find((item) => item.id === selectedItemId) ?? null;
  const fromOrder = origin === 'pedido';

  const pickItem = (item: SalesItemOption) => {
    if (!item.product_id || !selectedOrder) return;
    setSelectedItemId(item.id);
    setProductId(item.product_id);
    setQuantity(String(item.quantity));
    setClientName(selectedOrder.client_name);
  };

  const optionalNumber = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const selectedProduct = products.find((product) => product.id === productId) ?? null;
  const selectedMachine = machines.find((machine) => machine.id === machineId) ?? null;
  const selectedResource = resources.find((resource) => resource.id === resourceId) ?? null;
  const selectedWarpProduct = products.find((product) => product.id === warpProductId) ?? null;
  const selectedWeftProduct = products.find((product) => product.id === weftProductId) ?? null;
  const demandError = (() => {
    if (fromOrder) {
      if (!selectedOrder) return 'Primeiro localize e selecione o pedido confirmado.';
      if (!selectedItem) return 'Selecione o item do pedido que será produzido.';
      if (!selectedItem.product_id) return 'Este item não está vinculado a um produto. Vincule o produto no pedido ou cadastre a OP pelo setor correto.';
      if (!eligibleIds.has(selectedItem.product_id)) return 'Este item ainda não tem ficha (BOM) e roteiro começando na tecelagem. Cadastre a ficha/roteiro ou gere a OP pelo setor do roteiro dele.';
    } else if (!productId) {
      return eligibleProducts.length === 0
        ? 'Nenhum artigo está pronto para tecer: falta produto ativo com BOM e roteiro começando na tecelagem.'
        : 'Selecione o artigo que será tecido.';
    }
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return 'Informe uma quantidade maior que zero.';
    return '';
  })();

  const goNext = () => {
    if (step === 0 && demandError) {
      setStepError(demandError);
      return;
    }
    setStepError('');
    setStep((current) => Math.min(2, current + 1));
  };

  const goBack = () => {
    setStepError('');
    setStep((current) => Math.max(0, current - 1));
  };

  const resetForm = () => {
    setOrigin('avulsa');
    setOrderSearch('');
    setSelectedOrderId('');
    setOrderItems([]);
    setSelectedItemId('');
    setProductId('');
    setQuantity('');
    setPriority('medium');
    setDueDate('');
    setWorkCenter('');
    setClientName('');
    setWarpProductId(NONE);
    setWeftProductId(NONE);
    setResourceId(NONE);
    setMachineId(NONE);
    setBeamCode('');
    setReedCode('');
    setPicksPerCm('');
    setWarpThreadCount('');
    setPlannedWidthCm('');
    setPlannedLengthM('');
    setSetupMinutes('');
    setStep(0);
    setStepError('');
  };

  const handleSubmit = async () => {
    if (demandError) {
      setStep(0);
      setStepError(demandError);
      toast.error(demandError);
      return;
    }
    const parsedQuantity = Number(quantity);
    setSubmitting(true);
    try {
      const result = await createTextileProductionOrder({
        productId,
        quantity: parsedQuantity,
        idempotencyKey: fromOrder && selectedOrder && selectedItem
          ? demandIdempotencyKey(selectedOrder.id, selectedItem.id)
          : createClientIdempotencyKey('op'),
        priority,
        dueDate: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
        workCenter: workCenter.trim() || null,
        clientName: clientName.trim() || null,
        salesOrderId: fromOrder ? selectedOrder?.id ?? null : null,
        orderItemId: fromOrder ? selectedItem?.id ?? null : null,
        clientId: fromOrder ? selectedOrder?.client_id ?? null : null,
        weavingProfile: {
          warp_product_id: warpProductId === NONE ? null : warpProductId,
          weft_product_id: weftProductId === NONE ? null : weftProductId,
          loom_resource_id: resourceId === NONE ? null : resourceId,
          machine_id: machineId === NONE ? null : machineId,
          work_center: workCenter.trim() || null,
          beam_code: beamCode.trim() || null,
          reed_code: reedCode.trim() || null,
          picks_per_cm: optionalNumber(picksPerCm),
          warp_thread_count: optionalNumber(warpThreadCount),
          planned_width_cm: optionalNumber(plannedWidthCm),
          planned_length_m: optionalNumber(plannedLengthM),
          setup_minutes: optionalNumber(setupMinutes),
        },
      });
      const orderNumber = typeof result.order_number === 'string' ? result.order_number : '';
      const replay = result.idempotent_replay === true;
      toast.success(replay
        ? `Este item já tinha a OP ${orderNumber} — nada foi duplicado.`
        : orderNumber ? `OP ${orderNumber} criada. Próximo passo: programá-la na fila do tear.` : 'OP criada. Próximo passo: programá-la na fila do tear.');
      resetForm();
      onOpenChange(false);
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar OP de tecelagem');
    } finally {
      setSubmitting(false);
    }
  };

  const productSelect = (value: string, onChange: (value: string) => void, placeholder: string, options: ProductOption[] = products) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map((product) => <SelectItem key={product.id} value={product.id}>{product.code} — {product.name} ({product.unit})</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova OP de tecelagem</DialogTitle>
          <DialogDescription>Siga três passos: diga o que precisa ser tecido, prepare o tear se já souber os dados e confirme. A ficha técnica usada fica guardada na OP; nenhum parâmetro de tear é presumido.</DialogDescription>
        </DialogHeader>

        <ol className="grid gap-2 sm:grid-cols-3" aria-label="Passos para criar a OP">
          {[
            ['1', 'O que tecer', 'pedido ou OP avulsa'],
            ['2', 'Preparar o tear', 'pode deixar para depois'],
            ['3', 'Confirmar', 'revisar e criar'],
          ].map(([number, label, detail], index) => {
            const done = step > index;
            const current = step === index;
            return (
              <li key={label} aria-current={current ? 'step' : undefined} className={`flex items-center gap-2 rounded-lg border p-2.5 ${current ? 'border-primary bg-primary/5' : 'bg-muted/30'}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${done ? 'bg-emerald-600 text-white' : current ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : number}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-tight">{label}</span>
                  <span className="block text-[11px] text-muted-foreground">{detail}</span>
                </span>
              </li>
            );
          })}
        </ol>
        {stepError ? <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/20 dark:text-red-100">{stepError}</p> : null}

        <div className={step === 0 ? 'space-y-2' : 'hidden'}>
          <Label>Como esta OP nasceu?</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => { setOrigin('pedido'); setStepError(''); }} className={`rounded-lg border p-3 text-left ${origin === 'pedido' ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50'}`}>
              <span className="block text-sm font-bold">Atender um pedido</span>
              <span className="mt-1 block text-xs text-muted-foreground">Localize o pedido confirmado e escolha o item. A OP nasce vinculada e não duplica.</span>
            </button>
            <button type="button" onClick={() => { setOrigin('avulsa'); setStepError(''); }} className={`rounded-lg border p-3 text-left ${origin === 'avulsa' ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50'}`}>
              <span className="block text-sm font-bold">Produzir avulsa</span>
              <span className="mt-1 block text-xs text-muted-foreground">Para estoque, reposição ou demanda ainda sem pedido. Escolha o artigo e a quantidade.</span>
            </button>
          </div>
        </div>

        {step === 0 && fromOrder ? (
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
                  const eligible = item.product_id ? eligibleIds.has(item.product_id) : false;
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
                        {!item.product_id ? <Badge variant="outline">sem produto vinculado</Badge> : !eligible ? <Badge variant="outline">sem BOM/roteiro de tecelagem</Badge> : null}
                        <span className="text-muted-foreground">{formatNumber(item.quantity)}</span>
                      </span>
                    </button>
                  );
                })}
                {selectedItem && selectedItem.product_id && !eligibleIds.has(selectedItem.product_id) ? (
                  <p className="text-sm text-amber-700">Este item não tem BOM/roteiro de tecelagem: a criação será recusada pelo banco. Cadastre antes (Fichas/Roteiros) ou gere a OP pelo setor do roteiro dele.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 0 && !fromOrder && eligibleProducts.length === 0 ? (
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p>Nenhum produto elegível para tecelagem: é preciso produto ativo com BOM e roteiro ativo cuja primeira operação seja de tecelagem.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><Link to="/producao/fichas">Fichas/BOM</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/producao/roteiros">Roteiros</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/producao/etapas">Operações</Link></Button>
            </div>
          </div>
        ) : null}

        {step === 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label>Artigo a tecer {fromOrder ? '(veio do item selecionado)' : ''}</Label>
              {fromOrder
                ? <Input value={selectedItem ? `${selectedItem.product_code ? `${selectedItem.product_code} — ` : ''}${selectedItem.product_name}` : ''} placeholder="Selecione o item do pedido acima" disabled />
                : productSelect(productId, setProductId, 'Selecione o artigo pronto para tecelagem', eligibleProducts)}
              {!fromOrder ? <p className="text-xs text-muted-foreground">A lista só mostra artigos com ficha de materiais e roteiro começando na tecelagem.</p> : null}
            </div>
            <div className="space-y-1">
              <Label>Quantidade a produzir{selectedProduct ? ` (${selectedProduct.unit})` : ''}</Label>
              <Input type="number" min="0" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={fromOrder} />
              {fromOrder ? <p className="text-xs text-muted-foreground">Quantidade do item do pedido; para produzir outra quantidade, ajuste no pedido ou crie uma OP avulsa.</p> : null}
            </div>
            <div className="space-y-1"><Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="urgent">Urgente</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="low">Baixa</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1"><Label>Precisa ficar pronto até</Label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Cliente {fromOrder ? '(veio do pedido)' : '(opcional)'}</Label><Input value={clientName} onChange={(event) => setClientName(event.target.value)} disabled={fromOrder} /></div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-bold">Preparação do tear — só o que você já souber</p>
              <p className="mt-1 text-muted-foreground">Estes dados ajudam a montar a OP, mas podem ser completados depois no perfil da OP. A programação do tear (dia, hora e fila) é feita na central após criar.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1"><Label>Tear cadastrado</Label><Select value={machineId} onValueChange={setMachineId}><SelectTrigger><SelectValue placeholder="Escolher tear" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Definir depois</SelectItem>{machines.filter((machine) => machine.active).map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.code} — {machine.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Código do rolo de urdume</Label><Input value={beamCode} onChange={(event) => setBeamCode(event.target.value)} placeholder="Ex.: URD-2026-014" /></div>
              <div className="space-y-1"><Label>Fio de urdume</Label><Select value={warpProductId} onValueChange={setWarpProductId}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{filterYarnProducts(products, warpProductId === NONE ? null : warpProductId).map((product) => <SelectItem key={product.id} value={product.id}>{product.code} — {product.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Fio de trama</Label><Select value={weftProductId} onValueChange={setWeftProductId}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{filterYarnProducts(products, weftProductId === NONE ? null : weftProductId).map((product) => <SelectItem key={product.id} value={product.id}>{product.code} — {product.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Comprimento planejado no tear (m)</Label><Input type="number" min="0" step="0.01" value={plannedLengthM} onChange={(event) => setPlannedLengthM(event.target.value)} /></div>
            </div>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-bold">Detalhes técnicos complementares (opcional)</summary>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div className="space-y-1"><Label>Recurso de capacidade</Label><Select value={resourceId} onValueChange={setResourceId}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{resources.filter((resource) => resource.is_active).map((resource) => <SelectItem key={resource.id} value={resource.id}>{resource.code} — {resource.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Nome/centro do tear (texto)</Label><Input value={workCenter} onChange={(event) => setWorkCenter(event.target.value)} placeholder="Use só se o tear não estiver cadastrado" /></div>
                <div className="space-y-1"><Label>Pente</Label><Input value={reedCode} onChange={(event) => setReedCode(event.target.value)} /></div>
                <div className="space-y-1"><Label>Batidas/cm da ficha</Label><Input type="number" min="0" step="0.01" value={picksPerCm} onChange={(event) => setPicksPerCm(event.target.value)} /></div>
                <div className="space-y-1"><Label>Quantidade de fios de urdume</Label><Input type="number" min="0" step="1" value={warpThreadCount} onChange={(event) => setWarpThreadCount(event.target.value)} /></div>
                <div className="space-y-1"><Label>Largura planejada (cm)</Label><Input type="number" min="0" step="0.01" value={plannedWidthCm} onChange={(event) => setPlannedWidthCm(event.target.value)} /></div>
                <div className="space-y-1"><Label>Setup previsto pela ficha (min)</Label><Input type="number" min="0" step="0.01" value={setupMinutes} onChange={(event) => setSetupMinutes(event.target.value)} /></div>
              </div>
            </details>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <p className="flex items-center gap-2 text-sm font-bold"><ClipboardCheck className="h-4 w-4" /> Confira antes de criar</p>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Origem</dt><dd className="mt-1 font-medium">{fromOrder ? `Pedido ${selectedOrder?.number ?? ''} — ${selectedOrder?.client_name ?? ''}` : 'OP avulsa (manual)'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Artigo</dt><dd className="mt-1 font-medium">{selectedProduct ? `${selectedProduct.code} — ${selectedProduct.name}` : selectedItem?.product_name || 'Não selecionado'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantidade</dt><dd className="mt-1 font-medium">{quantity ? `${formatNumber(Number(quantity))} ${selectedProduct?.unit ?? ''}` : 'Não informada'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prazo e prioridade</dt><dd className="mt-1 font-medium">{dueDate ? new Date(`${dueDate}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem data'} · {priority === 'urgent' ? 'Urgente' : priority === 'high' ? 'Alta' : priority === 'low' ? 'Baixa' : 'Média'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente</dt><dd className="mt-1 font-medium">{clientName || 'Não informado'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tear previsto</dt><dd className="mt-1 font-medium">{selectedMachine ? `${selectedMachine.code} — ${selectedMachine.name}` : selectedResource ? `${selectedResource.code} — ${selectedResource.name}` : workCenter || 'Definir na programação'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fios</dt><dd className="mt-1 font-medium">Urdume: {selectedWarpProduct ? `${selectedWarpProduct.code} — ${selectedWarpProduct.name}` : 'não informado'} · Trama: {selectedWeftProduct ? `${selectedWeftProduct.code} — ${selectedWeftProduct.name}` : 'não informada'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rolo de urdume</dt><dd className="mt-1 font-medium">{beamCode || 'Definir depois'}</dd></div>
              </dl>
            </div>
            <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-100">
              <p className="font-bold">Depois de criar, a rota é:</p>
              <p className="mt-1">Programar no tear → conferir fios e lotes → tecer e apontar as passagens → liberar a qualidade → gerar o estoque do tecido.</p>
            </div>
            {demandError ? <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/20 dark:text-red-100">{demandError}</p> : null}
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {step > 0 ? <Button type="button" variant="outline" onClick={goBack} disabled={submitting}><ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar</Button> : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
            {step < 2 ? (
              <Button type="button" onClick={goNext}>{step === 1 ? 'Revisar OP' : 'Continuar'} <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Criando…' : 'Criar OP de tecelagem'}</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
