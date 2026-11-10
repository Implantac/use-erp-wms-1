import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Progress } from '@/ui/base/progress';
import { Wifi, WifiOff, Thermometer, Activity, Zap, Gauge, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MachTelemetry, getHealthColor } from './telemetry';

interface Machine { id: string; name: string; code: string; status: string; sector?: string | null; telemetry?: MachTelemetry }

export function MachinesTab({ machinesList }: { machinesList: Machine[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {machinesList.map(machine => {
        const t = machine.telemetry;
        return (
          <Card key={machine.id} className="relative overflow-hidden">
            <div className={cn('absolute top-0 left-0 right-0 h-1', machine.status === 'running' ? 'bg-success' : machine.status === 'maintenance' ? 'bg-destructive' : machine.status === 'stopped' ? 'bg-warning' : 'bg-muted-foreground')} />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{machine.name}</CardTitle>
                <div className="flex items-center gap-2">
                  {t?.connected ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3 text-destructive" />}
                  <Badge variant="outline" className="text-xs">
                    {machine.status === 'running' ? '▶ Operando' : machine.status === 'maintenance' ? '🔧 Manutenção' : machine.status === 'stopped' ? '⏸ Parada' : '● Disponível'}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{machine.code} • {machine.sector || 'Sem setor'}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {t ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Saúde</span>
                    <span className={cn('text-sm font-bold', getHealthColor(t.healthScore))}>{t.healthScore}%</span>
                  </div>
                  <Progress value={t.healthScore} className="h-2" />
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1"><Thermometer className={cn('h-3 w-3', t.temperature > 65 ? 'text-destructive' : 'text-success')} /><span>{t.temperature}°C</span></div>
                    <div className="flex items-center gap-1"><Activity className="h-3 w-3 text-primary" /><span>{t.vibration} mm/s</span></div>
                    <div className="flex items-center gap-1"><Zap className="h-3 w-3 text-chart-3" /><span>{t.power} kW</span></div>
                    <div className="flex items-center gap-1"><Gauge className="h-3 w-3 text-chart-4" /><span>{t.rpm} RPM</span></div>
                  </div>
                  {t.predictiveAlert && (
                    <div className="p-2 rounded bg-warning/10 text-xs flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-warning-text" /><span>{t.predictiveAlert}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>MTBF: {t.mtbf}h</span><span>Próx. Manut: {t.hoursToMaintenance}h</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Aguardando dados...</p>
              )}
            </CardContent>
          </Card>
        );
      })}
      {machinesList.length === 0 && (
        <div className="col-span-full text-center py-12 text-muted-foreground">
          Nenhuma máquina cadastrada. Cadastre máquinas no módulo de Capacidade.
        </div>
      )}
    </div>
  );
}
