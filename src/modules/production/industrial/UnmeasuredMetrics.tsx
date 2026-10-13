import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';

/** No measurement means no KPI: do not render invented telemetry or production. */
export function UnmeasuredMetrics({ metrics }: { metrics: readonly string[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric}>
          <CardHeader><CardTitle className="text-sm font-medium">{metric}</CardTitle></CardHeader>
          <CardContent>
            <p className="font-semibold">Sem dados suficientes</p>
            <p className="text-sm text-muted-foreground">
              Indicador indisponível até existir fonte real, fórmula, unidade e período validados.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
