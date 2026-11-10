import { useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { EmptyState } from '@/shared/components/EmptyState';
import { Skeleton } from '@/ui/base/skeleton';
import { useOperational } from '@/hooks/operational/useOperational';
import type { ShipmentOrder, DeliveryTrackingEvent } from '@/services/operational/operationalService';
import { Truck, Clock, CheckCircle, MapPin, Play, Eye } from 'lucide-react';

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const shipmentStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-warning/10 text-warning-text' },
  loading: { label: 'Em Carregamento', color: 'bg-info/10 text-info' },
  dispatched: { label: 'Despachado', color: 'bg-primary/10 text-primary' },
  in_transit: { label: 'Em Trânsito', color: 'bg-info/10 text-info' },
  delivered: { label: 'Entregue', color: 'bg-success/10 text-success' },
  returned: { label: 'Devolvido', color: 'bg-destructive/10 text-destructive' },
};

const SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  pending: ['loading'],
  loading: ['dispatched'],
  dispatched: ['in_transit'],
  in_transit: ['delivered', 'returned'],
};

export default function ShipmentPage() {
  const { shipments, shipmentsLoading: isLoading, updateShipmentStatus, getTracking, createTrackingEvent } = useOperational();
  const [selectedShipment, setSelectedShipment] = useState<ShipmentOrder | null>(null);
  const { data: tracking } = getTracking(selectedShipment?.id);


  const handleAdvance = (shipment: ShipmentOrder, nextStatus: string) => {
    updateShipmentStatus({ id: shipment.id, status: nextStatus });
    createTrackingEvent({
      shipment_id: shipment.id,
      event_type: nextStatus,
      description: `Status alterado para ${shipmentStatusConfig[nextStatus]?.label || nextStatus}`,
    });
  };


  const statusCounts = (shipments || []).reduce((acc: Record<string, number>, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <PageContainer>
      <PageHeader title="Expedição & Entregas" description="Controle de despacho, rastreamento e confirmação de entrega" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Truck className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{shipments?.length || 0}</p><p className="text-xs text-muted-foreground">Total Expedições</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Clock className="h-8 w-8 text-warning-text" />
          <div><p className="text-2xl font-bold">{statusCounts['pending'] || 0}</p><p className="text-xs text-muted-foreground">Pendentes</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <MapPin className="h-8 w-8 text-info" />
          <div><p className="text-2xl font-bold">{(statusCounts['in_transit'] || 0) + (statusCounts['dispatched'] || 0)}</p><p className="text-xs text-muted-foreground">Em Trânsito</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-success" />
          <div><p className="text-2xl font-bold">{statusCounts['delivered'] || 0}</p><p className="text-xs text-muted-foreground">Entregues</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Expedições</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !shipments?.length ? (
            <EmptyState
              icon={Truck}
              title="Nenhuma expedição registrada"
              description="Pedidos faturados gerarão expedições aqui para despacho, rastreamento e entrega."
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nº Expedição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Transportadora</TableHead>
                <TableHead>Volumes</TableHead>
                <TableHead>Peso (kg)</TableHead>
                <TableHead>Rastreio</TableHead>
                <TableHead>Prev. Entrega</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {shipments.map((s: ShipmentOrder) => {
                  const sc = shipmentStatusConfig[s.status] || { label: s.status, color: '' };
                  const nextStatuses = SHIPMENT_TRANSITIONS[s.status] || [];
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono">{s.shipment_number}</TableCell>
                      <TableCell><Badge variant="outline" className={cn('font-medium border', sc.color)}>{sc.label}</Badge></TableCell>
                      <TableCell>{s.carrier || '-'}</TableCell>
                      <TableCell>{s.volumes}</TableCell>
                      <TableCell>{s.total_weight?.toFixed(1)}</TableCell>
                      <TableCell className="font-mono text-xs">{s.tracking_code || '-'}</TableCell>
                      <TableCell>{s.expected_delivery ? format(new Date(s.expected_delivery), 'dd/MM/yyyy') : '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {nextStatuses.map(ns => (
                            <Button key={ns} size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => handleAdvance(s, ns)}>
                              <Play className="h-3 w-3 mr-1" /> {shipmentStatusConfig[ns]?.label}
                            </Button>
                          ))}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelectedShipment(s)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tracking Dialog */}
      <Dialog open={!!selectedShipment} onOpenChange={() => setSelectedShipment(null)}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rastreamento - {selectedShipment?.shipment_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!tracking?.length ? (
              <EmptyState
                icon={MapPin}
                title="Sem eventos de rastreamento"
                description="Eventos aparecerão à medida que a expedição avança."
                compact
              />
            ) : tracking.map((t: DeliveryTrackingEvent) => (
              <div key={t.id} className="flex gap-3 items-start">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{t.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(t.occurred_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    {t.location && ` • ${t.location}`}
                    {t.registered_by && ` • ${t.registered_by}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
