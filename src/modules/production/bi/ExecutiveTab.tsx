import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import type { BIMetrics } from './useBIMetrics';

interface ExecutiveTabProps {
  metrics: BIMetrics;
  period: string;
  periodDays: number;
}

export function ExecutiveTab({ metrics, period, periodDays }: ExecutiveTabProps) {
  const { productionTrend, marginDist } = metrics;
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Receita por Hora Trabalhada</p>
            <p className="text-4xl font-black text-primary">—</p>
            <p className="text-xs text-muted-foreground">Não apurada: preços cadastrados não são receita realizada</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Custo Médio por Peça</p>
            <p className="text-4xl font-black">—</p>
            <p className="text-xs text-muted-foreground">Não apurado: custos de catálogo não são custos de OP</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Taxa de Refugo</p>
            <p className="text-4xl font-black">—</p>
            <p className="text-xs text-muted-foreground">Unidades das OPs não comprovadas como comparáveis</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Apontamentos concluídos ({period} dias)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={productionTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" fontSize={10} interval={Math.floor(periodDays / 10)} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="entryCount" name="Apontamentos concluídos com duração válida" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Distribuição de margens unitárias cadastradas</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={marginDist} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={100} label={(p: any) => p.count > 0 ? `${p.label}: ${p.count}` : ''}>
                  {marginDist.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
