/**
 * Unified PCP Intelligence Hook
 * Aggregates MRP, Scheduling, and Simulation services into proactive alerts & metrics
 */
import { useMemo } from 'react';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useProductionCapacity } from '@/hooks/production/useProductionCapacity';
import { useTechnicalSheets } from '@/hooks/production/useTechnicalSheets';
import { useSupplyStock } from '@/hooks/inventory/useSupplyStock';
import { useTimeEntries } from '@/hooks/system/useTimeEntries';
import { MRPService, SchedulingService, PCPMetricsService, type ActionSuggestion, type PCPMetrics, type MaterialNeed, type ScheduleSlot } from '@/lib/pcpServices';

export interface PCPIntelligence {
  /** Proactive suggestions sorted by severity */
  suggestions: ActionSuggestion[];
  /** Material needs from MRP explosion */
  materialNeeds: MaterialNeed[];
  /** Sequenced OPs */
  scheduledSlots: ScheduleSlot[];
  /** PCP metrics */
  metrics: PCPMetrics;
  /** Quick summary counts */
  summary: {
    criticalAlerts: number;
    warningAlerts: number;
    materialsInDeficit: number;
    opsAtRisk: number;
    opsLate: number;
    bottleneckSectors: number;
  };
  loading: boolean;
}

export function usePCPIntelligence(): PCPIntelligence {
  const { orders, loading: loadingOrders } = useProductionOrders();
  const { capacities } = useProductionCapacity();
  const { sheets, loading: loadingSheets } = useTechnicalSheets();
  const { supplies, loading: loadingSupplies } = useSupplyStock();
  const { entries } = useTimeEntries();

  const loading = loadingOrders || loadingSheets || loadingSupplies;

  const activeOPs = useMemo(() =>
    orders.filter(o => ['planned', 'in_progress', 'paused'].includes(o.status)),
    [orders]
  );

  const materialNeeds = useMemo(() =>
    MRPService.calculateNeeds(activeOPs, sheets, supplies),
    [activeOPs, sheets, supplies]
  );

  const suggestions = useMemo(() =>
    MRPService.generateSuggestions(materialNeeds, activeOPs, capacities, sheets),
    [materialNeeds, activeOPs, capacities, sheets]
  );

  const scheduledSlots = useMemo(() =>
    SchedulingService.sequenceOPs(activeOPs, capacities, 'priority_due'),
    [activeOPs, capacities]
  );

  const resourceLoad = useMemo(() =>
    SchedulingService.calculateResourceLoad(scheduledSlots, capacities),
    [scheduledSlots, capacities]
  );

  const metrics = useMemo(() =>
    PCPMetricsService.calculate(orders, entries, capacities),
    [orders, entries, capacities]
  );

  const summary = useMemo(() => {
    const criticalAlerts = suggestions.filter(s => s.severity === 'critical').length;
    const warningAlerts = suggestions.filter(s => s.severity === 'warning').length;
    const materialsInDeficit = materialNeeds.filter(m => m.deficit > 0).length;
    const today = new Date();
    const opsLate = activeOPs.filter(o => o.due_date && new Date(o.due_date) < today).length;
    const opsAtRisk = scheduledSlots.filter(s => s.willBeLate && !s.isLate).length;
    const bottleneckSectors = resourceLoad.filter(r => r.isOverloaded).length;

    return { criticalAlerts, warningAlerts, materialsInDeficit, opsAtRisk, opsLate, bottleneckSectors };
  }, [suggestions, materialNeeds, activeOPs, scheduledSlots, resourceLoad]);

  return { suggestions, materialNeeds, scheduledSlots, metrics, summary, loading };
}
