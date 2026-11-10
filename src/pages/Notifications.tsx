import { useState } from 'react';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Input } from '@/ui/base/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/ui/base/select';
import { useNotifications } from '@/hooks/system/useNotifications';
import {
  BellOff, Check, CheckCheck, Search, Trash2,
  AlertTriangle, AlertCircle, Info, CheckCircle, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/ui/base/skeleton';
import { toastSuccess } from '@/lib/toastHelpers';
import { EmptyState } from '@/shared/components/EmptyState';

const typeConfig = {
  warning: { icon: AlertTriangle, color: 'text-warning-text', bg: 'bg-warning/10', badge: 'bg-warning/20 text-warning-text' },
  error: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', badge: 'bg-destructive/20 text-destructive' },
  info: { icon: Info, color: 'text-info', bg: 'bg-info/10', badge: 'bg-info/20 text-info' },
  success: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', badge: 'bg-success/20 text-success' },
};

export default function NotificationsPage() {
  const { notifications, isLoading, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll } = useNotifications();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterModule, setFilterModule] = useState<string>('all');

  const modules = [...new Set(notifications.map(n => n.module))];

  const filtered = notifications.filter(n => {
    const matchSearch = n.title.toLowerCase().includes(search.toLowerCase()) || n.description.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || n.type === filterType;
    const matchModule = filterModule === 'all' || n.module === filterModule;
    return matchSearch && matchType && matchModule;
  });

  const handleMarkAllRead = () => {
    markAllAsRead(undefined);
    toastSuccess('Notificações', 'Todas marcadas como lidas.');
  };

  const handleClearAll = () => {
    clearAll(undefined);
    toastSuccess('Limpo', 'Todas as notificações foram removidas.');
  };

  const handleDelete = (id: string) => {
    deleteNotification(id);
    toastSuccess('Removida', 'Notificação removida.');
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Carregando notificações...</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <main className="space-y-6 animate-fade-in max-w-4xl" aria-labelledby="notif-title">
      <div className="flex items-center justify-between">
        <div>
          <h1 id="notif-title" className="text-3xl font-bold text-foreground">Notificações</h1>
          <p className="text-muted-foreground" aria-live="polite">
            {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Tudo em dia'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={unreadCount === 0} className="gap-2" aria-label="Marcar todas as notificações como lidas">
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            Marcar todas como lidas
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearAll} disabled={notifications.length === 0} className="gap-2 text-destructive hover:text-destructive" aria-label="Limpar todas as notificações">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Limpar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3" role="search">
        <div className="relative flex-1 min-w-[200px]">
          <label htmlFor="notif-search" className="sr-only">Buscar notificações</label>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="notif-search" placeholder="Buscar notificações..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[150px]" aria-label="Filtrar por tipo">
            <Filter className="h-4 w-4 mr-2" aria-hidden="true" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="error">Erros</SelectItem>
            <SelectItem value="warning">Avisos</SelectItem>
            <SelectItem value="info">Informações</SelectItem>
            <SelectItem value="success">Sucesso</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-[150px]" aria-label="Filtrar por módulo">
            <SelectValue placeholder="Módulo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {modules.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <ul className="space-y-2 list-none p-0" aria-label="Lista de notificações" aria-live="polite">
        {filtered.length === 0 ? (
          <li>
            <EmptyState
              icon={BellOff}
              title="Nenhuma notificação"
              description="Você está em dia com tudo!"
            />
          </li>
        ) : (
          filtered.map((n) => {
            const config = typeConfig[n.type];
            const Icon = config.icon;
            return (
              <li key={n.id}>
                <Card
                  className={cn(
                    'transition-all duration-200 hover:shadow-md cursor-pointer',
                    !n.read && 'border-l-4 border-l-primary bg-accent/30'
                  )}
                  onClick={() => !n.read && markAsRead(n.id)}
                  role="article"
                  aria-label={`${n.title}${!n.read ? ' (não lida)' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={cn('p-2 rounded-full shrink-0', config.bg)} aria-hidden="true">
                        <Icon className={cn('h-4 w-4', config.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={cn('font-medium text-foreground text-base', !n.read && 'font-semibold')}>
                            {n.title}
                          </h3>
                          <Badge variant="outline" className="text-xs shrink-0">{n.module}</Badge>
                          {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-hidden="true" />}
                        </div>
                        <p className="text-sm text-muted-foreground">{n.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <time dateTime={n.created_at}>
                            {format(new Date(n.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                          </time>
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {!n.read && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }} aria-label={`Marcar "${n.title}" como lida`}>
                            <Check className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }} aria-label={`Remover "${n.title}"`}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })
        )}
      </ul>
    </main>
  );
}

