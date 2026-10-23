import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Plus, Search, MoreHorizontal, Eye, Edit, Trash2, Send, CheckCircle, Package, FileText, Loader2, Clock } from 'lucide-react';
import { ExportButton } from '@/shared/components/ExportButton';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { formatBRL, formatDate } from '@/lib/formatters';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/ui/base/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/ui/base/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/ui/base/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/ui/base/select';
import { Badge } from '@/ui/base/badge';
import { Label } from '@/ui/base/label';
import { Separator } from '@/ui/base/separator';
import { purchaseOrderStatuses } from '@/config/purchasing';
import { PurchaseOrder } from '@/types/purchasing';
import { usePurchasing } from '@/hooks/purchasing/usePurchasingQuery';
import { useProducts, type DbProduct } from '@/hooks/inventory/useProducts';
import { KPICard } from '@/shared/components/KPICard';
import { EmptyState } from '@/shared/components/EmptyState';
import { ClipboardList } from 'lucide-react';
import { toastError } from '@/lib/toastHelpers';

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: 'Baixa', className: 'bg-muted text-muted-foreground' },
  medium: { label: 'Média', className: 'bg-info/10 text-info' },
  high: { label: 'Alta', className: 'bg-warning/10 text-warning' },
  urgent: { label: 'Urgente', className: 'bg-destructive/10 text-destructive' },
};

