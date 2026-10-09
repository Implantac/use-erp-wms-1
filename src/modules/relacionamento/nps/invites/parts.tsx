import { Card, CardContent } from '@/ui/base/card';
import { Badge, type BadgeProps } from '@/ui/base/badge';

export type BulkResultItem = { id: string; name: string; ok: boolean; error?: string };
export type BulkResult = { title: string; items: BulkResultItem[] } | null;

export function KPI({ label, value, sub, tone = 'default' }: { label: string; value: number | string; sub?: string; tone?: 'default' | 'success' | 'warn' | 'danger' | 'info' }) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-green-500',
    warn: 'text-amber-500',
    danger: 'text-red-500',
    info: 'text-blue-500',
  }[tone];
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeProps['variant']; className?: string }> = {
    pending: { label: 'Pendente', variant: 'secondary' },
    sent: { label: 'Enviado', variant: 'default' },
    opened: { label: 'Aberto', variant: 'default', className: 'bg-blue-500/20 text-blue-500 border-blue-500/30' },
    responded: { label: 'Respondido', variant: 'default', className: 'bg-green-500/20 text-green-500 border-green-500/30' },
    bounced: { label: 'Falha', variant: 'outline', className: 'text-red-500 border-red-500/40' },
    failed: { label: 'Falha', variant: 'outline', className: 'text-red-500 border-red-500/40' },
    revoked: { label: 'Revogado', variant: 'outline' },
  };
  const s = map[status] ?? { label: status, variant: 'outline' };
  return <Badge variant={s.variant} className={s.className}>{s.label}</Badge>;
}
