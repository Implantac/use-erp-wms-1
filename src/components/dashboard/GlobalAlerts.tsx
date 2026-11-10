import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { ScrollArea } from '@/ui/base/scroll-area';
import { AlertTriangle, AlertCircle, Info, CheckCircle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GlobalAlert {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  module: string;
  message: string;
  timestamp: string;
}

interface GlobalAlertsProps {
  alerts: GlobalAlert[];
}

const alertIcons = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
};

const alertColors = {
  error: 'bg-destructive/8 text-destructive border-destructive/15',
  warning: 'bg-warning/8 text-warning-text border-warning/15',
  info: 'bg-info/8 text-info border-info/15',
  success: 'bg-success/8 text-success border-success/15',
};

export function GlobalAlerts({ alerts }: GlobalAlertsProps) {
  const criticalCount = alerts.filter(a => a.type === 'error' || a.type === 'warning').length;
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          Alertas do Sistema
          {criticalCount > 0 && (
            <Badge variant="destructive" className="ml-auto text-[10px] h-5 px-1.5">
              {criticalCount}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[280px] pr-3">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <CheckCircle className="h-8 w-8 text-success/40" />
              <p className="text-sm">Nenhum alerta no momento</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => {
                const Icon = alertIcons[alert.type];
                return (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors hover:opacity-90",
                      alertColors[alert.type]
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-current/20">
                          {alert.module}
                        </Badge>
                      </div>
                      <p className="text-xs leading-relaxed">{alert.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
