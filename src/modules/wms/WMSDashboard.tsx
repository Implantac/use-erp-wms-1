import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { ScreenTimingCard } from './components/ScreenTimingCard';
import { Button } from "@/ui/base/button";
import { Link } from "react-router-dom";
import { 
  PackagePlus, 
  MapPin, 
  PackageSearch, 
  RefreshCw, 
  PackageCheck,
  ScanBarcode,
  Truck,
  Brain,
  BarChart3
} from "lucide-react";
import WMSKpiStrip from "./components/WMSKpiStrip";
import { SmartReplenishment } from "./components/SmartReplenishment";
import { FactoryInboxPanel } from "./components/FactoryInboxPanel";
import { SystemReadinessPanel } from "./components/SystemReadinessPanel";
import { NetworkTodayPanel } from "./components/NetworkTodayPanel";
import WMSOperationalConsole from "./components/WMSOperationalConsole";
import { useWMSDashboardStats } from "@/hooks/wms/useWMSOperations";
import { Skeleton } from "@/ui/base/skeleton";


export default function WMSDashboard() {
  const { stats, loading, error, refetch } = useWMSDashboardStats();
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WMS Enterprise</h1>
          <p className="text-muted-foreground">Gestão inteligente de armazenagem, movimentação e logística interna.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => void refetch()} title="Atualizar painel" aria-label="Atualizar painel"><RefreshCw className="h-4 w-4" /></Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/wms/twin">
              <BarChart3 className="h-4 w-4" />
              Digital Twin
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/wms/inteligencia">
              <Brain className="h-4 w-4" />
              Inteligência
            </Link>
          </Button>
          <Button asChild className="gap-2">
            <Link to="/wms/slotting">
              <Brain className="h-4 w-4" />
              Otimizar Slotting
            </Link>
          </Button>
        </div>
      </div>

      <WMSKpiStrip />

      {error && <div role="alert" className="text-destructive flex items-center gap-3">Não foi possível carregar os indicadores WMS. <Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button></div>}


      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Docas em Operação</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-20" /> : error ? <span>—</span> : (
              <>
                <div className="text-2xl font-bold">{stats.activeDocks}</div>
                <p className="text-xs text-muted-foreground mt-1">Docas ocupadas</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Ondas de Picking</CardTitle>
            <PackageSearch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-20" /> : error ? <span>—</span> : (
              <>
                <div className="text-2xl font-bold">{stats.picking} Ativas</div>
                <p className="text-xs text-muted-foreground mt-1">Ordens em separação</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Ocupação de Armazém</CardTitle>
            <ScanBarcode className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-20" /> : error ? <span>—</span> : (
              <>
                <div className="text-2xl font-bold">{stats.occupancy}%</div>
                <p className="text-xs text-muted-foreground mt-1">{stats.occupied} / {stats.capacity} un</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Packing Pendente</CardTitle>
            <RefreshCw className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-20" /> : error ? <span>—</span> : (
              <>
                <div className="text-2xl font-bold">{stats.packing} Pedidos</div>
                <p className="text-xs text-purple-500 mt-1">Aguardando checkout</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <WMSOperationalConsole />

        <div className="grid gap-6">

        <Card>
          <CardHeader>
            <CardTitle>Fluxo de Logística Interna</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border bg-secondary/10 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                  <PackagePlus className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Recebimento</p>
                   <p className="text-xl font-bold">{loading || error ? '—' : stats.receivedItems} itens</p>
                </div>
              </div>
              <div className="p-4 rounded-xl border bg-secondary/10 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                  <PackageCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Expedição</p>
                   <p className="text-xl font-bold">{loading || error ? '—' : stats.shippedVolumes} vol</p>
                </div>
              </div>
              <div className="p-4 rounded-xl border bg-secondary/10 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                  <MapPin className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Endereçados</p>
                   <p className="text-xl font-bold">{loading || error ? '—' : `${stats.occupancy}%`}</p>
                </div>
              </div>
              <div className="p-4 rounded-xl border bg-secondary/10 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                  <PackageSearch className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Picking Pendente</p>
                   <p className="text-xl font-bold">{loading || error ? '—' : stats.pendingPickingItems} itens</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      <NetworkTodayPanel />
      <SystemReadinessPanel />
      <FactoryInboxPanel />
      <ScreenTimingCard />
      <SmartReplenishment />
    </div>
  );
}
