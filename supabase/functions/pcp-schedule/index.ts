import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getSystemPrompt } from "../_shared/ai-prompts.ts";
import { resolveContextByIds, branchScope, requireModule } from "../_shared/tenant.ts";
import { instrument, contextFromAuth } from "../_shared/observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-branch-id",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const userId = (claimsData.claims as any).sub;
    const { data: profile } = await supabase.from('profiles').select('company_id, default_branch_id').eq('id', userId).maybeSingle();
    const callerCompany = (profile as any)?.company_id;
    if (!callerCompany) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ctx = await resolveContextByIds(req, {
      userId,
      companyId: callerCompany,
      defaultBranchId: (profile as any)?.default_branch_id ?? null,
    });
    if (!ctx.ok) {
      return new Response(JSON.stringify({ error: ctx.message }), { status: ctx.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const moduleDenied = await requireModule(ctx, 'producao');
    if (moduleDenied) return moduleDenied;
    const scope = branchScope(ctx);

    const { v, parseJson } = await import("../_shared/validation.ts");
    const parsed = await parseJson(req, v.object({
      action: v.optional(v.string({ enum: ["suggest", "apply"] as const })),
      expectedSnapshot: v.optional(v.string({ min: 64, max: 64 })),
    }));
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const action = body.action || "suggest";

    // Fetch active production orders for caller's company + branch scope
    let ordersQ = supabase
      .from("production_orders")
      .select("*")
      .eq("company_id", callerCompany)
      .in("status", ["planned", "in_progress", "paused", "waiting_material", "outsourced"])
      .order("created_at", { ascending: false })
      .limit(500);
    if (scope) ordersQ = ordersQ.in("branch_id", scope);
    const { data: orders, error: ordErr } = await ordersQ;


    if (ordErr) throw ordErr;
    const allOrders = orders || [];
    const now = new Date();

    // ─── Intelligent Sequencing Algorithm ───
    // 1. Group by similarity (product_code, model_variant, color) to reduce setup changes
    // 2. Within groups, sort by priority_score DESC then due_date ASC
    // 3. Order groups by urgency (max priority_score in group)

    interface ScoredOrder {
      id: string;
      order_number: string;
      product_name: string;
      product_code: string;
      color: string | null;
      model_variant: string | null;
      size_grid: string | null;
      sector: string | null;
      priority: string;
      priority_score: number;
      due_date: string | null;
      quantity: number;
      produced_quantity: number;
      status: string;
      groupKey: string;
      sequenceScore: number;
    }

    // Build group key for similarity (same product_code + color reduces setup)
    const scored: ScoredOrder[] = allOrders.map((o: any) => {
      const groupKey = [
        o.product_code || "",
        o.color || "",
        o.model_variant || "",
      ].join("|");

      // Sequence score: combines urgency + deadline proximity
      let seqScore = o.priority_score || 0;

      // Deadline bonus
      if (o.due_date) {
        const hoursUntil = (new Date(o.due_date).getTime() - now.getTime()) / 3600000;
        if (hoursUntil < 0) seqScore += 30; // overdue
        else if (hoursUntil < 48) seqScore += 20;
        else if (hoursUntil < 120) seqScore += 10;
      }

      // Progress penalty: nearly done items get slight boost to finish them
      const pct = o.quantity > 0 ? o.produced_quantity / o.quantity : 0;
      if (pct > 0.7) seqScore += 5; // almost done, finish it

      return {
        id: o.id,
        order_number: o.order_number,
        product_name: o.product_name,
        product_code: o.product_code || "",
        color: o.color,
        model_variant: o.model_variant,
        size_grid: o.size_grid,
        sector: o.sector,
        priority: o.priority,
        priority_score: o.priority_score || 0,
        due_date: o.due_date,
        quantity: o.quantity,
        produced_quantity: o.produced_quantity,
        status: o.status,
        groupKey,
        sequenceScore: Math.round(seqScore * 100) / 100,
      };
    });

    // Group orders by similarity key
    const groups: Record<string, ScoredOrder[]> = {};
    for (const o of scored) {
      if (!groups[o.groupKey]) groups[o.groupKey] = [];
      groups[o.groupKey].push(o);
    }

    // Sort items within each group by sequenceScore DESC, then due_date ASC
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        if (b.sequenceScore !== a.sequenceScore) return b.sequenceScore - a.sequenceScore;
        if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        return 0;
      });
    }

    // Sort groups by max urgency score (highest first)
    const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
      const maxA = Math.max(...groups[a].map((o) => o.sequenceScore));
      const maxB = Math.max(...groups[b].map((o) => o.sequenceScore));
      return maxB - maxA;
    });

    // Flatten into final sequence
    const sequence: Array<{
      sequence: number;
      id: string;
      order_number: string;
      product_name: string;
      product_code: string;
      color: string | null;
      model_variant: string | null;
      sector: string | null;
      priority: string;
      priority_score: number;
      sequence_score: number;
      due_date: string | null;
      status: string;
      group_key: string;
      setup_change: boolean;
    }> = [];

    let seq = 1;
    let lastGroupKey = "";
    for (const key of sortedGroupKeys) {
      for (const o of groups[key]) {
        sequence.push({
          sequence: seq,
          id: o.id,
          order_number: o.order_number,
          product_name: o.product_name,
          product_code: o.product_code,
          color: o.color,
          model_variant: o.model_variant,
          sector: o.sector,
          priority: o.priority,
          priority_score: o.priority_score,
          sequence_score: o.sequenceScore,
          due_date: o.due_date,
          status: o.status,
          group_key: key,
          setup_change: lastGroupKey !== "" && key !== lastGroupKey,
        });
        seq++;
      }
      lastGroupKey = key;
    }

    // Count setup changes
    const setupChanges = sequence.filter((s) => s.setup_change).length;
    const totalGroups = sortedGroupKeys.length;

    // No plan can be applied unless all its OPs were present in the preview.
    if (sequence.length > 100) {
      return new Response(JSON.stringify({ error: "Mais de 100 OPs: prévia incompleta; divida o planejamento antes de aplicar." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409,
      });
    }
    const snapshotInput = JSON.stringify(sequence.map(s => [
      s.id, allOrders.find((o: any) => o.id === s.id)?.updated_at,
      s.sequence, s.sequence_score, s.priority,
    ]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshotInput));
    const snapshot = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");

    if (action === "suggest") {
      return new Response(
        JSON.stringify({
          action: "suggest", snapshot,
          totalOrders: sequence.length,
          totalGroups,
          setupChanges,
          summary: `Sugestão heurística: ${sequence.length} OPs em ${totalGroups} grupos, ${setupChanges} mudanças de grupo. Sem medição de tempo de setup.`,
          sequence,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "apply") {
      if (!body.expectedSnapshot || body.expectedSnapshot !== snapshot) {
        return new Response(JSON.stringify({ error: "Prévia desatualizada. Recalcule antes de aplicar." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409,
        });
      }
      let updated = 0;
      for (const s of sequence) {
        const version = allOrders.find((o: any) => o.id === s.id)?.updated_at;
        const { data: written, error } = await supabase
          .from("production_orders")
          .update({ sequence_order: s.sequence, updated_at: new Date().toISOString() })
          .eq("id", s.id).eq("company_id", callerCompany).eq("updated_at", version).select("id");
        if (error || !written?.length) throw error ?? new Error("OP mudou durante aplicação da sequência");
        updated++;
        // This loop is not transactional. A later error may leave partial writes.
      }

      return new Response(
        JSON.stringify({
          action: "apply", ordersUpdated: updated, totalGroups, setupChanges,
          summary: `Sequência aplicada: ${updated} OPs atualizadas`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use 'suggest' or 'apply'" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (error) {
    console.error("pcp-schedule error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
};

Deno.serve(instrument(handler, { source: "pcp-schedule", getContext: contextFromAuth }));
