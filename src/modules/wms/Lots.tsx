import { useMemo, useState } from 'react';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Search, Package, Plus, Layers, AlertTriangle, ClipboardList, PackagePlus, RefreshCcw } from 'lucide-react';
import { useWMSLots, type StockLot } from '@/hooks/wms/useWMSLots';
import { useFiberReceipt } from '@/hooks/wms/useFiberReceipt';
import { useProducts } from '@/hooks/inventory/useProducts';
import { isFiberProduct } from '@/lib/pcp/productFilters';
import { formatFiberClassificationSummary } from '@/lib/wms/fiberReceipt';
import { FiberClassificationDialog, FiberReceiptDialog } from './FiberReceiptDialog';
import { StockLotUnitsDialog } from './StockLotUnitsDialog';
import { ReworkOrderDialog } from './ReworkOrderDialog';
import { ExportButton } from '@/shared/components/ExportButton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toSafeNumber } from '@/lib/numericValidation';

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  available: 'default',
  reserved: 'secondary',
  consumed: 'outline',
  expired: 'destructive',
  blocked: 'destructive',
};

const statusLabels: Record<string, string> = {
  available: 'Disponível',
  reserved: 'Reservado',
  consumed: 'Consumido',
  expired: 'Vencido',
  blocked: 'Bloqueado',
};

const qualityLabels: Record<string, string> = {
  pending: 'Qualidade pendente',
  approved: 'Qualidade aprovada',
  quarantine: 'Quarentena',
  rejected: 'Rejeitado',
  blocked: 'Bloqueado',
};

