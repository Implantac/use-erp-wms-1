import { Activity as ActivityIcon, AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { ScrollArea } from '@/ui/base/scroll-area';
import { useNotifications } from '@/hooks/system/useNotifications';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
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

export function RecentActivities() {
  const { notifications, isLoading } = useNotifications();
  const recent = notifications.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ActivityIcon className="h-5 w-5" />
          Atividades Recentes
        </CardTitle>
        <CardDescription>Últimas ações no sistema</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center">Carregando...</p>
          ) : recent.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">Nenhuma atividade registrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recent.map((n) => {
                const Icon = iconMap[n.type] || Info;
                return (
                  <div key={n.id} className="flex items-start gap-3">
                    <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', colorMap[n.type])} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm font-medium text-foreground truncate', !n.read && 'font-semibold')}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {n.module} • {format(new Date(n.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
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
