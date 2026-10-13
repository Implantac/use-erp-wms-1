import { differenceInDays, parseISO, addDays, format } from 'date-fns';
import { formatBRL } from '@/lib/formatters';
import type {
  OrderLike, CapacityLike, SupplyLike, MaterialItemLike, SheetLike,
  TimeEntryLike, OutsourcingOrderLike, MaterialNeed, SimulationScenario,
  SimulationResult, ActionSuggestion, PCPMetrics, ScheduleSlot,
} from './types';

export class PCPMetricsService {
  static calculate(orders: OrderLike[], _timeEntries: TimeEntryLike[], _capacities: CapacityLike[]): PCPMetrics {
    const today = new Date();
    const todayStr = today.toDateString();
    const activeStatuses = ['planned', 'in_progress', 'paused'];
    const activeOPs = orders.filter(o => activeStatuses.includes(o.status));
    const completedOPs = orders.filter(o => o.status === 'completed');
    const completedToday = completedOPs.filter(o => o.completed_date && new Date(o.completed_date).toDateString() === todayStr);

    // Lead times
    const leadTimes = completedOPs
      .filter(o => o.start_date && o.completed_date && (o.estimated_time_minutes || 0) > 0)
      .map(o => ({
        planned: o.estimated_time_minutes!,
        real: (new Date(o.completed_date!).getTime() - new Date(o.start_date!).getTime()) / 60000,
      }))
      .filter(l => Number.isFinite(l.real) && l.real >= 0);

    const avgPlanned = leadTimes.length > 0 ? leadTimes.reduce((s, l) => s + l.planned, 0) / leadTimes.length : 0;
    const avgReal = leadTimes.length > 0 ? leadTimes.reduce((s, l) => s + l.real, 0) / leadTimes.length : 0;

    // Delay rate
    const withDueDate = orders.filter(o => o.due_date && o.status !== 'cancelled');
    const delayed = withDueDate.filter(o => {
      if (o.status === 'completed' && o.completed_date) {
        return new Date(o.completed_date) > new Date(o.due_date);
      }
      return new Date() > new Date(o.due_date) && o.status !== 'completed';
    });

    // Efficiency
    const totalProduced = completedOPs.reduce((s, o) => s + o.produced_quantity, 0);
    const totalPlanned = completedOPs.reduce((s, o) => s + o.quantity, 0);
    const efficiency = totalPlanned > 0 ? (totalProduced / totalPlanned) * 100 : 0;

    // Throughput (completed OPs in last 30 days)
    const last30 = completedOPs.filter(o => {
      if (!o.completed_date) return false;
      const ageMs = today.getTime() - new Date(o.completed_date).getTime();
      return ageMs >= 0 && ageMs <= 30 * 24 * 60 * 60 * 1000;
    });
    const throughput = last30.length;

    return {
      totalOPs: orders.length,
      activeOPs: activeOPs.length,
      completedToday: completedToday.length,
      avgLeadTimePlanned: Math.round(avgPlanned / 60),
      avgLeadTimeReal: Math.round(avgReal / 60),
      delayRate: withDueDate.length > 0 ? Math.round((delayed.length / withDueDate.length) * 100) : 0,
      delayedCount: delayed.length,
      onTimeRate: withDueDate.length > 0 ? Math.round(((withDueDate.length - delayed.length) / withDueDate.length) * 100) : 0,
      efficiency: Math.round(efficiency),
      throughput,
      leadTimeSampleSize: leadTimes.length,
      dueDateSampleSize: withDueDate.length,
      completedSampleSize: totalPlanned > 0 ? completedOPs.length : 0,
    };
  }
}

// ─── Priority Engine Service ─────────────────────────────────
