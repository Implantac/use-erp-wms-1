import { useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Separator } from '@/ui/base/separator';
import { 
  Download, 
  Upload, 
  RefreshCcw, 
  Package, 
  AlertTriangle, 
  Ban, 
  ChevronRight,
  Plus,
  ArrowRightLeft,
  Search,
  Truck,
  Clock,
  CheckCircle2,
  Filter
} from 'lucide-react';
import { useStoreCentral } from '@/hooks/operational/store/useStoreCentral';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { cn } from '@/lib/utils';
import { ReceivingDialog } from './components/ReceivingDialog';
import { GroupRequestsPanel } from './components/GroupRequestsPanel';
import { ReplenishmentAlertsPanel, SupplyAnalysisPanel } from './components/SupplyPanels';
import { useSupplyAccess } from '@/hooks/operational/store/useSupplyAccess';
import { StoreTransfersPanel } from './components/StoreTransfersPanel'
import { StoreReceivingTab, StoreTransfersTab, StoreStockTab, StoreOccurrencesTab } from './components/StoreTabsPanels';
import { RequestDialog } from './components/RequestDialog';
import { LossDialog } from './components/LossDialog';
import { InventoryDialog } from './components/InventoryDialog';

export default function StoreOperations() {
  const { currentBranch } = useEnterprise();
  const supplyAccess = useSupplyAccess();
  const { kpis, alerts, health, isLoading } = useStoreCentral();
  const [activeTab, setActiveTab] = useState<'resumo' | 'abastecimento' | 'solicitacoes' | 'recebimentos' | 'transferencias' | 'estoque' | 'ocorrencias'>('resumo');
  const [isReceivingOpen, setIsReceivingOpen] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isLossOpen, setIsLossOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);



  const mainActions = [
    { id: 'receive', label: 'RECEBER MERCADORIA', icon: <Download className="h-6 w-6" />, color: 'bg-emerald-500', description: 'Conferir o que está chegando' },
    { id: 'request', label: 'SOLICITAR MERCADORIA', icon: <Upload className="h-6 w-6" />, color: 'bg-blue-500', description: 'Pedir reposição ao CD/Rede' },
    { id: 'transfer', label: 'TRANSFERIR', icon: <ArrowRightLeft className="h-6 w-6" />, color: 'bg-slate-500', description: 'Mover para outra filial' },
    { id: 'inventory', label: 'INVENTÁRIO', icon: <Package className="h-6 w-6" />, color: 'bg-purple-500', description: 'Contagem e acuracidade' },
    { id: 'divergence', label: 'DIVERGÊNCIA', icon: <AlertTriangle className="h-6 w-6" />, color: 'bg-amber-500', description: 'Tratar faltas e sobras' },
    { id: 'loss', label: 'PERDA / AVARIA', icon: <Ban className="h-6 w-6" />, color: 'bg-red-500', description: 'Registrar quebras e danos' },
  ];

  return (
    <PageContainer loading={isLoading}>
      <div className="space-y-6 pb-10">
        {/* Header com Contexto de Unidade */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-background border-b pb-4 sticky top-0 z-10 pt-2">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
              OPERAÇÃO DA LOJA 
              <Badge variant="outline" className="ml-2 font-mono text-lg border-primary text-primary">
                {currentBranch?.name || '---'}
              </Badge>
            </h1>
            <p className="text-muted-foreground font-medium">
              Hoje: {new Date().toLocaleDateString('pt-BR')} · Execução da unidade: receber, transferir, inventário e ocorrências desta Loja
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <RefreshCcw className="h-4 w-4" /> Atualizar Tudo
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setIsRequestOpen(true)}>
              <Plus className="h-4 w-4" /> Nova Operação
            </Button>
          </div>
        </div>

        {/* Grade de Ações Principais (Coração da Operação) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {mainActions.map((action) => (
            <button
              key={action.id}
              onClick={() => {
                if (action.id === 'receive') setIsReceivingOpen(true);
                if (action.id === 'request' || action.id === 'transfer') setIsRequestOpen(true);
                if (action.id === 'loss') setIsLossOpen(true);
                if (action.id === 'inventory') setIsInventoryOpen(true);
              }}
              className="group relative flex flex-col items-center justify-center p-4 rounded-xl border-2 border-transparent bg-muted/30 hover:bg-muted/50 hover:border-primary/20 transition-all text-center"
            >
              <div className={cn(
                "p-3 rounded-xl mb-2 text-white shadow-sm group-hover:scale-110 transition-transform",
                action.color
              )}>
                {action.icon}
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider mb-1">{action.label}</span>
              <span className="text-[9px] text-muted-foreground leading-tight hidden md:block">{action.description}</span>
            </button>
          ))}
        </div>

        {/* Tabs de Navegação Operacional */}
        <div className="flex border-b overflow-x-auto no-scrollbar gap-6">
          {['resumo', 'abastecimento', 'solicitacoes', 'recebimentos', 'transferencias', 'estoque', 'ocorrencias'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={cn(
                "pb-3 text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all relative",
                activeTab === tab 
                  ? "text-primary border-b-2 border-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'abastecimento' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <ReplenishmentAlertsPanel branchId={currentBranch?.id} />
            {supplyAccess.canManage ? <SupplyAnalysisPanel /> : null}
          </div>
        )}

        {activeTab === 'solicitacoes' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <GroupRequestsPanel />
          </div>
        )}

        {activeTab === 'recebimentos' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <StoreReceivingTab onReceive={() => setIsReceivingOpen(true)} />
          </div>
        )}

        {activeTab === 'transferencias' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <StoreTransfersTab />
          </div>
        )}

        {activeTab === 'estoque' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <StoreStockTab />
          </div>
        )}

        {activeTab === 'ocorrencias' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <StoreOccurrencesTab />
          </div>
        )}

        {activeTab === 'resumo' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* KPIs Rápidos */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-primary/10">
                <CardHeader className="p-4 pb-0">
                  <CardDescription className="text-[10px] font-black uppercase">Solicitações</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="text-2xl font-black">{kpis?.transfers || 0}</div>
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardHeader className="p-4 pb-0">
                  <CardDescription className="text-[10px] font-black uppercase">A Receber</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="text-2xl font-black">{kpis?.receiving || 0}</div>
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardHeader className="p-4 pb-0">
                  <CardDescription className="text-[10px] font-black uppercase">Em Trânsito</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="text-2xl font-black">{kpis?.inTransit || 0}</div>
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardHeader className="p-4 pb-0">
                  <CardDescription className="text-[10px] font-black uppercase">Pendências</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-1 text-red-500">
                  <div className="text-2xl font-black">{kpis?.itemsPending || 0}</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Alertas de Atenção */}
              <Card className="border-red-500/20 bg-red-500/5">
                <CardHeader className="p-4">
                  <CardTitle className="text-sm font-black uppercase flex items-center gap-2 text-red-500">
                    <AlertTriangle className="h-4 w-4" /> ATENÇÃO
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-red-500/20 shadow-sm">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold uppercase tracking-tight">Risco de Ruptura</p>
                    <p className="text-[10px] text-muted-foreground font-medium">{kpis?.ruptures || 0} produto(s) em nível crítico</p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      className="h-7 text-[10px] font-black px-3"
                      onClick={() => setIsRequestOpen(true)}
                    >
                      TRATAR
                    </Button>
                  </div>

                </CardContent>
              </Card>

              <StoreTransfersPanel onReceive={() => setIsReceivingOpen(true)} />
            </div>
          </div>
        )}
      </div>

      <ReceivingDialog 
        isOpen={isReceivingOpen} 
        onClose={() => setIsReceivingOpen(false)} 
      />
      <RequestDialog
        isOpen={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
      />
      <LossDialog 
        isOpen={isLossOpen}
        onClose={() => setIsLossOpen(false)}
      />
      <InventoryDialog 
        isOpen={isInventoryOpen}
        onClose={() => setIsInventoryOpen(false)}
      />
    </PageContainer>
  );
}