export default function LotsPage() {
  const { lots, loading, create, refetch } = useWMSLots();
  const { classify } = useFiberReceipt();
  const { data: products = [] } = useProducts();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [fiberReceiptOpen, setFiberReceiptOpen] = useState(false);
  const [classificationLot, setClassificationLot] = useState<StockLot | null>(null);
  const [unitsLot, setUnitsLot] = useState<StockLot | null>(null);
  const [reworkLot, setReworkLot] = useState<StockLot | null>(null);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const canClassifyFiber = (lot: StockLot) => {
    if (lot.classification) return true;
    const product = lot.productId ? productById.get(lot.productId) : undefined;
    return product
      ? isFiberProduct(product)
      : isFiberProduct({ id: lot.productId ?? '', code: lot.productCode, name: lot.productName });
  };
  const [newLot, setNewLot] = useState({
    lot_number: '', product_code: '', product_name: '',
    supplier: '', quantity: 0, origin: 'purchase',
    manufacture_date: '', expiration_date: '', location: '',
  });

  const filteredLots = lots.filter(l => {
    const matchesSearch = l.lotNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.productCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatDate = (d?: string) => {
    if (!d) return '-';
    try { return format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }); } catch { return '-'; }
  };

  const nearExpiry = lots.filter(l => {
    if (!l.expirationDate) return false;
    const diff = (new Date(l.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 30;
  }).length;

  const handleCreate = async () => {
    if (!newLot.lot_number || !newLot.product_code) return;
    await create(newLot);
    setCreateOpen(false);
    setNewLot({ lot_number: '', product_code: '', product_name: '', supplier: '', quantity: 0, origin: 'purchase', manufacture_date: '', expiration_date: '', location: '' });
  };

  return (
    <PageContainer loading={loading}>
      <PageHeader
        title="Controle de Lotes"
        description="Rastreabilidade completa por lote de produto"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setFiberReceiptOpen(true)} className="gap-2"><PackagePlus className="h-4 w-4" /> Receber pluma/fibra</Button>
            <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo Lote</Button>
            <ExportButton
              data={filteredLots as unknown as Record<string, unknown>[]}
              columns={[
                { key: 'lotNumber', label: 'Lote' },
                { key: 'productCode', label: 'Código' },
                { key: 'productName', label: 'Produto' },
                { key: 'quantity', label: 'Quantidade' },
                { key: 'remainingQty', label: 'Restante' },
                { key: 'status', label: 'Status' },
              ]}
              filename="lotes_wms"
            />
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="Total de Lotes" value={lots.length} icon={Layers} index={0} />
        <KPICard title="Lotes Ativos" value={lots.filter(l => l.status === 'available').length} icon={Package} index={1} color="success" />
        <KPICard title="Próximos a Vencer" value={nearExpiry} description="Até 30 dias" icon={AlertTriangle} index={2} color={nearExpiry > 0 ? 'warning' : undefined} />
        <KPICard title="Vencidos" value={lots.filter(l => l.status === 'expired').length} icon={AlertTriangle} index={3} color="danger" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por lote, código ou produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5" /> Lotes ({filteredLots.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Original</TableHead>
                <TableHead className="text-right">Restante</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Qualidade</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLots.map(lot => (
                <TableRow key={lot.id} className={lot.status === 'expired' ? 'bg-destructive/5' : ''}>
                  <TableCell className="font-mono font-medium">{lot.lotNumber}</TableCell>
                  <TableCell className="font-mono text-xs">{lot.productCode}</TableCell>
                  <TableCell className="font-medium">
                    <div>{lot.productName}</div>
                    {formatFiberClassificationSummary(lot.classification) && (
                      <div className="text-xs font-normal text-muted-foreground">
                        {formatFiberClassificationSummary(lot.classification)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{lot.supplier || '-'}</TableCell>
                  <TableCell className="text-right">{lot.quantity}</TableCell>
                  <TableCell className={`text-right ${lot.remainingQty === 0 ? 'text-muted-foreground' : 'font-semibold'}`}>{lot.remainingQty}</TableCell>
                  <TableCell>{formatDate(lot.expirationDate)}</TableCell>
                  <TableCell className="font-mono text-xs">{lot.location || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{lot.origin === 'purchase' ? 'Compra' : lot.origin === 'production' ? 'Produção' : lot.origin}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[lot.status] || 'secondary'}>{statusLabels[lot.status] || lot.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={lot.qualityStatus === 'approved' ? 'default' : lot.qualityStatus === 'rejected' || lot.qualityStatus === 'blocked' ? 'destructive' : 'outline'}>
                      {qualityLabels[lot.qualityStatus || 'pending'] || lot.qualityStatus || 'Qualidade pendente'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setUnitsLot(lot)}>
                        <Layers className="h-3.5 w-3.5" /> Rolos/peças
                      </Button>
                      {lot.origin === 'production' && lot.remainingQty > 0 && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => setReworkLot(lot)}>
                          <RefreshCcw className="h-3.5 w-3.5" /> Reprocessar
                        </Button>
                      )}
                      {canClassifyFiber(lot) && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => setClassificationLot(lot)}>
                          <ClipboardList className="h-3.5 w-3.5" /> Classificar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredLots.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="p-0">
                    <EmptyState
                      compact
                      title="Nenhum lote encontrado"
                      description="Cadastre lotes para rastrear validade, origem e endereçamento no CD."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Lote</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Este cadastro apenas registra o lote: ele não lança movimento nem saldo. Para entrada de estoque,
            use “Receber pluma/fibra” ou finalize a conferência WMS.
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Nº Lote *</Label><Input value={newLot.lot_number} onChange={e => setNewLot(p => ({ ...p, lot_number: e.target.value }))} /></div>
              <div><Label>Código Produto *</Label><Input value={newLot.product_code} onChange={e => setNewLot(p => ({ ...p, product_code: e.target.value }))} /></div>
              <div className="col-span-2"><Label>Nome Produto</Label><Input value={newLot.product_name} onChange={e => setNewLot(p => ({ ...p, product_name: e.target.value }))} /></div>
              <div><Label>Fornecedor</Label><Input value={newLot.supplier} onChange={e => setNewLot(p => ({ ...p, supplier: e.target.value }))} /></div>
              <div><Label>Quantidade</Label><Input type="number" value={newLot.quantity || ''} onChange={e => setNewLot(p => ({ ...p, quantity: toSafeNumber(e.target.value) }))} /></div>
              <div><Label>Data Fabricação</Label><Input type="date" value={newLot.manufacture_date} onChange={e => setNewLot(p => ({ ...p, manufacture_date: e.target.value }))} /></div>
              <div><Label>Validade</Label><Input type="date" value={newLot.expiration_date} onChange={e => setNewLot(p => ({ ...p, expiration_date: e.target.value }))} /></div>
              <div><Label>Localização</Label><Input value={newLot.location} onChange={e => setNewLot(p => ({ ...p, location: e.target.value }))} /></div>
              <div>
                <Label>Origem</Label>
                <Select value={newLot.origin} onValueChange={v => setNewLot(p => ({ ...p, origin: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">Compra</SelectItem>
                    <SelectItem value="production">Produção</SelectItem>
                    <SelectItem value="transfer">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar Lote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FiberReceiptDialog
        open={fiberReceiptOpen}
        onOpenChange={setFiberReceiptOpen}
        onSuccess={() => void refetch()}
      />
      <FiberClassificationDialog
        open={!!classificationLot}
        onOpenChange={(open) => { if (!open) setClassificationLot(null); }}
        lotNumber={classificationLot?.lotNumber ?? ''}
        initial={classificationLot?.classification ?? null}
        onSave={async (classification) => {
          if (!classificationLot) return;
          await classify(classificationLot.id, classification);
          await refetch();
        }}
      />
      <StockLotUnitsDialog
        open={!!unitsLot}
        onOpenChange={(open) => { if (!open) setUnitsLot(null); }}
        lot={unitsLot}
      />
      <ReworkOrderDialog
        open={!!reworkLot}
        onOpenChange={(open) => { if (!open) { setReworkLot(null); void refetch(); } }}
        lot={reworkLot ? {
          id: reworkLot.id,
          lotNumber: reworkLot.lotNumber,
          productId: reworkLot.productId,
          productName: reworkLot.productName,
          remainingQty: reworkLot.remainingQty,
          status: reworkLot.status,
        } : null}
      />
    </PageContainer>
  );
}
