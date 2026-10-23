import { useState, useMemo } from 'react';
import { PurchasingDailyQueue } from '@/modules/purchasing/PurchasingDailyQueue';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, 
  ShoppingCart, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  Package,
  History
} from 'lucide-react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { ScrollArea } from '@/ui/base/scroll-area';
import { formatBRL } from '@/lib/formatters';
import { procurementAutomationService } from '@/services/purchasing/ProcurementAutomationService';
import { EmptyState } from '@/shared/components/EmptyState';
import { OperationalFeedback } from '@/components/shared/OperationalFeedback';
import { toastSuccess } from '@/lib/toastHelpers';

export default function ProcurementDashboard() {
  const { data: suggestions = [], isLoading, refetch } = useQuery({
    queryKey: ['purchase-suggestions'],
    queryFn: () => procurementAutomationService.getPurchaseSuggestions(),
  });

  const criticalItems = useMemo(() => 
    suggestions.filter(s => s.current_stock <= s.min_stock)
  , [suggestions]);

  const handleCreatePO = (item: any) => {
    toastSuccess(`Pedido de compra gerado para ${item.product_name}`, `Quantidade sugerida: ${item.suggested_quantity}`);
    // Futura integração: criar registro na tabela de purchase_orders
  };

  if (isLoading) {
    return <div className="p-8 text-center">Carregando sugestões de compra...</div>;
  }

  return (
    <PageContainer>
      <PurchasingDailyQueue />
      <PageHeader 
        title="Dashboard de Compras (MRP)" 
        description="Automação de ressuprimento baseada em inteligência de estoque"
      >
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <History className="h-4 w-4" /> Atualizar Sugestões
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <KPICard 
          title="Itens Críticos" 
          value={criticalItems.length} 
          subtitle="Abaixo do estoque mínimo" 
          icon={<AlertTriangle className="h-5 w-5" />} 
          accentColor="destructive" 
          index={0} 
        />
        <KPICard 
          title="Sugestões Ativas" 
          value={suggestions.length} 
          subtitle="Itens em ponto de pedido" 
          icon={<ShoppingCart className="h-5 w-5" />} 
          accentColor="primary" 
          index={1} 
        />
        <KPICard 
          title="Lead Time Médio" 
          value="4.2 dias" 
          subtitle="Desempenho da malha" 
          icon={<BarChart3 className="h-5 w-5" />} 
          accentColor="success" 
          index={2} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-primary/20 bg-primary/5 shadow-lg overflow-hidden">
          <CardHeader className="bg-primary/10 border-b border-primary/20">
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Sugestões de Ressuprimento</CardTitle>
                <CardDescription>Produtos que atingiram o ponto de pedido (Reorder Point)</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {suggestions.length === 0 ? (
              <div className="p-12">
                <EmptyState 
                  title="Estoque Saudável" 
                  description="Nenhum item atingiu o ponto de pedido no momento." 
                />
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="divide-y divide-border">
                  {suggestions.map((item) => (
                    <div key={item.product_id} className="p-4 hover:bg-background transition-colors flex items-center justify-between gap-4">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm truncate">{item.product_name}</span>
                          <Badge variant="outline" className="text-[10px] font-mono">{item.product_code}</Badge>
                          {item.current_stock <= item.min_stock && (
                            <Badge className="bg-destructive text-destructive-foreground text-[10px]">RUPTURA</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Estoque: <b className="text-foreground">{item.current_stock}</b></span>
                          <span>Mín: <b className="text-foreground">{item.min_stock}</b></span>
                          <span>Ponto Pedido: <b className="text-foreground">{item.reorder_point}</b></span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sugestão</p>
                          <p className="font-black text-primary text-lg">{item.suggested_quantity}</p>
                        </div>
                        <Button size="sm" onClick={() => handleCreatePO(item)} className="gap-2">
                          Gerar PO <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-primary/20 bg-background shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-primary font-black uppercase">
                <CheckCircle2 className="h-5 w-5" /> Regras MRP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <OperationalFeedback 
                type="info" 
                title="Sourcing Automático" 
                message="Sugestões calculadas com base em Lead Time histórico e Curva ABC." 
              />
              <div className="p-3 rounded-lg border bg-muted/50 space-y-2">
                <p className="text-xs font-bold uppercase text-muted-foreground">Próxima Execução</p>
                <p className="text-sm font-black flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" /> Hoje às 07:00 UTC
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
