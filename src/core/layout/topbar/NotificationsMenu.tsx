import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/hooks/system/useNotifications';
import { Button } from '@/ui/base/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/ui/base/dropdown-menu';
import { Badge } from '@/ui/base/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const typeColors = {
  error: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/10 text-warning-text',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
};

export function NotificationsMenu() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : 'Notificações'}
          className="relative h-9 w-9 rounded-lg text-sidebar-foreground/60 hover:text-primary hover:bg-sidebar-accent/50 transition-all"
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
          {unreadCount > 0 && (
            <span aria-hidden="true" className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1 ring-2 ring-sidebar animate-fade-in">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-sidebar border-sidebar-border">
        <DropdownMenuLabel className="flex items-center justify-between text-sidebar-foreground">
          Notificações
          {unreadCount > 0 && (
             <Button variant="ghost" size="xs"
              onClick={(e) => { e.stopPropagation(); markAllAsRead(undefined); }}
               className="text-xs text-primary hover:text-primary hover:bg-sidebar-accent"
            >
              Marcar todas como lidas
             </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-sidebar-border" />
        {notifications.length === 0 ? (
           <div className="py-6 text-center text-sm text-sidebar-foreground/70">Nenhuma notificação</div>
        ) : (
          notifications.slice(0, 5).map((n) => (
            <DropdownMenuItem
              key={n.id}
              onClick={() => { if (!n.read) markAsRead(n.id); }}
              className={cn('flex flex-col items-start gap-1 p-3 text-sidebar-foreground/80 cursor-pointer',
                !n.read && 'bg-sidebar-accent/50')}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  {!n.read && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                  <span className={cn('text-sm', !n.read ? 'font-semibold' : 'font-medium')}>{n.title}</span>
                </div>
                <Badge variant="outline" className={cn('text-[10px] h-4 px-1.5', typeColors[n.type])}>
                  {n.module}
                </Badge>
              </div>
              <span className="text-xs text-sidebar-foreground/50 line-clamp-2">{n.description}</span>
              <span className="text-[10px] text-sidebar-foreground/30">
                {format(new Date(n.created_at), 'dd/MM HH:mm', { locale: ptBR })}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator className="bg-sidebar-border" />
        <DropdownMenuItem className="justify-center text-primary font-medium" onClick={() => navigate('/notificacoes')}>
          Ver todas as notificações
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
