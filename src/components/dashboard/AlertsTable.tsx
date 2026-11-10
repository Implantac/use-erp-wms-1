import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { ScrollArea } from '@/ui/base/scroll-area';
import type { Alert } from '@/types';
const mockAlerts: Alert[] = [];
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const iconMap = {
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
  success: CheckCircle,
};

const colorMap = {
  warning: 'text-warning-text',
  error: 'text-destructive',
  info: 'text-info',
  success: 'text-success',
};

export function AlertsTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Alertas do Sistema
        </CardTitle>
        <CardDescription>
          {mockAlerts.filter((a) => !a.read).length} alertas não lidos
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-3">
            {mockAlerts.map((alert) => {
              const Icon = iconMap[alert.type];
              return (
                <div
                  key={alert.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                    !alert.read && 'bg-accent/50'
                  )}
                >
                  <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', colorMap[alert.type])} />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-foreground">{alert.title}</p>
                      <Badge variant="outline" className="text-xs">
                        {alert.module}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{alert.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(alert.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
