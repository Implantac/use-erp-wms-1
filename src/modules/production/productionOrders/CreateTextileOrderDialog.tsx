import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import { useProductionResources } from '@/hooks/production/useProductionResources';
import { createClientIdempotencyKey, createTextileProductionOrder } from '@/services/production/textilePcpService';

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
}

const NONE = '__none__';

export function CreateTextileOrderDialog({ open, onOpenChange, onCreated }: Props) {
  const { company } = useActiveTenant();
  const { resources } = useProductionResources();
  const { machines } = useProductionMachines();
  const [products, setProducts] = useState<ProductOption[]>([]);
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !company?.id) return;
    void supabase.from('products')
      .select('id, code, name, unit')
      .eq('company_id', company.id)
      .eq('status', 'active')
      .order('name')
      .then(({ data, error }) => {
        if (error) toast.error('Erro ao carregar produtos para a OP');
        else setProducts(data ?? []);
      });
  }, [open, company?.id]);

  const optionalNumber = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleSubmit = async () => {
    const parsedQuantity = Number(quantity);
    if (!productId || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error('Selecione o artigo/produto e informe uma quantidade positiva');
      return;
    }
    setSubmitting(true);
    try {
      const result = await createTextileProductionOrder({
        productId,
        quantity: parsedQuantity,
        idempotencyKey: createClientIdempotencyKey('op'),
        priority,
        dueDate: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
        workCenter: workCenter.trim() || null,
        clientName: clientName.trim() || null,
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
      toast.success(orderNumber ? `OP ${orderNumber} criada com snapshot técnico` : 'OP criada com snapshot técnico');
      onOpenChange(false);
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar OP de tecelagem');
    } finally {
      setSubmitting(false);
    }
  };

  const productSelect = (value: string, onChange: (value: string) => void, placeholder: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.code} — {product.name} ({product.unit})</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova OP de tecelagem</DialogTitle>
          <DialogDescription>A RPC valida BOM e roteiro ativos, gera as etapas, numera a OP e congela o snapshot técnico. Nenhum parâmetro de tear é presumido: informe apenas o que estiver configurado/aprovado.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2"><Label>Artigo/produto acabado</Label>{productSelect(productId, setProductId, 'Selecione o artigo')}</div>
          <div className="space-y-1"><Label>Quantidade planejada</Label><Input type="number" min="0" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
          <div className="space-y-1"><Label>Prioridade</Label>
            <Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="urgent">Urgente</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="low">Baixa</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1"><Label>Data necessária</Label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
          <div className="space-y-1"><Label>Centro/tear planejado (texto)</Label><Input value={workCenter} onChange={(event) => setWorkCenter(event.target.value)} placeholder="Ex.: Tear 03" /></div>
          <div className="space-y-1 md:col-span-2"><Label>Cliente (opcional)</Label><Input value={clientName} onChange={(event) => setClientName(event.target.value)} /></div>

          <div className="space-y-1"><Label>Fio de urdume</Label><Select value={warpProductId} onValueChange={setWarpProductId}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.code} — {product.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Fio de trama</Label><Select value={weftProductId} onValueChange={setWeftProductId}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.code} — {product.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Recurso/tear cadastrado</Label><Select value={resourceId} onValueChange={setResourceId}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{resources.filter((resource) => resource.is_active).map((resource) => <SelectItem key={resource.id} value={resource.id}>{resource.code} — {resource.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Máquina/tear cadastrada</Label><Select value={machineId} onValueChange={setMachineId}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Não informado</SelectItem>{machines.filter((machine) => machine.active).map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.code} — {machine.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Código do rolo de urdume</Label><Input value={beamCode} onChange={(event) => setBeamCode(event.target.value)} /></div>
          <div className="space-y-1"><Label>Pente</Label><Input value={reedCode} onChange={(event) => setReedCode(event.target.value)} /></div>
          <div className="space-y-1"><Label>Batidas/cm configuradas</Label><Input type="number" min="0" step="0.01" value={picksPerCm} onChange={(event) => setPicksPerCm(event.target.value)} /></div>
          <div className="space-y-1"><Label>Fios de urdume</Label><Input type="number" min="0" step="1" value={warpThreadCount} onChange={(event) => setWarpThreadCount(event.target.value)} /></div>
          <div className="space-y-1"><Label>Largura planejada (cm)</Label><Input type="number" min="0" step="0.01" value={plannedWidthCm} onChange={(event) => setPlannedWidthCm(event.target.value)} /></div>
          <div className="space-y-1"><Label>Comprimento planejado (m)</Label><Input type="number" min="0" step="0.01" value={plannedLengthM} onChange={(event) => setPlannedLengthM(event.target.value)} /></div>
          <div className="space-y-1"><Label>Setup configurado (min)</Label><Input type="number" min="0" step="0.01" value={setupMinutes} onChange={(event) => setSetupMinutes(event.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Criando…' : 'Criar OP com snapshot'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
