import { Badge } from '@/ui/base/badge';
import { cn } from '@/lib/utils';
import type { OrderStatus, SaleStatus, QuotationStatus } from '@/types/commercial';
import type { PaymentStatus } from '@/types/financial';

type StatusVariant = 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'secondary';

interface StatusConfig {
  label: string;
  variant: StatusVariant;
}

const orderStatusConfig: Record<string, StatusConfig> = {
  quote: { label: 'Orçamento', variant: 'secondary' },
  pending: { label: 'Pendente', variant: 'warning' },
  awaiting_commercial_approval: { label: 'Aguard. Aprov. Comercial', variant: 'warning' },
  awaiting_financial_approval: { label: 'Aguard. Aprov. Financeira', variant: 'warning' },
  blocked: { label: 'Bloqueado', variant: 'destructive' },
  confirmed: { label: 'Liberado', variant: 'info' },
  awaiting_separation: { label: 'Aguard. Separação', variant: 'secondary' },
  in_separation: { label: 'Em Separação', variant: 'info' },
  awaiting_production: { label: 'Aguard. Produção', variant: 'warning' },
  in_production: { label: 'Em Produção', variant: 'info' },
  partial_production: { label: 'Produção Parcial', variant: 'warning' },
  awaiting_conference: { label: 'Aguard. Conferência', variant: 'secondary' },
  conferenced: { label: 'Conferido', variant: 'success' },
  awaiting_billing: { label: 'Aguard. Faturamento', variant: 'secondary' },
  processing: { label: 'Processando', variant: 'info' },
  separated: { label: 'Separado', variant: 'secondary' },
  invoiced: { label: 'Faturado', variant: 'default' },
  shipped: { label: 'Expedido', variant: 'info' },
  delivered: { label: 'Entregue', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
};

const saleStatusConfig: Record<SaleStatus, StatusConfig> = {
  completed: { label: 'Concluída', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
  refunded: { label: 'Devolvida', variant: 'warning' },
  pending: { label: 'Pendente', variant: 'warning' },
};

const quotationStatusConfig: Record<QuotationStatus, StatusConfig> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  sent: { label: 'Enviado', variant: 'info' },
  approved: { label: 'Aprovado', variant: 'success' },
  rejected: { label: 'Rejeitado', variant: 'destructive' },
  expired: { label: 'Expirado', variant: 'warning' },
  converted: { label: 'Convertido', variant: 'default' },
};

const clientStatusConfig: Record<string, StatusConfig> = {
  active: { label: 'Ativo', variant: 'success' },
  inactive: { label: 'Inativo', variant: 'secondary' },
  blocked: { label: 'Bloqueado', variant: 'destructive' },
};

const priorityConfig: Record<string, StatusConfig> = {
  low: { label: 'Baixa', variant: 'secondary' },
  medium: { label: 'Média', variant: 'default' },
  high: { label: 'Alta', variant: 'warning' },
  urgent: { label: 'Urgente', variant: 'destructive' },
};

const paymentStatusConfig: Record<PaymentStatus, StatusConfig> = {
  paid: { label: 'Pago', variant: 'success' },
  pending: { label: 'Pendente', variant: 'warning' },
  partial: { label: 'Parcial', variant: 'info' },
  overdue: { label: 'Vencido', variant: 'destructive' },
  cancelled: { label: 'Cancelado', variant: 'secondary' },
};

const inventoryStatusConfig: Record<string, StatusConfig> = {
  available: { label: 'Disponível', variant: 'success' },
  reserved: { label: 'Reservado', variant: 'warning' },
  damaged: { label: 'Danificado', variant: 'destructive' },
  expired: { label: 'Vencido', variant: 'destructive' },
  quarantine: { label: 'Quarentena', variant: 'info' },
  out_of_stock: { label: 'Indisponível', variant: 'destructive' },
};

const shipmentStatusConfig: Record<string, StatusConfig> = {
  pending: { label: 'Pendente', variant: 'warning' },
  ready: { label: 'Pronto', variant: 'info' },
  shipped: { label: 'Enviado', variant: 'success' },
  delivered: { label: 'Entregue', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
};

const productionStatusConfig: Record<string, StatusConfig> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  planned: { label: 'Planejado', variant: 'info' },
  in_progress: { label: 'Em Produção', variant: 'warning' },
  paused: { label: 'Pausada', variant: 'secondary' },
  completed: { label: 'Concluído', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
};

const nfeStatusConfig: Record<string, StatusConfig> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  pending: { label: 'Pendente', variant: 'warning' },
  authorized: { label: 'Autorizada', variant: 'success' },
  rejected: { label: 'Rejeitada', variant: 'destructive' },
  cancelled: { label: 'Cancelada', variant: 'secondary' },
  denied: { label: 'Denegada', variant: 'destructive' },
};

const accountingStatusConfig: Record<string, StatusConfig> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  posted: { label: 'Lançado', variant: 'success' },
  reversed: { label: 'Estornado', variant: 'destructive' },
  open: { label: 'Aberto', variant: 'info' },
  closed: { label: 'Fechado', variant: 'warning' },
  locked: { label: 'Bloqueado', variant: 'destructive' },
};

const variantStyles: Record<StatusVariant, string> = {
  default: 'bg-primary/10 text-primary border-primary/20',
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning-text border-warning/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  info: 'bg-info/10 text-info border-info/20',
  secondary: 'bg-muted text-muted-foreground border-border',
};

const dotStyles: Record<StatusVariant, string> = {
  default: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
  secondary: 'bg-muted-foreground',
};

export interface StatusBadgeProps {
  type: 'order' | 'sale' | 'client' | 'priority' | 'payment' | 'quotation' | 'inventory' | 'shipment' | 'production' | 'nfe' | 'accounting';
  status: string;
  className?: string;
}

export function StatusBadge({ type, status, className }: StatusBadgeProps) {
  let config: StatusConfig;

  switch (type) {
    case 'order':
      config = orderStatusConfig[status as OrderStatus] || { label: status, variant: 'default' };
      break;
    case 'sale':
      config = saleStatusConfig[status as SaleStatus] || { label: status, variant: 'default' };
      break;
    case 'quotation':
      config = quotationStatusConfig[status as QuotationStatus] || { label: status, variant: 'default' };
      break;
    case 'client':
      config = clientStatusConfig[status] || { label: status, variant: 'default' };
      break;
    case 'priority':
      config = priorityConfig[status] || { label: status, variant: 'default' };
      break;
    case 'payment':
      config = paymentStatusConfig[status as PaymentStatus] || { label: status, variant: 'default' };
      break;
    case 'inventory':
      config = inventoryStatusConfig[status] || { label: status, variant: 'default' };
      break;
    case 'shipment':
      config = shipmentStatusConfig[status] || { label: status, variant: 'default' };
      break;
    case 'production':
      config = productionStatusConfig[status] || { label: status, variant: 'default' };
      break;
    case 'nfe':
      config = nfeStatusConfig[status] || { label: status, variant: 'default' };
      break;
    case 'accounting':
      config = accountingStatusConfig[status] || { label: status, variant: 'default' };
      break;
    default:
      config = { label: status, variant: 'default' };
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium border gap-1.5 pl-2',
        variantStyles[config.variant],
        className
      )}
    >
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dotStyles[config.variant])} aria-hidden="true" />
      {config.label}
    </Badge>
  );
}
