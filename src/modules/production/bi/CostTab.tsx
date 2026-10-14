import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import type { BIMetrics } from './useBIMetrics';

export function CostTab({ metrics }: { metrics: BIMetrics }) {
  const { sectorActivity } = metrics;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Contagem de OPs e horas realizadas informadas. Sem custo monetário, eficiência validada ou soma de peças em unidades potencialmente distintas.</p>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Horas informadas por setor</CardTitle></CardHeader>
        <CardContent>
          {sectorActivity.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sectorActivity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="sector" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="laborHours" name="Horas realizadas informadas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-muted-foreground py-8">Sem OPs carregadas para a empresa.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Apontamentos por setor (sem recorte pela janela de tendências)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Setor</TableHead><TableHead className="text-right">OPs</TableHead>
              <TableHead className="text-right">OPs com tempo positivo</TableHead>
              <TableHead className="text-right">Horas informadas</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sectorActivity.map(row => (
                <TableRow key={row.sector}>
                  <TableCell className="font-medium">{row.sector}</TableCell>
                  <TableCell className="text-right">{row.orders}</TableCell>
                  <TableCell className="text-right">{row.timedOrders}</TableCell>
                  <TableCell className="text-right">{row.laborHours === null ? '—' : `${row.laborHours}h`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
