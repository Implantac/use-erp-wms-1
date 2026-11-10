import { Badge } from '@/ui/base/badge';
import { Brain, Database, ShieldCheck, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  qualityScore: number;
  lastAnalysis?: string;
}

export function ExecutiveIntelligenceStatus({ qualityScore, lastAnalysis }: Props) {
  const isHealthy = qualityScore > 70;
  const isWarning = qualityScore <= 70 && qualityScore > 40;

  return (
    <div className="flex items-center gap-2 bg-muted/30 px-2 py-1 rounded-full border border-border/50">
      <div className="flex items-center gap-1.5 px-1.5 border-r border-border/50">
        <Database className={cn(
          "h-3.5 w-3.5",
          isHealthy ? "text-success" : isWarning ? "text-warning-text" : "text-destructive"
        )} />
        <span className="text-[10px] font-bold text-muted-foreground">
          DADOS: <span className="text-foreground">{qualityScore}%</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-1.5 border-r border-border/50">
        <Brain className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-bold text-muted-foreground">
          IA: <span className="text-foreground uppercase">Ativa</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-success" />
        <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
          VERIFICADO
        </span>
      </div>
    </div>
  );
}
