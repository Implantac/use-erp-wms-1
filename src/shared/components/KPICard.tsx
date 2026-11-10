import { type ReactNode, type ElementType } from 'react';
import { Card, CardContent } from '@/ui/base/card';
import { cn } from '@/lib/utils';
import { EnterpriseKPICard } from './EnterpriseKPICard';
import type { EntityKey } from '@/core/entityRegistry';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  description?: string;
  icon: ReactNode | ElementType;
  accentColor?: string;
  color?: string;
  className?: string;
  index?: number;
  /** Fase 2 — opt-in Enterprise slots. Se qualquer um for informado, o card
   *  delega ao EnterpriseKPICard (drill-down + IA) mantendo o layout base. */
  entityKey?: EntityKey;
  numericValue?: number;
  deltas?: { day?: number; week?: number; month?: number; year?: number };
  goal?: number;
  progress?: number;
  status?: 'healthy' | 'warn' | 'critical';
  impact?: { financial?: number; operational?: string };
  source?: string;
  lastUpdated?: string | Date;
  trend?: 'up' | 'down' | 'flat';
  onClick?: () => void;
}


const colorMap: Record<string, { border: string; iconBg: string; iconText: string; glow: string }> = {
  primary: { border: 'border-l-primary', iconBg: 'bg-gradient-to-br from-primary/15 to-primary/5', iconText: 'text-primary', glow: 'group-hover:shadow-glow' },
  success: { border: 'border-l-success', iconBg: 'bg-gradient-to-br from-success/15 to-success/5', iconText: 'text-success', glow: '' },
  warning: { border: 'border-l-warning', iconBg: 'bg-gradient-to-br from-warning/15 to-warning/5', iconText: 'text-warning-text', glow: '' },
  danger: { border: 'border-l-destructive', iconBg: 'bg-gradient-to-br from-destructive/15 to-destructive/5', iconText: 'text-destructive', glow: '' },
  info: { border: 'border-l-info', iconBg: 'bg-gradient-to-br from-info/15 to-info/5', iconText: 'text-info', glow: '' },
  accent: { border: 'border-l-primary', iconBg: 'bg-gradient-to-br from-accent to-accent/50', iconText: 'text-primary', glow: '' },
};

export function KPICard(props: KPICardProps) {
  const { title, value, subtitle, description, icon, accentColor, color, className, index = 0 } = props;
  const resolvedColor = accentColor || color || 'primary';
  const resolvedSubtitle = subtitle || description;

  // Fase 2: se qualquer slot Enterprise foi passado, delega ao card avançado.
  const hasEnterprise =
    props.entityKey || props.deltas || props.goal != null || props.progress != null ||
    props.status || props.impact || props.source || props.lastUpdated || props.trend || props.onClick;
  if (hasEnterprise) {
    const allowed = ['primary', 'success', 'warning', 'danger', 'info', 'accent'] as const;
    const safeColor = (allowed as readonly string[]).includes(resolvedColor)
      ? (resolvedColor as typeof allowed[number])
      : 'primary';
    return (
      <EnterpriseKPICard
        title={title}
        value={value}
        subtitle={resolvedSubtitle}
        icon={icon}
        color={safeColor}
        className={className}
        index={index}
        entityKey={props.entityKey}
        numericValue={props.numericValue}
        deltas={props.deltas}
        goal={props.goal}
        progress={props.progress}
        status={props.status}
        impact={props.impact}
        source={props.source}
        lastUpdated={props.lastUpdated}
        trend={props.trend}
        onClick={props.onClick}
      />
    );
  }

  const colors = colorMap[resolvedColor] || colorMap.primary;


  // Support both ReactNode and ElementType (component reference)
  let iconElement: ReactNode;
  if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && 'render' in (icon as object))) {
    const IconComponent = icon as ElementType;
    iconElement = <IconComponent className="h-5 w-5" />;
  } else {
    iconElement = icon;
  }

  return (
    <Card
      className={cn(
        'group border-l-4 hover-lift opacity-0 animate-slide-in-bottom overflow-hidden relative',
        colors.border,
        className
      )}
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'forwards' }}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 ring-1 ring-inset ring-border/50', colors.iconBg, colors.glow)}>
          <div className={colors.iconText}>{iconElement}</div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{title}</p>
          <p className="text-2xl font-bold text-foreground tabular-nums leading-tight mt-0.5">{value}</p>
          {resolvedSubtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{resolvedSubtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
