import { UnmeasuredMetrics } from './industrial/UnmeasuredMetrics';

const metrics = ['Eficiência Teares', 'Metros/Hora', 'Troca de Artigo', 'Qualidade (1ª Escolha)'];

export default function WeavingDashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Tecelagem Industrial</h2>
      <UnmeasuredMetrics metrics={metrics} />
    </div>
  );
}
