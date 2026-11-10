import { AlertTriangle, Target, Lightbulb, CheckCircle2, RefreshCw } from 'lucide-react';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { impactColor } from './helpers';
import type { CEORisk, CEOPlanItem, CEODecision } from './types';

export function RisksList({ risks }: { risks: CEORisk[] }) {
  if (!risks.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" /> Riscos detectados ({risks.length})
      </h4>
      <div className="space-y-2">
        {risks.map((r, i) => (
          <div key={i} className="flex items-start justify-between gap-2 p-2 rounded border bg-muted/30">
            <div className="flex-1">
              <div className="text-sm font-medium">{r?.titulo ?? 'Risco'}</div>
              <div className="text-xs text-muted-foreground">{r?.detalhe ?? ''}</div>
            </div>
            <Badge variant={impactColor(r?.impacto ?? 'baixo')}>{r?.impacto ?? 'baixo'}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlanList({ plan }: { plan: CEOPlanItem[] }) {
  if (!plan.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" /> Plano de crescimento
      </h4>
      <ul className="space-y-1.5">
        {plan.map((p, i) => (
          <li key={i} className="text-sm flex gap-2">
            <Badge variant="outline" className="text-[10px] h-5">{p?.tipo ?? 'acao'}</Badge>
            <div>
              <span className="font-medium">{p?.titulo ?? ''}</span>
              <span className="text-muted-foreground"> — {p?.detalhe ?? ''}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DecisionsList({
  decisions, onApprove, isPending,
}: { decisions: CEODecision[]; onApprove: () => void; isPending: boolean }) {
  if (!decisions.length) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-warning-text" /> Decisões sugeridas (requerem aprovação)
        </h4>
        <Button onClick={onApprove} disabled={isPending} size="sm" variant="outline" className="h-7">
          {isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
          Aprovar e registrar
        </Button>
      </div>
      <div className="space-y-1.5">
        {decisions.map((d, i) => (
          <div key={i} className="text-sm p-2 rounded border bg-muted/30 flex items-center justify-between gap-2">
            <span>{d?.action ?? d?.type ?? 'Decisão'}</span>
            <Badge variant={d?.priority === 'alta' ? 'destructive' : 'secondary'}>{d?.priority ?? 'media'}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
