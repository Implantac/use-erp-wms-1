import { PageContainer } from "@/shared/components/PageContainer";
import { PageHeader } from "@/shared/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/ui/base/card";
import { Badge } from "@/ui/base/badge";
import { Button } from "@/ui/base/button";
import { Progress } from "@/ui/base/progress";
import { useStoreCentral } from "@/hooks/operational/store/useStoreCentral";
import { useSupplyChainExecution } from "@/hooks/operational/network/useSupplyChainExecution";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/base/tabs";
import { 
  Store, 
  TrendingUp, 
  Package, 
  AlertTriangle, 
  Truck, 
  RefreshCw, 
  ChevronRight, 
  CheckCircle2, 
  Heart,
  ShieldCheck,
  DollarSign,
  Ticket,
  Clock,
  ArrowRight,
  ClipboardList,
  ListTodo,
  ArrowUpCircle,
  PlayCircle,
  TruckIcon,
  CheckCircle,
  XCircle,
  LayoutGrid,
  FileText,
  Lightbulb,
  Map as MapIcon
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Skeleton } from "@/ui/base/skeleton";
import { useEnterprise } from "@/core/auth/EnterpriseContext";
import { NetworkMap } from "./components/NetworkMap";
import { PrescriptiveAlert } from "./components/PrescriptiveAlert";
import { ReplenishmentPanel } from "./components/ReplenishmentPanel";
import { DailyQueuePanel } from "./components/DailyQueuePanel";
import { SupplyAnalysisPanel, MySupplyRequestsPanel, ReplenishmentAlertsPanel } from "@/modules/store-operations/components/SupplyPanels";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/base/dialog";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createSupplyRequest } from "@/services/operational/store/supplyService";
import { useSupplyAccess } from "@/hooks/operational/store/useSupplyAccess";


