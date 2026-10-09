import { errorMessage } from "@/lib/errors";
/**
 * Fase 1 — AI Insight Panel
 *
 * Contract:  indicatorId (EntityKey) + payload (value/delta/goal) + horizon.
 * Calls the ai-insight edge function; renders causa/impacto/plano/automações.
 * Falls back to the registry narrative when AI is unavailable — never blank.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Lightbulb, TrendingDown, TrendingUp, AlertCircle, PlayCircle } from "lucide-react";
import { Badge } from "@/ui/base/badge";
import { Button } from "@/ui/base/button";
import { Skeleton } from "@/ui/base/skeleton";
import { getEntity, type EntityKey } from "@/core/entityRegistry";
import { formatBRL } from "@/lib/formatters";

interface AIInsight {
  root_cause: string;
  owners?: string[];
  financial_impact?: number;
  operational_impact?: string;
  risk_score?: number;
  forecast?: string;
  action_plan: Array<{ title: string; owner?: string; due?: string }>;
  automations?: Array<{ label: string; action: string }>;
}

interface AIInsightPanelProps {
  entityKey: EntityKey;
  value?: number | string;
  delta?: { day?: number; week?: number; month?: number; year?: number };
  goal?: number;
  horizon?: "day" | "week" | "month" | "quarter";
}

export function AIInsightPanel({ entityKey, value, delta, goal, horizon = "month" }: AIInsightPanelProps) {
  const entity = getEntity(entityKey);
  const deltaKey = JSON.stringify(delta ?? null);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase.functions.invoke("ai-insight", {
          body: { entityKey, value, delta: (JSON.parse(deltaKey) ?? undefined) as AIInsightPanelProps["delta"], goal, horizon },
        });
        if (cancelled) return;
        if (err) throw err;
        if (data?.insight) setInsight(data.insight as AIInsight);
        else setError("empty");
      } catch (e: unknown) {
        if (!cancelled) setError(errorMessage(e) || "AI indisponível");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [entityKey, value, goal, horizon, deltaKey]);

  if (!entity) return null;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  // Fallback: use narrative from registry (never blank state)
  const narrative = entity.narrative;
  const trend = delta?.month ?? 0;
  const TrendIcon = trend >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-4 text-sm">
      <header className="flex items-start gap-3">
        <div className="mt-0.5 p-2 rounded-lg bg-primary/10">
          <Brain className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Análise IA — {entity.label}</h3>
            <Badge variant="outline" className="uppercase text-[10px]">{entity.agent}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Horizonte {horizon} · {error ? "Análise offline (modo narrativa)" : "Análise em tempo real"}
          </p>
        </div>
      </header>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" /> O que está acontecendo
        </h4>
        <p className="leading-relaxed">
          {insight?.root_cause ?? narrative?.what ?? "Sem análise disponível."}
        </p>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <TrendIcon className="h-3.5 w-3.5" /> Por que está acontecendo
        </h4>
        <p className="leading-relaxed">
          {insight?.operational_impact ?? narrative?.why ?? "-"}
        </p>
        {(insight?.financial_impact ?? 0) !== 0 && (
          <p className="text-xs text-muted-foreground">
            Impacto financeiro estimado:{" "}
            <strong className="text-foreground">
              {formatBRL(insight!.financial_impact!)}
            </strong>
          </p>
        )}
        {typeof insight?.risk_score === "number" && (
          <Badge variant={insight.risk_score >= 70 ? "destructive" : insight.risk_score >= 40 ? "secondary" : "outline"}>
            Risco {insight.risk_score}/100
          </Badge>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5" /> O que o sistema recomenda
        </h4>
        {insight?.action_plan?.length ? (
          <ul className="space-y-1.5">
            {insight.action_plan.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p>{step.title}</p>
                  {(step.owner || step.due) && (
                    <p className="text-[11px] text-muted-foreground">
                      {step.owner ? `Responsável: ${step.owner}` : ""}
                      {step.due ? ` · até ${step.due}` : ""}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="leading-relaxed">{narrative?.next ?? "Sem recomendação disponível."}</p>
        )}
      </section>

      {insight?.automations?.length ? (
        <section className="space-y-2 pt-2 border-t">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Automações sugeridas</h4>
          <div className="flex flex-wrap gap-2">
            {insight.automations.map((a, i) => (
              <Button key={i} size="sm" variant="outline" className="h-7 text-xs">
                <PlayCircle className="h-3.5 w-3.5 mr-1" /> {a.label}
              </Button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
