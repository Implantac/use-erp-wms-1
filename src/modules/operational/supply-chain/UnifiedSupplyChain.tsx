import { useMemo, useRef, useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { 
  Package, Truck, Factory, Store, ArrowRightLeft, 
  Upload, AlertTriangle, ClipboardList, Plus, 
  CheckCircle2, Clock, ChevronRight, Zap, History, X,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { useSupplyChain } from '@/hooks/operational/supply-chain/useSupplyChain';
import { SUPPLY_CHAIN_STATUS_ORDER } from '@/lib/supplyChainStatus';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import { cn } from '@/lib/utils';
import { MovementLedger } from './components/MovementLedger';
import { FactoryInboxPanel } from '@/modules/wms/components/FactoryInboxPanel';
import { useSupplyAccess } from '@/hooks/operational/store/useSupplyAccess';
import { useSupplyChainExecution } from '@/hooks/operational/network/useSupplyChainExecution';
import { nextStatuses, type TransferStatus } from '@/services/operational/inventory/transferWorkflow';
import { TransferDetail } from './components/TransferDetail';
import { RomaneioPanel } from './components/RomaneioPanel';
import { useNavigate } from 'react-router-dom';

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
  const [scope, setScope] = useState<'unit' | 'group'>('group');
  const { movements, isLoading: isSupplyLoading, refresh } = useSupplyChain({ scope });
  const { transition, isProcessing } = useSupplyChainExecution();
  // Execucao (aprovar/separar/expedir) e do gestor do grupo; a Loja usa
  // esta tela apenas para acompanhar — os botoes de avanco somem para ela.
  const supplyAccess = useSupplyAccess();
  
  const isLoading = isEnterpriseLoading || isSupplyLoading;
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const navigate = useNavigate();

  const unitType = (currentBranch as { tipo?: string } | null)?.tipo?.toLowerCase() || 'store';

  const statusOrder = SUPPLY_CHAIN_STATUS_ORDER;
  // Avanço operacional DESTA central: até EM TRÂNSITO (origem executa).
  // Recebimento/conferência são da unidade destino (Central da Loja).
  const BOARD_ADVANCE: TransferStatus[] = ['APROVADA', 'RESERVADA', 'SEPARAÇÃO', 'CONFERÊNCIA', 'EXPEDIDA', 'EM TRÂNSITO'];
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const handleAdvance = async (movementId: string, toStatus: TransferStatus) => {
    setAdvancingId(movementId);
    try {
      await transition({ transferId: movementId, toStatus });
    } catch {
      // o hook ja mostra o erro (toast)
    } finally {
      setAdvancingId(null);
    }
  };

  // Cards de KPI clicaveis: filtram o Fluxo de Movimentacao abaixo e rolam
  // ate ele (acesso rapido do gestor as solicitacoes de cada etapa).
  type StatusCardFilter = 'requested' | 'operation' | 'transit' | 'divergent';
  const STATUS_FILTER_LABEL: Record<StatusCardFilter, string> = {
    requested: 'Solicitações',
    operation: 'Em Operação',
    transit: 'Em Trânsito',
    divergent: 'Divergências',
  };
  const [statusFilter, setStatusFilter] = useState<StatusCardFilter | null>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const visibleMovements = useMemo(() => {
    switch (statusFilter) {
      case 'requested': return movements.filter(m => m.status === 'requested');
      case 'operation': return movements.filter(m => ['picking', 'shipped'].includes(m.status));
      case 'transit': return movements.filter(m => m.status === 'in_transit');
      case 'divergent': return movements.filter(m => m.status === 'divergent');
      default: return movements;
    }
  }, [movements, statusFilter]);
  const handleCardClick = (key: StatusCardFilter) => {
    setStatusFilter(prev => (prev === key ? null : key));
    requestAnimationFrame(() => flowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

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
              Malha Logística: {currentBranch?.name || '---'} ({unitType.toUpperCase()}) — o dia do gestor em 3 passos: <strong>1</strong> decidir as solicitações, <strong>2</strong> expedir pelo romaneio, <strong>3</strong> acompanhar até a Loja receber
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              className="gap-2 font-bold uppercase text-xs"
              onClick={() => navigate('/operacional/loja/central')}
            >
              <Plus className="h-4 w-4" /> Nova Solicitação (Central da Loja)
            </Button>
            
          </div>
        </header>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Visão:</span>
          {(['group', 'unit'] as const).map((sc) => (
            <Button
              key={sc}
              size="sm"
              variant={scope === sc ? 'default' : 'outline'}
              className="h-7 text-[10px] font-black uppercase"
              onClick={() => setScope(sc)}
            >
              {sc === 'group' ? 'Grupo inteiro (malha)' : 'Minha unidade'}
            </Button>
          ))}
          <span className="text-[11px] text-muted-foreground">
            {scope === 'group'
              ? 'Indústria, CD e lojas do grupo — incluindo pedidos das lojas à fábrica.'
              : 'Somente transferências da unidade ativa.'}
          </span>
        </div>

        <div>
          <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
            Passo 1 · Solicitações das lojas — analisar e decidir
          </h2>
          <FactoryInboxPanel />
        </div>

        <div>
          <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
            Passo 2 · Expedição — agrupar por Loja e gerar o romaneio
          </h2>
          <RomaneioPanel movements={movements as any[]} canManage={supplyAccess.canManage} onChanged={refresh} />
        </div>

        <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Passo 3 · Acompanhamento da malha
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 -mt-2">
          <StatCard title="Solicitações" value={movements.filter(m => m.status === 'requested').length} icon={ClipboardList} color="blue" active={statusFilter === 'requested'} onClick={() => handleCardClick('requested')} />
          <StatCard title="Em Operação" value={movements.filter(m => ['picking', 'shipped'].includes(m.status)).length} icon={Zap} color="orange" active={statusFilter === 'operation'} onClick={() => handleCardClick('operation')} />
          <StatCard title="Em Trânsito" value={movements.filter(m => m.status === 'in_transit').length} icon={Truck} color="purple" active={statusFilter === 'transit'} onClick={() => handleCardClick('transit')} />
          <StatCard title="Divergências" value={movements.filter(m => m.status === 'divergent').length} icon={AlertTriangle} color="red" active={statusFilter === 'divergent'} onClick={() => handleCardClick('divergent')} />
        </div>

        <div ref={flowRef} className="scroll-mt-24">
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
                <div className="flex items-center gap-2">
                  {statusFilter && (
                    <Badge className="text-[10px] uppercase font-bold gap-1">
                      Filtro: {STATUS_FILTER_LABEL[statusFilter]}
                      <button
                        type="button"
                        aria-label="Limpar filtro"
                        className="ml-1 rounded-full hover:bg-primary-foreground/20 p-0.5"
                        onClick={() => setStatusFilter(null)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] uppercase font-bold">
                    {statusFilter ? `Exibindo ${visibleMovements.length} de ${movements.length}` : `Total: ${movements.length}`}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p role="note" className="mb-4 text-sm text-muted-foreground">Aqui o CD/Fábrica executa: aprova, reserva, separa, confere e expede. O <strong>recebimento com conferência é na unidade destino</strong> (Central da Loja) — por isso as etapas finais não avançam nesta tela.</p>
                <div className="space-y-4">
                  {movements.length === 0 ? (
                    <EmptyState 
                      title="Nenhuma movimentação registrada"
                      description="A malha logística está sem solicitações ativas no momento. Crie uma nova transferência para iniciar o fluxo."
                      action={{ label: "Nova Solicitação", onClick: () => navigate('/operacional/loja/central') }}
                    />
                  ) : visibleMovements.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Nenhuma movimentação em “{statusFilter ? STATUS_FILTER_LABEL[statusFilter] : ''}” no momento. Clique no card novamente para ver tudo.
                    </p>
                  ) : (
                    visibleMovements.map(m => (
                      <div key={m.id} className="group border rounded-xl p-4 hover:border-primary/50 transition-all bg-card shadow-sm">
                        <div
                          className="flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                          onClick={() => setSelectedMovement(selectedMovement === m.id ? null : m.id)}
                          title="Clique para abrir a origem, o destino e os itens desta transferência"
                        >
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
                            {(() => {
                              const raw = (m as any).raw_status as TransferStatus | undefined;
                              if (!raw) return null;
                              const nexts = nextStatuses(raw).filter((s) => BOARD_ADVANCE.includes(s));
                              if (!supplyAccess.canManage) {
                                return raw === 'EM TRÂNSITO'
                                  ? <span className="text-[11px] text-muted-foreground">Recebimento na unidade destino</span>
                                  : null;
                              }
                              if (nexts.length === 0) {
                                return <span className="text-[11px] text-muted-foreground">Recebimento na unidade destino</span>;
                              }
                              return (
                                <span className="flex gap-1">
                                  {nexts.map((to) => (
                                    <Button key={to} size="sm" variant="secondary"
                                      disabled={isProcessing && advancingId === m.id}
                                      onClick={(e) => { e.stopPropagation(); void handleAdvance(m.id, to); }}>
                                      Avançar: {to}
                                    </Button>
                                  ))}
                                </span>
                              );
                            })()}

                          </div>
                        </div>

                        {selectedMovement === m.id && (
                          <div className="mt-4 pt-4 border-t animate-in slide-in-from-top-2 duration-300 space-y-4">
                            <TransferDetail movement={m} />
                            <MovementLedger movementId={m.id} />
                          </div>
                        )}
                        
                        {/* Status Lifecycle Indicator */}
                        <div className="mt-4 flex items-center gap-1 w-full opacity-60">
                          {statusOrder.map((status, idx) => {
                            const currentIdx = statusOrder.indexOf(m.status as (typeof statusOrder)[number]);
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
      </div>
    </PageContainer>
  );
}

function StatCard({ title, value, icon: Icon, color, active, onClick }: {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    blue: 'text-blue-500 bg-blue-500/5 border-blue-500/20',
    orange: 'text-orange-500 bg-orange-500/5 border-orange-500/20',
    purple: 'text-purple-500 bg-purple-500/5 border-purple-500/20',
    emerald: 'text-emerald-500 bg-emerald-500/5 border-emerald-500/20',
    red: 'text-red-500 bg-red-500/5 border-red-500/20',
  };

  return (
    <Card
      className={cn(
        "border transition-all hover:shadow-md",
        colors[color],
        onClick && "cursor-pointer hover:-translate-y-0.5",
        active && "ring-2 ring-primary/70 shadow-md",
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? !!active : undefined}
      title={onClick ? (active ? 'Clique para limpar o filtro' : `Clique para ver: ${title}`) : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase opacity-60 mb-1">{title}</p>
          <p className="text-3xl font-black">{value}</p>
          {onClick && (
            <p className="mt-1 text-[9px] font-bold uppercase tracking-wider opacity-50">
              {active ? 'Filtrando — clique p/ limpar' : 'Clique para ver'}
            </p>
          )}
        </div>
        <div className="p-3 rounded-xl bg-background/50 backdrop-blur-sm border shadow-inner">
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}