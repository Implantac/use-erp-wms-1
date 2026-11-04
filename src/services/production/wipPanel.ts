import { supabase } from "@/integrations/supabase/client";
import type { WipStepInput } from "@/lib/pcp/wipPanel";

interface OrderStepRow {
  production_order_id: string;
  step_id: string;
  sequence: number;
  status: string;
  started_at: string | null;
  created_at: string;
}

interface StepNameRow {
  id: string;
  name: string;
  sector: string | null;
}

/**
 * Etapas reais das OPs abertas (para o painel WIP). Sem FK entre
 * production_order_steps.step_id e production_steps: o nome/setor da etapa é
 * mesclado aqui, como no hook de etapas da OP.
 */
export async function fetchWipSteps(companyId: string, orderIds: string[]): Promise<WipStepInput[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await supabase
    .from("production_order_steps")
    .select("production_order_id, step_id, sequence, status, started_at, created_at")
    .eq("company_id", companyId)
    .in("production_order_id", orderIds)
    .order("sequence", { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as OrderStepRow[];

  const stepIds = [...new Set(rows.map((row) => row.step_id).filter(Boolean))];
  const names = new Map<string, StepNameRow>();
  if (stepIds.length > 0) {
    const { data: stepData, error: stepError } = await supabase
      .from("production_steps")
      .select("id, name, sector")
      .eq("company_id", companyId)
      .in("id", stepIds);
    if (stepError) throw new Error(stepError.message);
    for (const step of (stepData ?? []) as unknown as StepNameRow[]) names.set(step.id, step);
  }

  return rows.map((row) => ({
    production_order_id: row.production_order_id,
    sequence: row.sequence,
    status: row.status,
    started_at: row.started_at,
    created_at: row.created_at,
    step_name: names.get(row.step_id)?.name,
    step_sector: names.get(row.step_id)?.sector ?? null,
  }));
}
