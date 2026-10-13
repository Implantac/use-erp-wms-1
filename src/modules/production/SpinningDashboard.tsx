import { UnmeasuredMetrics } from './industrial/UnmeasuredMetrics';

const metrics = ['Eficiência Cardas', 'Consumo Energia/kg', 'Rupturas/1000h', 'Neps (Contagem)'];

export default function SpinningDashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Fiação & Fios</h2>
      <UnmeasuredMetrics metrics={metrics} />
    </div>
  );
}
