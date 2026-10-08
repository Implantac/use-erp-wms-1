import { useQuery } from "@tanstack/react-query";
import { useSupplyChain } from "@/hooks/operational/supply-chain/useSupplyChain";
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import { 
  History, 
  User, 
  Calendar, 
  ArrowRight,
  ShieldCheck,
  ClipboardList
} from "lucide-react";
import { Badge } from "@/ui/base/badge";
import { Skeleton } from "@/ui/base/skeleton";
import { ScrollArea } from "@/ui/base/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MovementLedgerProps {
  movementId: string;
}

export function MovementLedger({ movementId }: MovementLedgerProps) {
  const { getMovementLedger } = useSupplyChain();
  const { activeCompanyId, user } = useActiveTenant();

  const { data: ledger, isLoading, error } = useQuery({
    queryKey: ['movement_ledger', user?.id, activeCompanyId, movementId],
    queryFn: () => getMovementLedger(movementId),
    enabled: Boolean(user?.id && activeCompanyId && movementId),
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!activeCompanyId || !user?.id || error) {
    return <div role="alert" className="p-4 text-sm text-destructive">Histórico indisponível: empresa não identificada ou falha ao consultar o banco.</div>;
  }

  if (!ledger || ledger.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground opacity-50">
        <History className="h-8 w-8 mb-2" />
        <p className="text-xs font-bold uppercase">Nenhum histórico encontrado</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[300px] w-full pr-4">
      <div className="space-y-4 p-1">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Rastreabilidade Imutável (Ledger)</h4>
        </div>
        
        {ledger.map((entry) => (
          <div key={entry.id} className="relative pl-6 pb-4 border-l-2 border-primary/20 last:border-0 last:pb-0">
            {/* Timeline Dot */}
            <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-background border-2 border-primary flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>

            <div className="bg-muted/30 rounded-lg p-3 border border-border/50 hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] uppercase font-bold bg-background">
                    {entry.previous_status || 'INÍCIO'}
                  </Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge className="text-[9px] uppercase font-black bg-primary/10 text-primary border-primary/20">
                    {entry.new_status}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-medium">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(entry.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[9px] font-bold uppercase text-muted-foreground">Sistema / Auditoria</span>
                </div>
                <Badge variant="outline" className="text-[8px] font-bold opacity-40">
                  #{entry.id.split('-')[0].toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
