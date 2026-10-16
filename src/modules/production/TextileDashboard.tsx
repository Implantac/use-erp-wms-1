import { UnmeasuredMetrics } from './industrial/UnmeasuredMetrics';
import { TextileProcessMap } from './industrial/TextileProcessMap';

const metrics = ['Eficiência Teares', 'Produção (Metros)', 'Tempo Médio Setup', 'Paradas Ativas'];

export default function TextileDashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Dashboard Têxtil</h2>
      <UnmeasuredMetrics metrics={metrics} />
      <TextileProcessMap />
    </div>
  );
}
