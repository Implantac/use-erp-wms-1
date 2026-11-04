import { useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Input } from '@/ui/base/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Package, CheckCircle, Truck, Search, AlertTriangle, PackageCheck, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { EmptyState } from '@/shared/components/EmptyState';
import { useOrdersForPicking, useShipmentInfo } from './orderPicking/useOrderPickingData';
import { useOrderPickingMutations } from './orderPicking/useOrderPickingMutations';
import { TrackingDialog } from './orderPicking/TrackingDialog';
import { OrderUnitAllocationDialog } from './orderPicking/OrderUnitAllocationDialog';
import type { OrderRow, StageForm } from './orderPicking/types';

export default function OrderPicking() {
  const [search, setSearch] = useState('');
  const [stageOpen, setStageOpen] = useState(false);
  const [stageOrder, setStageOrder] = useState<OrderRow | null>(null);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [unitsOrder, setUnitsOrder] = useState<OrderRow | null>(null);
  const [stageForm, setStageForm] = useState<StageForm>({
    stage: 'conferred',
    tracking_number: '',
    carrier: '',
    location: '',
    notes: '',
  });

  const { data: orders = [], isLoading } = useOrdersForPicking();
  const { data: shipmentInfo } = useShipmentInfo(stageOrder?.number);
  const { pickMut, shipMut, stageMut } = useOrderPickingMutations(stageForm, () =>
    setStageForm((p) => ({ ...p, notes: '' })),
  );

  const openStageDialog = (o: OrderRow) => {
    setStageOrder(o);
    setStageForm({
      stage: o.stage === 'shipped' ? 'delivered' : 'conferred',
      tracking_number: '',
      carrier: '',
      location: '',
      notes: '',
    });
    setStageOpen(true);
  };

  const filtered = orders.filter(
    (o) =>
      o.number.toLowerCase().includes(search.toLowerCase()) ||
      o.client_name.toLowerCase().includes(search.toLowerCase()),
  );

  const totals = {
    total: orders.length,
    reserved: orders.filter((o) => o.stage === 'reserved').length,
    picked: orders.filter((o) => o.stage === 'picked').length,
    shipped: orders.filter((o) => o.stage === 'shipped').length,
  };

  const stageBadge = (s: OrderRow['stage']) => {
    switch (s) {
      case 'reserved':
        return <Badge className="bg-info/10 text-info border-info/30">Reservado</Badge>;
      case 'partial_picked':
        return <Badge className="bg-warning/10 text-warning border-warning/30">Separação parcial</Badge>;
      case 'picked':
        return <Badge className="bg-success/10 text-success border-success/30">Separado</Badge>;
      case 'shipped':
        return <Badge className="bg-primary/10 text-primary border-primary/30">Expedido</Badge>;
      default:
        return <Badge variant="outline">—</Badge>;
    }
  };

  return (
    <PageContainer loading={isLoading}>
      <PageHeader
        title="Separação e Expedição"
        description="Confirma a separação física (consome reservado e baixa saldo) e marca a expedição. Isolado por empresa via RLS."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="Pedidos no fluxo" value={totals.total} icon={Package} index={0} />
        <KPICard title="Aguardando separação" value={totals.reserved} icon={AlertTriangle} index={1} color="warning" />
        <KPICard title="Separados" value={totals.picked} icon={PackageCheck} index={2} color="success" />
        <KPICard title="Expedidos" value={totals.shipped} icon={Truck} index={3} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por número ou cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Reservadas</TableHead>
                <TableHead className="text-center">Separadas</TableHead>
                <TableHead className="text-center">Expedidas</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="p-4">
                    <EmptyState
                      compact
                      title="Nada para separar agora"
                      description="Assim que um pedido tiver reservas confirmadas, ele aparecerá aqui para picking."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.number}</TableCell>
                    <TableCell>{o.client_name}</TableCell>
                    <TableCell>{format(new Date(o.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>{stageBadge(o.stage)}</TableCell>
                    <TableCell className="text-center">{o.reserved_lines}</TableCell>
                    <TableCell className="text-center">{o.picked_lines}</TableCell>
                    <TableCell className="text-center">{o.shipped_lines}</TableCell>
                    <TableCell className="text-right">
                      {o.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        {(o.stage === 'reserved' || o.stage === 'partial_picked') && (
                          <Button size="sm" onClick={() => pickMut.mutate(o.id)} disabled={pickMut.isPending}>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Separar
                          </Button>
                        )}
                        {o.stage === 'picked' && (
                          <Button size="sm" variant="default" onClick={() => shipMut.mutate(o.id)} disabled={shipMut.isPending}>
                            <Truck className="h-3 w-3 mr-1" />
                            Expedir
                          </Button>
                        )}
                        {o.stage === 'shipped' && (
                          <Badge variant="outline" className="text-muted-foreground">Finalizado</Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setUnitsOrder(o); setUnitsOpen(true); }}
                          title="Vincular rolos/peças embalados deste pedido"
                        >
                          <PackageCheck className="h-3 w-3 mr-1" />
                          Rolos
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openStageDialog(o)} title="Atualizar tracking / etapa de expedição">
                          <ClipboardList className="h-3 w-3 mr-1" />
                          Tracking
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OrderUnitAllocationDialog open={unitsOpen} onOpenChange={setUnitsOpen} order={unitsOrder} />

      <TrackingDialog
        open={stageOpen}
        onOpenChange={setStageOpen}
        order={stageOrder}
        form={stageForm}
        setForm={setStageForm}
        shipmentInfo={shipmentInfo}
        onSubmit={() => stageOrder && stageMut.mutate(stageOrder.id)}
        submitting={stageMut.isPending}
      />
    </PageContainer>
  );
}
