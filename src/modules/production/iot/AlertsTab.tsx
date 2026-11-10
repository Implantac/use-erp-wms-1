import { Card, CardContent } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { MachTelemetry } from './telemetry';

interface Machine { id: string; name: string; code: string; telemetry?: MachTelemetry }

export function AlertsTab({ machinesList }: { machinesList: Machine[] }) {
  const alerts = machinesList.filter(m => m.telemetry?.predictiveAlert);
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-3">
          {alerts.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-4 rounded-lg border border-warning/50 bg-warning/5">
              <AlertTriangle className="h-6 w-6 text-warning-text" />
              <div className="flex-1">
                <p className="font-medium">{m.name} ({m.code})</p>
                <p className="text-sm text-muted-foreground">{m.telemetry!.predictiveAlert}</p>
                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                  <span>Saúde: {m.telemetry!.healthScore}%</span>
                  <span>Temp: {m.telemetry!.temperature}°C</span>
                  <span>Vibr: {m.telemetry!.vibration} mm/s</span>
                </div>
              </div>
              <Badge variant="secondary">Preditivo</Badge>
            </div>
          ))}
          {alerts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-success" />
              <p>Nenhum alerta preditivo. Todas as máquinas operam normalmente.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
