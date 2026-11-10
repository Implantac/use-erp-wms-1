import { differenceInDays } from 'date-fns';
import { Badge } from '@/ui/base/badge';
import type { PaymentMethod } from '@/types/financial';

export const paymentMethods: Record<PaymentMethod, string> = {
  pix: 'PIX', boleto: 'Boleto', credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito', transfer: 'Transferência', cash: 'Dinheiro', check: 'Cheque',
};

export const getDaysOverdue = (dueDate: string, now: Date = new Date()) => {
  const days = differenceInDays(now, new Date(dueDate));
  return days > 0 ? days : 0;
};

export const getAgingBadge = (dueDate: string, status: string, now: Date = new Date()) => {
  if (status === 'paid' || status === 'cancelled') return null;
  const days = getDaysOverdue(dueDate, now);
  if (days === 0) return null;
  if (days <= 7) return <Badge variant="outline" className="text-warning-text border-warning/30 bg-warning/10 text-xs">{days}d</Badge>;
  if (days <= 30) return <Badge variant="outline" className="text-warning-text border-warning/50 bg-warning/20 text-xs">{days}d</Badge>;
  return <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/5 text-xs">{days}d</Badge>;
};
