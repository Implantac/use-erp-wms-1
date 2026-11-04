import { ShieldCheck, AlertTriangle, Ban } from "lucide-react";
import type { FiberClassification } from "@/lib/wms/fiberReceipt";

export interface Lot {
  id: string;
  lot_number: string;
  product_code: string | null;
  product_name: string | null;
  supplier: string | null;
  quantity: number | null;
  remaining_qty: number | null;
  expiration_date: string | null;
  quality_status: string | null;
  inspection_date: string | null;
  created_at: string;
  fiber_classification?: FiberClassification | null;
}

export interface Check {
  id: string;
  lot_id: string | null;
  decision: string;
  reason: string | null;
  sample_size: number | null;
  defects_found: number | null;
  created_at: string;
}

export type Decision = "approved" | "quarantine" | "rejected";

export const decisionMeta: Record<Decision, { label: string; cls: string; icon: typeof ShieldCheck }> = {
  approved: { label: "Aprovado", cls: "bg-emerald-500/10 text-emerald-500", icon: ShieldCheck },
  quarantine: { label: "Quarentena", cls: "bg-amber-500/10 text-amber-500", icon: AlertTriangle },
  rejected: { label: "Rejeitado", cls: "bg-red-500/10 text-red-500", icon: Ban },
};

export const KPI_DEFAULT = { total: 0, approved: 0, quarantine: 0, rejected: 0, pending: 0 };
export type KPI = typeof KPI_DEFAULT;
