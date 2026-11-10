import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Utensils, Zap, ShieldCheck, ThermometerSnowflake } from "lucide-react";

export default function FoodFeedDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard Alimentos e Rações</h2>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produção (Toneladas)</CardTitle>
            <Utensils className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">340t</div>
            <p className="text-xs text-muted-foreground">Meta diária: 400t</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Segurança Alimentar</CardTitle>
            <ShieldCheck className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">100% OK</div>
            <p className="text-xs text-muted-foreground">Análises laboratoriais concluídas</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cadeia de Frio</CardTitle>
            <ThermometerSnowflake className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-18.2°C</div>
            <p className="text-xs text-muted-foreground">Média silas e câmaras frias</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consumo de Energia / Ton</CardTitle>
            <Zap className="h-4 w-4 text-warning-text" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12.5 kWh</div>
            <p className="text-xs text-muted-foreground">Meta: 11.0 kWh</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
