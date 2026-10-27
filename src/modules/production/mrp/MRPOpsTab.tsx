import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Progress } from '@/ui/base/progress';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/formatters';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { NetMrpBomLine, OrderMaterialCoverage } from '@/lib/pcp/netMrp';

interface Props {
  activeOPs: ProductionOrderRow[];
  bomLines: NetMrpBomLine[];
  coverageByOrder: Map<string, OrderMaterialCoverage>;
}

export function MRPOpsTab({ activeOPs, bomLines, coverageByOrder }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle>OPs ativas × cobertura líquida</CardTitle></CardHeader>
      <CardContent>
        {activeOPs.length === 0 ? (
          <EmptyState compact title="Nenhuma OP ativa" description="Libere ordens de produção para calcular necessidades." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OP</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd. pendente</TableHead>
                <TableHead>Materiais da BOM</TableHead>
                <TableHead>Prontidão líquida</TableHead>
                <TableHead>Faltas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeOPs.map((order) => {
                const materialCount = order.product_id ? bomLines.filter((line) => line.productId === order.product_id).length : 0;
                const coverage = coverageByOrder.get(order.id);
                const remaining = Math.max(0, order.quantity - order.produced_quantity);
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                    <TableCell className="font-medium">{order.product_name}</TableCell>
                    <TableCell className="text-right">{formatNumber(remaining)} {order.unit}</TableCell>
                    <TableCell>{materialCount > 0 ? `${materialCount} itens` : <Badge variant="destructive">BOM ausente</Badge>}</TableCell>
                    <TableCell>
                      {coverage?.coveragePct !== null && coverage ? (
                        <div className="flex items-center gap-2">
                          <Progress value={coverage.coveragePct} className="h-2 w-16" />
                          <span className={cn('text-xs font-bold', coverage.ready ? 'text-green-600' : 'text-destructive')}>{Math.round(coverage.coveragePct)}%</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">Não calculável sem BOM</span>}
                    </TableCell>
                    <TableCell>{coverage ? coverage.missingComponents : '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
