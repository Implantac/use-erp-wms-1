import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Progress } from '@/ui/base/progress';
import { cn } from '@/lib/utils';
import type { MaterialNeed } from './types';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { TechnicalSheetRow } from '@/hooks/production/useTechnicalSheets';
import { getOrderGrossCoverage } from './grossCoverage';
import { getUniqueSheet } from './grossNeeds';

interface Props {
  activeOPs: ProductionOrderRow[];
  sheets: TechnicalSheetRow[];
  materialNeeds: MaterialNeed[];
}

export function MRPOpsTab({ activeOPs, sheets, materialNeeds }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle>OPs Ativas × Materiais</CardTitle></CardHeader>
      <CardContent>
        {activeOPs.length === 0 ? (
          <EmptyState compact title="Nenhuma OP ativa" description="Libere ordens de produção para calcular necessidades." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OP</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd. Pendente</TableHead>
                <TableHead>Ficha Técnica</TableHead>
                <TableHead>Materiais</TableHead>
                <TableHead>Cobertura bruta estimada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeOPs.map(op => {
                const sheet = getUniqueSheet(op, sheets);
                const matCount = sheet ? (sheet.materials?.length || 0) : 0;
                const remaining = Math.max(0, op.quantity - op.produced_quantity);

                const opCoverage = getOrderGrossCoverage(sheet?.materials, materialNeeds);

                return (
                  <TableRow key={op.id}>
                    <TableCell className="font-mono text-sm">{op.order_number}</TableCell>
                    <TableCell className="font-medium">{op.product_name}</TableCell>
                    <TableCell className="text-right">{remaining}</TableCell>
                    <TableCell>
                      {sheet ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">v{sheet.version}</Badge>
                      ) : (
                        <Badge variant="destructive">Ficha ausente ou ambígua</Badge>
                      )}
                    </TableCell>
                    <TableCell>{matCount} itens</TableCell>
                    <TableCell>
                      {opCoverage !== null ? (
                        <div className="flex items-center gap-2">
                          <Progress value={opCoverage} className="w-16 h-2" />
                          <span className={cn('text-xs font-bold', opCoverage < 100 ? 'text-destructive' : 'text-green-600')}>{opCoverage}%</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">Não calculável: verifique ficha, código e unidade</span>}
                    </TableCell>
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
