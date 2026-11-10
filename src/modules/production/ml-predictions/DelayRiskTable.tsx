import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Progress } from '@/ui/base/progress';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DelayRisk } from './useMLPredictions';

export function DelayRiskTable({ rows }: { rows: DelayRisk }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Análise de Risco Multi-Fator (Tempo × Progresso × Complexidade × Qualidade)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-16">Score</TableHead>
              <TableHead>OP</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead className="text-right">Prazo</TableHead>
              <TableHead className="text-right">Progresso</TableHead>
              <TableHead>Fatores de Risco</TableHead>
              <TableHead>Risco</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.slice(0, 15).map((r, i) => (
                <TableRow key={i} className={cn(r.riskScore >= 70 && 'bg-destructive/5')}>
                  <TableCell>
                    <div className={cn('text-xl font-bold text-center', r.riskScore >= 70 ? 'text-destructive' : r.riskScore >= 40 ? 'text-warning-text' : 'text-success')}>
                      {r.riskScore}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{r.orderNumber}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{r.product}</TableCell>
                  <TableCell><Badge variant={r.priority === 'urgent' ? 'destructive' : 'outline'} className="text-xs">{r.priority}</Badge></TableCell>
                  <TableCell className="text-right">{r.daysRemaining <= 0 ? <span className="text-destructive font-bold">Atrasada</span> : `${r.daysRemaining}d`}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Progress value={r.progress} className="w-16 h-2" />
                      <span className="text-xs">{r.progress.toFixed(0)}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.riskFactors.map((f, j) => <Badge key={j} variant="outline" className="text-xs">{f}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.riskScore >= 70 ? 'destructive' : r.riskScore >= 40 ? 'secondary' : 'outline'}>
                      {r.riskLabel}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center text-muted-foreground py-8">Nenhuma OP ativa com data de entrega.</p>
        )}
      </CardContent>
    </Card>
  );
}
