import { differenceInDays, parseISO, addDays, format } from 'date-fns';
import { formatBRL } from '@/lib/formatters';
import type {
  OrderLike, CapacityLike, SupplyLike, MaterialItemLike, SheetLike,
  TimeEntryLike, OutsourcingOrderLike, MaterialNeed, SimulationScenario,
  SimulationResult, ActionSuggestion, PCPMetrics, ScheduleSlot,
} from './types';

import { PriorityEngineService } from './priority';
import { SchedulingService } from './scheduling';
export interface WarModeResult {
  timestamp: string;
  snapshot?: string; // Server-side version of the priority preview.
  ordersAnalyzed: number;
  priorityChanges: { opId: string; opNumber: string; oldPriority: string; newPriority: string; score: number; factors: string[] }[];
  kanbanReorg: { opNumber: string; suggestedStatus: string; reason: string }[];
  criticalAlerts: string[];
  summary: string;
}

export class WarModeService {
  /**
   * Execute War Mode: full recalculation + reorganization suggestion.
   * Does NOT persist — returns a plan for user confirmation.
   */
  static execute(
    orders: OrderLike[],
    materialNeeds: MaterialNeed[],
    capacities: CapacityLike[]
  ): WarModeResult {
    const scores = PriorityEngineService.calculateScores(orders, materialNeeds);
    const activeOPs = orders.filter(o => ['planned', 'in_progress', 'paused', 'waiting_material', 'outsourced'].includes(o.status));
    const now = new Date();

    // Priority changes
    const priorityChanges = scores
      .map(s => {
        const order = orders.find(o => o.id === s.opId);
        if (!order) return null;
        const newPriority = PriorityEngineService.scoreToPriority(s.score);
        if (newPriority === order.priority) return null;
        return { opId: s.opId, opNumber: s.opNumber, oldPriority: order.priority, newPriority, score: s.score, factors: s.factors };
      })
      .filter(Boolean) as WarModeResult['priorityChanges'];

    // Kanban reorganization suggestions
    const kanbanReorg: WarModeResult['kanbanReorg'] = [];

    // OPs waiting_material that have materials available → suggest moving to planned/in_progress
    activeOPs.filter(o => o.status === 'waiting_material').forEach(o => {
      const hasCritical = materialNeeds.some(m => m.status === 'critical' && m.relatedOPs.includes(o.order_number));
      const related = materialNeeds.filter(m => m.relatedOPs.includes(o.order_number));
      if (!hasCritical && related.length > 0 && related.every(m => m.coverageKnown && m.deficit === 0)) {
        kanbanReorg.push({ opNumber: o.order_number, suggestedStatus: 'in_progress', reason: 'Projeção bruta sem déficit; valide reservas e lotes antes de iniciar' });
      }
    });

    // Paused OPs that are late → suggest resuming
    activeOPs.filter(o => o.status === 'paused' && o.due_date && new Date(o.due_date) < now).forEach(o => {
      kanbanReorg.push({ opNumber: o.order_number, suggestedStatus: 'in_progress', reason: 'OP atrasada e pausada — retomar imediatamente' });
    });

    // Critical alerts
    const criticalAlerts: string[] = [];
    const lateUrgent = activeOPs.filter(o => o.due_date && new Date(o.due_date) < now && o.priority === 'urgent');
    if (lateUrgent.length > 0) {
      criticalAlerts.push(`${lateUrgent.length} OP(s) urgente(s) atrasada(s) — ação imediata necessária`);
    }
    const criticalMaterials = materialNeeds.filter(m => m.status === 'critical');
    if (criticalMaterials.length > 0) {
      criticalAlerts.push(`${criticalMaterials.length} material(is) em estado crítico — risco de parada`);
    }
    const overloadedSectors = SchedulingService.calculateResourceLoad(
      SchedulingService.sequenceOPs(activeOPs, capacities), capacities
    ).filter(r => r.isOverloaded);
    if (overloadedSectors.length > 0) {
      criticalAlerts.push(`${overloadedSectors.length} setor(es) sobrecarregado(s) — redistribuir carga`);
    }

    const summary = `Modo Guerra: ${scores.length} OPs analisadas, ${priorityChanges.length} repriorização(ões), ${kanbanReorg.length} sugestão(ões) de movimentação, ${criticalAlerts.length} alerta(s) crítico(s).`;

    return {
      timestamp: now.toISOString(),
      ordersAnalyzed: scores.length,
      priorityChanges,
      kanbanReorg,
      criticalAlerts,
      summary,
    };
  }
}

// ─── Bottleneck Detection Service ────────────────────────────
