import { VALID_OP_TRANSITIONS } from '@/lib/pcp/orderTransitions';
import { Clock, Factory, CheckCircle, PackageX, Truck, Wrench } from 'lucide-react';

export const KANBAN_COLUMNS = [
  { key: 'planned', label: 'Planejado', icon: Clock, gradient: 'from-blue-500/10 to-blue-600/5', border: 'border-blue-500/40', badge: 'bg-blue-500/20 text-blue-300' },
  { key: 'waiting_material', label: 'Aguardando Material', icon: PackageX, gradient: 'from-purple-500/10 to-purple-600/5', border: 'border-purple-500/40', badge: 'bg-purple-500/20 text-purple-300' },
  { key: 'in_progress', label: 'Em Produção', icon: Factory, gradient: 'from-amber-500/10 to-yellow-600/5', border: 'border-amber-500/40', badge: 'bg-amber-500/20 text-amber-300' },
  { key: 'outsourced', label: 'Terceirizado', icon: Truck, gradient: 'from-indigo-500/10 to-indigo-600/5', border: 'border-indigo-500/40', badge: 'bg-indigo-500/20 text-indigo-300' },
  { key: 'finishing', label: 'Finalização', icon: Wrench, gradient: 'from-teal-500/10 to-teal-600/5', border: 'border-teal-500/40', badge: 'bg-teal-500/20 text-teal-300' },
  { key: 'completed', label: 'Concluído', icon: CheckCircle, gradient: 'from-emerald-500/10 to-green-600/5', border: 'border-emerald-500/40', badge: 'bg-emerald-500/20 text-emerald-300' },
];

export const VALID_TRANSITIONS = VALID_OP_TRANSITIONS;

export const STATUS_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = { paused: 'Pausada' };
  KANBAN_COLUMNS.forEach(c => { map[c.key] = c.label; });
  return map;
})();
