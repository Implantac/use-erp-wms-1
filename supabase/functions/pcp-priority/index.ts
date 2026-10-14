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
      action: v.optional(v.string({ enum: ["recalculate", "war_mode"] as const })),
      confirm: v.optional(v.boolean()),
      expectedSnapshot: v.optional(v.string({ min: 64, max: 64 })),
    }));
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const action = body.action || "recalculate";

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


    // Calculate priority scores
    const scores = allOrders.map((o: any) => {
      let score = 0;
      const factors: string[] = [];

      // Priority base
      const pw: Record<string, number> = { urgent: 40, high: 25, medium: 10, low: 0 };
      score += pw[o.priority] ?? 5;

      // Deadline
      if (o.due_date) {
        const hoursUntil = (new Date(o.due_date).getTime() - now.getTime()) / 3600000;
        if (hoursUntil < 0) {
          const late = Math.min(50, 20 + (Math.abs(hoursUntil) / 24) * 5);
          score += late;
          factors.push(`Atrasada ${Math.ceil(Math.abs(hoursUntil) / 24)}d`);
        } else if (hoursUntil < 48) {
          score += 15;
          factors.push("Prazo < 48h");
        } else if (hoursUntil < 120) {
          score += 8;
          factors.push("Prazo < 5d");
        }
      }

      // Progress
      const pct = o.quantity > 0 ? o.produced_quantity / o.quantity : 0;
      if (pct < 0.1 && o.status === "in_progress") {
        score += 10;
        factors.push("< 10% concluído");
      }

      // Client order
      if (o.sales_order_id) {
        score += 5;
        factors.push("Pedido de cliente");
      }

      return { id: o.id, order_number: o.order_number, score: Math.round(score * 100) / 100, factors, currentPriority: o.priority };
    });

    if (action === "recalculate") {
      // Update priority_score on all active OPs
      let updated = 0;
      for (const s of scores) {
        const { data: written, error } = await supabase
          .from("production_orders")
          .update({ priority_score: s.score, updated_at: new Date().toISOString() })
          .eq("id", s.id)
          .eq("company_id", callerCompany)
          .select("id");
        if (error || !written?.length) throw error ?? new Error("OP não atualizada durante recálculo");
        updated++;
      }

      return new Response(
        JSON.stringify({
          action: "recalculate",
          ordersProcessed: scores.length,
          ordersUpdated: updated,
          scores: scores.sort((a: any, b: any) => b.score - a.score).slice(0, 20),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "war_mode") {
      // Preview must be read-only. Include version and computed score in the
      // fingerprint so a later confirmation cannot silently apply a changed plan.
      const snapshotInput = JSON.stringify(allOrders.map((o: any) => [
        o.id, o.updated_at, o.priority, o.status, o.due_date, o.quantity,
        o.produced_quantity, scores.find(s => s.id === o.id)?.score,
      ]).sort((a: any[], b: any[]) => String(a[0]).localeCompare(String(b[0]))));
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshotInput));
      const snapshot = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");

      const changes = scores.flatMap(s => {
        const newPriority = s.score >= 50 ? "urgent" : s.score >= 30 ? "high" : s.score >= 15 ? "medium" : "low";
        return newPriority === s.currentPriority ? [] : [{
          id: s.id,
          order_number: s.order_number,
          oldPriority: s.currentPriority,
          newPriority,
          score: s.score,
          factors: s.factors,
        }];
      });

      if (body.confirm === true) {
        if (!body.expectedSnapshot || body.expectedSnapshot !== snapshot) {
          return new Response(JSON.stringify({ error: "Prévia desatualizada. Simule novamente antes de confirmar." }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409,
          });
        }
        for (const s of scores) {
          const change = changes.find(c => c.id === s.id);
          const version = allOrders.find((o: any) => o.id === s.id)?.updated_at;
          const { data: written, error } = await supabase.from("production_orders").update({
            priority_score: s.score,
            ...(change ? { priority: change.newPriority } : {}),
            updated_at: new Date().toISOString(),
          }).eq("id", s.id).eq("company_id", callerCompany).eq("updated_at", version).select("id");
          if (error || !written?.length) throw error ?? new Error("Plano de prioridade alterado durante a confirmação");
          // Other OPs may have been updated already: this loop is NOT atomic.
        }
      }

      return new Response(
        JSON.stringify({
          action: "war_mode",
          confirmed: body.confirm === true,
          snapshot,
          ordersAnalyzed: scores.length,
          priorityChanges: changes,
          summary: `Modo Guerra: ${scores.length} OPs, ${changes.length} repriorização(ões)${body.confirm ? ' — APLICADO' : ' — prévia sem gravação'}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use 'recalculate' or 'war_mode'" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (error) {
    console.error("pcp-priority error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
};

Deno.serve(instrument(handler, { source: "pcp-priority", getContext: contextFromAuth }));
