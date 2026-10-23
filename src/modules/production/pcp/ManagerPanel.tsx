import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Factory, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { KPICard } from '@/shared/components/KPICard';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useProductionSchedule } from '@/hooks/production/useProductionSchedule';
import { useQualityInspections } from '@/hooks/production/useQualityInspections';
import { useManagerPanelData } from '@/hooks/production/useManagerPanelData';
import { detectScheduleConflicts, type ScheduleSlotLike } from '@/lib/pcp/capacityConflicts';
import { computeManagerMetrics } from '@/lib/pcp/managerMetrics';
import { formatNumber } from '@/lib/formatters';

function scheduleResourceKey(schedule: { resource_id?: string | null; machine_id?: string | null; work_center?: string | null; sector?: string | null; shift?: string | null }): string | null {
  if (schedule.machine_id) return `machine:${schedule.machine_id}`;
  if (schedule.resource_id) return `resource:${schedule.resource_id}`;
  const workCenter = schedule.work_center?.trim();
  if (workCenter) return workCenter;
  const sector = schedule.sector?.trim();
  return sector ? `${sector} · ${schedule.shift?.trim() || 'sem turno'}` : null;
}

/**
 * Painel do Gerente de Produção: somente consultas reais da empresa ativa.
 * Cada indicador mostra a fórmula/fonte; sem amostra válida, exibimos
 * "Sem dados suficientes" em vez de estimar qualquer número.
 */
