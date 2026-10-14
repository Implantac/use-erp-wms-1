import { differenceInDays, parseISO, addDays, format } from 'date-fns';
import { formatBRL } from '@/lib/formatters';
import type {
  OrderLike, CapacityLike, SupplyLike, MaterialItemLike, SheetLike,
  TimeEntryLike, OutsourcingOrderLike, MaterialNeed, SimulationScenario,
  SimulationResult, ActionSuggestion, PCPMetrics, ScheduleSlot,
} from './types';

import { MRPService } from './mrp';
export class SimulationService {
  /**
   * Run a what-if simulation without persisting data
   */
  static simulate(
    scenario: SimulationScenario,
    orders: OrderLike[],
    sheets: SheetLike[],
    supplies: SupplyLike[],
    capacities: CapacityLike[]
  ): SimulationResult {
    const today = new Date();

    // Clone data for simulation (no mutations to originals)
    const simOrders = orders.map(o => ({ ...o }));
    const simSupplies = supplies.map(s => ({ ...s }));
    const simCapacities = capacities.map(c => ({ ...c }));

    // Apply delay scenario
    if (scenario.delayedOPs) {
      scenario.delayedOPs.forEach(d => {
        const op = simOrders.find(o => o.id === d.opId);
        if (op && op.due_date) {
          op.due_date = addDays(parseISO(op.due_date), d.delayDays).toISOString();
        }
      });
    }

    // Apply material shortage scenario
    if (scenario.materialShortages) {
      scenario.materialShortages.forEach(ms => {
        const sup = simSupplies.find(s => s.code === ms.materialCode || s.name === ms.materialCode);
        if (sup) {
          sup.current_quantity = Math.max(0, sup.current_quantity * (1 - ms.reducePct / 100));
        }
      });
    }

    // Apply capacity changes
    if (scenario.capacityChange) {
      scenario.capacityChange.forEach(cc => {
        simCapacities.filter(c => c.sector === cc.sector).forEach(c => {
          c.capacity_per_hour = Math.max(0, c.capacity_per_hour * (1 + cc.changePct / 100));
        });
      });
    }

    // Calculate original and simulated needs
    const activeOPs = simOrders.filter(o => ['planned', 'in_progress', 'paused'].includes(o.status));
    const originalNeeds = MRPService.calculateNeeds(
      orders.filter(o => ['planned', 'in_progress', 'paused'].includes(o.status)),
      sheets, supplies
    );
    const simNeeds = MRPService.calculateNeeds(activeOPs, sheets, simSupplies);

    // Calculate impact on OPs
    const affectedOPs = activeOPs
      .filter(o => o.due_date)
      .map(o => {
        const origOrder = orders.find(orig => orig.id === o.id);
        const origDue = origOrder?.due_date || o.due_date;
        const remaining = Math.max(0, o.quantity - o.produced_quantity);
        const avgTime = o.estimated_time_minutes / Math.max(o.quantity, 1);
        const totalCap = simCapacities.reduce((s: number, c) => s + (c.capacity_per_hour || 0) * 8, 0);
        const estDays = totalCap > 0 ? remaining / totalCap : 999;
        const newEstimate = format(addDays(today, Math.ceil(estDays)), 'yyyy-MM-dd');
        const daysImpact = differenceInDays(parseISO(newEstimate), parseISO(origDue));
        let risk: 'low' | 'medium' | 'high' = 'low';
        if (daysImpact > 5) risk = 'high';
        else if (daysImpact > 0) risk = 'medium';

        return {
          opNumber: o.order_number,
          originalDue: format(parseISO(origDue), 'dd/MM/yyyy'),
          newEstimate: format(parseISO(newEstimate), 'dd/MM/yyyy'),
          daysImpact,
          risk,
        };
      })
      .filter(o => o.daysImpact !== 0)
      .sort((a, b) => b.daysImpact - a.daysImpact);

    // Material impact comparison
    const materialImpact = simNeeds.map(sn => {
      const orig = originalNeeds.find(on => on.materialCode === sn.materialCode && on.unit === sn.unit);
      if (!orig?.coverageKnown || !sn.coverageKnown) return null;
      return {
        materialName: sn.materialName,
        originalDeficit: orig.deficit,
        newDeficit: sn.deficit,
        change: sn.deficit - orig.deficit,
      };
    }).filter((m): m is NonNullable<typeof m> => m !== null && m.change !== 0);

    // KPIs
    const delayedInSim = affectedOPs.filter(o => o.daysImpact > 0).length;
    const totalActive = activeOPs.filter(o => o.due_date).length;

    const suggestions = MRPService.generateSuggestions(simNeeds, activeOPs, simCapacities, sheets);

    return {
      scenario: scenario.name,
      impactSummary: `Cenário "${scenario.name}": ${affectedOPs.length} OPs impactadas, ${delayedInSim} com atraso adicional.`,
      affectedOPs,
      materialImpact,
      kpis: {
        delayRate: totalActive > 0 ? (delayedInSim / totalActive) * 100 : 0,
        avgLeadTimeChange: affectedOPs.length > 0 ? affectedOPs.reduce((s, o) => s + o.daysImpact, 0) / affectedOPs.length : 0,
        criticalOPs: affectedOPs.filter(o => o.risk === 'high').length,
      },
      suggestions,
    };
  }

  /**
   * Generate preset scenarios for quick simulation
   */
  static presetScenarios(orders: OrderLike[], supplies: SupplyLike[], capacities: CapacityLike[]): SimulationScenario[] {
    const scenarios: SimulationScenario[] = [];

    // Scenario 1: Main material shortage
    if (supplies.length > 0) {
      const topMaterial = supplies.sort((a, b) => (b.current_quantity || 0) - (a.current_quantity || 0))[0];
      scenarios.push({
        name: 'Falta de material principal',
        description: `Redução de 50% no estoque de ${topMaterial?.name || 'material'}`,
        materialShortages: [{ materialCode: topMaterial?.code || '', reducePct: 50 }],
      });
    }

    // Scenario 2: Capacity reduction
    const sectors = [...new Set(capacities.map((c) => c.sector))];
    if (sectors.length > 0) {
      scenarios.push({
        name: 'Redução de capacidade (-30%)',
        description: `Redução de 30% na capacidade de ${sectors[0]}`,
        capacityChange: [{ sector: sectors[0], changePct: -30 }],
      });
    }

    // Scenario 3: Delay of urgent OPs
    const urgentOPs = orders.filter(o => o.priority === 'urgent' && ['planned', 'in_progress'].includes(o.status));
    if (urgentOPs.length > 0) {
      scenarios.push({
        name: 'Atraso em OPs urgentes (+5 dias)',
        description: `Simulação de atraso de 5 dias nas ${urgentOPs.length} OPs urgentes`,
        delayedOPs: urgentOPs.map(o => ({ opId: o.id, delayDays: 5 })),
      });
    }

    // Scenario 4: Overtime (+20% capacity)
    if (sectors.length > 0) {
      scenarios.push({
        name: 'Hora extra (+20% capacidade)',
        description: `Aumento de 20% na capacidade de todos os setores`,
        capacityChange: sectors.map(s => ({ sector: s, changePct: 20 })),
      });
    }

    return scenarios;
  }
}

// ─── Metrics Service ─────────────────────────────────────────
