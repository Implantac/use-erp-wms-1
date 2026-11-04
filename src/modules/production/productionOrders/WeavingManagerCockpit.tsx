import { useMemo } from 'react';
import { AlertTriangle, CalendarClock, CalendarPlus, CheckCircle2, Play, Plus } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { ProductionScheduleRow } from '@/hooks/production/useProductionSchedule';
import { buildWeavingManagerActions, type WeavingManagerAction } from '@/lib/pcp/weavingManagerGuide';
import { cn } from '@/lib/utils';

interface Props {
  orders: ProductionOrderRow[];
  schedules: ProductionScheduleRow[];
  onOpenOrder: (orderId: string, targetId: string) => void;
  onCreateOrder: () => void;
}

const ACTION_ICON: Record<WeavingManagerAction['key'], typeof AlertTriangle> = {
  entrega: AlertTriangle,
  conflito: AlertTriangle,
  atraso: CalendarClock,
  programar: CalendarPlus,
  producao: Play,
  proxima: CalendarClock,
};

const TONE_CLASS: Record<WeavingManagerAction['tone'], string> = {
  danger: 'border-red-300 bg-red-50 text-red-950 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/20 dark:text-red-100',
  warning: 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100',
  info: 'border-blue-300 bg-blue-50 text-blue-950 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-100',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100',
};

/**
 * Primeira leitura do gerente de tecelagem: não é um painel de indicadores,
 * é a fila de decisões. Cada cartão nasce de prazo/fila/conflito real e abre
 * a OP no ponto certo da central.
 */
export function WeavingManagerCockpit({ orders, schedules, onOpenOrder, onCreateOrder }: Props) {
  const actions = useMemo(
    () => buildWeavingManagerActions({ orders, schedules }),
    [orders, schedules],
  );
  const openOrders = orders.filter((order) => !['completed', 'cancelled', 'canceled'].includes(order.status));

  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><CalendarPlus className="h-5 w-5" /> Comece criando a primeira OP</CardTitle>
          <CardDescription>Escolha um pedido confirmado ou crie uma OP avulsa. Depois ela entra aqui para ser programada no tear.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onCreateOrder}><Plus className="mr-2 h-4 w-4" /> Nova OP de tecelagem</Button>
        </CardContent>
      </Card>
    );
  }

  if (actions.length === 0) {
    return (
      <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-emerald-900 dark:text-emerald-100"><CheckCircle2 className="h-5 w-5" /> Nenhuma OP aberta agora</CardTitle>
          <CardDescription className="text-emerald-800 dark:text-emerald-300">As OPs desta empresa estão concluídas ou canceladas. Crie a próxima quando entrar demanda.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Comece por aqui — decisões da tecelagem</CardTitle>
        <CardDescription>
          {openOrders.length} OP(s) aberta(s). Os cartões abaixo usam prazo, fila e estado reais; clique para abrir a OP no ponto certo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {actions.map((action) => {
            const Icon = ACTION_ICON[action.key];
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => onOpenOrder(action.orderId, action.targetId)}
                className={cn('min-h-28 rounded-lg border p-3 text-left transition-colors', TONE_CLASS[action.tone])}
              >
                <span className="flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4 shrink-0" /> {action.title}</span>
                <span className="mt-2 block text-xs leading-relaxed opacity-80">{action.detail}</span>
                <span className="mt-3 block text-xs font-bold underline underline-offset-2">Abrir e resolver</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
