import { useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import { useSectorIndicatorData } from '@/hooks/production/useSectorIndicatorData';
import type { SectorKind } from '@/lib/pcp/sectorProfiles';
import {
  computeMachineEfficiency,
  computeSectorIndicators,
  computeSectorReadiness,
  type SectorIndicatorInspection,
  type SectorIndicatorOrder,
} from '@/lib/pcp/sectorIndicators';
import { formatNumber } from '@/lib/formatters';

interface Props {
  kind: SectorKind;
  companyId: string | null;
  orders: readonly SectorIndicatorOrder[];
  inspections: readonly SectorIndicatorInspection[];
  refreshKey?: number;
}

function pct(value: number | null): string {
  return value === null ? 'sem dados' : `${formatNumber(value, 1)}%`;
}

/**
 * Indicadores e prontidão do setor, calculados de registros reais
 * (fórmulas em src/lib/pcp/sectorIndicators.ts). Sem denominador, o
 * indicador mostra "sem dados" — nenhum valor é estimado.
 */
export function SectorIndicatorsCard({ kind, companyId, orders, inspections, refreshKey }: Props) {
  const weavingOrderIds = useMemo(
    () => (kind === 'tecelagem' ? orders.map((order) => order.id) : []),
    [kind, orders],
  );
  const { events, products, schedules } = useSectorIndicatorData(companyId, kind, weavingOrderIds, refreshKey);
  const { machines } = useProductionMachines();

  const indicators = useMemo(
    () => computeSectorIndicators({ kind, orders, events, inspections }),
    [kind, orders, events, inspections],
  );
  const readiness = useMemo(
    () => computeSectorReadiness({ kind, machines, products }),
    [kind, machines, products],
  );
  const efficiency = useMemo(
    () => computeMachineEfficiency({ events, schedules, machines }),
    [events, schedules, machines],
  );
  const machineName = useMemo(() => {
    const map = new Map(machines.map((machine) => [machine.id, `${machine.code} — ${machine.name}`]));
    return (id: string) => map.get(id) ?? 'Máquina não identificada';
  }, [machines]);

  const tiles: Array<{ label: string; value: string; hint: string }> = [
    {
      label: 'Aderência ao plano (30 dias)',
      value: pct(indicators.adherencePct),
      hint: `${formatNumber(indicators.producedTotal)} de ${formatNumber(indicators.plannedTotal)} planejados em ${indicators.completedOrders} OP(s) concluída(s)`,
    },
    {
      label: 'Cumprimento de prazo',
      value: pct(indicators.onTimePct),
      hint: indicators.onTimeBase > 0 ? `base: ${indicators.onTimeBase} OP(s) com data devida` : 'sem OP concluída com data devida no período',
    },
    {
      label: 'Inspeções aprovadas',
      value: pct(indicators.approvedInspectionPct),
      hint: indicators.decidedInspections > 0 ? `${indicators.decidedInspections} inspeção(ões) decidida(s) no período` : 'nenhuma inspeção decidida no período',
    },
    {
      label: 'Paradas registradas (30 dias)',
      value: `${formatNumber(indicators.downtimeMinutes)} min`,
      hint: indicators.breaksCount > 0 ? `${indicators.breaksCount} ruptura(s) registrada(s)` : 'sem rupturas registradas',
    },
    {
      label: 'Em andamento (WIP)',
      value: `${indicators.wipOrders} OP(s)`,
      hint: `${formatNumber(indicators.wipRemainingQty)} restantes (planejado − produzido)`,
    },
  ];
  if (kind === 'tinturaria') {
    tiles.push({
      label: 'Retingimentos',
      value: `${indicators.reworkEvents}`,
      hint: 'eventos de retingimento registrados no período (retrabalho)',
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" /> Indicadores do setor — últimos {indicators.windowDays} dias
        </CardTitle>
        <CardDescription>
          Calculados de ordens, apontamentos e inspeções reais; sem denominador, aparece “sem dados”.
          Paradas agrupadas pela classificação de desvio registrada no apontamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">{tile.label}</p>
              <p className="text-xl font-semibold">{tile.value}</p>
              <p className="text-xs text-muted-foreground">{tile.hint}</p>
            </div>
          ))}
        </div>

        {efficiency.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium">Eficiência por máquina — produzido ÷ (capacidade/hora cadastrada × horas programadas, 30 dias)</p>
            <ul className="space-y-1 text-sm">
              {efficiency.slice(0, 5).map((row) => (
                <li key={row.machineId} className="flex items-center justify-between gap-2">
                  <span>{machineName(row.machineId)}</span>
                  <span className="text-muted-foreground">
                    {formatNumber(row.producedQty)} produzidos
                    {row.efficiencyPct !== null
                      ? ` · teórico ${formatNumber(row.theoreticalQty)} · ${formatNumber(row.efficiencyPct, 1)}%`
                      : ` · ${formatNumber(row.scheduledHours, 1)} h programadas · sem capacidade/hora cadastrada`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">
              Só aparece percentual com capacidade/hora cadastrada na máquina e janela programada —
              sem denominador configurado, mostramos o produzido e as horas, sem estimar.
            </p>
          </div>
        )}

        {indicators.downtimeByCategory.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium">Paradas por classificação de desvio</p>
            <ul className="space-y-1 text-sm">
              {indicators.downtimeByCategory.map((row) => (
                <li key={row.category} className="flex items-center justify-between gap-2">
                  <span>{row.label}</span>
                  <span className="text-muted-foreground">
                    {formatNumber(row.minutes)} min · {row.events} evento(s)
                  </span>
                </li>
              ))}
              {indicators.unclassifiedDowntimeMinutes > 0 && (
                <li className="flex items-center justify-between gap-2 text-amber-700">
                  <span>Sem classificação (causa não presumida)</span>
                  <span>{formatNumber(indicators.unclassifiedDowntimeMinutes)} min</span>
                </li>
              )}
            </ul>
          </div>
        )}

        {indicators.downtimeByMachine.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium">Máquinas com mais parada no período</p>
            <ul className="space-y-1 text-sm">
              {indicators.downtimeByMachine.slice(0, 5).map((row) => (
                <li key={row.machineId} className="flex items-center justify-between gap-2">
                  <span>{machineName(row.machineId)}</span>
                  <span className="text-muted-foreground">{formatNumber(row.minutes)} min · {row.events} evento(s)</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-1 text-sm font-medium">Prontidão mínima para programar</p>
          <ul className="space-y-1 text-sm">
            {readiness.map((item) => (
              <li key={item.key} className="flex items-start gap-2">
                {item.ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />}
                <span>
                  <span className="font-medium">{item.label}:</span>{' '}
                  <span className="text-muted-foreground">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
