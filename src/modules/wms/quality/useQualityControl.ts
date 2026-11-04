import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/ui/base/use-toast";
import { KPI_DEFAULT, decisionMeta, type Check, type Decision, type Lot } from "./types";
import type { FiberClassification } from "@/lib/wms/fiberReceipt";

interface FiberClassificationQuery {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

const fiberClassificationClient = supabase as unknown as FiberClassificationQuery;

export function useQualityControl() {
  const { toast } = useToast();
  const [lots, setLots] = useState<Lot[]>([]);
  const [recentChecks, setRecentChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState(KPI_DEFAULT);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: lotsData }, { data: checksData }] = await Promise.all([
      supabase
        .from("stock_lots")
        .select(
          "id, lot_number, product_code, product_name, supplier, quantity, remaining_qty, expiration_date, quality_status, inspection_date, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("wms_quality_checks")
        .select("id, lot_id, decision, reason, sample_size, defects_found, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const rows = (lotsData ?? []) as Lot[];
    if (rows.length > 0) {
      const { data: classificationData, error: classificationError } = await fiberClassificationClient
        .from("fiber_lot_classifications")
        .select("*")
        .in("lot_id", rows.map((row) => row.id));
      if (!classificationError) {
        const classificationRows = (classificationData as Array<FiberClassification & { lot_id: string }> | null) ?? [];
        const byLot = new Map(classificationRows.map((row) => [row.lot_id, row]));
        for (const row of rows) {
          row.fiber_classification = byLot.get(row.id) ?? null;
        }
      }
    }
    setLots(rows);
    setRecentChecks((checksData ?? []) as Check[]);
    setKpi({
      total: rows.length,
      approved: rows.filter((r) => r.quality_status === "approved").length,
      quarantine: rows.filter((r) => r.quality_status === "quarantine").length,
      rejected: rows.filter((r) => r.quality_status === "rejected").length,
      pending: rows.filter((r) => !r.quality_status || r.quality_status === "pending").length,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitInspection = useCallback(
    async (params: {
      lot: Lot;
      decision: Decision;
      reason: string;
      notes: string;
      sampleSize: number;
      defects: number;
    }) => {
      setSaving(true);
      try {
        const { data: u } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", u.user?.id ?? "")
          .maybeSingle();
        if (!profile?.company_id) {
          toast({ title: "Empresa não identificada", variant: "destructive" });
          return false;
        }
        const { error } = await supabase.from("wms_quality_checks").insert({
          company_id: profile.company_id,
          lot_id: params.lot.id,
          inspector_id: u.user?.id,
          decision: params.decision,
          reason: params.reason || null,
          notes: params.notes || null,
          sample_size: params.sampleSize,
          defects_found: params.defects,
        });
        if (error) {
          toast({ title: "Erro ao registrar inspeção", description: error.message, variant: "destructive" });
          return false;
        }
        toast({
          title: "Inspeção registrada",
          description: `Lote ${params.lot.lot_number} → ${decisionMeta[params.decision].label}`,
        });
        await load();
        return true;
      } finally {
        setSaving(false);
      }
    },
    [load, toast],
  );

  return { lots, recentChecks, loading, kpi, saving, load, submitInspection };
}
