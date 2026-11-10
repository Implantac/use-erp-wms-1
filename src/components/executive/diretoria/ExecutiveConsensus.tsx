import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Badge } from "@/ui/base/badge";
import { Brain, CheckCircle, AlertCircle, TrendingUp, ShieldAlert } from "lucide-react";

const councilMembers = [
  { role: "CTO Global", status: "online", opinion: "Infraestrutura escalável pronta para expansão multi-regional.", sentiment: "positive" },
  { role: "Arq. SAP S/4HANA", status: "online", opinion: "Governança de dados alinhada com padrões internacionais.", sentiment: "positive" },
  { role: "Esp. Fiscal Br", status: "online", opinion: "Atenção: Nova alíquota de ICMS ST entra em vigor em 15 dias.", sentiment: "warning" },
  { role: "Esp. PCP/MRP", status: "online", opinion: "Gargalo detectado no setor de acabamento. Sugiro redistribuição.", sentiment: "warning" },
  { role: "Esp. Contábil", status: "online", opinion: "EBITDA consolidado 2% acima do forecast. Provisão recomendada.", sentiment: "positive" }
];

export function ExecutiveConsensus() {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-sidebar via-background to-sidebar/50 shadow-xl overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-sidebar-border/50">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold">Consenso do Conselho Executivo</CardTitle>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Inteligência Coletiva EEE</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 animate-pulse">
          Síncronização Ativa
        </Badge>
      </CardHeader>
      <CardContent className="pt-4 px-0">
        <div className="space-y-1">
          {councilMembers.map((member, i) => (
            <div 
              key={i} 
              className="group flex items-start gap-4 p-4 transition-all duration-300 hover:bg-primary/5 border-b border-sidebar-border/30 last:border-0"
            >
              <div className="relative">
                <div className="h-10 w-10 rounded-full bg-sidebar-accent flex items-center justify-center font-bold text-xs ring-2 ring-sidebar-border group-hover:ring-primary/30 transition-all">
                  {member.role.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-green-500 shadow-sm" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <h4 className="text-sm font-bold text-sidebar-foreground truncate">{member.role}</h4>
                  {member.sentiment === 'positive' ? (
                    <TrendingUp className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5 text-warning-text animate-bounce" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed italic line-clamp-2">
                  "{member.opinion}"
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 bg-sidebar-accent/30 text-center">
          <button className="text-[11px] font-bold text-primary hover:underline uppercase tracking-wider">
            Convocar Conselho para Reunião IA
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
