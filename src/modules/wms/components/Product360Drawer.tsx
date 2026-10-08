import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/ui/base/sheet';
import { Badge } from '@/ui/base/badge';
import { Card, CardContent } from '@/ui/base/card';
import { Skeleton } from '@/ui/base/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { ScrollArea } from '@/ui/base/scroll-area';
import { Progress } from '@/ui/base/progress';
import { formatBRL, formatDate } from '@/lib/formatters';
import { Package, History, TrendingUp, AlertTriangle, Box, ArrowRightLeft, DollarSign, BrainCircuit, Zap, Info, Calendar, Wind } from 'lucide-react';
import { useWMSInventory } from '@/hooks/wms/useWMSInventory';
import { useProductCosts } from '@/hooks/production/useProductCosts';
import { usePredictiveIntelligence } from '@/hooks/ai/usePredictiveIntelligence';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { DemandProjectionChart } from './DemandProjectionChart';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/base/tooltip';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string | null;
  productName?: string;
}

export function Product360Drawer({ open, onOpenChange, productId, productName }: Props) {
  const { items, loading: loadingInventory } = useWMSInventory();
  const { costs, loading: loadingCosts } = useProductCosts();
  const [period, setPeriod] = useState<number>(30);
  const [seasonality, setSeasonality] = useState<'none' | 'high' | 'low'>('none');
  const { demand, loading: loadingDemand, error: demandError } = usePredictiveIntelligence(productId, { days: period, seasonality });

  const product = useMemo(() => 
    items.find(i => i.id === productId || i.productCode === productId),
    [items, productId]
  );

  const costData = useMemo(() => 
    costs.find(c => c.product_id === productId || c.product_code === product?.productCode),
    [costs, productId, product]
  );

  const loading = loadingInventory || loadingCosts;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <SheetTitle className="truncate">{product?.productName || productName || 'Produto'}</SheetTitle>
          </div>
          <SheetDescription>Visão consolidada 360° do SKU</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !product ? (
          <div className="mt-12 text-center text-muted-foreground">
            <Box className="mx-auto h-12 w-12 opacity-20 mb-4" />
            <p>Dados do produto não localizados.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Resumo Rápido */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Saldo Total</p>
                <p className="text-lg font-black">{product.quantity} <span className="text-xs font-normal">{product.unit}</span></p>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Disponível</p>
                <p className="text-lg font-black text-success">{product.availableQty}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Reservado</p>
                <p className="text-lg font-black text-warning">{product.reservedQty}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Status</p>
                <div className="mt-1"><StatusBadge status={product.status} type="inventory" /></div>
              </CardContent></Card>
            </div>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="overview">Geral</TabsTrigger>
                <TabsTrigger value="logistics">Logística</TabsTrigger>
                <TabsTrigger value="costs">Custos</TabsTrigger>
                <TabsTrigger value="history">Histórico</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Código SKU:</span>
                      <span className="font-mono font-bold">{product.productCode}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Categoria:</span>
                      <span>{product.category}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Localização Padrão:</span>
                      <Badge variant="outline">{product.location}</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Lote atual:</span>
                      <span>{product.batch || '—'}</span>
                    </div>
                  </CardContent>
                </Card>

                {costData && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <span className="text-sm font-bold">Rentabilidade Estimada</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] uppercase text-muted-foreground">Margem</p>
                          <p className={`text-xl font-black ${costData.profit_margin > 20 ? 'text-success' : 'text-warning'}`}>
                            {costData.profit_margin.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-muted-foreground">Preço Venda</p>
                          <p className="text-xl font-black">{formatBRL(costData.sale_price)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {loadingDemand && <p role="status" className="text-xs text-muted-foreground">Verificando disponibilidade de projeção...</p>}
                {demandError && <p role="note" className="text-xs text-muted-foreground">{demandError} Nenhuma sugestão de compra ou reposição foi calculada.</p>}
                {demand && (
                  <Card className="border-accent/20 bg-accent/5">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <BrainCircuit className="h-4 w-4 text-accent" />
                        <span className="text-sm font-bold">Projeção Digital Twin</span>
                        <Badge variant="outline" className="text-[9px] h-4 ml-auto border-accent/30 text-accent">Fase 5 - Predictive</Badge>
                      </div>

                      {/* Filtros de IA */}
                      <div className="flex gap-2 mb-4">
                        <div className="flex-1 space-y-1">
                          <label className="text-[9px] text-muted-foreground uppercase flex items-center gap-1">
                            <Calendar className="h-2 w-2" /> Período
                          </label>
                          <Select value={period.toString()} onValueChange={(v) => setPeriod(parseInt(v))}>
                            <SelectTrigger className="h-7 text-[10px] bg-background/50 border-accent/20">
                              <SelectValue placeholder="Período" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="7">7 dias</SelectItem>
                              <SelectItem value="30">30 dias</SelectItem>
                              <SelectItem value="90">90 dias</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 space-y-1">
                          <label className="text-[9px] text-muted-foreground uppercase flex items-center gap-1">
                            <Wind className="h-2 w-2" /> Sazonalidade
                          </label>
                          <Select value={seasonality} onValueChange={(v) => { if (v === 'none' || v === 'high' || v === 'low') setSeasonality(v); }}>
                            <SelectTrigger className="h-7 text-[10px] bg-background/50 border-accent/20">
                              <SelectValue placeholder="Sazonalidade" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Normal</SelectItem>
                              <SelectItem value="high">Alta (Pico)</SelectItem>
                              <SelectItem value="low">Baixa</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">Demanda Prevista ({period}d)</p>
                            <p className="text-2xl font-black text-accent">{demand.predicted_demand} <span className="text-xs font-normal text-muted-foreground">{product.unit}</span></p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="secondary" className="bg-accent/10 text-accent border-accent/20 text-[10px] flex gap-1 items-center">
                              <Zap className="h-2 w-2" /> {Math.round(demand.confidence_score * 100)}% Confiança
                            </Badge>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="h-3 w-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[200px] text-[10px]">
                                  {demand.reasoning}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>

                        <DemandProjectionChart predictedDemand={demand.predicted_demand} unit={product.unit} periodDays={period} />

                        <p className="text-[10px] text-muted-foreground leading-tight bg-accent/10 p-2 rounded border border-accent/10 italic">
                          "{demand.reasoning}"
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="logistics" className="space-y-4 mt-4">
                {demandError && <p role="note" className="text-xs text-muted-foreground">{demandError} Reposição preditiva e EOQ não disponíveis.</p>}
                {demand && (
                  <div className="space-y-4">
                    <div className="p-4 border border-accent/20 bg-accent/5 rounded-lg space-y-4">
                      <div className="flex items-center gap-2">
                        <BrainCircuit className="h-4 w-4 text-accent" />
                        <p className="text-xs font-bold uppercase text-accent">Inteligência de Ressuprimento</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold">Sugestão de Compra</p>
                          <p className="text-2xl font-black text-accent">
                            {Math.max(0, demand.predicted_demand - product.availableQty)} <span className="text-sm font-normal">{product.unit}</span>
                          </p>
                          <div className="flex items-center gap-1">
                            <Progress value={Math.min(100, (product.availableQty / demand.predicted_demand) * 100)} className="h-1.5 w-full bg-accent/10" />
                          </div>
                          <p className="text-[9px] text-muted-foreground">Baseado no déficit projetado</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold">Cobertura de Estoque</p>
                          <p className="text-2xl font-black">
                            {Math.round((product.availableQty / (demand.predicted_demand / 30)) || 0)} <span className="text-sm font-normal">dias</span>
                          </p>
                          <Badge variant="outline" className="text-[8px] h-4 px-1 border-accent/30 text-accent bg-accent/5">Fase 5 - Predictive</Badge>
                          <p className="text-[9px] text-muted-foreground">Atendimento da demanda atual</p>
                        </div>
                      </div>
                      
                      <div className="pt-3 border-t border-accent/10 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[9px] text-muted-foreground uppercase">Ponto de Pedido IA</p>
                          <p className="text-sm font-bold">{Math.round(demand.predicted_demand * 0.3)} {product.unit}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground uppercase">Lote Econômico (EOQ)</p>
                          <p className="text-sm font-bold text-success">{Math.round(demand.predicted_demand * 0.5)} {product.unit}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="logistics" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Parâmetros de Estoque</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 border rounded-lg">
                      <p className="text-[10px] text-muted-foreground">Estoque Mínimo</p>
                      <p className="font-bold">{product.minStock} {product.unit}</p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <p className="text-[10px] text-muted-foreground">Estoque Máximo</p>
                      <p className="font-bold">{product.maxStock} {product.unit}</p>
                    </div>
                  </div>
                </div>

                {product.availableQty <= product.minStock && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs">
                    <AlertTriangle className="h-4 w-4" />
                    Atenção: Produto abaixo do estoque mínimo de segurança.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="costs" className="space-y-4 mt-4">
                {costData ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 border rounded-lg bg-muted/30">
                        <p className="text-[10px] text-muted-foreground">Matéria Prima</p>
                        <p className="font-bold">{formatBRL(costData.raw_material_cost)}</p>
                      </div>
                      <div className="p-3 border rounded-lg bg-muted/30">
                        <p className="text-[10px] text-muted-foreground">Mão de Obra</p>
                        <p className="font-bold">{formatBRL(costData.labor_cost)}</p>
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg space-y-2">
                      <div className="flex justify-between font-bold">
                        <span>Custo Total:</span>
                        <span>{formatBRL(costData.total_cost)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Tempo de Produção:</span>
                        <span>{costData.production_time_minutes} min</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                    <DollarSign className="mx-auto h-8 w-8 mb-2 opacity-20" />
                    <p className="text-sm">Custos de produção não configurados para este SKU.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Últimas Movimentações</p>
                    <Badge variant="secondary" className="text-[10px]">Realtime</Badge>
                  </div>
                  <ScrollArea className="h-[300px] w-full pr-4">
                    <div className="space-y-3">
                      {/* Mock de histórico ou integração com ledger se disponível */}
                      <div className="p-3 border rounded-lg text-xs space-y-1">
                        <div className="flex justify-between font-bold">
                          <span>Última Movimentação</span>
                          <span className="text-muted-foreground font-normal">{formatDate(product.lastMovement || new Date().toISOString())}</span>
                        </div>
                        <p className="text-muted-foreground">Registro automático de alteração de saldo/status no WMS.</p>
                      </div>
                      <div className="flex items-center justify-center py-8 text-muted-foreground italic text-xs">
                        <History className="h-3 w-3 mr-1" />
                        Histórico completo disponível no Ledger Logístico
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
