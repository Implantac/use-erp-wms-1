import { differenceInDays, format, parseISO } from 'date-fns';
import { Activity, AlertTriangle, DollarSign, Target } from 'lucide-react';
import { Badge } from '@/ui/base/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import type { BIMetrics } from './useBIMetrics';

export function StrategicTab({ metrics }: { metrics: BIMetrics }) {
  const { onTimePct, onTime, completedOPs, lateOPs } = metrics;
  const items = [
    { label: 'MTTR (Tempo Reparo)', value: '—', desc: 'Requer dados de manutenção', icon: <Activity className="h-6 w-6 text-primary" /> },
    { label: 'Custo de Não-Qualidade', value: '—', desc: 'Requer custo real de perda por lote', icon: <AlertTriangle className="h-6 w-6 text-destructive" /> },
    { label: 'Valor Agregado/Hora', value: '—', desc: 'Requer receita realizada e horas compatíveis', icon: <DollarSign className="h-6 w-6 text-success" /> },
    { label: 'On-Time Delivery', value: completedOPs.length ? `${onTimePct.toFixed(0)}%` : '—', desc: `${onTime} de ${completedOPs.length} OPs no prazo`, icon: <Target className="h-6 w-6 text-primary" /> },
  ];
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((item, i) => (
          <Card key={i}>
            <CardContent className="pt-6 text-center space-y-2">
              <div className="mx-auto w-fit">{item.icon}</div>
              <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {lateOPs.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> OPs Atrasadas ({lateOPs.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>OP</TableHead><TableHead>Produto</TableHead><TableHead>Prazo</TableHead><TableHead className="text-right">Atraso</TableHead><TableHead>Prioridade</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lateOPs.slice(0, 10).map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.order_number}</TableCell>
                    <TableCell>{o.product_name}</TableCell>
                    <TableCell>{format(new Date(o.due_date!), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="text-right text-destructive font-bold">{differenceInDays(new Date(), parseISO(o.due_date!))}d</TableCell>
                    <TableCell><Badge variant={o.priority === 'urgent' ? 'destructive' : 'outline'}>{o.priority}</Badge></TableCell>
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
