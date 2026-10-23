import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { ShoppingCart } from 'lucide-react';
import { formatNumber } from '@/lib/formatters';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import type { NetMaterialNeed } from '@/lib/pcp/netMrp';
import { createClientIdempotencyKey, generateMrpPurchaseOrder } from '@/services/production/textilePcpService';

interface Props {
  materialNeeds: NetMaterialNeed[];
  onGenerated: () => Promise<void> | void;
}

interface SupplierOption {
  id: string;
  name: string;
}

export function MRPPurchaseTab({ materialNeeds, onGenerated }: Props) {
  const { company } = useActiveTenant();
  const deficits = useMemo(() => materialNeeds.filter((need) => need.suggestedPurchase > 0), [materialNeeds]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [generating, setGenerating] = useState(false);
  const idempotencyKeyRef = useRef('');

  useEffect(() => {
    setSelected(new Set(deficits.map((need) => need.componentId)));
    setQuantities(Object.fromEntries(deficits.map((need) => [need.componentId, String(need.suggestedPurchase)])));
    idempotencyKeyRef.current = '';
  }, [deficits]);

  useEffect(() => {
    if (!company?.id) return;
    void supabase.from('suppliers').select('id, name').eq('company_id', company.id).order('name')
      .then(({ data, error }) => {
        if (error) toast.error('Erro ao carregar fornecedores da empresa');
        else setSuppliers(data ?? []);
      });
  }, [company?.id]);

  const toggle = (componentId: string, checked: boolean) => {
    idempotencyKeyRef.current = '';
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(componentId);
      else next.delete(componentId);
      return next;
    });
  };

  const handleGenerate = async () => {
    const items = deficits.filter((need) => selected.has(need.componentId)).map((need) => ({
      component_id: need.componentId,
      quantity: Number(quantities[need.componentId] ?? need.suggestedPurchase),
    }));
    if (items.length === 0 || items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      toast.error('Selecione itens com quantidade de compra positiva');
      return;
    }
    if (!supplierId && !supplierName.trim()) {
      toast.error('Selecione ou informe o fornecedor');
      return;
    }
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = createClientIdempotencyKey('mrp-po');
    setGenerating(true);
    try {
      const result = await generateMrpPurchaseOrder({
        items,
        idempotencyKey: idempotencyKeyRef.current,
        supplierId: supplierId || null,
        supplierName: supplierName.trim() || null,
        expectedDelivery: expectedDelivery || null,
      });
      const number = typeof result.number === 'string' ? result.number : '';
      toast.success(number ? `Pedido ${number} criado em rascunho` : 'Pedido de compra criado em rascunho');
      await onGenerated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar pedido do MRP');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" /> Compra sugerida pelo MRP líquido
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          A sugestão já exclui saldo reservado/bloqueado e compras abertas, inclui estoque mínimo e arredonda pelo lote padrão configurado no produto. O pedido nasce em <strong>rascunho</strong> para aprovação em Compras; reenviar esta ação retorna o mesmo pedido.
        </p>
        {deficits.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Nenhum déficit líquido calculado para as OPs ativas.</p>
        ) : (
          <>
            <div className="mb-4 grid gap-3 rounded-lg border bg-muted/40 p-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Fornecedor cadastrado</Label>
                <Select value={supplierId} onValueChange={(value) => { setSupplierId(value); idempotencyKeyRef.current = ''; }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>ou fornecedor (texto)</Label><Input value={supplierName} onChange={(event) => { setSupplierName(event.target.value); idempotencyKeyRef.current = ''; }} placeholder="Somente se não houver cadastro" /></div>
              <div className="space-y-1"><Label>Entrega esperada</Label><Input type="date" value={expectedDelivery} onChange={(event) => { setExpectedDelivery(event.target.value); idempotencyKeyRef.current = ''; }} /></div>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Usar</TableHead><TableHead>Material</TableHead><TableHead className="text-right">Necessidade líquida</TableHead><TableHead className="text-right">Sugestão/lote</TableHead><TableHead className="text-right">Quantidade do pedido</TableHead><TableHead>Lead time</TableHead><TableHead>Urgência</TableHead></TableRow></TableHeader>
              <TableBody>
                {deficits.map((need) => (
                  <TableRow key={need.componentId}>
                    <TableCell><input type="checkbox" checked={selected.has(need.componentId)} onChange={(event) => toggle(need.componentId, event.target.checked)} aria-label={`Selecionar ${need.materialName}`} /></TableCell>
                    <TableCell className="font-medium">{need.materialCode} — {need.materialName}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(need.netRequirement)} {need.unit}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(need.suggestedPurchase)}</TableCell>
                    <TableCell><Input className="ml-auto w-32 text-right" type="number" min="0" step="0.0001" value={quantities[need.componentId] ?? ''} onChange={(event) => { setQuantities((current) => ({ ...current, [need.componentId]: event.target.value })); idempotencyKeyRef.current = ''; }} /></TableCell>
                    <TableCell>{need.leadTimeDays !== null ? `${need.leadTimeDays} dias` : '—'}{need.lateRisk ? <Badge variant="destructive" className="ml-2">risco</Badge> : null}</TableCell>
                    <TableCell><Badge variant={need.status === 'critical' ? 'destructive' : 'secondary'}>{need.status === 'critical' ? 'Sem cobertura' : 'Cobertura parcial'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex justify-end"><Button onClick={handleGenerate} disabled={generating}><ShoppingCart className="mr-2 h-4 w-4" />{generating ? 'Gerando…' : 'Gerar pedido em rascunho'}</Button></div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
