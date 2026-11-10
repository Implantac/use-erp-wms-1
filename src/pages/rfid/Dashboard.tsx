import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/ui/base/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRFIDDashboard } from './dashboard/useRFIDDashboard';
import { KPICards } from './dashboard/KPICards';
import { ChartsRow } from './dashboard/ChartsRow';
import { ZonesRow } from './dashboard/ZonesRow';
import { RecentEvents } from './dashboard/RecentEvents';

export default function RFIDDashboardPage() {
  const { readers, tags, events, loading, summary, eventsPerHour, eventsByZone, readerStatusData, tagAlerts, offlineReaders, refetch } = useRFIDDashboard();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refetch();
      toast.success('Dados atualizados');
    } catch {
      toast.error('Não foi possível atualizar os dados. Tente novamente.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard RFID</h1>
          <p className="text-muted-foreground">Visão geral do sistema de rastreamento RFID em tempo real</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} aria-busy={refreshing}>
          <RefreshCw className={cn('h-4 w-4 mr-1', refreshing && 'animate-spin')} />
          {refreshing ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      <KPICards loading={loading} summary={summary} tagAlertsCount={tagAlerts.length} offlineReadersCount={offlineReaders.length} />
      <ChartsRow loading={loading} eventsPerHour={eventsPerHour} readerStatusData={readerStatusData} />
      <ZonesRow loading={loading} eventsByZone={eventsByZone} readers={readers} tags={tags} offlineReaders={offlineReaders} tagAlerts={tagAlerts} />
      <RecentEvents loading={loading} events={events} />
    </div>
  );
}
