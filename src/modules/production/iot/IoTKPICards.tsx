import { Card, CardContent } from '@/ui/base/card';
import { Wifi, Activity, ShieldAlert, Gauge, Zap, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHealthColor } from './telemetry';

interface Props {
  connectedCount: number;
  totalMachines: number;
  runningCount: number;
  alertCount: number;
  avgHealth: number;
  totalEnergy: number;
  avgMTBF: number;
}

export function IoTKPICards({ connectedCount, totalMachines, runningCount, alertCount, avgHealth, totalEnergy, avgMTBF }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card className="border-l-4 border-l-success">
        <CardContent className="p-3 flex items-center gap-2">
          <Wifi className="h-5 w-5 text-success" />
          <div><p className="text-xs text-muted-foreground">Conectadas</p><p className="text-lg font-bold">{connectedCount}/{totalMachines}</p></div>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-3 flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <div><p className="text-xs text-muted-foreground">Operando</p><p className="text-lg font-bold">{runningCount}</p></div>
        </CardContent>
      </Card>
      <Card className={cn('border-l-4', alertCount > 0 ? 'border-l-warning' : 'border-l-success')}>
        <CardContent className="p-3 flex items-center gap-2">
          <ShieldAlert className={cn('h-5 w-5', alertCount > 0 ? 'text-warning-text' : 'text-success')} />
          <div><p className="text-xs text-muted-foreground">Alertas Preditivos</p><p className="text-lg font-bold">{alertCount}</p></div>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-chart-2">
        <CardContent className="p-3 flex items-center gap-2">
          <Gauge className={cn('h-5 w-5', getHealthColor(avgHealth))} />
          <div><p className="text-xs text-muted-foreground">Saúde Média</p><p className={cn('text-lg font-bold', getHealthColor(avgHealth))}>{avgHealth.toFixed(0)}%</p></div>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-chart-3">
        <CardContent className="p-3 flex items-center gap-2">
          <Zap className="h-5 w-5 text-chart-3" />
          <div><p className="text-xs text-muted-foreground">Energia Total</p><p className="text-lg font-bold">{totalEnergy.toFixed(1)} kW</p></div>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-chart-4">
        <CardContent className="p-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-chart-4" />
          <div><p className="text-xs text-muted-foreground">MTBF Médio</p><p className="text-lg font-bold">{avgMTBF.toFixed(0)}h</p></div>
        </CardContent>
      </Card>
    </div>
  );
}
