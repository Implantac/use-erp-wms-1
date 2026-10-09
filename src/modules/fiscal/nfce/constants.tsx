import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  CreditCard,
  Banknote,
  QrCode,
  Receipt,
} from 'lucide-react';
import { Badge } from '@/ui/base/badge';

const statusConfig: Record<string, { color: string; icon: React.ComponentType<{ className?: string }> }> = {
  authorized: { color: 'bg-success/10 text-success', icon: CheckCircle },
  cancelled: { color: 'bg-muted text-muted-foreground', icon: XCircle },
  contingency: { color: 'bg-warning/10 text-warning', icon: AlertTriangle },
};

const statusLabels: Record<string, string> = {
  authorized: 'Autorizada',
  cancelled: 'Cancelada',
  contingency: 'Contingência',
};

const paymentLabels: Record<string, string> = {
  cash: 'Dinheiro',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  pix: 'PIX',
  voucher: 'Vale',
  multiple: 'Múltiplo',
};

const paymentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  credit_card: CreditCard,
  debit_card: CreditCard,
  pix: QrCode,
  voucher: Receipt,
  multiple: CreditCard,
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status];
  const Icon = config?.icon || Receipt;
  return (
    <Badge className={`${config?.color} gap-1`}>
      <Icon className="h-3 w-3" />
      {statusLabels[status] || status}
    </Badge>
  );
}

export function PaymentBadge({ method }: { method: string }) {
  const Icon = paymentIcons[method] || CreditCard;
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>{paymentLabels[method] || method}</span>
    </div>
  );
}