export function ManagerPanel() {
  const { orders, loading: ordersLoading, loadError: ordersError, hasCompany } = useProductionOrders();
  const { schedules } = useProductionSchedule();
  const { inspections } = useQualityInspections();
  const { lots, shipments, loadError: stockError } = useManagerPanelData();

  const conflicts = useMemo(() => {
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const slots: ScheduleSlotLike[] = schedules.map((schedule) => ({
      id: schedule.id,
      orderNumber: schedule.production_order_id ? orderById.get(schedule.production_order_id)?.order_number : undefined,
      resourceKey: scheduleResourceKey(schedule),
      plannedStart: schedule.planned_start,
      plannedEnd: schedule.planned_end,
      status: schedule.status,
    }));
    return detectScheduleConflicts(slots);
  }, [orders, schedules]);

  const metrics = useMemo(
    () =>
      computeManagerMetrics({
        orders,
        schedules,
        lots,
        shipments,
        inspections: inspections.map((inspection) => ({
          approved_quantity: inspection.approved_quantity,
          rejected_quantity: inspection.rejected_quantity,
          order_unit: inspection.order_unit,
        })),
      }),
    [orders, schedules, lots, shipments, inspections],
  );

  if (!hasCompany) {
    return <EmptyState icon={Factory} title="Selecione uma empresa" description="O Painel do Gerente só mostra dados da empresa ativa." />;
  }
  if (ordersError || stockError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Sem dados suficientes"
        description="Falha ao consultar ordens/lotes da empresa. Nenhum indicador foi estimado; tente recarregar a página."
      />
    );
  }

  const hasProduction = metrics.productionByUnit.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPICard title="OPs abertas" value={metrics.openOrders} subtitle={`de ${metrics.totalOrders} OPs da empresa (status ≠ concluída/cancelada)`} icon={<ClipboardList className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Concluídas (30 dias)" value={metrics.completedInWindow} subtitle="por completed_date, sem estimativa" icon={<CheckCircle2 className="h-5 w-5" />} accentColor="success" index={1} />
        <KPICard title="OPs atrasadas" value={metrics.overdueOpenOrders} subtitle="abertas com due_date vencida" icon={<AlertTriangle className="h-5 w-5" />} accentColor={metrics.overdueOpenOrders > 0 ? 'danger' : 'success'} index={2} />
        <KPICard title="Aprovação de qualidade" value={metrics.qualityApprovalPct === null ? '—' : `${metrics.qualityApprovalPct.toFixed(1)}%`} subtitle={metrics.qualityApprovalPct === null ? `Sem dados suficientes (${metrics.qualitySampleSize} inspeções; unidades mistas ou ausentes)` : `aprovada/(aprovada+rejeitada) em ${metrics.qualitySampleSize} inspeções`} icon={<ShieldCheck className="h-5 w-5" />} accentColor="info" index={3} />
        <KPICard title="Janelas hoje" value={metrics.windowsToday} subtitle="programação scheduled/em execução cruzando o dia" icon={<CalendarClock className="h-5 w-5" />} accentColor="primary" index={4} />
        <KPICard title="OPs sem programação" value={metrics.unscheduledOpenOrders} subtitle="abertas sem janela ativa (risco de atraso)" icon={<CalendarClock className="h-5 w-5" />} accentColor={metrics.unscheduledOpenOrders > 0 ? 'warning' : 'success'} index={5} />
        <KPICard title="Conflitos de capacidade" value={conflicts.length} subtitle="janelas sobrepostas no mesmo recurso/máquina" icon={<Factory className="h-5 w-5" />} accentColor={conflicts.length > 0 ? 'danger' : 'success'} index={6} />
        <KPICard title="Lotes bloqueados" value={metrics.blockedLots} subtitle="quarentena/rejeitado com saldo (não reserva, não expede)" icon={<PackageCheck className="h-5 w-5" />} accentColor={metrics.blockedLots > 0 ? 'danger' : 'success'} index={7} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild><Link to="/producao/ordens">Abrir ordens de produção</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/producao/programacao">Abrir programação finita</Link></Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Produção concluída por unidade (30 dias)</CardTitle></CardHeader>
          <CardContent>
            {!hasProduction ? (
              <p className="text-sm text-muted-foreground">Sem dados suficientes: nenhuma OP concluída nos últimos 30 dias.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1">Unidade</th><th>OPs</th><th>Produzido</th><th>Rejeitado</th><th>Rendimento</th></tr></thead>
                <tbody>
                  {metrics.productionByUnit.map((row) => (
                    <tr key={row.unit} className="border-t">
                      <td className="py-1.5 font-medium">{row.unit}</td>
                      <td>{row.orders}</td>
                      <td>{formatNumber(row.produced)}</td>
                      <td>{formatNumber(row.rejected)}</td>
                      <td>{row.yieldPct === null ? '—' : `${row.yieldPct.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Fórmula: produzido e rejeitado somados por unidade das OPs concluídas; rendimento = produzido/(produzido+rejeitado). Unidades diferentes nunca são somadas.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">OPs abertas por setor</CardTitle></CardHeader>
          <CardContent>
            {metrics.openBySector.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados suficientes: nenhuma OP aberta.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {metrics.openBySector.map((row) => (
                  <li key={row.sector} className="flex items-center justify-between border-b pb-1.5 last:border-0">
                    <span>{row.sector}</span><span className="font-medium">{row.openOrders}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Fonte: production_orders.setor da OP (derivado do roteiro na criação); sem setor, usa centro de trabalho.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Saldo por lote (produtos com saldo)</CardTitle></CardHeader>
          <CardContent>
            {metrics.lotsByProduct.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados suficientes: nenhum lote com saldo restante.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {metrics.lotsByProduct.slice(0, 10).map((row) => (
                  <li key={row.productCode} className="flex items-center justify-between border-b pb-1.5 last:border-0">
                    <span className="font-mono text-xs">{row.productCode}</span><span className="font-medium">{formatNumber(row.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Fórmula: soma de stock_lots.remaining_qty por produto (somente saldo &gt; 0), incluindo o que está reservado — disponibilidade líquida fica no MRP/estoque.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Expedido (7 dias, por lote)</CardTitle></CardHeader>
          <CardContent>
            {metrics.shippedByProduct.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados suficientes: nenhuma separação WMS nos últimos 7 dias.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {metrics.shippedByProduct.slice(0, 10).map((row) => (
                  <li key={row.productCode} className="flex items-center justify-between border-b pb-1.5 last:border-0">
                    <span className="font-mono text-xs">{row.productCode}</span><span className="font-medium">{formatNumber(row.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Fonte: stock_movements do picking WMS (source = wms_pick), que identifica o lote expedido em cada movimento.</p>
          </CardContent>
        </Card>
      </div>

      {ordersLoading && <p className="text-xs text-muted-foreground">Atualizando indicadores…</p>}
    </div>
  );
}
