/**
 * Fase 1 — EnterpriseKPICard
 *
 * Opt-in evolution of KPICard with 24 Enterprise slots. 100% backward-compatible:
 *  - Legacy props (title, value, subtitle, icon, color) still work.
 *  - New props add deltas, goal, drill-down, IA and export without breaking layout.
 *
 * Uses window event `drilldown:open` (see DrillDownDrawer) — no prop drilling.
 */
import { type ReactNode, type ElementType, type MouseEvent } from "react";
import { Card, CardContent } from "@/ui/base/card";
import { Badge } from "@/ui/base/badge";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { openDrillDown } from "./drillDownEvents";
import type { EntityKey } from "@/core/entityRegistry";

type Trend = "up" | "down" | "flat";

interface Deltas {
  day?: number;
  week?: number;
  month?: number;
  year?: number;
}

interface EnterpriseKPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode | ElementType;
  color?: "primary" | "success" | "warning" | "danger" | "info" | "accent";
  className?: string;
  index?: number;
  /** Enterprise slots — all optional so migration is incremental. */
  entityKey?: EntityKey;
  numericValue?: number;
  deltas?: Deltas;
  goal?: number;
  progress?: number;
  status?: "healthy" | "warn" | "critical";
  impact?: { financial?: number; operational?: string };
  source?: string;
  lastUpdated?: string | Date;
  trend?: Trend;
  onClick?: () => void;
}

const colorMap: Record<string, { border: string; iconBg: string; iconText: string }> = {
  primary: { border: "border-l-primary", iconBg: "bg-primary/10", iconText: "text-primary" },
  success: { border: "border-l-success", iconBg: "bg-success/10", iconText: "text-success" },
  warning: { border: "border-l-warning", iconBg: "bg-warning/10", iconText: "text-warning" },
  danger: { border: "border-l-destructive", iconBg: "bg-destructive/10", iconText: "text-destructive" },
  info: { border: "border-l-info", iconBg: "bg-info/10", iconText: "text-info" },
  accent: { border: "border-l-primary", iconBg: "bg-accent/10", iconText: "text-accent-foreground" },
};

function formatDelta(n?: number) {
  if (n == null || Number.isNaN(n)) return null;
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function DeltaChip({ label, value }: { label: string; value?: number }) {
  if (value == null || Number.isNaN(value)) return null;
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        positive ? "text-success bg-success/10" : "text-destructive bg-destructive/10",
      )}
      title={`${label}: ${formatDelta(value)}`}
    >
      {positive ? "▲" : "▼"}
      {Math.abs(value).toFixed(1)}%
      <span className="opacity-60 ml-0.5">{label}</span>
    </span>
  );
}

export function EnterpriseKPICard(props: EnterpriseKPICardProps) {
  const {
    title,
    value,
    subtitle,
    icon,
    color = "primary",
    className,
    index = 0,
    entityKey,
    numericValue,
    deltas,
    goal,
    progress,
    status,
    impact,
    source,
    lastUpdated,
    trend,
    onClick,
  } = props;

  const colors = colorMap[color] || colorMap.primary;
  const interactive = Boolean(entityKey || onClick);

  const iconEl =
    typeof icon === "function" || (typeof icon === "object" && icon !== null && "render" in (icon as object))
      ? (() => {
          const I = icon as ElementType;
          return <I className="h-5 w-5" />;
        })()
      : (icon as ReactNode);

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : trend === "flat" ? Minus : null;

  const goalPercent =
    progress != null
      ? Math.min(100, Math.max(0, progress))
      : goal && typeof numericValue === "number"
      ? Math.min(100, Math.max(0, (numericValue / goal) * 100))
      : null;

  const handleClick = (e: MouseEvent) => {
    if (onClick) return onClick();
    if (!entityKey) return;
    e.preventDefault();
    openDrillDown({ entityKey, value: numericValue ?? value, delta: deltas, goal });
  };

  const statusColor =
    status === "critical" ? "bg-destructive/10 text-destructive" : status === "warn" ? "bg-warning/10 text-warning" : status === "healthy" ? "bg-success/10 text-success" : "";

  return (
    <Card
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? handleClick : undefined}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
      className={cn(
        "border-l-4 opacity-0 animate-slide-in-bottom transition-all duration-200",
        colors.border,
        interactive && "cursor-pointer hover:shadow-md hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
        className,
      )}
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: "forwards" }}
      aria-label={interactive ? `Abrir análise detalhada de ${title}` : undefined}
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", colors.iconBg)}>
            <div className={colors.iconText}>{iconEl}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{title}</p>
              {entityKey && <Sparkles className="h-3 w-3 text-primary/60" aria-hidden />}
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums leading-tight">{value}</p>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
          {status && <span className={cn("h-2 w-2 rounded-full mt-2", statusColor.split(" ")[0])} aria-label={status} />}
        </div>

        {(deltas || TrendIcon || impact) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {TrendIcon && (
              <TrendIcon
                className={cn(
                  "h-3.5 w-3.5",
                  trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground",
                )}
              />
            )}
            <DeltaChip label="D" value={deltas?.day} />
            <DeltaChip label="S" value={deltas?.week} />
            <DeltaChip label="M" value={deltas?.month} />
            <DeltaChip label="A" value={deltas?.year} />
            {impact?.financial != null && (
              <Badge variant="outline" className="text-[10px] h-5">
                Impacto {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(impact.financial)}
              </Badge>
            )}
          </div>
        )}

        {goalPercent != null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Meta</span>
              <span className="tabular-nums">{goalPercent.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  goalPercent >= 100 ? "bg-success" : goalPercent >= 70 ? "bg-primary" : "bg-warning",
                )}
                style={{ width: `${Math.min(100, goalPercent)}%` }}
              />
            </div>
          </div>
        )}

        {(source || lastUpdated) && (
          <p className="text-[10px] text-muted-foreground/70 truncate">
            {source && <span>{source}</span>}
            {source && lastUpdated && <span> · </span>}
            {lastUpdated && (
              <span>
                atualizado{" "}
                {typeof lastUpdated === "string"
                  ? lastUpdated
                  : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(lastUpdated)}
              </span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
