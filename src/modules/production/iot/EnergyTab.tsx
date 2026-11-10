import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Zap, Battery, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MachTelemetry } from './telemetry';

interface Machine { id: string; name: string; status: string; telemetry?: MachTelemetry }

export function EnergyTab({ machinesList, totalEnergy, runningCount, avgEfficiency }: { machinesList: Machine[]; totalEnergy: number; runningCount: number; avgEfficiency: number }) {
  return (
    <>
      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardContent className="pt-6 text-center space-y-2">
            <Zap className="h-8 w-8 mx-auto text-chart-3" />
            <p className="text-sm text-muted-foreground">Consumo Total Atual</p>
            <p className="text-4xl font-black">{totalEnergy.toFixed(1)} kW</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center space-y-2">
            <Battery className="h-8 w-8 mx-auto text-success" />
            <p className="text-sm text-muted-foreground">Eficiência Energética Média</p>
            <p className="text-4xl font-black text-success">{avgEfficiency.toFixed(0)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center space-y-2">
            <TrendingUp className="h-8 w-8 mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">kW por Máquina Ativa</p>
            <p className="text-4xl font-black">{runningCount > 0 ? (totalEnergy / runningCount).toFixed(1) : '0'}</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Consumo por Máquina</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Máquina</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Consumo (kW)</TableHead>
              <TableHead className="text-right">Eficiência</TableHead>
              <TableHead className="text-right">RPM</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {machinesList.filter(m => m.telemetry).sort((a, b) => (b.telemetry?.power || 0) - (a.telemetry?.power || 0)).map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{m.status}</Badge></TableCell>
                  <TableCell className="text-right font-mono">{m.telemetry!.power} kW</TableCell>
                  <TableCell className="text-right"><span className={cn(m.telemetry!.energyEfficiency >= 80 ? 'text-success' : 'text-warning-text')}>{m.telemetry!.energyEfficiency}%</span></TableCell>
                  <TableCell className="text-right font-mono">{m.telemetry!.rpm}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
