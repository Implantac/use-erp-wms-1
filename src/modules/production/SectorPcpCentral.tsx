import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Factory, PackageCheck, Plus, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useSectorAccess } from '@/hooks/production/useSectorAccess';
import { canOpenSector } from '@/lib/pcp/sectorAccess';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { SectorIndicatorsCard } from './productionOrders/SectorIndicatorsCard';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Progress } from '@/ui/base/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { useProductionOrders, type ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { useProductionOrderSteps } from '@/hooks/production/useProductionSteps';
import { useProductionSchedule } from '@/hooks/production/useProductionSchedule';
import { useQualityInspections } from '@/hooks/production/useQualityInspections';
import { useTextilePcpData } from '@/hooks/production/useTextilePcpData';
import { useNetMRP } from './mrp/useNetMRP';
import { CreateTextileOrderDialog } from './productionOrders/CreateTextileOrderDialog';
import { CreateSectorOrderDialog } from './productionOrders/CreateSectorOrderDialog';
import { OrderMaterialReservationPanel, OrderStepProgressPanel } from './productionOrders/OrderExecutionPanels';
import { ProductionCompletionPanel } from './productionOrders/ProductionCompletionPanel';
import { WeavingEventsPanel, WeavingProfilePanel } from './productionOrders/WeavingOperationsPanel';
import { LoomBoardPanel } from './productionOrders/LoomBoardPanel';
import { SectorBoardPanel, SECTOR_BOARDS } from './productionOrders/SectorBoardPanel';
import { DyeingProfilePanel, KnittingProfilePanel, SectorEventsPanel, SpinningProfilePanel } from './productionOrders/SectorOperationsPanels';
import { SECTOR_MATCHERS, type SectorKind } from '@/lib/pcp/sectorProfiles';
import { formatNumber } from '@/lib/formatters';

/**
 * Central de PCP por setor têxtil (fiação, malharia, tecelagem, tinturaria).
 *
 * Um único motor de execução (OP com snapshot, reserva por lote, capacidade
 * finita, apontamento sequencial, qualidade e genealogia) visto por setor:
 * cada tipo de produção tem sua central, sem duplicar módulos. A OP pertence
 * ao setor gravado nela na criação (derivado do roteiro); o centro de
 * trabalho só é usado para OPs legadas sem setor.
 */
export interface SectorCentralConfig {
  key: SectorKind;
  /** Nome do setor para textos ("fiação", "tecelagem"...). */
  noun: string;
  title: string;
  description: string;
  newOrderLabel: string;
  /** Trechos (sem acento, minúsculos) que identificam o setor da OP. */
  matchers: readonly string[];
}

export const SECTOR_CENTRALS: Record<SectorCentralConfig['key'], SectorCentralConfig> = {
  fiacao: {
    key: 'fiacao',
    noun: 'fiação',
    title: 'Central PCP — Fiação',
    description: 'Fluxo executável da fiação: OP com snapshot, reserva por lote de fibra/pluma, capacidade finita, apontamento sequencial, qualidade e genealogia até o fio.',
    newOrderLabel: 'Nova OP de fiação',
    matchers: SECTOR_MATCHERS.fiacao,
  },
  malharia: {
    key: 'malharia',
    noun: 'malharia',
    title: 'Central PCP — Malharia',
    description: 'Fluxo executável da malharia: OP com snapshot, reserva por lote de fio, capacidade finita, apontamento sequencial, qualidade e genealogia até a malha crua.',
    newOrderLabel: 'Nova OP de malharia',
    matchers: SECTOR_MATCHERS.malharia,
  },
  tecelagem: {
    key: 'tecelagem',
    noun: 'tecelagem',
    title: 'Central PCP — Tecelagem',
    description: 'Fluxo executável do tear à conclusão: OP com snapshot, perfil de tecelagem, reserva por lote, capacidade finita, apontamento sequencial, qualidade e genealogia.',
    newOrderLabel: 'Nova OP de tecelagem',
    matchers: SECTOR_MATCHERS.tecelagem,
  },
  tinturaria: {
    key: 'tinturaria',
    noun: 'tinturaria',
    title: 'Central PCP — Tinturaria',
    description: 'Fluxo executável da tinturaria: OP com snapshot (ficha e receita configuradas da empresa), reserva por lote, capacidade finita, apontamento sequencial, qualidade e genealogia até o lote tingido.',
    newOrderLabel: 'Nova OP de tinturaria',
    matchers: SECTOR_MATCHERS.tinturaria,
  },
};

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isSectorOrder(order: ProductionOrderRow, matchers: readonly string[]): boolean {
  const sector = normalize(order.sector ?? '');
  if (sector) return matchers.some((matcher) => sector.includes(matcher));
  const workCenter = normalize(order.work_center ?? '');
  return matchers.some((matcher) => workCenter.includes(matcher));
}

