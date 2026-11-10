import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Wrench, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MachTelemetry, getHealthColor } from './telemetry';

interface Machine { id: string; name: string; status: string; telemetry?: MachTelemetry }

export function PredictiveTab({ machinesList }: { machinesList: Machine[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Manutenção Preditiva — MTBF / MTTR</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Máquina</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Saúde</TableHead>
            <TableHead className="text-right">MTBF (h)</TableHead>
            <TableHead className="text-right">MTTR (h)</TableHead>
            <TableHead className="text-right">Disponibilidade</TableHead>
            <TableHead className="text-right">Próx. Manutenção</TableHead>
            <TableHead>Alerta</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {machinesList.filter(m => m.telemetry).map(m => {
              const t = m.telemetry!;
              const availability = t.mtbf / (t.mtbf + t.mttr) * 100;
              return (
                <TableRow key={m.id} className={cn(t.predictiveAlert && 'bg-warning/5')}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{m.status}</Badge></TableCell>
                  <TableCell className="text-center"><span className={cn('font-bold', getHealthColor(t.healthScore))}>{t.healthScore}%</span></TableCell>
                  <TableCell className="text-right font-mono">{t.mtbf}</TableCell>
                  <TableCell className="text-right font-mono">{t.mttr}</TableCell>
                  <TableCell className="text-right"><span className={cn('font-bold', availability >= 95 ? 'text-success' : availability >= 85 ? 'text-warning-text' : 'text-destructive')}>{availability.toFixed(1)}%</span></TableCell>
                  <TableCell className="text-right">{t.hoursToMaintenance < 100 ? <span className="text-warning-text font-bold">{t.hoursToMaintenance}h</span> : `${t.hoursToMaintenance}h`}</TableCell>
                  <TableCell>{t.predictiveAlert ? <Badge variant="secondary" className="text-xs">{t.predictiveAlert}</Badge> : <CheckCircle className="h-4 w-4 text-success" />}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
