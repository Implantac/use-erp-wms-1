import { AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/ui/base/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/formatters';
import type { BIMetrics } from './useBIMetrics';

export function ProfitTab({ metrics }: { metrics: BIMetrics }) {
  const { profitByProduct, lowMarginProducts } = metrics;
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Diferença unitária entre preço e custo cadastrado (Top 15)</CardTitle></CardHeader>
          <CardContent>
            {profitByProduct.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={profitByProduct} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={11} tickFormatter={v => `R$${v}`} />
                  <YAxis dataKey="product" type="category" width={120} fontSize={11} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Bar dataKey="unitDifference" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                    {profitByProduct.map((entry, i) => (
                      <Cell key={i} fill={entry.margin < 10 ? 'hsl(var(--destructive))' : entry.margin < 20 ? 'hsl(var(--chart-3))' : 'hsl(var(--primary))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-8">Sem dados de custos</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Preço de venda × Custo cadastrado (por unidade)</CardTitle></CardHeader>
          <CardContent>
            {profitByProduct.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={profitByProduct.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={11} tickFormatter={v => `R$${v}`} />
                  <YAxis dataKey="product" type="category" width={120} fontSize={11} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Legend />
                  <Bar dataKey="price" name="Preço unitário" fill="hsl(var(--chart-2))" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="cost" name="Custo unitário" fill="hsl(var(--destructive))" stackId="b" radius={[0, 0, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-8">Sem dados</p>}
          </CardContent>
        </Card>
      </div>

      {lowMarginProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Produtos com margem cadastrada abaixo do limite</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Produto</TableHead><TableHead className="text-right">Preço Venda</TableHead>
                <TableHead className="text-right">Custo Total</TableHead><TableHead className="text-right">Margem</TableHead><TableHead>Ação</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lowMarginProducts.slice(0, 10).map(p => (
                  <TableRow key={p.product_code}>
                    <TableCell className="font-medium">{p.product_name}</TableCell>
                    <TableCell className="text-right">{formatBRL(p.sale_price)}</TableCell>
                    <TableCell className="text-right">{formatBRL(p.total_cost)}</TableCell>
                    <TableCell className="text-right"><span className={cn('font-bold', p.profit_margin < 0 ? 'text-destructive' : 'text-warning')}>{p.profit_margin.toFixed(1)}%</span></TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{p.profit_margin < 0 ? '🔴 Revisar preço' : '🟡 Otimizar custo'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
