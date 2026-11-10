import { CheckCircle2, Clock, XCircle, AlertTriangle, FileText, Ban, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { FiscalStatus } from '@/modules/fiscal/types';
export type { FiscalStatus };

const config: Record<FiscalStatus, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  draft: { label: 'Rascunho', icon: FileText, className: 'bg-muted text-muted-foreground border-border' },
  pending: { label: 'Em processamento', icon: Clock, className: 'bg-warning/10 text-warning-text border-warning/30' },
  authorized: { label: 'Autorizada', icon: CheckCircle2, className: 'bg-success/10 text-success border-success/30' },
  rejected: { label: 'Rejeitada', icon: AlertTriangle, className: 'bg-destructive/10 text-destructive border-destructive/30' },
  cancelled: { label: 'Cancelada', icon: Ban, className: 'bg-muted text-muted-foreground border-border' },
  denied: { label: 'Denegada', icon: XCircle, className: 'bg-destructive/10 text-destructive border-destructive/30' },
  closed: { label: 'Encerrada', icon: Truck, className: 'bg-primary/10 text-primary border-primary/30' },
  contingency: { label: 'Contingência', icon: AlertTriangle, className: 'bg-warning/10 text-warning-text border-warning/30' },
};

interface FiscalStatusBadgeProps {
  status: string;
  className?: string;
}

export function FiscalStatusBadge({ status, className }: FiscalStatusBadgeProps) {
  const c = config[status as FiscalStatus] || config.draft;
  const Icon = c.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        c.className,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}
