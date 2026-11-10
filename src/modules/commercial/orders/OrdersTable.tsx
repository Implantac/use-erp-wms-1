import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowRight, Eye, FileText, Loader2, MoreHorizontal, TruckIcon, Trash2, XCircle,
} from 'lucide-react';
import { formatBRL } from '@/lib/formatters';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/ui/base/dropdown-menu';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { getOrderStatusLabel, getPaymentMethodLabel } from '@/config/commercial';
import type { OrderStatus, PaymentMethod } from '@/types/commercial';
import type { DbOrder } from '@/hooks/commercial/useOrders';
import { statusFlow } from './constants';
import { MarginBadge } from './MarginBadge';

interface OrdersTableProps {
  orders: DbOrder[];
  selectedOrder: DbOrder | null;
  isDeletePending: boolean;
  isAdvancePending: boolean;
  onView: (order: DbOrder) => void;
  onAdvance: (order: DbOrder) => void;
  onAskDelete: (order: DbOrder) => void;
  onAskCancel: (order: DbOrder) => void;
}

export function OrdersTable({
  orders, selectedOrder, isDeletePending, isAdvancePending,
  onView, onAdvance, onAskDelete, onAskCancel,
}: OrdersTableProps) {
  const columns: Column<DbOrder>[] = [
    {
      key: 'number', label: 'Pedido', sortable: true,
      render: (v) => <span className="font-mono font-semibold text-primary">{v as string}</span>,
    },
    {
      key: 'client_name', label: 'Cliente', sortable: true,
      render: (v, row) => (
        <div>
          <p className="font-medium">{v as string}</p>
          <p className="text-xs text-muted-foreground">{getPaymentMethodLabel(row.payment_method as PaymentMethod)}</p>
        </div>
      ),
    },
    { key: 'date', label: 'Data', sortable: true, render: (v) => v ? format(new Date(v as string), 'dd/MM/yyyy', { locale: ptBR }) : '—' },
    {
      key: 'delivery_date', label: 'Entrega',
      render: (v) => v ? (
        <div className="flex items-center gap-1.5 text-sm">
          <TruckIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {format(new Date(v as string), 'dd/MM/yyyy', { locale: ptBR })}
        </div>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'items', label: 'Itens',
      render: (_, row) => (
        <Badge variant="secondary" className="font-mono">
          {row.items?.length || 0} {(row.items?.length || 0) === 1 ? 'item' : 'itens'}
        </Badge>
      ),
    },
    {
      key: 'total', label: 'Total', sortable: true,
      render: (v) => <span className="font-semibold">{formatBRL(v as number)}</span>,
    },
    {
      key: 'estimated_margin_pct', label: 'Margem', sortable: true,
      render: (v) => <MarginBadge value={v as number | null | undefined} />,
    },
    { key: 'priority', label: 'Prioridade', render: (v) => <StatusBadge type="priority" status={v as string} /> },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge type="order" status={v as string} /> },
  ];

  const renderActions = (order: DbOrder) => {
    const nextStatus = statusFlow[order.status];
    const canAdvance = nextStatus !== null && order.status !== 'cancelled';
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Ações do pedido ${order.number ?? order.id}`}
            className={`h-8 w-8 ${isDeletePending && selectedOrder?.id === order.id ? 'opacity-50' : ''}`}
            disabled={isDeletePending}
          >
            {isDeletePending && selectedOrder?.id === order.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onView(order)} disabled={isDeletePending}>
            <Eye className="mr-2 h-4 w-4" />Visualizar
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isDeletePending}>
            <FileText className="mr-2 h-4 w-4" />Imprimir
          </DropdownMenuItem>
          {canAdvance && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAdvance(order)} disabled={isDeletePending || isAdvancePending}>
                <ArrowRight className="mr-2 h-4 w-4 text-primary" />
                Avançar para {getOrderStatusLabel(nextStatus as OrderStatus)}
              </DropdownMenuItem>
            </>
          )}
          {order.status !== 'cancelled' && order.status !== 'delivered' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => onAskDelete(order)} disabled={isDeletePending}>
                <Trash2 className="mr-2 h-4 w-4" />Excluir Pedido
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onAskCancel(order)} disabled={isDeletePending}>
                <XCircle className="mr-2 h-4 w-4" />Cancelar Pedido
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <DataTable
      columns={columns}
      data={orders}
      searchPlaceholder="Buscar por número, cliente..."
      pageSize={10}
      actions={renderActions}
    />
  );
}
