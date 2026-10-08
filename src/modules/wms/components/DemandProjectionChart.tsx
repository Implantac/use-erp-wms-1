interface DemandChartProps {
  predictedDemand: number;
  unit: string;
  periodDays?: number;
}

// There is no daily forecast series in the API. Do not invent a trajectory from one aggregate.
export function DemandProjectionChart({ predictedDemand, unit, periodDays = 30 }: DemandChartProps) {
  return (
    <div className="mt-2 rounded border bg-muted/30 p-3 text-xs text-muted-foreground" role="note">
      Projeção agregada para {periodDays} dias: {predictedDemand} {unit}. Distribuição diária não disponível; gráfico temporal não calculado.
    </div>
  );
}
