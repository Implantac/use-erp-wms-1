import { useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { 
  Package, Truck, Factory, Store, ArrowRightLeft, 
  Upload, AlertTriangle, ClipboardList, Plus, 
  CheckCircle2, Clock, ChevronRight, Zap, History,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { useSupplyChain } from '@/hooks/operational/supply-chain/useSupplyChain';
import { SUPPLY_CHAIN_STATUS_ORDER } from '@/lib/supplyChainStatus';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import { cn } from '@/lib/utils';
import { MovementLedger } from './components/MovementLedger';
import { NewTransferDialog } from '@/modules/wms/TransferenciasCanal';

const STATUS_MAP: Record<string, { label: string, color: string, icon: LucideIcon }> = {
  requested: { label: 'Solicitado', color: 'bg-blue-500/10 text-blue-500', icon: Clock },
  approved: { label: 'Aprovado', color: 'bg-cyan-500/10 text-cyan-500', icon: CheckCircle2 },
  picking: { label: 'Em Separação', color: 'bg-amber-500/10 text-amber-500', icon: Package },
  picked: { label: 'Separado', color: 'bg-indigo-500/10 text-indigo-500', icon: Package },
  shipped: { label: 'Expedido', color: 'bg-orange-500/10 text-orange-500', icon: Upload },
  in_transit: { label: 'Em Trânsito', color: 'bg-purple-500/10 text-purple-500', icon: Truck },
  received: { label: 'Recebido', color: 'bg-emerald-500/10 text-emerald-500', icon: CheckCircle2 },
  checked: { label: 'Conferido', color: 'bg-teal-500/10 text-teal-500', icon: CheckCircle2 },
  completed: { label: 'Finalizado', color: 'bg-slate-500/10 text-slate-500', icon: CheckCircle2 },
  divergent: { label: 'Divergente', color: 'bg-red-500/10 text-red-500', icon: AlertTriangle },
};

export default function UnifiedSupplyChain() {
  const { branch: currentBranch, isLoading: isEnterpriseLoading } = useActiveTenant();
  const { movements, isLoading: isSupplyLoading } = useSupplyChain();
  
  const isLoading = isEnterpriseLoading || isSupplyLoading;
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);

  const unitType = (currentBranch as { tipo?: string } | null)?.tipo?.toLowerCase() || 'store';

  // Status progression is blocked until server-side transition and role checks are homologated.
  const statusOrder = SUPPLY_CHAIN_STATUS_ORDER;

  return (
    <PageContainer loading={isLoading}>
      <div className="space-y-6 pb-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
              {unitType === 'factory' && <Factory className="h-8 w-8 text-primary" />}
              {unitType === 'warehouse' && <Package className="h-8 w-8 text-primary" />}
              {unitType === 'store' && <Store className="h-8 w-8 text-primary" />}
              Central de Abastecimento
            </h1>
            <p className="text-muted-foreground font-medium">
              Malha Logística: {currentBranch?.name || '---'} ({unitType.toUpperCase()})
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              className="gap-2 font-bold uppercase text-xs"
              onClick={() => setIsTransferDialogOpen(true)}
            >
              <Plus className="h-4 w-4" /> Nova Solicitação
            </Button>
            <NewTransferDialog 
              open={isTransferDialogOpen} 
              onOpenChange={setIsTransferDialogOpen}
              trigger={null} 
            />
            
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Solicitações" value={movements.filter(m => m.status === 'requested').length} icon={ClipboardList} color="blue" />
          <StatCard title="Em Operação" value={movements.filter(m => ['picking', 'shipped'].includes(m.status)).length} icon={Zap} color="orange" />
          <StatCard title="Em Trânsito" value={movements.filter(m => m.status === 'in_transit').length} icon={Truck} color="purple" />
          <StatCard title="Divergências" value={movements.filter(m => m.status === 'divergent').length} icon={AlertTriangle} color="red" />
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3 md:w-[500px]">
            <TabsTrigger value="all" className="font-bold uppercase text-[10px]">Todas</TabsTrigger>
            <TabsTrigger value="inbound" className="font-bold uppercase text-[10px]">Entradas</TabsTrigger>
            <TabsTrigger value="outbound" className="font-bold uppercase text-[10px]">Saídas</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-primary" /> Fluxo de Movimentação
                </CardTitle>
                <Badge variant="outline" className="text-[10px] uppercase font-bold">Total: {movements.length}</Badge>
              </CardHeader>
              <CardContent>
                <p role="note" className="mb-4 text-sm text-muted-foreground">Avanço de etapa indisponível nesta tela: políticas de autorização, efeitos de estoque e transições ainda exigem validação no servidor.</p>
                <div className="space-y-4">
                  {movements.length === 0 ? (
                    <EmptyState 
                      title="Nenhuma movimentação registrada"
                      description="A malha logística está sem solicitações ativas no momento. Crie uma nova transferência para iniciar o fluxo."
                      action={{ label: "Nova Solicitação", onClick: () => setIsTransferDialogOpen(true) }}
                    />
                  ) : (
                    movements.map(m => (
                      <div key={m.id} className="group border rounded-xl p-4 hover:border-primary/50 transition-all bg-card shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className={cn("p-3 rounded-full", STATUS_MAP[m.status]?.color)}>
                              {(() => {
                                const Icon = STATUS_MAP[m.status]?.icon || Package;
                                return <Icon className="h-5 w-5" />;
                              })()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-black text-xs uppercase text-muted-foreground">{m.origin_type}</span>
                                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                <span className="font-black text-xs uppercase text-muted-foreground">{m.destination_type}</span>
                              </div>
                              <h3 className="font-bold text-sm">Transferência #{m.id.split('-')[0].toUpperCase()}</h3>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase mt-1">
                                {m.items_count} Itens • Prioridade: {m.priority}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 justify-end">
                            <Badge className={cn("text-[9px] font-black uppercase px-2 py-0.5", STATUS_MAP[m.status]?.color)}>
                              {STATUS_MAP[m.status]?.label || m.status}
                            </Badge>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className={cn(
                                "h-8 w-8 p-0 rounded-full",
                                selectedMovement === m.id ? "bg-primary text-primary-foreground" : ""
                              )}
                              onClick={() => setSelectedMovement(selectedMovement === m.id ? null : m.id)}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="secondary" disabled title="Transições indisponíveis até autorização e validação no servidor">
                              Transição indisponível
                            </Button>

                          </div>
                        </div>

                        {selectedMovement === m.id && (
                          <div className="mt-4 pt-4 border-t animate-in slide-in-from-top-2 duration-300">
                            <MovementLedger movementId={m.id} />
                          </div>
                        )}
                        
                        {/* Status Lifecycle Indicator */}
                        <div className="mt-4 flex items-center gap-1 w-full opacity-60">
                          {statusOrder.map((status, idx) => {
                            const currentIdx = statusOrder.indexOf(m.status);
                            return (
                              <div key={status} className="flex items-center gap-1 flex-1">
                                <div className={cn('h-1.5 flex-1 rounded-full transition-colors', idx <= currentIdx ? 'bg-primary' : 'bg-muted')} />
                              </div>
                            );
                          })}
                        </div>

                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: LucideIcon; color: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-500 bg-blue-500/5 border-blue-500/20',
    orange: 'text-orange-500 bg-orange-500/5 border-orange-500/20',
    purple: 'text-purple-500 bg-purple-500/5 border-purple-500/20',
    emerald: 'text-emerald-500 bg-emerald-500/5 border-emerald-500/20',
    red: 'text-red-500 bg-red-500/5 border-red-500/20',
  };

  return (
    <Card className={cn("border transition-all hover:shadow-md", colors[color])}>
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase opacity-60 mb-1">{title}</p>
          <p className="text-3xl font-black">{value}</p>
        </div>
        <div className="p-3 rounded-xl bg-background/50 backdrop-blur-sm border shadow-inner">
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}