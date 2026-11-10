import { Brain, AlertTriangle, Lightbulb, Target, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/ui/base/badge';
import { trendIcon, priorityColor, statusBadgeVariant, statusBorder } from './helpers';

export interface CEOStructuredBrief {
  veredicto?: string;
  kpis?: { nome: string; valor: string | number; status?: string; trend?: string }[];
  riscos?: { titulo: string; impacto?: string; acao?: string }[];
  insights?: { titulo: string; descricao?: string; tipo?: string }[];
  plano?: { metas?: string[]; acoes?: string[] };
  decisoes?: { acao: string; prioridade?: string }[];
}

export function StructuredBlock({ structured, dataStatus }: { structured: CEOStructuredBrief; dataStatus?: string }) {
  return (
    <div className="space-y-4">
      {dataStatus === 'insufficient' && (
        <div className="rounded-lg border-l-4 border-l-warning bg-warning/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning-text shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Dados insuficientes para análise confiável</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cadastre vendas, pedidos ou contas no sistema para que a IA CEO possa gerar diagnóstico estratégico baseado em dados reais.
            </p>
          </div>
        </div>
      )}

      {structured.veredicto && dataStatus !== 'insufficient' && (
        <div className="rounded-lg border-l-4 border-l-primary bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Veredicto Executivo</span>
          </div>
          <p className="text-sm font-medium text-foreground leading-relaxed">{structured.veredicto}</p>
        </div>
      )}

      {structured.kpis?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {structured.kpis.map((k, i: number) => (
            <div key={i} className={`p-3 rounded-lg border bg-card border-l-4 ${statusBorder(k.status)}`}>
              <div className="text-[11px] text-muted-foreground flex items-center justify-between gap-1">
                <span className="truncate">{k.nome}</span>
                {trendIcon(k.trend)}
              </div>
              <div className="text-lg font-bold mt-1 tabular-nums">{k.valor}</div>
              <Badge variant={statusBadgeVariant(k.status)} className="mt-1 text-[10px]">{k.status}</Badge>
            </div>
          ))}
        </div>
      )}

      {structured.riscos?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Alertas Críticos ({(structured.riscos?.length ?? 0)})
          </h4>
          <div className="space-y-2">
            {structured.riscos.map((r, i: number) => (
              <div key={i} className="rounded-lg border-l-4 border-l-destructive bg-destructive/5 p-3">
                <div className="text-sm font-semibold text-foreground">⚠️ {r.titulo}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  <span className="font-medium text-foreground/80">Impacto:</span> {r.impacto}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium text-foreground/80">Ação:</span> {r.acao}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(structured.insights?.length ?? 0) > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" /> Insights ({(structured.insights?.length ?? 0)})
          </h4>
          <div className="grid md:grid-cols-2 gap-2">
            {structured.insights.map((it, i: number) => {
              const tipoColor =
                it.tipo === 'risco' ? 'border-l-destructive' :
                it.tipo === 'oportunidade' ? 'border-l-success' :
                it.tipo === 'tendencia' ? 'border-l-primary' : 'border-l-muted-foreground';
              return (
                <div key={i} className={`p-3 rounded-lg border bg-card border-l-4 ${tipoColor}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{it.titulo}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">{it.tipo}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{it.descricao}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {structured.plano && ((structured.plano.metas?.length ?? 0) > 0 || (structured.plano.acoes?.length ?? 0) > 0) && (
        <div className="grid md:grid-cols-2 gap-3">
          {(structured.plano.metas?.length ?? 0) > 0 && (
            <div className="rounded-lg border bg-card p-3">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> Metas (30 dias)
              </h4>
              <ul className="space-y-1.5">
                {structured.plano.metas.map((m: string, i: number) => (
                  <li key={i} className="text-sm flex gap-2"><span className="text-primary">🎯</span><span>{m}</span></li>
                ))}
              </ul>
            </div>
          )}
          {(structured.plano.acoes?.length ?? 0) > 0 && (
            <div className="rounded-lg border bg-card p-3">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-warning-text" /> Ações
              </h4>
              <ul className="space-y-1.5">
                {structured.plano.acoes.map((a: string, i: number) => (
                  <li key={i} className="text-sm flex gap-2"><span className="text-warning-text">⚙️</span><span>{a}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {structured.decisoes?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Decisões Recomendadas
          </h4>
          <div className="space-y-1.5">
            {structured.decisoes.map((d, i: number) => (
              <div key={i} className="text-sm p-2.5 rounded-lg border bg-card flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span>{d.prioridade === 'alta' ? '🔴' : d.prioridade === 'media' ? '🟡' : '🟢'}</span>
                  {d.acao}
                </span>
                <Badge variant={priorityColor(d.prioridade)} className="text-[10px] uppercase">{d.prioridade}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t pt-1" />
    </div>
  );
}
