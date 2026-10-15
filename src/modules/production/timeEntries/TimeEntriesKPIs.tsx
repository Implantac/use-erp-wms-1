import { KPICard } from '@/shared/components/KPICard';
import { PlayCircle, Pause, CheckCircle } from 'lucide-react';

interface Props {
  activeCount: number;
  pausedCount: number;
  completedToday: number;
}

export function TimeEntriesKPIs({ activeCount, pausedCount, completedToday }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <KPICard title="Em Andamento" value={activeCount} subtitle="Operações ativas" icon={<PlayCircle className="h-5 w-5" />} accentColor="success" index={0} />
      <KPICard title="Pausados" value={pausedCount} subtitle="Aguardando" icon={<Pause className="h-5 w-5" />} accentColor="warning" index={1} />
      <KPICard title="Concluídos Hoje" value={completedToday} subtitle="Finalizados" icon={<CheckCircle className="h-5 w-5" />} accentColor="primary" index={2} />
    </div>
  );
}