export default function StoreCentral() {
  const { kpis, alerts, health, reliability, isLoading, refetch } = useStoreCentral();
  const { tasks, inTransit, isLoading: isLoadingExecution, isProcessing, transition } = useSupplyChainExecution();
  const { currentBranch } = useEnterprise();
  const supplyAccess = useSupplyAccess();
  const { currentCompany } = useEnterprise();
  const [receiving, setReceiving] = useState<any | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [reqProduct, setReqProduct] = useState('');
  const [reqQty, setReqQty] = useState('');
  const [reqNotes, setReqNotes] = useState('');
  const [reqSaving, setReqSaving] = useState(false);
  const storeProductsQuery = useQuery({
    queryKey: ['store-products', currentCompany?.id],
    enabled: !!currentCompany?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('products').select('id, code, name, unit')
        .eq('company_id', currentCompany!.id).order('name').limit(500);
      if (error) throw error;
      return (data || []) as Array<{ id: string; code: string; name: string; unit: string | null }>;
    },
  });
  const handleManualRequest = async () => {
    const qty = Number(reqQty);
    if (!currentBranch?.id || !reqProduct || !(qty > 0)) {
      toast.error('Escolha o produto e a quantidade para solicitar');
      return;
    }
    setReqSaving(true);
    try {
      await createSupplyRequest(currentBranch.id, reqProduct, qty);
      toast.success('Solicitação enviada — a Fábrica vai analisar a melhor origem (Fábrica × CD × outra Loja).');
      setReqQty(''); setReqNotes('');
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao solicitar');
    } finally {
      setReqSaving(false);
    }
  };
  const openReceive = (order: any) => {
    const initial: Record<string, string> = {};
    for (const item of order.items || []) {
      initial[item.id] = String(item.shipped_qty ?? item.requested_qty ?? 0);
    }
    setReceiveQty(initial);
    setReceiving(order);
  };
  const handleReceive = async () => {
    if (!receiving) return;
    try {
      await transition({
        transferId: receiving.id,
        toStatus: 'RECEBIDA',
        itemQuantities: (receiving.items || []).map((item: any) => ({
          itemId: item.id,
          quantity: Number(receiveQty[item.id] ?? item.shipped_qty ?? item.requested_qty ?? 0),
        })),
        notes: 'Recebimento na Central da Loja',
      });
      toast.success('Recebimento registrado — saldo da Loja atualizado pelo fluxo oficial.');
      setReceiving(null);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao receber');
    }
  };



  if (isLoading) {
    return (
      <PageContainer loading>
        <div className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="mb-6 space-y-1">
        <h1 className="text-3xl font-black tracking-tighter">MINHA LOJA</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Store className="h-4 w-4" />
          <span className="text-sm font-bold uppercase tracking-wider">{currentBranch?.name || "CARREGANDO UNIDADE..."}</span>
        </div>
      </div>

      <PageHeader 
        title={`Bom dia, ${currentBranch?.name?.split(' ')[0] || 'Gestor'}.`}
        description="Aqui está o que precisa da sua atenção hoje."
        icon={Heart}
      >
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn(
            "border-success/20 font-bold",
            health?.status === 'excellent' ? "bg-success/10 text-success" : 
            health?.status === 'attention' ? "bg-amber-500/10 text-amber-500" : 
            "bg-destructive/10 text-destructive"
          )}>
            Estado: {health?.status === 'excellent' ? '🟢 Normal' : health?.status === 'attention' ? '🟡 Atenção' : '🔴 Crítica'}
          </Badge>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
            <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} /> Atualizar
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lado Esquerdo: Resumo e KPIs */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Dashboard Superior */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard 
              title="Vendas Hoje" 
              value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpis?.sales || 0)} 
              icon={DollarSign}
              trend="+12%"
              variant="default"
            />
            <KPICard 
              title="Ticket Médio" 
              value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpis?.ticketAverage || 0)} 
              icon={Ticket}
              trend="+5%"
              variant="default"
            />
            <KPICard 
              title="Estoque" 
              value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((kpis?.stockValue || 0) / 1000) + ' mil'} 
              icon={Package}
              variant="info"
            />
            <KPICard 
              title="Rupturas" 
              value={kpis?.ruptures || 0} 
              icon={AlertTriangle}
              variant={ (kpis?.ruptures || 0) > 0 ? "warning" : "success" }
            />
          </div>

          {/* Camada Prescritiva (Minha Loja 2.0) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <PrescriptiveAlert />
             <Card className="bg-primary/5 border-primary/20">
               <CardHeader className="pb-2">
                 <CardTitle className="text-sm font-bold flex items-center gap-2">
                   <Lightbulb className="h-4 w-4 text-primary" /> Ações Sugeridas
                 </CardTitle>
               </CardHeader>
               <CardContent className="p-0">
                  <div className="divide-y divide-primary/10">
                    <Button variant="ghost" className="w-full justify-start text-xs h-10 gap-2 rounded-none px-4" asChild>
                      <Link to="/operacional/loja/operacao">
                        <Package className="h-3 w-3" /> Receber Mercadoria ({kpis?.receiving || 0})
                      </Link>
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-xs h-10 gap-2 rounded-none px-4" asChild>
                      <Link to="/operacional/rede/ressuprimento">
                        <RefreshCw className="h-3 w-3" /> Solicitar Abastecimento
                      </Link>
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-xs h-10 gap-2 rounded-none px-4" asChild>
                      <Link to="/operacional/abastecimento/central">
                        <Truck className="h-3 w-3" /> Transferir Produto
                      </Link>
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-xs h-10 gap-2 rounded-none px-4" asChild>
                      <Link to="/operacional/loja/operacao">
                        <ClipboardList className="h-3 w-3" /> Iniciar Inventário
                      </Link>
                    </Button>
                  </div>
               </CardContent>
             </Card>
          </div>

          <DailyQueuePanel branchId={currentBranch?.id} />

          {/* Central de Operação Unificada */}
          <Tabs defaultValue="reposicao" className="w-full">
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 mb-4">
              <TabsTrigger value="reposicao" className="gap-2 font-bold">
                <RefreshCw className="h-4 w-4" /> Reposição
              </TabsTrigger>
              <TabsTrigger value="alertas" className="gap-2">
                <AlertTriangle className="h-4 w-4" /> Alertas
              </TabsTrigger>
              <TabsTrigger value="tarefas" className="gap-2">
                <ListTodo className="h-4 w-4" /> Tarefas
                {tasks.length > 0 && <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]">{tasks.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="transito" className="gap-2">
                <Truck className="h-4 w-4" /> Trânsito
                {inTransit.length > 0 && <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]">{inTransit.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="fiscal" className="gap-2">
                <FileText className="h-4 w-4" /> Fiscal
                {inTransit.length > 0 && <Badge variant="outline" className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px] bg-orange-500/10 text-orange-500 border-orange-500/20">!</Badge>}
              </TabsTrigger>
              <TabsTrigger value="novo" className="gap-2 text-primary font-bold">
                <ArrowUpCircle className="h-4 w-4" /> Solicitar
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reposicao">
              <div className="space-y-6">
                <ReplenishmentPanel />
                <MySupplyRequestsPanel branchId={currentBranch?.id} />
                {supplyAccess.canManage ? <SupplyAnalysisPanel /> : null}
              </div>
            </TabsContent>


            <TabsContent value="alertas">
              <Card className="border-primary/20 shadow-elevation-2">
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Exceções & Prioridades (Orquestradas)</CardTitle>
                      <CardDescription>Pendências críticas que exigem ação imediata (P3 - Minha Loja)</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/5 animate-pulse">
                        {alerts?.filter(a => a.type === 'critical').length} Críticos
                      </Badge>
                      <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5">
                        EOE Intelligence
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {isLoading ? (
                      <div className="p-8 text-center">
                        <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" />
                        <p className="text-xs text-muted-foreground mt-2">Carregando tarefas críticas...</p>
                      </div>
                    ) : alerts?.length > 0 ? (
                      alerts.map((alert) => (
                        <div key={alert.id} className="p-4 flex items-start gap-4 hover:bg-muted/50 transition-colors group relative overflow-hidden">
                          {alert.type === 'critical' && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-destructive animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                          )}
                          <div className={cn(
                            "p-2 rounded-full ring-1 ring-inset relative z-10",
                            alert.type === 'critical' ? "bg-destructive/10 text-destructive ring-destructive/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]" : 
                            alert.type === 'warning' ? "bg-warning/10 text-warning ring-warning/20" : "bg-primary/10 text-primary ring-primary/20"
                          )}>
                            {alert.category === 'rupture' && <AlertTriangle className="h-5 w-5" />}
                            {alert.category === 'receiving' && <Package className="h-5 w-5" />}
                            {alert.category === 'transfer' && <Truck className="h-5 w-5" />}
                            {alert.category === 'cashier' && <DollarSign className="h-5 w-5" />}
                            {alert.category === 'replenishment' && <RefreshCw className="h-5 w-5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-bold text-sm">{alert.title}</p>
                              {alert.actionPath && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                                  <Link to={alert.actionPath}>
                                    {alert.actionLabel || 'Tratar'} <ChevronRight className="h-3 w-3" />
                                  </Link>
                                </Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        <p className="sm:text-sm text-xs">Nenhuma pendência crítica encontrada.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tarefas">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ListTodo className="h-5 w-5 text-primary" /> Fila de Execução Operacional
                  </CardTitle>
                  <CardDescription>Ações logísticas aguardando processamento nesta unidade</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {tasks.length > 0 ? (
                      tasks.map((task: any) => {
                        const isOrigin = task.origin_unit_id === currentBranch?.id;
                        const status = task.current_status;
                        
                        // Determinar ações possíveis com base no status e se é origem ou destino
                        let nextAction = null;
                        if (isOrigin) {
                          if (status === 'SUGERIDA') nextAction = { label: 'Aprovar', status: 'APROVADA', icon: CheckCircle };
                          else if (status === 'APROVADA') nextAction = { label: 'Alocar', status: 'RESERVADA', icon: LayoutGrid };
                          else if (status === 'RESERVADA') nextAction = { label: 'Separar', status: 'SEPARAÇÃO', icon: Package };
                          else if (status === 'SEPARAÇÃO') nextAction = { label: 'Expedir', status: 'EM TRÂNSITO', icon: TruckIcon };
                        } else {
                          if (status === 'EM TRÂNSITO') nextAction = { label: 'Receber', status: 'RECEBIDA', icon: ArrowUpCircle };
                          else if (status === 'RECEBIDA') nextAction = { label: 'Concluir', status: 'ENCERRADA', icon: CheckCircle };
                        }

                        return (
                          <div key={task.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-muted/30 transition-colors gap-4">
                            <div className="flex items-center gap-4">
                              <div className="p-2 rounded bg-primary/10 text-primary">
                                {status === 'SEPARAÇÃO' ? <Package className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold">TRF-{task.id.split('-')[0].toUpperCase()}</p>
                                  <Badge variant="outline" className="text-[9px] h-4 py-0">{status}</Badge>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                  <span className={cn(isOrigin && "font-bold text-primary")}>{task.origin?.name}</span>
                                  <ArrowRight className="h-2 w-2" />
                                  <span className={cn(!isOrigin && "font-bold text-primary")}>{task.destination?.name}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {nextAction && (
                                <Button 
                                  size="sm" 
                                  className="h-8 text-xs gap-1.5"
                                  disabled={isProcessing}
                                  onClick={() => transition({ transferId: task.id, toStatus: nextAction.status })}
                                >
                                  {<nextAction.icon className="h-3.5 w-3.5" />}
                                  {nextAction.label}
                                </Button>
                              )}
                              <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                                <Link to={`/logistica/transferencias?id=${task.id}`}>Detalhes</Link>
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-12 text-center text-muted-foreground">
                        <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">Sem tarefas pendentes para hoje.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>


            <TabsContent value="transito">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Truck className="h-5 w-5 text-violet-500" /> Carga em Trânsito para esta Loja
                  </CardTitle>
                  <CardDescription>Acompanhe o que está a caminho e planeje o recebimento</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {inTransit.length > 0 ? (
                      inTransit.map((order: any) => (
                        <div key={order.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="p-2 rounded bg-violet-500/10 text-violet-500">
                              <Package className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold">TRF-{order.id.split('-')[0].toUpperCase()}</p>
                              <p className="text-[10px] text-muted-foreground">Origem: {order.origin?.name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge className="bg-violet-500 text-[10px] mb-1">EM TRÂNSITO</Badge>
                            <p className="text-[10px] text-muted-foreground">Previsão: Hoje</p>
                            <Button size="sm" className="mt-2" onClick={() => openReceive(order)}>Receber mercadoria</Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-12 text-center text-muted-foreground">
                        <Clock className="h-10 w-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">Nenhuma carga em trânsito no momento.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="novo">
              <div className="space-y-6">
              <Card className="border-primary/40 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ArrowUpCircle className="h-5 w-5 text-primary" /> Nova Solicitação de Abastecimento
                  </CardTitle>
                  <CardDescription>Solicite aqui mesmo — sem sair desta tela. A origem é decidida pela Fábrica.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
                    <div className="space-y-1">
                      <Label>Produto</Label>
                      <Select value={reqProduct} onValueChange={setReqProduct}>
                        <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                        <SelectContent>
                          {(storeProductsQuery.data || []).map((prod) => (
                            <SelectItem key={prod.id} value={prod.id}>{prod.code} — {prod.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Quantidade</Label>
                      <Input type="number" min="0" step="0.0001" value={reqQty} onChange={(e) => setReqQty(e.target.value)} placeholder="Ex.: 20" />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={() => void handleManualRequest()} disabled={reqSaving || !currentBranch?.id}>
                        {reqSaving ? 'Enviando…' : 'Solicitar abastecimento'}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Você não escolhe a origem: a solicitação cai na caixa de entrada da Fábrica, que analisa os saldos (Fábrica × CD × outra Loja) e decide. Acompanhe na aba Reposição, em “Minhas solicitações”.</p>
                </CardContent>
              </Card>
              <ReplenishmentAlertsPanel branchId={currentBranch?.id} />
              </div>
</TabsContent>

            <TabsContent value="fiscal">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-orange-500" /> Documentos Fiscais Pendentes
                  </CardTitle>
                  <CardDescription>NF-es de transferências em trânsito aguardando conferência</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {inTransit.length > 0 ? (
                      inTransit.map((order: any) => (
                        <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg bg-orange-500/5 border-orange-500/20 group hover:bg-orange-500/10 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded bg-orange-500/10 text-orange-500 ring-1 ring-orange-500/20 shadow-[0_0_10px_rgba(249,115,22,0.1)]">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-orange-600">NF-e aguardando conferência</p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                                <span className="font-mono uppercase">TRF-{order.id.split('-')[0]}</span>
                                <span>•</span>
                                <span className="opacity-70">Rastreio: {order.correlation_id?.split('-')[0]}</span>
                              </p>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to="/fiscal/nfe">Ver Documento</Link>
                          </Button>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground italic text-sm">
                        Nenhum documento fiscal pendente para as cargas atuais.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
      <Dialog open={!!receiving} onOpenChange={(open) => { if (!open) setReceiving(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Receber mercadoria — conferência</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Confira item a item. Se receber menos que o expedido, o sistema registra <strong>divergência</strong> automaticamente e o saldo da Loja sobe só o recebido.</p>
            {(receiving?.items || []).map((item: any) => (
              <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border p-2">
                <div>
                  <p className="text-sm font-medium">{item.product?.code ? `${item.product.code} — ` : ''}{item.product?.name || 'Produto'}</p>
                  <p className="text-xs text-muted-foreground">Expedido: {item.shipped_qty ?? item.requested_qty} · Pedido: {item.requested_qty}</p>
                </div>
                <div className="w-28">
                  <Label className="text-xs">Recebido</Label>
                  <Input type="number" min="0" step="0.0001" value={receiveQty[item.id] ?? ''}
                    onChange={(e) => setReceiveQty((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReceiving(null)}>Cancelar</Button>
              <Button onClick={() => void handleReceive()} disabled={isProcessing}>Confirmar recebimento</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>





          {/* Seção Operacional Secundária - Ações Rápidas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="hover:border-primary/40 transition-colors">
              <CardHeader>
                <CardTitle className="text-md flex items-center gap-2">
                  <Truck className="h-4 w-4" /> Centro de Recebimento
                </CardTitle>
                <CardDescription>Conferência de mercadorias e ajuste de divergências</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-accent/30">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded bg-primary/10 text-primary">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{inTransit.length} Cargas Pendentes</p>
                      <p className="text-[10px] text-muted-foreground">Acompanhamento em tempo real</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="text-[10px] h-7" asChild>
                    <Link to="/operacional/abastecimento/central">Rastrear</Link>
                  </Button>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-accent/30">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded bg-success/10 text-success">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">Conferência Cega</p>
                      <p className="text-[10px] text-muted-foreground">Validar itens recebidos</p>
                    </div>
                  </div>
                  <Button variant="default" size="sm" className="text-[10px] h-7" asChild>
                    <Link to="/operacional/abastecimento/central">Iniciar</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:border-primary/40 transition-colors">
              <CardHeader>
                <CardTitle className="text-md flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" /> Sugestão de Abastecimento
                </CardTitle>
                <CardDescription>Reposição baseada em demanda e cobertura</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Solicitações Ativas</span>
                    <span className="font-bold">{kpis?.itemsPending || 0} SKUs</span>
                  </div>
                  <div className={cn(
                    "flex items-center justify-between text-sm font-medium p-2 rounded",
                    (kpis?.unitsPending || 0) > 0 ? "text-destructive bg-destructive/5" : "text-success bg-success/5"
                  )}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      { (kpis?.unitsPending || 0) > 0 ? "Risco de Ruptura Detectado" : "Nível de Estoque Seguro" }
                    </div>
                    <span>{kpis?.unitsPending || 0} un</span>
                  </div>
                  <Button className="w-full gap-2 mt-2" asChild>
                    <Link to="/operacional/rede/ressuprimento">
                      Analisar Sugestão <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>

        {/* Lado Direito: Saúde e Índices */}
        <div className="space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-md flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" /> Saúde Operacional
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center py-4">
                <div className="text-4xl font-black text-primary">{health?.score}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Score Total</div>
                <Badge className={cn(
                  "mt-2 text-white",
                  health?.status === 'excellent' ? "bg-success hover:bg-success/90" : 
                  health?.status === 'attention' ? "bg-amber-500 hover:bg-amber-600" : 
                  "bg-destructive hover:bg-destructive/90"
                )}>
                  {health?.status === 'excellent' ? 'Excelente' : 
                   health?.status === 'attention' ? 'Atenção' : 'Crítico'}
                </Badge>
              </div>
              <div className="space-y-3">
                {health?.factors.map((factor) => (
                  <div key={factor.label} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-medium">
                      <span>{factor.label}</span>
                      <span>{factor.score}%</span>
                    </div>
                    <Progress value={factor.score} className="h-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-md flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-success" /> Acuracidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{reliability}%</div>
              <p className="text-[10px] text-muted-foreground mt-1">Confiabilidade do estoque baseada em inventários cíclicos.</p>
              <div className="mt-4 pt-4 border-t space-y-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Ranking Eficiência</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Posição na Rede</span>
                  <span className="font-bold text-primary">{health?.networkPosition || '—'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <NetworkMap />

          <Card className="border-dashed border-primary/40 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-black uppercase text-primary/70">Auditoria Cíclica (Smart)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <ClipboardList className="h-4 w-4" />
                <span className="text-sm font-bold">12 SKUs Críticos</span>
              </div>
              <p className="text-[10px] text-muted-foreground">O motor de inteligência selecionou itens de alto giro e risco de ruptura para conferência hoje.</p>
              <Button variant="default" size="sm" className="w-full text-xs font-bold shadow-sm" asChild>
                <Link to="/operacional/loja/operacao">Iniciar Contagem Cíclica</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function KPICard({ title, value, icon: Icon, trend, variant = 'default' }: { 
  title: string, 
  value: string | number, 
  icon: any, 
  trend?: string,
  variant?: 'default' | 'info' | 'warning' | 'success'
}) {
  return (
    <Card className={cn(
      "border-border/50",
      variant === 'info' && "bg-info/5 border-info/20",
      variant === 'warning' && "bg-warning/5 border-warning/20",
      variant === 'success' && "bg-success/5 border-success/20",
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-xl font-bold">{value}</p>
            {trend && (
              <p className="text-[10px] font-bold text-success">{trend} <TrendingUp className="inline h-2 w-2" /></p>
            )}
          </div>
          <Icon className={cn(
            "h-4 w-4",
            variant === 'default' && "text-muted-foreground",
            variant === 'info' && "text-info",
            variant === 'warning' && "text-warning",
            variant === 'success' && "text-success",
          )} />
        </div>
      </CardContent>
    </Card>
  );
}
