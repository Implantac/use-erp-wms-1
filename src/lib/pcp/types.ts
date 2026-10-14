/**
 * PCP shared types and structural DTOs.
 */
import { differenceInDays, parseISO, addDays, format } from 'date-fns';
import { formatBRL } from '@/lib/formatters';

// ─── Structural input types (duck-typed shapes from hooks/DB) ───
// These describe the *fields the engine reads*, not full DB rows.
export interface OrderLike {
  id: string;
  order_number: string;
  product_name?: string;
  product_code?: string;
  product_id?: string;
  quantity: number;
  produced_quantity: number;
  status: string;
  priority?: string;
  sector?: string;
  work_center?: string;
  due_date?: string | null;
  start_date?: string | null;
  completed_date?: string | null;
  estimated_time_minutes?: number;
  realized_time_minutes?: number;
  sales_order_id?: string | null;
}
export interface CapacityLike {
  sector?: string;
  capacity_per_hour?: number;
  max_hours_per_day?: number;
}
export interface SupplyLike {
  code?: string;
  unit?: string;
  name?: string;
  current_quantity?: number;
  unit_cost?: number;
}
export interface MaterialItemLike {
  code?: string;
  componentCode?: string;
  material_code?: string;
  name?: string;
  componentName?: string;
  material_name?: string;
  quantity?: number;
  qty?: number;
  waste_pct?: number;
  wastePercentage?: number;
  unit?: string;
}
export interface SheetLike {
  product_code?: string;
  product_id?: string;
  materials?: MaterialItemLike[];
}
export interface TimeEntryLike {
  start_time: string;
  work_center?: string;
  produced_quantity?: number;
  rejected_quantity?: number;
}
export interface OutsourcingOrderLike {
  id: string;
  order_number?: string;
  supplier_name: string;
  status: string;
  expected_return_date?: string | null;
  actual_return_date?: string | null;
  quantity_returned?: number;
  quantity_rejected?: number;
}

// ─── Types ───────────────────────────────────────────────────

export interface MaterialNeed {
  materialCode: string;
  materialName: string;
  unit: string;
  totalRequired: number;
  inStock: number;
  deficit: number;
  coveragePct: number;
  coverageKnown: boolean;
  relatedOPs: string[];
  status: 'ok' | 'partial' | 'critical' | 'unverified';
}

export interface SimulationScenario {
  name: string;
  description: string;
  delayedOPs?: { opId: string; delayDays: number }[];
  materialShortages?: { materialCode: string; reducePct: number }[];
  capacityChange?: { sector: string; changePct: number }[];
}

export interface SimulationResult {
  scenario: string;
  impactSummary: string;
  affectedOPs: { opNumber: string; originalDue: string; newEstimate: string; daysImpact: number; risk: 'low' | 'medium' | 'high' }[];
  materialImpact: { materialName: string; originalDeficit: number; newDeficit: number; change: number }[];
  kpis: { delayRate: number; avgLeadTimeChange: number; criticalOPs: number };
  suggestions: ActionSuggestion[];
}

export interface ActionSuggestion {
  type: 'anticipate' | 'purchase' | 'redistribute' | 'alert' | 'overtime';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  relatedOP?: string;
  estimatedImpact?: string;
}

export interface PCPMetrics {
  totalOPs: number;
  activeOPs: number;
  completedToday: number;
  avgLeadTimePlanned: number;
  avgLeadTimeReal: number;
  delayRate: number;
  delayedCount: number;
  onTimeRate: number;
  efficiency: number;
  throughput: number;
  leadTimeSampleSize: number;
  dueDateSampleSize: number;
  completedSampleSize: number;
}

export interface ScheduleSlot {
  opId: string;
  opNumber: string;
  productName: string;
  sector: string;
  startDate: Date;
  endDate: Date;
  estHours: number;
  priority: string;
  isLate: boolean;
  willBeLate: boolean;
  criticalRatio: number;
}

