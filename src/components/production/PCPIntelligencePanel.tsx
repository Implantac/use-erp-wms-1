import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { ScrollArea } from '@/ui/base/scroll-area';
import { cn } from '@/lib/utils';
import { Brain, AlertTriangle, ShoppingCart, Clock, Zap, ArrowRight, Lightbulb, Shield } from 'lucide-react';
import type { ActionSuggestion } from '@/lib/pcpServices';
import { useNavigate } from 'react-router-dom';

const severityConfig = {
  critical: { bg: 'bg-destructive/10 border-destructive/30', icon: AlertTriangle, color: 'text-destructive', badge: 'bg-destructive text-destructive-foreground' },
  warning: { bg: 'bg-warning/10 border-warning/30', icon: Clock, color: 'text-warning', badge: 'bg-warning/20 text-warning' },
  info: { bg: 'bg-primary/10 border-primary/30', icon: Lightbulb, color: 'text-primary', badge: 'bg-primary/20 text-primary' },
};

const typeConfig: Record<string, { icon: any; label: string; route: string }> = {
  purchase: { icon: ShoppingCart, label: 'Compra', route: '/production/mrp' },
  anticipate: { icon: Zap, label: 'Antecipar', route: '/production/aps' },
  redistribute: { icon: ArrowRight, label: 'Redistribuir', route: '/production/aps' },
  alert: { icon: Shield, label: 'Alerta', route: '/production/pcp' },
  overtime: { icon: Clock, label: 'Hora Extra', route: '/production/capacidade' },
};

interface Props {
  suggestions: ActionSuggestion[];
  summary: {
    criticalAlerts: number;
    warningAlerts: number;
    materialsInDeficit: number;
    opsAtRisk: number;
    opsLate: number;
    bottleneckSectors: number;
  };
  compact?: boolean;
}

export default function PCPIntelligencePanel({ suggestions, summary, compact = false }: Props) {
  const navigate = useNavigate();
  const totalAlerts = summary.criticalAlerts + summary.warningAlerts;

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Brain className="h-10 w-10 mx-auto text-success/40 mb-3" />
          <p className="text-sm font-medium text-success">Nenhum alerta calculado</p>
          <p className="text-xs text-muted-foreground mt-1">Ausência de alertas não comprova disponibilidade de materiais, capacidade ou qualidade.</p>
        </CardContent>
      </Card>
    );
  }

  const displayed = compact ? suggestions.slice(0, 5) : suggestions;

  return (
    <Card className={cn(summary.criticalAlerts > 0 && 'border-destructive/30')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Inteligência PCP
            <Badge variant="outline" className="ml-1 text-xs">
              {totalAlerts} {totalAlerts === 1 ? 'alerta' : 'alertas'}
            </Badge>
          </CardTitle>
          <div className="flex gap-1.5">
            {summary.criticalAlerts > 0 && (
              <Badge className="bg-destructive text-destructive-foreground text-xs">
                {summary.criticalAlerts} crítico{summary.criticalAlerts > 1 ? 's' : ''}
              </Badge>
            )}
            {summary.opsLate > 0 && (
              <Badge className="bg-warning/20 text-warning text-xs">
                {summary.opsLate} atrasada{summary.opsLate > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
          {summary.materialsInDeficit > 0 && <span>📦 {summary.materialsInDeficit} materiais em déficit</span>}
          {summary.opsAtRisk > 0 && <span>⏳ {summary.opsAtRisk} OPs em risco</span>}
          {summary.bottleneckSectors > 0 && <span>🔥 {summary.bottleneckSectors} setor(es) sobrecarregado(s)</span>}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className={compact ? 'max-h-[280px]' : 'max-h-[450px]'}>
          <div className="space-y-2">
            {displayed.map((s, i) => {
              const sev = severityConfig[s.severity] || severityConfig.info;
              const typeConf = typeConfig[s.type] || typeConfig.alert;
              const SevIcon = sev.icon;
              const TypeIcon = typeConf.icon;

              return (
                <div key={i} className={cn('p-3 rounded-lg border flex items-start gap-3', sev.bg)}>
                  <SevIcon className={cn('h-4 w-4 mt-0.5 shrink-0', sev.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium truncate">{s.title}</p>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        <TypeIcon className="h-3 w-3 mr-0.5" />{typeConf.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                    {s.estimatedImpact && (
                      <p className="text-xs font-medium mt-1 text-foreground/80">📊 {s.estimatedImpact}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-7 text-xs"
                    onClick={() => navigate(typeConf.route)}
                  >
                    Ação <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        {compact && suggestions.length > 5 && (
          <Button variant="link" size="sm" className="w-full mt-2 text-xs" onClick={() => navigate('/production/pcp')}>
            Ver todos os {suggestions.length} alertas →
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
