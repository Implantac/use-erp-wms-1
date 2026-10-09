import { brl } from './currency';
import { Heart, AlertTriangle, Sparkles, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

export function GradePill({ grade, score }: { grade: string; score: number }) {
  const color =
    grade === "A" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" :
    grade === "B" ? "bg-blue-500/15 text-blue-500 border-blue-500/30" :
    grade === "C" ? "bg-amber-500/15 text-amber-500 border-amber-500/30" :
    grade === "D" ? "bg-orange-500/15 text-orange-500 border-orange-500/30" :
    "bg-red-500/15 text-red-500 border-red-500/30";
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", color)}>
      <Heart className="h-3.5 w-3.5" />
      Grau {grade} · {score}/100
    </div>
  );
}

export function RevenueBarChart({ data }: { data: Array<{ label: string; revenue: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  return (
    <div className="flex h-[220px] items-end gap-2 px-1">
      {data.map((d, i) => {
        const h = (d.revenue / max) * 100;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5 group">
            <div className="text-[10px] font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              {(d.revenue / 1000).toFixed(0)}k
            </div>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-primary/80 to-primary transition-all hover:brightness-110"
              style={{ height: `${Math.max(h, 2)}%` }}
              title={brl(d.revenue)}
            />
            <span className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function RecIcon({ icon }: { icon: "warning" | "opportunity" | "insight" | "alert" }) {
  if (icon === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (icon === "alert") return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (icon === "opportunity") return <Sparkles className="h-4 w-4 text-emerald-500" />;
  return <Lightbulb className="h-4 w-4 text-blue-500" />;
}