export default function SectorPcpCentral({ config }: { config: SectorCentralConfig }) {
  const { orders, loading, loadError, hasCompany, refetch } = useProductionOrders();
  const { data: sectorAccess } = useSectorAccess();
  const sectorDenied = sectorAccess != null && !canOpenSector(sectorAccess, config.key);
  const { schedules } = useProductionSchedule();
  const { inspections } = useQualityInspections();
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const markedOrders = useMemo(
    () => orders.filter((order) => isSectorOrder(order, config.matchers)),
    [orders, config.matchers],
  );
  const usingFallbackOrders = markedOrders.length === 0 && orders.length > 0;
  const sectorOrders = usingFallbackOrders ? orders : markedOrders;
  const selectedOrder = sectorOrders.find((order) => order.id === selectedOrderId) ?? sectorOrders[0] ?? null;
  const { orderSteps, refetch: refetchSteps } = useProductionOrderSteps(selectedOrder?.id);
  const execution = useTextilePcpData(selectedOrder);
  const { needs } = useNetMRP(orders);

  useEffect(() => {
    if (selectedOrder && selectedOrder.id !== selectedOrderId) setSelectedOrderId(selectedOrder.id);
  }, [selectedOrder, selectedOrderId]);

  const refresh = async () => {
    await Promise.all([refetch(), execution.refetch(), refetchSteps()]);
  };

  const activeOrders = sectorOrders.filter((order) => !['completed', 'cancelled'].includes(order.status));
  const sectorOrderIds = new Set(sectorOrders.map((order) => order.id));
  const sectorActiveSchedules = schedules.filter(
    (schedule) => sectorOrderIds.has(schedule.production_order_id) && ['scheduled', 'in_progress'].includes(schedule.status ?? ''),
  );
  const deficitComponents = needs.filter(
    (need) => need.netRequirement > 0 && need.relatedOPs.some((orderId) => sectorOrderIds.has(orderId)),
  ).length;
  const selectedSchedule = selectedOrder
    ? schedules.find((schedule) => schedule.production_order_id === selectedOrder.id && ['scheduled', 'in_progress'].includes(schedule.status ?? ''))
    : null;
  const selectedInspections = selectedOrder ? inspections.filter((inspection) => inspection.production_order_id === selectedOrder.id) : [];
  const approvedQuality = selectedInspections
    .filter((inspection) => inspection.status.toLowerCase() === 'approved')
    .reduce((sum, inspection) => sum + inspection.approved_quantity, 0);
  const blockedQuality = selectedInspections.some((inspection) => ['rejected', 'quarantine', 'blocked'].includes(inspection.status.toLowerCase()));
  const completedSteps = orderSteps.filter((step) => step.status === 'completed').length;
  const activeReservationCount = execution.reservations
    .filter((reservation) => ['reserved', 'partially_consumed'].includes(reservation.status)).length;
  const progress = selectedOrder && selectedOrder.quantity > 0 ? (selectedOrder.produced_quantity / selectedOrder.quantity) * 100 : 0;

  const readiness = selectedOrder ? [
    { label: 'Snapshot técnico congelado', ok: Boolean(execution.snapshotAt), detail: execution.snapshotAt ? new Date(execution.snapshotAt).toLocaleString('pt-BR') : 'OP legada usa BOM atual; nova OP congela na criação' },
    { label: 'BOM e lotes liberados', ok: execution.bomLines.length > 0, detail: `${execution.bomLines.length} componente(s); ${activeReservationCount} reserva(s) ativa(s) por lote — quantidades ficam no painel de reservas, sem somar unidades diferentes` },
    { label: 'Programação finita', ok: Boolean(selectedSchedule), detail: selectedSchedule ? `${selectedSchedule.work_center ?? selectedSchedule.sector ?? 'Recurso'} · ${new Date(selectedSchedule.planned_start).toLocaleString('pt-BR')}` : 'Sem janela ativa para esta OP' },
    { label: 'Etapas sequenciais', ok: orderSteps.length > 0 && completedSteps === orderSteps.length, detail: `${completedSteps}/${orderSteps.length} concluídas` },
    { label: 'Qualidade formalmente aprovada', ok: approvedQuality >= (selectedOrder.quantity || 0) && !blockedQuality, detail: blockedQuality ? 'Há inspeção rejeitada/quarentena' : `Aprovado ${formatNumber(approvedQuality)} ${selectedOrder.unit}` },
    { label: 'Genealogia de lotes', ok: execution.genealogy.length > 0, detail: selectedOrder.status === 'completed' ? `${execution.genealogy.length} aresta(s) entrada→saída` : 'Será gravada na conclusão transacional' },
  ] : [];

  if (sectorDenied) {
    return (
      <PageContainer>
        <PageHeader title={config.title} description={config.description} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Sem acesso ao setor de {config.noun}
            </CardTitle>
            <CardDescription>
              Seu usuário não tem concessão neste setor. Quem opera e gerencia
              cada setor é definido pelo administrador da empresa (acesso por
              setor: visualização, operação ou gerenciamento). Fala com o
              administrador para liberar seu acesso à {config.noun} — as
              demais centrais liberadas para você continuam no menu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/">Voltar ao início</Link>
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer loading={loading}>
      <PageHeader title={config.title} description={config.description}>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" /> {config.newOrderLabel}</Button>
        <Button variant="outline" asChild><Link to="/producao/programacao">Programação finita</Link></Button>
        <Button variant="outline" asChild><Link to="/producao/mrp">MRP líquido</Link></Button>
        <Button variant="outline" asChild><Link to="/producao/qualidade">Qualidade</Link></Button>
      </PageHeader>

      {!hasCompany && <p role="alert" className="text-sm text-muted-foreground">Selecione uma empresa para operar o PCP de {config.noun}.</p>}
      {loadError && <p role="alert" className="text-sm text-destructive">Falha ao carregar OPs; a central não exibe indicadores sem fonte confiável.</p>}
      {execution.error && <p role="alert" className="text-sm text-destructive">Execução da OP selecionada indisponível: {execution.error}</p>}
      {usingFallbackOrders && <p role="alert" className="text-sm text-amber-700">Nenhuma OP está marcada por setor/centro como {config.noun}. Para não esconder trabalho existente, a lista abaixo mostra todas as OPs apenas para seleção manual; os KPIs não as classificam como {config.noun}.</p>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard title={usingFallbackOrders ? `OPs ativas (sem marca ${config.noun})` : `OPs de ${config.noun} ativas`} value={activeOrders.length} icon={<Factory className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Componentes com déficit líquido" value={deficitComponents} icon={<AlertTriangle className="h-5 w-5" />} accentColor="danger" index={1} />
        <KPICard title="Janelas finitas ativas" value={sectorActiveSchedules.length} icon={<CalendarClock className="h-5 w-5" />} accentColor="info" index={2} />
        <KPICard title="OPs concluídas" value={sectorOrders.filter((order) => order.status === 'completed').length} icon={<CheckCircle2 className="h-5 w-5" />} accentColor="success" index={3} />
      </div>

      <SectorIndicatorsCard
        kind={config.key}
        companyId={markedOrders[0]?.company_id ?? null}
        orders={markedOrders}
        inspections={inspections}
      />
      {config.key === 'tecelagem' && <LoomBoardPanel />}
      {(config.key === 'fiacao' || config.key === 'malharia' || config.key === 'tinturaria') && (
        <SectorBoardPanel config={SECTOR_BOARDS[config.key]} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> OP em operação</CardTitle>
          <CardDescription>Os indicadores abaixo são consultas reais das OPs, BOM, saldos/lotes, programação, inspeções e genealogia. Sem fonte suficiente, a tela mostra a pendência em vez de estimar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sectorOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma OP encontrada. Crie a primeira OP de {config.noun} com BOM e roteiro ativos.</p>
          ) : (
            <>
              <Select value={selectedOrder?.id ?? ''} onValueChange={setSelectedOrderId}>
                <SelectTrigger><SelectValue placeholder="Selecione a OP" /></SelectTrigger>
                <SelectContent>{sectorOrders.map((order) => <SelectItem key={order.id} value={order.id}>{order.order_number} — {order.product_name} · {order.status} · {formatNumber(order.produced_quantity)}/{formatNumber(order.quantity)} {order.unit}</SelectItem>)}</SelectContent>
              </Select>
              {selectedOrder && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{selectedOrder.status}</Badge>
                    <span className="text-sm text-muted-foreground">{selectedOrder.work_center || selectedOrder.sector || 'Centro não informado'} · {execution.bomLines.length} componente(s) na BOM/snapshot; necessidade por unidade no painel de reservas</span>
                  </div>
                  <Progress value={Math.min(100, progress)} />
                  <div className="grid gap-2 md:grid-cols-3">
                    {readiness.map((item) => (
                      <div key={item.label} className="rounded-md border p-3">
                        <p className="flex items-center gap-2 text-sm font-medium">{item.ok ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}{item.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selectedOrder && (
        <div className="space-y-4">
          {config.key === 'tecelagem' && (
            <WeavingProfilePanel order={selectedOrder} profile={execution.weavingProfile} lots={execution.lots} onChanged={refresh} />
          )}
          {config.key === 'fiacao' && (
            <SpinningProfilePanel order={selectedOrder} profile={execution.sectorProfile} onChanged={refresh} />
          )}
          {config.key === 'malharia' && (
            <KnittingProfilePanel order={selectedOrder} profile={execution.sectorProfile} onChanged={refresh} />
          )}
          {config.key === 'tinturaria' && (
            <DyeingProfilePanel order={selectedOrder} profile={execution.sectorProfile} onChanged={refresh} />
          )}
          <OrderMaterialReservationPanel order={selectedOrder} bomLines={execution.bomLines} lots={execution.lots} reservations={execution.reservations} snapshotAt={execution.snapshotAt} loading={execution.loading} onChanged={refresh} />
          <OrderStepProgressPanel order={selectedOrder} steps={orderSteps} loading={false} onChanged={refresh} />
          {config.key === 'tecelagem' && (
            <WeavingEventsPanel order={selectedOrder} events={execution.weavingEvents} onChanged={refresh} />
          )}
          {config.key !== 'tecelagem' && (
            <SectorEventsPanel order={selectedOrder} kind={config.key} events={execution.sectorEvents} onChanged={refresh} />
          )}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><PackageCheck className="h-4 w-4" /> Qualidade, conclusão e genealogia</CardTitle><CardDescription>Para aprovar/rejeitar com ação corretiva e concluir com lote de saída, use a execução completa da OP.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild><Link to="/producao/ordens">Abrir OPs e concluir</Link></Button>
              <Button variant="outline" asChild><Link to="/producao/qualidade">Registrar/inspecionar qualidade</Link></Button>
              <Button variant="outline" asChild><Link to="/producao/rastreabilidade">Rastreabilidade de lotes</Link></Button>
            </CardContent>
          </Card>
          <ProductionCompletionPanel order={selectedOrder} bomLines={execution.bomLines} lots={execution.lots} onCompleted={refresh} />
        </div>
      )}

      {config.key === 'tecelagem' ? (
        <CreateTextileOrderDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
      ) : (
        <CreateSectorOrderDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={refresh}
          kind={config.key}
          noun={config.noun}
        />
      )}
    </PageContainer>
  );
}
