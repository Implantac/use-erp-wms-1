import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Activity, Beaker, ClipboardCheck, AlertTriangle } from "lucide-react";

export default function PharmaDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard Farmacêutico</h2>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lotes em Quarentena</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning-text" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">Aguardando liberação de qualidade</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produção (Unidades)</CardTitle>
            <Beaker className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">45.000</div>
            <p className="text-xs text-muted-foreground">Meta diária: 50.000 cápsulas</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conformidade (RDC 658)</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">100%</div>
            <p className="text-xs text-muted-foreground">Todos os processos auditados</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eficiência da Linha</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">94.8%</div>
            <p className="text-xs text-muted-foreground">+0.5% em relação ao turno anterior</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
