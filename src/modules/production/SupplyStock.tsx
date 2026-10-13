import { useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Badge } from '@/ui/base/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Label } from '@/ui/base/label';
import { Textarea } from '@/ui/base/textarea';
import { useSupplyStock } from '@/hooks/inventory/useSupplyStock';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { KPICard } from '@/shared/components/KPICard';
import { Plus, Package, Search, ArrowUpCircle, ArrowDownCircle, AlertTriangle, Boxes } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/ui/base/skeleton';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/formatters';
import { toSafeNumber } from '@/lib/numericValidation';

export default function SupplyStockPage() {
  const { supplies, movements, loading, createSupply, registerMovement, lowStockItems } = useSupplyStock();
  const { orders: productionOrders } = useProductionOrders();
  const [search, setSearch] = useState('');
  const [newSupplyOpen, setNewSupplyOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [supplyForm, setSupplyForm] = useState({ code: '', name: '', unit: 'UN', current_quantity: 0, min_quantity: 0, max_quantity: 0, unit_cost: 0, supplier: '', location: '', category: '' });
  const [movForm, setMovForm] = useState({ supply_id: '', direction: 'in', quantity: 0, unit_cost: 0, production_order_id: '', reason: '', operator: '', document_number: '' });

  const filteredSupplies = supplies.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()));
  const totalValue = supplies.reduce((s, i) => s + i.total_value, 0);
  const activeOPs = productionOrders.filter(o => ['in_progress', 'planned'].includes(o.status));

  const handleCreateSupply = async () => {
    if (!supplyForm.code || !supplyForm.name) return;
    await createSupply(supplyForm);
    setNewSupplyOpen(false);
    setSupplyForm({ code: '', name: '', unit: 'UN', current_quantity: 0, min_quantity: 0, max_quantity: 0, unit_cost: 0, supplier: '', location: '', category: '' });
  };

  const handleMovement = async () => {
    if (!movForm.supply_id || movForm.quantity <= 0) return;
    const supply = supplies.find(s => s.id === movForm.supply_id);
    if (!supply) return;
    const op = activeOPs.find(o => o.id === movForm.production_order_id);
    const saved = await registerMovement({
      supply_id: movForm.supply_id,
      supply_code: supply.code,
      supply_name: supply.name,
      type: movForm.direction === 'in' ? 'entry' : 'consumption',
      direction: movForm.direction,
      quantity: movForm.quantity,
      unit_cost: movForm.unit_cost || supply.unit_cost,
      total_cost: movForm.quantity * (movForm.unit_cost || supply.unit_cost),
      production_order_id: movForm.production_order_id || null,
      production_order_number: op?.order_number || null,
      document_number: movForm.document_number || null,
      operator: movForm.operator || null,
      reason: movForm.reason || null,
    });
    if (!saved) return;
    setMovementOpen(false);
    setMovForm({ supply_id: '', direction: 'in', quantity: 0, unit_cost: 0, production_order_id: '', reason: '', operator: '', document_number: '' });
  };

  if (loading) {
    return <PageContainer><Skeleton className="h-10 w-64" /><div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div></PageContainer>;
  }

  return (
    <PageContainer>
      <PageHeader title="Estoque de Insumos" description="Controle de matérias-primas e insumos de produção">
        <Button variant="outline" disabled title="Requer operação transacional de estoque homologada"><ArrowUpCircle className="h-4 w-4 mr-2" /> Movimentação indisponível</Button>
        <Button onClick={() => setNewSupplyOpen(true)}><Plus className="h-4 w-4 mr-2" /> Novo Insumo</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="Total de Insumos" value={supplies.length} icon={<Boxes className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Valor em Estoque" value={`${formatBRL(totalValue)}`} icon={<Package className="h-5 w-5" />} accentColor="success" index={1} />
        <KPICard title="Estoque Crítico" value={lowStockItems.length} subtitle="abaixo do mínimo" icon={<AlertTriangle className="h-5 w-5" />} accentColor="warning" index={2} />
        <KPICard title="Movimentações" value={movements.length} subtitle="registradas" icon={<ArrowDownCircle className="h-5 w-5" />} accentColor="info" index={3} />
      </div>

      {lowStockItems.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader><CardTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Insumos em Estoque Crítico</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockItems.map(s => (
                <div key={s.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div><span className="font-mono mr-2">{s.code}</span><span>{s.name}</span></div>
                  <div className="flex items-center gap-3">
                    <span className="text-destructive font-medium">{s.current_quantity} {s.unit}</span>
                    <span className="text-xs text-muted-foreground">mín: {s.min_quantity}</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setMovForm({ ...movForm, supply_id: s.id, direction: 'in' }); setMovementOpen(true); }}>
                      <ArrowUpCircle className="h-3 w-3 mr-1" /> Entrada
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="stock">
        <TabsList><TabsTrigger value="stock">Estoque</TabsTrigger><TabsTrigger value="movements">Movimentações</TabsTrigger></TabsList>

        <TabsContent value="stock" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <CardTitle>Insumos</CardTitle>
                <div className="relative flex-1 max-w-sm ml-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Qtde Atual</TableHead>
                  <TableHead>Mín.</TableHead><TableHead>Custo Unit.</TableHead><TableHead>Valor Total</TableHead>
                  <TableHead>Fornecedor</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredSupplies.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum insumo cadastrado</TableCell></TableRow>
                  ) : filteredSupplies.map(s => {
                    const isCritical = s.current_quantity <= s.min_quantity;
                    return (
                      <TableRow key={s.id} className={cn(isCritical && 'bg-destructive/5')}>
                        <TableCell className="font-mono">{s.code}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className={cn(isCritical && 'text-destructive font-bold')}>{s.current_quantity} {s.unit}</TableCell>
                        <TableCell>{s.min_quantity}</TableCell>
                        <TableCell>R$ {Number(s.unit_cost).toFixed(2)}</TableCell>
                        <TableCell>R$ {Number(s.total_value).toFixed(2)}</TableCell>
                        <TableCell>{s.supplier || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={isCritical ? 'destructive' : 'default'}>{isCritical ? 'Crítico' : 'Normal'}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Movimentações Recentes</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Insumo</TableHead><TableHead>Tipo</TableHead>
                  <TableHead>Qtde</TableHead><TableHead>Custo</TableHead><TableHead>OP</TableHead><TableHead>Operador</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma movimentação</TableCell></TableRow>
                  ) : movements.map(m => (
                    <TableRow key={m.id}>
                      <TableCell>{format(new Date(m.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                      <TableCell><span className="font-mono mr-1">{m.supply_code}</span>{m.supply_name}</TableCell>
                      <TableCell>
                        <Badge variant={m.direction === 'in' ? 'default' : 'secondary'} className="gap-1">
                          {m.direction === 'in' ? <ArrowUpCircle className="h-3 w-3" /> : <ArrowDownCircle className="h-3 w-3" />}
                          {m.direction === 'in' ? 'Entrada' : 'Saída'}
                        </Badge>
                      </TableCell>
                      <TableCell>{m.quantity}</TableCell>
                      <TableCell>R$ {Number(m.total_cost).toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs">{m.production_order_number || '-'}</TableCell>
                      <TableCell>{m.operator || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Supply Dialog */}
      <Dialog open={newSupplyOpen} onOpenChange={setNewSupplyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Insumo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Código</Label><Input value={supplyForm.code} onChange={e => setSupplyForm({ ...supplyForm, code: e.target.value })} /></div>
              <div><Label>Nome</Label><Input value={supplyForm.name} onChange={e => setSupplyForm({ ...supplyForm, name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Unidade</Label><Input value={supplyForm.unit} onChange={e => setSupplyForm({ ...supplyForm, unit: e.target.value })} /></div>
              <div><Label>Qtde Inicial</Label><Input type="number" value={supplyForm.current_quantity} onChange={e => setSupplyForm({ ...supplyForm, current_quantity: toSafeNumber(e.target.value) })} /></div>
              <div><Label>Custo Unit. (R$)</Label><Input type="number" step="0.01" value={supplyForm.unit_cost} onChange={e => setSupplyForm({ ...supplyForm, unit_cost: toSafeNumber(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Qtde Mínima</Label><Input type="number" value={supplyForm.min_quantity} onChange={e => setSupplyForm({ ...supplyForm, min_quantity: toSafeNumber(e.target.value) })} /></div>
              <div><Label>Qtde Máxima</Label><Input type="number" value={supplyForm.max_quantity} onChange={e => setSupplyForm({ ...supplyForm, max_quantity: toSafeNumber(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Fornecedor</Label><Input value={supplyForm.supplier} onChange={e => setSupplyForm({ ...supplyForm, supplier: e.target.value })} /></div>
              <div><Label>Localização</Label><Input value={supplyForm.location} onChange={e => setSupplyForm({ ...supplyForm, location: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSupplyOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateSupply}>Cadastrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={movementOpen} onOpenChange={setMovementOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Movimentação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Insumo</Label>
              <Select value={movForm.supply_id} onValueChange={v => setMovForm({ ...movForm, supply_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{supplies.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Tipo</Label>
                <Select value={movForm.direction} onValueChange={v => setMovForm({ ...movForm, direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Entrada</SelectItem>
                    <SelectItem value="out">Saída / Consumo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Quantidade</Label><Input type="number" value={movForm.quantity} onChange={e => setMovForm({ ...movForm, quantity: toSafeNumber(e.target.value) })} /></div>
            </div>
            {movForm.direction === 'out' && (
              <div><Label>Ordem de Produção (opcional)</Label>
                <Select value={movForm.production_order_id} onValueChange={v => setMovForm({ ...movForm, production_order_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{activeOPs.map(o => <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.product_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Operador</Label><Input value={movForm.operator} onChange={e => setMovForm({ ...movForm, operator: e.target.value })} /></div>
              <div><Label>Documento</Label><Input value={movForm.document_number} onChange={e => setMovForm({ ...movForm, document_number: e.target.value })} /></div>
            </div>
            <div><Label>Motivo</Label><Textarea value={movForm.reason} onChange={e => setMovForm({ ...movForm, reason: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementOpen(false)}>Cancelar</Button>
            <Button onClick={handleMovement}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