interface DraftItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export default function PurchaseOrdersPage() {
  const { orders, ordersLoading: loading, suppliers, createOrder, creatingOrder } = usePurchasing();
  const { data: products } = useProducts() as { data: DbProduct[] | undefined };
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newExpected, setNewExpected] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([{ productId: '', quantity: 1, unitPrice: 0 }]);
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') || '');

  useEffect(() => { setSearchTerm(searchParams.get('q') || ''); }, [searchParams]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [payable, setPayable] = useState<{ amount: number; status: string; due_date: string } | null>(null);

  useEffect(() => {
    if (!selectedOrder?.id) { setPayable(null); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from('accounts_payable')
        .select('amount, status, due_date')
        .eq('source_type', 'purchase_order')
        .eq('source_id', selectedOrder.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setPayable(data || null);
    })();
  }, [selectedOrder?.id]);

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const matchesSearch =
      order.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.supplierName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || order.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  }), [orders, searchTerm, statusFilter, priorityFilter]);

  const stats = useMemo(() => ({
    total: orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0),
    pending: orders.filter((o) => ['draft', 'pending_approval', 'approved'].includes(o.status)).length,
    inTransit: orders.filter((o) => ['sent', 'confirmed'].includes(o.status)).length,
    received: orders.filter((o) => o.status === 'received').length,
  }), [orders]);

  const draftTotal = useMemo(
    () => draftItems.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0),
    [draftItems],
  );

  const handleCreateOrder = async () => {
    const supplier = suppliers.find((s) => s.id === newSupplierId);
    const validItems = draftItems.filter((i) => i.productId && Number(i.quantity) > 0);
    if (!supplier || validItems.length === 0) {
      toastError('Selecione um fornecedor e ao menos um item com quantidade.');
      return;
    }

    await createOrder({
      supplierId: supplier.id,
      supplierName: supplier.name,
      expectedDelivery: newExpected || null,
      priority: newPriority,
      items: validItems.map((i) => {
        const product = (products || []).find((p) => p.id === i.productId);
        return {
          productId: i.productId,
          productCode: product?.code || '',
          productName: product?.name || '',
          unit: product?.unit || 'UN',
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        };
      }),
    });

    setIsCreateOpen(false);
    setNewSupplierId('');
    setNewExpected('');
    setNewPriority('medium');
    setDraftItems([{ productId: '', quantity: 1, unitPrice: 0 }]);
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin" /></div>;

  return (
    <PageContainer>
      <PageHeader title="Pedidos de Compra" description="Gerencie os pedidos de compra">
        <ExportButton
          data={filteredOrders as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'number', label: 'Número' },
            { key: 'supplierName', label: 'Fornecedor' },
            { key: 'date', label: 'Data', format: (v) => formatDate(v as string) },
            { key: 'total', label: 'Total', format: (v) => formatBRL(Number(v)) },
            { key: 'status', label: 'Status' },
            { key: 'priority', label: 'Prioridade' },
          ]}
          filename="pedidos_compra"
        />
        <Button onClick={() => setIsCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo Pedido</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <KPICard title="Valor Total" value={formatBRL(stats.total)} icon={<FileText className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Pendentes" value={String(stats.pending)} icon={<Clock className="h-5 w-5" />} accentColor="warning" index={1} />
        <KPICard title="Em Trânsito" value={String(stats.inTransit)} icon={<Package className="h-5 w-5" />} accentColor="info" index={2} />
        <KPICard title="Recebidos" value={String(stats.received)} icon={<CheckCircle className="h-5 w-5" />} accentColor="success" index={3} />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(purchaseOrderStatuses).map(([key, value]) => (
                  <SelectItem key={key} value={key}>{value.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState icon={ClipboardList} title="Nenhum pedido de compra" description="Crie pedidos para formalizar aquisições junto aos seus fornecedores." />
                  </TableCell>
                </TableRow>
              ) : filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.number}</TableCell>
                  <TableCell>{order.supplierName}</TableCell>
                  <TableCell>{formatDate(order.date)}</TableCell>
                  <TableCell>{formatBRL(order.total)}</TableCell>
                  <TableCell>
                    <Badge className={priorityConfig[order.priority]?.className || ''}>
                      {priorityConfig[order.priority]?.label || order.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={purchaseOrderStatuses[order.status]?.color || ''}>
                      {purchaseOrderStatuses[order.status]?.label || order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelectedOrder(order); setIsViewOpen(true); }}><Eye className="mr-2 h-4 w-4" />Visualizar</DropdownMenuItem>
                        <DropdownMenuItem><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Detalhes do Pedido {selectedOrder?.number}</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <div><Label className="text-muted-foreground text-xs uppercase">Fornecedor</Label><p className="font-bold">{selectedOrder.supplierName}</p></div>
                 <div><Label className="text-muted-foreground text-xs uppercase">Total</Label><p className="font-bold">{formatBRL(selectedOrder.total)}</p></div>
                 <div>
                   <Label className="text-muted-foreground text-xs uppercase">Financeiro</Label>
                   {payable ? (
                     <p className="font-bold">Título a pagar de {formatBRL(Number(payable.amount))} · {payable.status} · vence {formatDate(payable.due_date)}</p>
                   ) : (
                     <p className="text-muted-foreground">Sem título (gerado no recebimento)</p>
                   )}
                 </div>
               </div>
               <Separator />
               <Table>
                 <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Preço</TableHead></TableRow></TableHeader>
                 <TableBody>{selectedOrder.items?.map(item => (
                   <TableRow key={item.id}>
                     <TableCell>{item.productName}</TableCell>
                     <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                     <TableCell className="text-right">{formatBRL(item.unitPrice)}</TableCell>
                   </TableRow>
                 ))}</TableBody>
               </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Novo Pedido de Compra</DialogTitle>
            <DialogDescription>Selecione o fornecedor e os itens que deseja comprar.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Select value={newSupplierId} onValueChange={setNewSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityConfig).map(([key, value]) => (
                      <SelectItem key={key} value={key}>{value.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Entrega prevista</Label>
                <Input type="date" value={newExpected} onChange={(e) => setNewExpected(e.target.value)} />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              {draftItems.map((item, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">Produto</Label>
                    <Select
                      value={item.productId}
                      onValueChange={(value) => setDraftItems((prev) => prev.map((it, i) => {
                        if (i !== index) return it;
                        const product = (products || []).find((p) => p.id === value);
                        return { ...it, productId: value, unitPrice: it.unitPrice || Number(product?.cost_price || 0) };
                      }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                      <SelectContent>
                        {(products || []).map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">Quantidade</Label>
                    <Input
                      type="number" min={1} value={item.quantity}
                      onChange={(e) => setDraftItems((prev) => prev.map((it, i) => i === index ? { ...it, quantity: Number(e.target.value) } : it))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">Preço unit.</Label>
                    <Input
                      type="number" min={0} step="0.01" value={item.unitPrice}
                      onChange={(e) => setDraftItems((prev) => prev.map((it, i) => i === index ? { ...it, unitPrice: Number(e.target.value) } : it))}
                    />
                  </div>
                  <Button
                    variant="ghost" size="icon" aria-label="Remover item"
                    disabled={draftItems.length === 1}
                    onClick={() => setDraftItems((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setDraftItems((prev) => [...prev, { productId: '', quantity: 1, unitPrice: 0 }])}>
                <Plus className="mr-2 h-4 w-4" />Adicionar item
              </Button>
            </div>

            <Separator />
            <div className="flex justify-end text-sm">
              <span className="text-muted-foreground mr-2">Total:</span>
              <span className="font-bold">{formatBRL(draftTotal)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateOrder} disabled={creatingOrder}>
              {creatingOrder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
