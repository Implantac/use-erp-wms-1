import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Progress } from '@/ui/base/progress';
import { Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/formatters';
import { MRPStatusBadge } from './MRPStatusBadge';
import type { MaterialNeed } from './types';

export function MRPNeedsTab({ materialNeeds }: { materialNeeds: MaterialNeed[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" /> Simulação de Necessidades (Saldo Bruto)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {materialNeeds.length === 0 ? (
          <EmptyState
            icon={Calculator}
            title="Nenhuma necessidade calculada"
            description="Verifique se as OPs ativas possuem fichas técnicas (BOM) com materiais cadastrados."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Necessário</TableHead>
                <TableHead className="text-right">Saldo bruto</TableHead>
                <TableHead className="text-right">Déficit bruto</TableHead>
                <TableHead>Cobertura bruta</TableHead>
                <TableHead>OPs</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materialNeeds.map(m => (
                <TableRow key={m.materialCode} className={cn(m.status === 'critical' && 'bg-destructive/5')}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{m.materialName}</span>
                      <span className="text-xs text-muted-foreground ml-2">{m.materialCode}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatNumber(m.totalRequired)} {m.unit}</TableCell>
                  <TableCell className="text-right font-mono">{formatNumber(m.inStock)} {m.unit}</TableCell>
                  <TableCell className={cn('text-right font-mono font-bold', m.deficit > 0 ? 'text-destructive' : 'text-green-600')}>
                    {m.deficit > 0 ? `-${formatNumber(m.deficit)}` : '0'} {m.unit}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={m.coveragePct} className="w-16 h-2" />
                      <span className="text-xs">{m.coveragePct}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {m.relatedOPs.slice(0, 3).map(op => (
                        <Badge key={op} variant="outline" className="text-xs">{op}</Badge>
                      ))}
                      {m.relatedOPs.length > 3 && <span className="text-xs text-muted-foreground">+{m.relatedOPs.length - 3}</span>}
                    </div>
                  </TableCell>
                  <TableCell><MRPStatusBadge status={m.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
