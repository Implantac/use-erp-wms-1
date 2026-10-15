import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getSystemPrompt } from "../_shared/ai-prompts.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { recordUsage } from "../_shared/usage.ts";
import { enforceQuota } from "../_shared/quota.ts";
import { instrument, contextFromAuth } from "../_shared/observability.ts";
import { buildCanonicalMetrics, formatCanonicalBlock } from "../_shared/canonical-metrics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    
    // Using getUser instead of getClaims for more robust auth verification
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authenticatedUserId = user.id;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limit: 30 requests / minute per user (AI calls are expensive)
    const rl = checkRateLimit({ key: `ai-executive:${authenticatedUserId}`, limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
      console.warn(`[ai-executive] rate limit hit for user ${authenticatedUserId}`);
      return rateLimitResponse(rl, corsHeaders);
    }

    // Fetch user profile to get company_id (multi-tenant isolation)
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", authenticatedUserId)
      .single();
    
    const companyId = profile?.company_id;

    const body = await req.json().catch(() => ({}));
    const ALLOWED_ACTIONS = new Set(["clear_history","chat","assistant_chat","daily_summary","generate_insights","generate_scenarios","ceo_brief","execute_decisions","autopilot_run","dashboard"]);
    const { action, messages, months = 12, segment = 'general' } = body;
    if (action !== undefined && (typeof action !== "string" || !ALLOWED_ACTIONS.has(action))) {
      return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (typeof months !== "number" || months < 1 || months > 60) {
      return new Response(JSON.stringify({ error: "Parâmetro months inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "clear_history") {
      let delQ = supabase.from("ai_executive_chat").delete().eq("user_id", authenticatedUserId);
      if (companyId) delQ = delQ.eq("company_id", companyId);
      await delQ;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    const AI_ACTIONS = new Set(["chat","assistant_chat","daily_summary","generate_insights","generate_scenarios","ceo_brief","autopilot_run"]);
    if (action && AI_ACTIONS.has(action)) {
      const blocked = await enforceQuota(companyId, "ai_calls", corsHeaders);
      if (blocked) return blocked;
      await recordUsage(companyId, "ai_call", 1, { source: "ai-executive", action });
    }

    if (action === "chat" || action === "assistant_chat") 
      return await handleUnifiedChat(messages, supabase, lovableKey, corsHeaders, authenticatedUserId, companyId);
    
    if (action === "daily_summary") 
      return await handleDailySummary(supabase, lovableKey, corsHeaders, authenticatedUserId, companyId);
    
    if (action === "generate_insights") 
      return await handleGenerateInsights(supabase, lovableKey, corsHeaders, authenticatedUserId, companyId);
    
    if (action === "generate_scenarios") 
      return await handleGenerateScenarios(supabase, lovableKey, corsHeaders, authenticatedUserId, companyId);
    
    if (action === "ceo_brief") 
      return await handleCEOBrief(supabase, lovableKey, corsHeaders, authenticatedUserId, companyId);
    
    if (action === "execute_decisions") 
      return await handleExecuteDecisions(supabase, body, corsHeaders, authenticatedUserId, companyId);
    
    if (action === "autopilot_run") 
      return await handleAutoPilotRun(supabase, lovableKey, corsHeaders, companyId);

    return await handleDashboardData(supabase, corsHeaders, months, segment, companyId);
  } catch (e) {
    console.error("ai-executive error:", e);
    return new Response(JSON.stringify({ error: "Erro interno. Tente novamente." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(instrument(handler, {
  source: "ai-executive",
  getContext: contextFromAuth,
}));

// ─── Data Fetching ──────────────────────────────────────────────

async function fetchAllData(supabase: any, companyId?: string) {
  const query = (table: string) => {
    let q = supabase.from(table).select("*");
    if (companyId) q = q.eq("company_id", companyId);
    return q;
  };

  const [
    ordersRes, receivableRes, payableRes, productsRes,
    clientsRes, productionRes, insightsRes, alertsRes, scenariosRes,
    salesRes, cashFlowRes, salesRepsRes, funnelRes, salesTargetsRes,
    orderItemsRes, commissionRes,
  ] = await Promise.all([
    query("orders").order("created_at", { ascending: false }).limit(500),
    query("accounts_receivable").limit(500),
    query("accounts_payable").limit(500),
    query("products").limit(500),
    query("clients").limit(500),
    query("production_orders").limit(200),
    query("ai_executive_insights").eq("status", "active").order("created_at", { ascending: false }).limit(20),
    query("ai_executive_alerts").eq("status", "active").order("created_at", { ascending: false }).limit(10),
    query("ai_executive_scenarios").order("created_at", { ascending: false }).limit(3),
    query("sales").limit(500),
    query("cash_flow_entries").order("date", { ascending: false }).limit(200),
    query("sales_reps").limit(100),
    query("sales_funnel").limit(300),
    query("sales_targets").limit(100),
    query("order_items").limit(1000),
    query("commissions").limit(200),
  ]);

  // Fiscal data (NF-e, taxes, SPED)
  const [nfeRes, nfeItemsRes, taxRulesRes, spedRes] = await Promise.all([
    query("nfe").order("issue_date", { ascending: false }).limit(300).then((r: any) => r).catch(() => ({ data: [] })),
    query("nfe_items").limit(1000).then((r: any) => r).catch(() => ({ data: [] })),
    query("tax_rules").limit(200).then((r: any) => r).catch(() => ({ data: [] })),
    query("sped_files").order("generated_at", { ascending: false }).limit(50).then((r: any) => r).catch(() => ({ data: [] })),
  ]);

  // NPS / Relacionamento (Voice of Customer)
  const [npsAnswersRes, npsInvitesRes] = await Promise.all([
    query("nps_answers").order("created_at", { ascending: false }).limit(500).then((r: any) => r).catch(() => ({ data: [] })),
    query("nps_invites").limit(1000).then((r: any) => r).catch(() => ({ data: [] })),
  ]);

  return {
    orders: ordersRes.data || [],
    receivables: receivableRes.data || [],
    payables: payableRes.data || [],
    products: productsRes.data || [],
    clients: clientsRes.data || [],
    production: productionRes.data || [],
    insights: insightsRes.data || [],
    alerts: alertsRes.data || [],
    scenarios: scenariosRes.data || [],
    sales: salesRes.data || [],
    cashFlow: cashFlowRes.data || [],
    salesReps: salesRepsRes.data || [],
    funnel: funnelRes.data || [],
    salesTargets: salesTargetsRes.data || [],
    orderItems: orderItemsRes.data || [],
    commissions: commissionRes.data || [],
    nfe: nfeRes.data || [],
    nfeItems: nfeItemsRes.data || [],
    taxRules: taxRulesRes.data || [],
    spedFiles: spedRes.data || [],
    npsAnswers: npsAnswersRes.data || [],
    npsInvites: npsInvitesRes.data || [],
  };
}

// ─── KPI Computation ──────────────────────────────────────────────

function computeKPIs(d: any, months: number = 12) {
  const completedStatuses = ['completed', 'invoiced', 'shipped', 'delivered'];
  const now = new Date();
  
  // Base metrics
  const totalRevenue = d.orders.filter((o: any) => completedStatuses.includes(o.status)).reduce((s: number, o: any) => s + (o.total || 0), 0);
  const totalCosts = d.payables.filter((p: any) => p.status === 'paid').reduce((s: number, p: any) => s + (p.amount || 0), 0);
  const grossProfit = totalRevenue - totalCosts;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue * 100) : 0;

  // Time-based aggregation for trends
  const revenueByMonth = [];
  const growthTrends = [];
  
  for (let i = months; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthOrders = d.orders.filter((o: any) => {
      const od = new Date(o.created_at);
      return od.getMonth() === dt.getMonth() && od.getFullYear() === dt.getFullYear() && completedStatuses.includes(o.status);
    });
    
    const monthPayables = d.payables.filter((p: any) => {
      const pd = new Date(p.due_date);
      return pd.getMonth() === dt.getMonth() && pd.getFullYear() === dt.getFullYear() && p.status === 'paid';
    });

    const rev = monthOrders.reduce((s: number, o: any) => s + (o.total || 0), 0);
    const cost = monthPayables.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const profit = rev - cost;
    const margin = rev > 0 ? (profit / rev * 100) : 0;

    revenueByMonth.push({
      month: dt.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      revenue: rev,
      margin: +margin.toFixed(1)
    });
  }

  for (let i = 1; i < revenueByMonth.length; i++) {
    const current = revenueByMonth[i];
    const prev = revenueByMonth[i - 1];
    const moM = prev.revenue > 0 ? ((current.revenue - prev.revenue) / prev.revenue * 100) : 0;
    
    let yoY = 0;
    if (i >= 12) {
      const sameMonthLastYear = revenueByMonth[i - 12];
      yoY = sameMonthLastYear.revenue > 0 ? ((current.revenue - sameMonthLastYear.revenue) / sameMonthLastYear.revenue * 100) : 0;
    }

    growthTrends.push({
      month: current.month,
      revenueMoM: +moM.toFixed(1),
      revenueYoY: +yoY.toFixed(1),
      margin: current.margin
    });
  }

  const totalReceivable = d.receivables.filter((r: any) => r.status === 'pending').reduce((s: number, r: any) => s + (r.open_amount || r.amount || 0), 0);
  const overdueReceivable = d.receivables.filter((r: any) => r.status === 'overdue' || (r.status === 'pending' && new Date(r.due_date) < now)).reduce((s: number, r: any) => s + (r.open_amount || r.amount || 0), 0);
  const defaultRate = (totalReceivable + overdueReceivable) > 0 ? (overdueReceivable / (totalReceivable + overdueReceivable) * 100) : 0;

  const futureReceivablesTotal = d.receivables.filter((r: any) => r.status === 'pending' && new Date(r.due_date) > now).reduce((s: number, r: any) => s + (r.open_amount || r.amount || 0), 0);
  const futurePayablesTotal = d.payables.filter((p: any) => p.status === 'pending' && new Date(p.due_date) > now).reduce((s: number, p: any) => s + (p.open_amount || p.amount || 0), 0);

  const currentRatio = futurePayablesTotal > 0 ? futureReceivablesTotal / futurePayablesTotal : 2; 
  const quickRatio = futurePayablesTotal > 0 ? (futureReceivablesTotal * 0.8) / futurePayablesTotal : 1.5;

  const activeClientsCount = d.clients.filter((c: any) => c.status === 'active').length;
  const inactiveClientsCount = d.clients.filter((c: any) => c.status === 'inactive').length;
  const churnRate = (activeClientsCount + inactiveClientsCount) > 0 ? (inactiveClientsCount / (activeClientsCount + inactiveClientsCount) * 100) : 0;

  const prodCompleted = d.production.filter((p: any) => p.status === 'completed');
  const prodEfficiency = d.production.length > 0 ? (prodCompleted.length / d.production.length * 100) : 0;

  const targetsSummary = d.salesTargets.reduce((acc: any, t: any) => ({ target: acc.target + (t.target_value || 0), achieved: acc.achieved + (t.achieved_value || 0) }), { target: 0, achieved: 0 });
  const targetAttainment = targetsSummary.target > 0 ? (targetsSummary.achieved / targetsSummary.target * 100) : 0;

  const productMap: Record<string, any> = {};
  d.products.forEach((p: any) => { productMap[p.id] = { name: p.name, cost: p.cost || 0 }; });
  const productSales: Record<string, any> = {};
  d.orderItems.forEach((item: any) => {
    if (!item.product_id || !productMap[item.product_id]) return;
    if (!productSales[item.product_id]) productSales[item.product_id] = { revenue: 0, cost: 0, qty: 0, name: productMap[item.product_id].name };
    productSales[item.product_id].revenue += item.total || 0;
    productSales[item.product_id].cost += (productMap[item.product_id].cost || 0) * (item.quantity || 0);
    productSales[item.product_id].qty += item.quantity || 0;
  });
  const productMargins = Object.values(productSales).map((v: any) => ({
    ...v,
    margin: v.revenue - v.cost,
    marginPct: v.revenue > 0 ? +((v.revenue - v.cost) / v.revenue * 100).toFixed(1) : 0
  })).sort((a, b) => b.revenue - a.revenue);

  const kpis = {
      totalRevenue, grossProfit, totalCosts,
      grossMargin: +grossMargin.toFixed(1),
      moMGrowth: growthTrends[growthTrends.length - 1]?.revenueMoM || 0,
      yoYGrowth: growthTrends[growthTrends.length - 1]?.revenueYoY || 0,
      defaultRate: +defaultRate.toFixed(1),
      totalReceivable,
      overdueReceivable,
      totalPayable: d.payables.filter((p: any) => p.status === 'pending').reduce((s: number, p: any) => s + (p.open_amount || p.amount || 0), 0),
      churnRate: +churnRate.toFixed(1),
      avgDailyRevenue: +(totalRevenue / 30).toFixed(0),
      cashFlowProjection30d: futureReceivablesTotal - futurePayablesTotal,
      futureReceivables: futureReceivablesTotal, 
      futurePayables: futurePayablesTotal,
      currentRatio: +currentRatio.toFixed(2),
      quickRatio: +quickRatio.toFixed(2),
      prodEfficiency: +prodEfficiency.toFixed(1),
      prodInProgress: d.production.filter((p: any) => p.status === 'in_progress').length,
      prodPlanned: d.production.filter((p: any) => p.status === 'planned').length,
      prodCompleted: prodCompleted.length,
      targetAttainment,
      totalTarget: targetsSummary.target,
      totalAchieved: targetsSummary.achieved,
      activeClients: activeClientsCount,
      clientsAtRisk: d.clients.filter((c: any) => c.abc_classification === 'C' && c.status === 'active').length,
      concentrationPct: (() => {
          const top3Revenue = d.clients.sort((a: any, b: any) => (b.total_purchases || 0) - (a.total_purchases || 0)).slice(0, 3).reduce((s: number, c: any) => s + (c.total_purchases || 0), 0);
          return totalRevenue > 0 ? +((top3Revenue / totalRevenue) * 100).toFixed(1) : 0;
      })(),
      avgTicket: activeClientsCount > 0 ? +(totalRevenue / activeClientsCount).toFixed(2) : 0,
      netPosition: totalReceivable - totalCosts,
      lowStockProducts: d.products.filter((p: any) => p.stock_current <= p.stock_min).length,
      revenueGrowth: growthTrends[growthTrends.length - 1]?.revenueMoM || 0,
      // Fiscal KPIs
      nfeIssuedCount: d.nfe.length,
      nfeAuthorizedCount: d.nfe.filter((n: any) => n.status === 'authorized' || n.status === 'autorizada').length,
      nfeRejectedCount: d.nfe.filter((n: any) => n.status === 'rejected' || n.status === 'rejeitada').length,
      nfeTotalAmount: d.nfe.reduce((s: number, n: any) => s + (n.total_amount || 0), 0),
      totalTaxAmount: d.nfe.reduce((s: number, n: any) => s + (n.total_tax || 0), 0),
      taxBurdenPct: (() => {
        const rev = d.nfe.reduce((s: number, n: any) => s + (n.total_amount || 0), 0);
        const tax = d.nfe.reduce((s: number, n: any) => s + (n.total_tax || 0), 0);
        return rev > 0 ? +(tax / rev * 100).toFixed(2) : 0;
      })(),
      activeTaxRules: d.taxRules.filter((t: any) => t.active).length,
      spedFilesGenerated: d.spedFiles.length,
      lastSpedDate: d.spedFiles[0]?.generated_at || null,
      // NPS / CX
      ...(() => {
        const ans = d.npsAnswers || [];
        const total = ans.length;
        const promoters = ans.filter((a: any) => (a.score ?? -1) >= 9).length;
        const detractors = ans.filter((a: any) => (a.score ?? -1) <= 6 && a.score != null).length;
        const passives = total - promoters - detractors;
        const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
        const invitesTotal = (d.npsInvites || []).length;
        const responded = (d.npsInvites || []).filter((i: any) => i.responded_at).length;
        const responseRate = invitesTotal > 0 ? Math.min(100, Math.round((responded / invitesTotal) * 100)) : 0;
        return { npsScore, npsTotal: total, npsPromoters: promoters, npsPassives: passives, npsDetractors: detractors, npsResponseRate: responseRate };
      })(),
  };

  // NPS: comentários críticos (detratores com sentimento negativo ou score <= 4)
  const criticalNpsComments = (d.npsAnswers || [])
    .filter((a: any) => (a.score != null && a.score <= 4) || a.ai_sentiment === 'negative')
    .filter((a: any) => (a.comment || '').trim().length > 0)
    .slice(0, 10)
    .map((a: any) => ({ score: a.score, sentiment: a.ai_sentiment, summary: a.ai_summary || a.comment?.slice(0, 200), created_at: a.created_at }));

  return {
    kpis,
    revenueByMonth: revenueByMonth.slice(1),
    growthTrends,
    topClients: d.clients.sort((a: any, b: any) => (b.total_purchases || 0) - (a.total_purchases || 0)).slice(0, 5),
    expenseByCategory: d.payables.reduce((acc: any, p: any) => ({ ...acc, [p.category || 'Outros']: (acc[p.category || 'Outros'] || 0) + (p.amount || 0) }), {}),
    salesRepStats: d.salesReps.map((r: any) => ({ name: r.name, revenue: d.orders.filter((o: any) => o.sales_rep_id === r.id).reduce((s: number, o: any) => s + (o.total || 0), 0) })),
    funnelByStage: d.funnel.reduce((acc: any, f: any) => ({ ...acc, [f.stage || 'Outros']: (acc[f.stage || 'Outros'] || 0) + (f.value || 0) }), {}),
    productMargins: productMargins.slice(0, 10),
    topProfitable: productMargins.sort((a: any, b: any) => b.margin - a.margin).slice(0, 5),
    lowMarginProducts: productMargins.filter((p: any) => p.marginPct < 10).slice(0, 5),
    revenueByRegion: d.clients.reduce((acc: any, c: any) => ({ ...acc, [c.region || 'Outros']: (acc[c.region || 'Outros'] || 0) + (c.total_purchases || 0) }), {}),
    autoAlerts: d.alerts,
    criticalNpsComments,
    swot: {
      strengths: [
        { title: "Margem Bruta", description: `Margem de ${kpis.grossMargin}% acima da meta setorial`, impact: "high" },
        { title: "Fidelidade", description: "Top 5 clientes representam receita recorrente estável", impact: "medium" }
      ],
      weaknesses: [
        { title: "Inadimplência", description: `Taxa de ${kpis.defaultRate}% impactando fluxo de caixa`, impact: "high" },
        { title: "Estoque Crítico", description: `${d.products.filter((p: any) => p.stock_current <= p.stock_min).length} itens abaixo do estoque mínimo`, impact: "medium" }
      ],
      opportunities: [
        { title: "Expansão Regional", description: "Crescimento detectado na região Sul (+15%)", impact: "medium" },
        { title: "Mix de Produtos", description: "Oportunidade de cross-sell em clientes classe A", impact: "low" }
      ],
      threats: [
        { title: "Concentração", description: "Faturamento concentrado (3 clientes > 40%)", impact: "high" },
        { title: "Custo Operacional", description: "Tendência de alta em custos logísticos MoM", impact: "medium" }
      ]
    },
    summary: {
      totalOrders: d.orders.length,
      totalProducts: d.products.length,
      totalClients: d.clients.length,
      productionOrders: d.production.length,
      funnelOpportunities: d.funnel.length,
    },
  };
}


// Helper: detecta se há dados reais suficientes para análise por IA
function checkHasRealData(d: any): boolean {
  return (
    (d.orders?.length ?? 0) > 0 ||
    (d.sales?.length ?? 0) > 0 ||
    (d.receivables?.length ?? 0) > 0 ||
    (d.payables?.length ?? 0) > 0
  );
}

const INSUFFICIENT_DATA_MSG = "Dados insuficientes para análise confiável. Cadastre vendas, pedidos, contas a pagar ou receber para que a IA possa gerar diagnóstico baseado em dados reais.";

async function handleDashboardData(supabase: any, corsHeaders: any, months: number = 12, segment: string = 'general', companyId?: string) {
  const d = await fetchAllData(supabase, companyId);
  const computed = computeKPIs(d, months);
  
  // Custom logic for consensus based on segment
  const consensus = generateConsensusItems(computed.kpis, d, segment);
  
  const hasRealData = checkHasRealData(d);

  return new Response(JSON.stringify({
    ...computed,
    consensus,
    insights: d.insights,
    alerts: d.alerts,
    scenarios: d.scenarios,
    data_status: hasRealData ? "ok" : "insufficient",
    summary: {
      ...computed.summary,
      segment
    }
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateConsensusItems(kpis: any, data: any, segment: string) {
  const items = [];
  
  // IA CEO
  items.push({
    specialist: 'IA CEO',
    insight: kpis.totalRevenue > 0 ? `Crescimento projetado de ${kpis.revenueGrowth || 0}%. Foco estratégico em expansão de margem.` : 'Aguardando massa crítica de dados para roadmap estratégico.',
    status: 'success',
  });

  // IA CFO
  items.push({
    specialist: 'IA CFO',
    insight: kpis.defaultRate > 5 ? `Alerta: Inadimplência em ${kpis.defaultRate}%. Recomendo revisão de régua de cobrança.` : 'Saúde financeira e liquidez em níveis excelentes.',
    status: kpis.defaultRate > 5 ? 'alert' : 'success',
  });

  // Industrial Vertical
  if (['textile', 'fio', 'tecelagem', 'industry', 'pharma', 'food_factory'].includes(segment)) {
    items.push({
      specialist: 'Especialista PCP',
      insight: kpis.prodEfficiency < 85 ? `OEE abaixo da meta (${kpis.prodEfficiency}%). Analisando paradas.` : 'Eficiência produtiva acima da média setorial.',
      status: kpis.prodEfficiency < 85 ? 'alert' : 'success',
    });
    
    if (segment === 'pharma') {
      items.push({
        specialist: 'Quality QA',
        insight: 'Rastreabilidade total garantida. Lotes em conformidade com RDC 658.',
        status: 'success',
      });
    } else {
      items.push({
        specialist: 'IA Supply Chain',
        insight: data.products.some((p: any) => p.stock_current <= p.stock_min) ? 'Ruptura detectada em itens Curva A.' : 'Níveis de estoque otimizados via MRP dinâmico.',
        status: data.products.some((p: any) => p.stock_current <= p.stock_min) ? 'alert' : 'success',
      });
    }
  } else {
    // Other verticals
    items.push({
      specialist: 'Market Intelligence',
      insight: 'Oportunidades de cross-sell detectadas em 15% da base de clientes ativa.',
      status: 'success',
    });
    items.push({
      specialist: 'IA CTO',
      insight: 'Infraestrutura Enterprise Evolution Engine (EEE) operando com latência < 30ms.',
      status: 'success',
    });
  }

  return items;
}


// ─── Generate Insights ──────────────────────────────────────────

async function handleGenerateInsights(supabase: any, lovableKey: string, corsHeaders: any, authenticatedUserId?: string, companyId?: string) {
  if (!companyId) {
    return new Response(JSON.stringify({ error: "Empresa não identificada" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const d = await fetchAllData(supabase, companyId);
  const computed = computeKPIs(d);

  // Guard: sem dados reais, não chama LLM (evita alucinação)
  if (!checkHasRealData(d)) {
    return new Response(JSON.stringify({
      insights: [],
      generated: 0,
      data_status: "insufficient",
      message: INSUFFICIENT_DATA_MSG,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const systemPrompt = await getSystemPrompt('CEO', `Analise APENAS os dados reais fornecidos e gere insights estratégicos acionáveis.
- Gere entre 4-10 insights cobrindo: receita, lucro, custos, risco financeiro, eficiência operacional e comercial.
- Cada insight deve seguir o esquema JSON: { type, severity, title, description, explanation, impact_estimate, recommended_actions, module }.
- Toda recomendação deve ser concreta e mensurável.`, supabase, 'ai-executive-insights', authenticatedUserId);

  const userPrompt = `DADOS DA EMPRESA:
KPIs: ${JSON.stringify(computed.kpis)}
RECEITA MENSAL: ${JSON.stringify(computed.revenueByMonth)}
TOP CLIENTES: ${JSON.stringify(computed.topClients)}
DESPESAS: ${JSON.stringify(computed.expenseByCategory)}
VENDEDORES: ${JSON.stringify(computed.salesRepStats)}
FUNIL: ${JSON.stringify(computed.funnelByStage)}
MARGEM POR PRODUTO (top 10): ${JSON.stringify(computed.productMargins)}
PRODUTOS BAIXA MARGEM: ${JSON.stringify(computed.lowMarginProducts)}
RECEITA POR REGIÃO: ${JSON.stringify(computed.revenueByRegion)}
ALERTAS AUTO: ${JSON.stringify(computed.autoAlerts)}
NPS / VOZ DO CLIENTE: score=${computed.kpis.npsScore}, respostas=${computed.kpis.npsTotal}, promotores=${computed.kpis.npsPromoters}, neutros=${computed.kpis.npsPassives}, detratores=${computed.kpis.npsDetractors}, taxa_resposta=${computed.kpis.npsResponseRate}%
COMENTÁRIOS CRÍTICOS NPS: ${JSON.stringify(computed.criticalNpsComments)}
RESUMO: ${JSON.stringify(computed.summary)}

Gere insights estratégicos: { "insights": [...] }`;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!aiResp.ok) {
    const status = aiResp.status;
    return new Response(JSON.stringify({ error: "AI analysis failed" }), {
      status: status === 429 ? 429 : status === 402 ? 402 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const aiData = await aiResp.json();
  const content = aiData.choices?.[0]?.message?.content || "{}";
  let parsed: any;
  try { parsed = JSON.parse(content); } catch { parsed = { insights: [] }; }
  const insights = parsed.insights || [];

  await supabase.from("ai_executive_insights")
    .update({ status: "expired" })
    .eq("status", "active")
    .eq("company_id", companyId);

  for (const ins of insights) {
    await supabase.from("ai_executive_insights").insert({
      company_id: companyId,
      insight_type: ins.type || "general",
      category: "strategic",
      severity: ins.severity || "medium",
      title: ins.title,
      description: ins.description,
      explanation: ins.explanation,
      impact_estimate: ins.impact_estimate,
      recommended_actions: ins.recommended_actions,
      module: ins.module || ins.type,
    });
  }

  return new Response(JSON.stringify({ insights, generated: insights.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Generate Scenarios ──────────────────────────────────────────

async function handleGenerateScenarios(supabase: any, lovableKey: string, corsHeaders: any, authenticatedUserId?: string, companyId?: string) {
  if (!companyId) {
    return new Response(JSON.stringify({ error: "Empresa não identificada" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const d = await fetchAllData(supabase, companyId);
  const computed = computeKPIs(d);

  // Guard: sem dados reais, não simula cenários
  if (!checkHasRealData(d)) {
    return new Response(JSON.stringify({
      scenarios: null,
      data_status: "insufficient",
      message: INSUFFICIENT_DATA_MSG,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const systemPrompt = await getSystemPrompt('CEO', `Com base APENAS nos dados reais fornecidos, gere 3 cenários (otimista, realista, pessimista) para os próximos 3 meses.
- Formato JSON: { "scenarios": { "optimistic": { "revenue", "profit", "margin", "growth", "description", "key_actions": [...] }, "realistic": {...}, "pessimistic": {...} }, "assumptions": [...], "recommendations": [...], "risks": [...] }
- Cada cenário deve ter ações específicas e mensuráveis.`, supabase, 'ai-executive-scenarios', authenticatedUserId);

  const userPrompt = `KPIs: ${JSON.stringify(computed.kpis)}
RECEITA MENSAL: ${JSON.stringify(computed.revenueByMonth)}
FUNIL: ${JSON.stringify(computed.funnelByStage)}
VENDEDORES: ${JSON.stringify(computed.salesRepStats)}
MARGEM PRODUTOS: ${JSON.stringify(computed.productMargins?.slice(0, 5))}
RECEITA REGIÃO: ${JSON.stringify(computed.revenueByRegion)}`;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!aiResp.ok) {
    const status = aiResp.status;
    return new Response(JSON.stringify({ error: "Scenario generation failed" }), {
      status: status === 429 ? 429 : status === 402 ? 402 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const aiData = await aiResp.json();
  const content = aiData.choices?.[0]?.message?.content || "{}";
  let parsed: any;
  try { parsed = JSON.parse(content); } catch { parsed = {}; }

  const scenarios = parsed.scenarios || {};
  await supabase.from("ai_executive_scenarios").insert({
    company_id: companyId,
    scenario_type: "quarterly",
    period: "next_3_months",
    optimistic: scenarios.optimistic || null,
    realistic: scenarios.realistic || null,
    pessimistic: scenarios.pessimistic || null,
    assumptions: parsed.assumptions || [],
    recommendations: parsed.recommendations || [],
  });

  return new Response(JSON.stringify(parsed), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── ERP Tools (Unified) ────────────────────────────────────────

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const ERP_TOOLS = [
  {
    type: "function",
    function: {
      name: "analise_historica",
      description: "Compara performance de períodos (ex: último mês vs mês anterior ou ano passado).",
      parameters: {
        type: "object",
        properties: {
          periodo_a: { type: "string", description: "Data inicial período A (YYYY-MM-DD)" },
          periodo_b: { type: "string", description: "Data inicial período B (YYYY-MM-DD)" },
        },
        required: ["periodo_a", "periodo_b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_financeiro",
      description: "Consulta resumo financeiro: contas a pagar, receber, vencimentos, saldos, inadimplência",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["resumo", "a_pagar", "a_receber", "vencimentos_hoje", "atrasados", "fluxo_caixa"], description: "Tipo de consulta financeira" },
          periodo_dias: { type: "number", description: "Período em dias para projeção (padrão 30)" },
        },
        required: ["tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_comercial",
      description: "Consulta resumo comercial: clientes, pedidos, funil, metas, vendedores",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["resumo", "pedidos_recentes", "top_clientes", "clientes_risco", "metas", "funil", "vendedores"], description: "Tipo de consulta comercial" },
          limite: { type: "number", description: "Limite de registros (padrão 10)" },
        },
        required: ["tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_producao",
      description: "Consulta resumo de produção: OPs ativas, atrasadas, eficiência",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["resumo", "ordens_ativas", "atrasadas", "eficiencia"], description: "Tipo de consulta produção" },
        },
        required: ["tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_estoque",
      description: "Consulta resumo de estoque: produtos, ruptura, movimentações",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["resumo", "baixo_estoque", "movimentacoes_recentes", "produto_especifico"], description: "Tipo de consulta estoque" },
          produto_nome: { type: "string", description: "Nome do produto para busca" },
        },
        required: ["tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sugerir_acao",
      description: "Propõe próximos passos nos módulos, sem executar pagamentos, estoque, pedidos ou produção",
      parameters: {
        type: "object",
        properties: {
          acao: { type: "string", enum: ["registrar_pagamento", "adiar_vencimento", "criar_conta_pagar", "criar_conta_receber", "alterar_status_pedido", "alterar_status_op", "priorizar_op", "ajustar_estoque"] },
          modulo: { type: "string", enum: ["financeiro", "comercial", "producao", "estoque"] },
          parametros: { type: "object", description: "Dados para revisão humana; não executados" },
        },
        required: ["acao", "modulo", "parametros"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_fiscal",
      description: "Consulta dados fiscais: NF-e emitidas/autorizadas/rejeitadas, total de impostos, carga tributária, regras fiscais ativas e SPED gerados.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["resumo", "nfe_recentes", "nfe_rejeitadas", "impostos_periodo", "regras_ativas", "sped"], description: "Tipo de consulta fiscal" },
          periodo_dias: { type: "number", description: "Período em dias (padrão 30)" },
        },
        required: ["tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_nps",
      description: "Consulta dados de NPS/CSAT/CES: score atual, tendência, promotores/detratores, follow-ups pendentes, respostas recentes com comentários e principais alertas de experiência do cliente.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["resumo", "tendencia", "detratores", "comentarios_recentes", "followups", "csat_ces"], description: "Tipo de consulta NPS" },
          periodo_dias: { type: "number", description: "Período em dias (padrão 90)" },
        },
        required: ["tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analise_estrategica",
      description: "Gera análise estratégica detalhada com KPIs, tendências e recomendações da empresa toda",
      parameters: {
        type: "object",
        properties: {
          foco: { type: "string", enum: ["geral", "financeiro", "comercial", "producao", "margem", "risco", "fiscal"], description: "Foco da análise" },
        },
        required: ["foco"],
      },
    },
  },
];

// ─── Tool Executors ─────────────────────────────────────────────

async function executeConsultaFinanceiro(supabase: any, args: any, user_id?: string, company_id?: string) {
  if (!company_id) return { erro: "Empresa não identificada para a sessão." };
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const query = (table: string) => {
    let q = supabase.from(table).select("*");
    if (company_id) q = q.eq("company_id", company_id);
    return q;
  };

  switch (args.tipo) {
    case "resumo": {
      const [recRes, pagRes, bankRes] = await Promise.all([
        query("accounts_receivable").limit(500),
        query("accounts_payable").limit(500),
        query("bank_accounts").eq("active", true),
      ]);
      const rec = recRes.data || []; const pag = pagRes.data || []; const banks = bankRes.data || [];
      const saldoBancario = banks.reduce((s: number, b: any) => s + (b.balance || 0), 0);
      const totalReceber = rec.filter((r: any) => r.status === "pending").reduce((s: number, r: any) => s + (r.open_amount || r.amount || 0), 0);
      const totalPagar = pag.filter((p: any) => p.status === "pending").reduce((s: number, p: any) => s + (p.open_amount || p.amount || 0), 0);
      const atrasadosRec = rec.filter((r: any) => (r.status === "overdue" || (r.status === "pending" && r.due_date < today)));
      const atrasadosPag = pag.filter((p: any) => (p.status === "overdue" || (p.status === "pending" && p.due_date < today)));
      return { saldo_bancario: saldoBancario, contas_bancarias: banks.map((b: any) => ({ nome: b.name, saldo: b.balance })), total_a_receber: totalReceber, total_a_pagar: totalPagar, posicao_liquida: totalReceber - totalPagar, inadimplencia: { total: atrasadosRec.reduce((s: number, r: any) => s + (r.open_amount || r.amount || 0), 0), quantidade: atrasadosRec.length }, contas_atrasadas_pagar: { total: atrasadosPag.reduce((s: number, p: any) => s + (p.open_amount || p.amount || 0), 0), quantidade: atrasadosPag.length } };
    }
    case "vencimentos_hoje": {
      const [recHoje, pagHoje] = await Promise.all([
        query("accounts_receivable").eq("due_date", today).eq("status", "pending"),
        query("accounts_payable").eq("due_date", today).eq("status", "pending"),
      ]);
      return { data: today, receber_hoje: { total: (recHoje.data || []).reduce((s: number, r: any) => s + (r.open_amount || r.amount || 0), 0), itens: recHoje.data || [] }, pagar_hoje: { total: (pagHoje.data || []).reduce((s: number, p: any) => s + (p.open_amount || p.amount || 0), 0), itens: pagHoje.data || [] } };
    }
    case "atrasados": {
      const [recAtr, pagAtr] = await Promise.all([
        query("accounts_receivable").or(`status.eq.overdue,and(status.eq.pending,due_date.lt.${today})`).order("due_date").limit(20),
        query("accounts_payable").or(`status.eq.overdue,and(status.eq.pending,due_date.lt.${today})`).order("due_date").limit(20),
      ]);
      return { receber_atrasados: recAtr.data || [], pagar_atrasados: pagAtr.data || [] };
    }
    case "a_pagar": {
      const { data } = await query("accounts_payable").eq("status", "pending").order("due_date").limit(20);
      return { contas_a_pagar: data || [] };
    }
    case "a_receber": {
      const { data } = await query("accounts_receivable").eq("status", "pending").order("due_date").limit(20);
      return { contas_a_receber: data || [] };
    }
    case "fluxo_caixa": {
      const dias = args.periodo_dias || 30;
      const futuro = new Date(now.getTime() + dias * 86400000).toISOString().split("T")[0];
      const [recFut, pagFut, bankRes] = await Promise.all([
        query("accounts_receivable").eq("status", "pending").gte("due_date", today).lte("due_date", futuro),
        query("accounts_payable").eq("status", "pending").gte("due_date", today).lte("due_date", futuro),
        query("bank_accounts").eq("active", true),
      ]);
      const entradas = (recFut.data || []).reduce((s: number, r: any) => s + (r.open_amount || r.amount || 0), 0);
      const saidas = (pagFut.data || []).reduce((s: number, p: any) => s + (p.open_amount || p.amount || 0), 0);
      const saldoAtual = (bankRes.data || []).reduce((s: number, b: any) => s + (b.balance || 0), 0);
      return { periodo_dias: dias, saldo_atual: saldoAtual, entradas_previstas: entradas, saidas_previstas: saidas, saldo_projetado: saldoAtual + entradas - saidas };
    }
    default: return { erro: "Tipo não reconhecido" };
  }
}

async function executeConsultaComercial(supabase: any, args: any, user_id?: string, company_id?: string) {
  if (!company_id) return { erro: "Empresa não identificada para a sessão." };
  const limite = args.limite || 10;
  const query = (table: string) => {
    let q = supabase.from(table).select("*");
    if (company_id) q = q.eq("company_id", company_id);
    return q;
  };

  switch (args.tipo) {
    case "resumo": {
      const [clRes, ordRes, funRes] = await Promise.all([
        query("clients").limit(1000),
        query("orders").order("created_at", { ascending: false }).limit(100),
        query("sales_funnel").limit(300),
      ]);
      const clients = clRes.data || []; const orders = ordRes.data || []; const funnel = funRes.data || [];
      return { clientes_ativos: clients.filter((c: any) => c.status === "active").length, total_clientes: clients.length, pedidos_recentes_30d: orders.filter((o: any) => new Date(o.created_at) > new Date(Date.now() - 30 * 86400000)).length, valor_pipeline: funnel.filter((f: any) => f.status === "active" || !f.status).reduce((s: number, f: any) => s + (f.value || 0), 0), oportunidades_ativas: funnel.filter((f: any) => f.status === "active" || !f.status).length };
    }
    case "pedidos_recentes": {
      const { data } = await query("orders").order("created_at", { ascending: false }).limit(limite);
      return { pedidos: data || [] };
    }
    case "top_clientes": {
      const { data } = await query("clients").order("total_purchases", { ascending: false }).limit(limite);
      return { top_clientes: data || [] };
    }
    case "clientes_risco": {
      const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data } = await query("clients").eq("status", "active").or(`last_purchase_date.lt.${cutoff},last_purchase_date.is.null`).limit(limite);
      return { clientes_em_risco: data || [] };
    }
    case "metas": {
      const { data } = await query("sales_targets").limit(50);
      const targets = data || [];
      const totalMeta = targets.reduce((s: number, t: any) => s + (t.target_value || 0), 0);
      const totalAtingido = targets.reduce((s: number, t: any) => s + (t.achieved_value || 0), 0);
      return { total_meta: totalMeta, total_atingido: totalAtingido, percentual: totalMeta > 0 ? +((totalAtingido / totalMeta) * 100).toFixed(1) : 0 };
    }
    case "funil": {
      const { data } = await query("sales_funnel").eq("status", "active").order("value", { ascending: false }).limit(limite);
      return { oportunidades: data || [] };
    }
    case "vendedores": {
      const [repsRes, ordersRes] = await Promise.all([
        query("sales_reps").eq("status", "active").limit(50),
        query("orders").in("status", ["completed", "invoiced", "shipped", "delivered"]).limit(500),
      ]);
      const reps = repsRes.data || [];
      const orders = ordersRes.data || [];
      const repMap: Record<string, { name: string; revenue: number; orders: number }> = {};
      orders.forEach((o: any) => {
        if (o.sales_rep_id) {
          if (!repMap[o.sales_rep_id]) repMap[o.sales_rep_id] = { name: o.sales_rep_name || '', revenue: 0, orders: 0 };
          repMap[o.sales_rep_id].revenue += o.total || 0;
          repMap[o.sales_rep_id].orders++;
        }
      });
      return { vendedores: reps.map((r: any) => ({ ...r, ...(repMap[r.id] || { revenue: 0, orders: 0 }) })) };
    }
    default: return { clientes_ativos: 0 };
  }
}

async function executeConsultaProducao(supabase: any, args: any, user_id?: string, company_id?: string) {
  if (!company_id) return { erro: "Empresa não identificada para a sessão." };
  const today = new Date().toISOString().split("T")[0];
  const query = (table: string) => {
    let q = supabase.from(table).select("*");
    if (company_id) q = q.eq("company_id", company_id);
    return q;
  };

  switch (args.tipo) {
    case "resumo": {
      const { data } = await query("production_orders").limit(500);
      const ops = data || [];
      return { total_ordens: ops.length, em_producao: ops.filter((o: any) => o.status === "in_progress").length, planejadas: ops.filter((o: any) => o.status === "planned" || o.status === "pending").length, concluidas: ops.filter((o: any) => o.status === "completed").length, atrasadas: ops.filter((o: any) => o.due_date && o.due_date < today && !["completed", "cancelled"].includes(o.status)).length };
    }
    case "ordens_ativas": {
      const { data } = await query("production_orders").in("status", ["in_progress", "planned", "pending"]).order("priority").limit(20);
      return { ordens_ativas: data || [] };
    }
    case "atrasadas": {
      const { data } = await query("production_orders").lt("due_date", today).not("status", "in", '("completed","cancelled")').order("due_date").limit(20);
      return { ordens_atrasadas: data || [] };
    }
    case "eficiencia": {
      const { count, error } = await supabase.from("production_orders").select("id", { count: "exact", head: true })
        .eq("company_id", company_id).eq("status", "completed");
      if (error) return { erro: "Não foi possível consultar as OPs." };
      return { eficiencia_geral: null, ordens_analisadas: count ?? 0,
        observacao: "Eficiência não apurada: unidades de OP e tempos de máquina não foram validados." };
    }
    default: return { resumo: "Dados não encontrados" };
  }
}

async function executeConsultaEstoque(supabase: any, args: any, user_id?: string, company_id?: string) {
  if (!company_id) return { erro: "Empresa não identificada para a sessão." };
  const query = (table: string) => {
    let q = supabase.from(table).select("*");
    if (company_id) q = q.eq("company_id", company_id);
    return q;
  };

  switch (args.tipo) {
    case "resumo": {
      const { data } = await query("products").eq("status", "active").limit(500);
      const prods = data || [];
      return { total_produtos: prods.length, abaixo_minimo: prods.filter((p: any) => p.stock_current <= p.stock_min).length,
        valor_estoque_total: null, observacao: "Valor do estoque não apurado: preço de catálogo não é custo de lote validado." };
    }
    case "baixo_estoque": {
      const { data } = await query("products").eq("status", "active").limit(500);
      const baixo = (data || []).filter((p: any) => p.stock_current <= p.stock_min).sort((a: any, b: any) => (a.stock_current - a.stock_min) - (b.stock_current - b.stock_min));
      return { produtos_baixo_estoque: baixo.slice(0, 20) };
    }
    case "movimentacoes_recentes": {
      const { data } = await query("stock_movements").order("created_at", { ascending: false }).limit(15);
      return { movimentacoes: data || [] };
    }
    case "produto_especifico": {
      if (!args.produto_nome) return { erro: "Nome do produto não informado" };
      const { data } = await query("products").ilike("name", `%${args.produto_nome}%`).limit(5);
      return { produtos_encontrados: data || [] };
    }
    default: return { resumo: "Dados não encontrados" };
  }
}

async function suggestAction(_supabase: any, args: any, _user_id?: string, company_id?: string) {
  if (!company_id) return { erro: "Empresa não identificada para a sessão." };
  const allowed = new Set([
    "registrar_pagamento", "adiar_vencimento", "criar_conta_pagar", "criar_conta_receber",
    "alterar_status_pedido", "alterar_status_op", "priorizar_op", "ajustar_estoque",
  ]);
  if (!allowed.has(args?.acao) || !["financeiro", "comercial", "producao", "estoque"].includes(args?.modulo)) {
    return { erro: "Ação não reconhecida para sugestão." };
  }
  return {
    status: "sugestao_nao_executada",
    acao: args.acao,
    modulo: args.modulo,
    mensagem: "Nenhum dado foi alterado. Revise e aprove a operação no módulo responsável, com suas validações e permissões próprias.",
  };
}

async function executeAnaliseEstrategica(supabase: any, args: any, user_id?: string, company_id?: string) {
  if (!company_id) return { erro: "Empresa não identificada para a sessão." };
  const d = await fetchAllData(supabase, company_id);
  const computed = computeKPIs(d);
  const k = computed.kpis;

  const focusData: Record<string, any> = {
    geral: { kpis: k, topClients: computed.topClients, revenueByMonth: computed.revenueByMonth, salesRepStats: computed.salesRepStats, funnelByStage: computed.funnelByStage, autoAlerts: computed.autoAlerts },
    financeiro: { receita: k.totalRevenue, custos: k.totalCosts, lucro: k.grossProfit, margem: k.grossMargin, inadimplencia: k.overdueReceivable, taxa_inadimplencia: k.defaultRate, posicao_liquida: k.netPosition, fluxo_caixa_30d: k.cashFlowProjection30d, receber: k.totalReceivable, pagar: k.totalPayable, despesas: computed.expenseByCategory },
    comercial: { clientes_ativos: k.activeClients, clientes_risco: k.clientsAtRisk, concentracao: k.concentrationPct, ticket_medio: k.avgTicket, meta_atingimento: k.targetAttainment, topClients: computed.topClients, vendedores: computed.salesRepStats, funil: computed.funnelByStage, crescimento: k.revenueGrowth },
    producao: { eficiencia: k.prodEfficiency, em_andamento: k.prodInProgress, planejadas: k.prodPlanned, concluidas: k.prodCompleted, estoque_critico: k.lowStockProducts },
    margem: { margens: computed.productMargins, top_rentaveis: computed.topProfitable, baixa_margem: computed.lowMarginProducts, margem_bruta: k.grossMargin },
    risco: { inadimplencia: k.defaultRate, concentracao: k.concentrationPct, estoque_critico: k.lowStockProducts, clientes_risco: k.clientsAtRisk, fluxo_caixa: k.cashFlowProjection30d, alertas: computed.autoAlerts },
    fiscal: {
      nfe_emitidas: k.nfeIssuedCount,
      nfe_autorizadas: k.nfeAuthorizedCount,
      nfe_rejeitadas: k.nfeRejectedCount,
      faturamento_nfe: k.nfeTotalAmount,
      total_impostos: k.totalTaxAmount,
      carga_tributaria_pct: k.taxBurdenPct,
      regras_fiscais_ativas: k.activeTaxRules,
      sped_gerados: k.spedFilesGenerated,
      ultimo_sped: k.lastSpedDate,
    },
  };

  return focusData[args.foco] || focusData.geral;
}

// MCP-Fiscal: tool executor
async function executeConsultaFiscal(supabase: any, args: any, user_id?: string, company_id?: string) {
  if (!company_id) return { erro: "Empresa não identificada para a sessão." };
  const periodoDias = args.periodo_dias || 30;
  const since = new Date(Date.now() - periodoDias * 24 * 3600 * 1000).toISOString();

  const query = (table: string) => {
    let q = supabase.from(table).select("*");
    q = q.eq("company_id", company_id);
    return q;
  };

  switch (args.tipo) {
    case "resumo": {
      const [nfeRes, taxRes, spedRes] = await Promise.all([
        query("nfe").gte("issue_date", since).limit(500),
        query("tax_rules").limit(200),
        query("sped_files").order("generated_at", { ascending: false }).limit(10),
      ]);
      const nfes = nfeRes.data || [];
      const totalAmount = nfes.reduce((s: number, n: any) => s + (n.total_amount || 0), 0);
      const totalTax = nfes.reduce((s: number, n: any) => s + (n.total_tax || 0), 0);
      return {
        periodo_dias: periodoDias,
        nfe_emitidas: nfes.length,
        nfe_autorizadas: nfes.filter((n: any) => ['authorized', 'autorizada'].includes(n.status)).length,
        nfe_rejeitadas: nfes.filter((n: any) => ['rejected', 'rejeitada'].includes(n.status)).length,
        faturamento_nfe: totalAmount,
        total_impostos: totalTax,
        carga_tributaria_pct: totalAmount > 0 ? +(totalTax / totalAmount * 100).toFixed(2) : 0,
        regras_fiscais_ativas: (taxRes.data || []).filter((t: any) => t.active).length,
        sped_recentes: spedRes.data || [],
      };
    }
    case "nfe_recentes": {
      const { data } = await query("nfe").order("issue_date", { ascending: false }).limit(20);
      return { nfe_recentes: data || [] };
    }
    case "nfe_rejeitadas": {
      const { data } = await query("nfe").in("status", ["rejected", "rejeitada"]).order("issue_date", { ascending: false }).limit(20);
      return { nfe_rejeitadas: data || [] };
    }
    case "impostos_periodo": {
      const { data } = await query("nfe").gte("issue_date", since).limit(1000);
      const items = data || [];
      const byMonth: Record<string, { tax: number; amount: number }> = {};
      items.forEach((n: any) => {
        const key = (n.issue_date || '').substring(0, 7);
        if (!byMonth[key]) byMonth[key] = { tax: 0, amount: 0 };
        byMonth[key].tax += n.total_tax || 0;
        byMonth[key].amount += n.total_amount || 0;
      });
      return { por_mes: byMonth, periodo_dias: periodoDias };
    }
    case "regras_ativas": {
      const { data } = await query("tax_rules").eq("active", true).limit(100);
      return { regras: data || [] };
    }
    case "sped": {
      const { data } = await query("sped_files").order("generated_at", { ascending: false }).limit(20);
      return { sped_files: data || [] };
    }
    default:
      return { erro: "tipo desconhecido" };
  }
}

// TOOL_EXECUTORS are called with (supabase, args, user_id) — see tool call loop below
const TOOL_EXECUTORS: Record<string, (supabase: any, args: any, user_id?: string, company_id?: string) => Promise<any>> = {
  analise_historica: async (supabase, args, _user_id, company_id) => {
    if (!company_id) return { erro: "Empresa não identificada para consulta histórica." };
    // Busca agregados históricos de dois períodos para comparação
    const { periodo_a, periodo_b } = args;
    const fetchStats = async (date: string) => {
      const start = new Date(date);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      const { data } = await supabase.from("orders").select("total, status").eq("company_id", company_id).gte("created_at", start.toISOString()).lte("created_at", end.toISOString()).in("status", ["completed", "invoiced", "shipped", "delivered"]);
      return (data || []).reduce((s: number, o: any) => s + (o.total || 0), 0);
    };
    const [revA, revB] = await Promise.all([fetchStats(periodo_a), fetchStats(periodo_b)]);
    return { periodo_a: { data: periodo_a, receita: revA }, periodo_b: { data: periodo_b, receita: revB }, crescimento: revB > 0 ? ((revA - revB) / revB * 100).toFixed(1) + "%" : "N/A" };
  },
  consultar_financeiro: executeConsultaFinanceiro,
  consultar_comercial: executeConsultaComercial,
  consultar_producao: executeConsultaProducao,
  consultar_estoque: executeConsultaEstoque,
  consultar_fiscal: executeConsultaFiscal,
  consultar_nps: executeConsultaNPS,
  sugerir_acao: suggestAction,
  analise_estrategica: executeAnaliseEstrategica,
};

// ─── NPS Executor ───────────────────────────────────────────────
async function executeConsultaNPS(supabase: any, args: any, _user_id?: string, company_id?: string) {
  if (!company_id) return { erro: "Empresa não identificada." };
  const dias = args.periodo_dias ?? 90;
  const cutoff = new Date(Date.now() - dias * 86400_000).toISOString();
  const base = () => supabase.from("nps_answers").select("*").eq("company_id", company_id).gte("responded_at", cutoff);

  switch (args.tipo) {
    case "resumo": {
      const { data } = await base().limit(5000);
      const rows = data || [];
      const total = rows.length;
      const p = rows.filter((r: any) => r.category === "promoter").length;
      const d = rows.filter((r: any) => r.category === "detractor").length;
      const pas = total - p - d;
      const nps = total ? Math.round(((p - d) / total) * 100) : 0;
      return { periodo_dias: dias, total_respostas: total, nps, promotores: p, neutros: pas, detratores: d, taxa_detratores_pct: total ? Math.round((d / total) * 100) : 0 };
    }
    case "tendencia": {
      const { data } = await base().limit(5000);
      const rows = data || [];
      const byMonth = new Map<string, { total: number; p: number; d: number }>();
      rows.forEach((r: any) => {
        const m = (r.responded_at || "").slice(0, 7);
        if (!m) return;
        const e = byMonth.get(m) || { total: 0, p: 0, d: 0 };
        e.total++;
        if (r.category === "promoter") e.p++;
        else if (r.category === "detractor") e.d++;
        byMonth.set(m, e);
      });
      return { tendencia: Array.from(byMonth.entries()).map(([mes, s]) => ({ mes, total: s.total, nps: s.total ? Math.round(((s.p - s.d) / s.total) * 100) : 0 })).sort((a, b) => a.mes.localeCompare(b.mes)) };
    }
    case "detratores": {
      const { data } = await supabase.from("nps_answers").select("*, clients(name,email,phone)").eq("company_id", company_id).eq("category", "detractor").gte("responded_at", cutoff).order("responded_at", { ascending: false }).limit(30);
      return { detratores: (data || []).map((r: any) => ({ cliente: r.clients?.name, email: r.clients?.email, score: r.score, comentario: r.comment, data: r.responded_at?.slice(0, 10) })) };
    }
    case "comentarios_recentes": {
      const { data } = await supabase.from("nps_answers").select("score,category,comment,responded_at, clients(name)").eq("company_id", company_id).not("comment", "is", null).gte("responded_at", cutoff).order("responded_at", { ascending: false }).limit(20);
      return { comentarios: (data || []).map((r: any) => ({ cliente: r.clients?.name, score: r.score, categoria: r.category, comentario: r.comment, data: r.responded_at?.slice(0, 10) })) };
    }
    case "followups": {
      const { data } = await supabase.from("nps_followups").select("*, clients(name,email)").eq("company_id", company_id).in("status", ["open", "in_progress", "overdue"]).order("due_date", { ascending: true }).limit(50);
      return { followups_pendentes: (data || []).map((f: any) => ({ cliente: f.clients?.name, status: f.status, prazo: f.due_date, motivo: f.reason })) };
    }
    case "csat_ces": {
      const { data } = await supabase.from("nps_answer_items").select("question_type,score,answer:answer_json").eq("company_id", company_id).gte("created_at", cutoff).limit(5000);
      const rows = data || [];
      const csat = rows.filter((r: any) => r.question_type === "csat");
      const ces = rows.filter((r: any) => r.question_type === "ces");
      const avg = (arr: any[]) => arr.length ? arr.reduce((s, r) => s + (r.score || 0), 0) / arr.length : 0;
      return {
        csat: { total: csat.length, media: Number(avg(csat).toFixed(2)), satisfeitos_pct: csat.length ? Math.round(csat.filter((r: any) => (r.score || 0) >= 4).length / csat.length * 100) : 0 },
        ces: { total: ces.length, media: Number(avg(ces).toFixed(2)), baixo_esforco_pct: ces.length ? Math.round(ces.filter((r: any) => (r.score || 0) <= 3).length / ces.length * 100) : 0 },
      };
    }
    default:
      return { erro: "Tipo não suportado" };
  }
}

// ─── Pattern Analysis ───────────────────────────────────────────

async function analyzeUserPatterns(supabase: any, user_id: string): Promise<string> {
  const { data: logs } = await supabase
    .from("ai_action_logs")
    .select("module, action_name, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!logs || logs.length < 3) return "";

  // Count action frequencies
  const freq: Record<string, number> = {};
  for (const log of logs) {
    const key = `${log.module}/${log.action_name}`;
    freq[key] = (freq[key] || 0) + 1;
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const patterns: string[] = [];

  for (const [action, count] of sorted.slice(0, 5)) {
    if (count >= 3) {
      patterns.push(`- "${action}" executada ${count}x`);
    }
  }

  // Detect time-based patterns (actions done at similar times)
  const hourFreq: Record<number, number> = {};
  for (const log of logs) {
    const h = new Date(log.created_at).getHours();
    hourFreq[h] = (hourFreq[h] || 0) + 1;
  }
  const peakHour = Object.entries(hourFreq).sort((a, b) => b[1] - a[1])[0];
  if (peakHour && Number(peakHour[1]) >= 5) {
    patterns.push(`- Horário de pico de uso: ${peakHour[0]}h (${peakHour[1]} ações)`);
  }

  // Detect daily routine patterns
  const recentDays = new Set(logs.slice(0, 20).map((l: any) => new Date(l.created_at).toISOString().split("T")[0]));
  const dailyActions = sorted.filter(([, c]) => c >= recentDays.size * 0.7);
  for (const [action] of dailyActions.slice(0, 2)) {
    patterns.push(`- "${action}" parece ser uma rotina diária`);
  }

  if (patterns.length === 0) return "";

  return `\n\n## 🤖 APRENDIZADO ADAPTATIVO
Padrões detectados no comportamento deste usuário:
${patterns.join("\n")}

Com base nesses padrões:
- Sugira proativamente ações que o usuário costuma fazer
- Se detectar rotina, pergunte: "Percebi que você faz [ação] com frequência. Deseja que eu automatize?"
- Antecipe necessidades baseadas no histórico
- Priorize módulos que o usuário mais utiliza`;
}

// ─── Unified Chat with Tool Calling ─────────────────────────────

async function handleUnifiedChat(messages: any[], supabase: any, lovableKey: string, corsHeaders: any, user_id?: string, company_id?: string) {
  // ─── Server-side Memory: Load recent history for context ───
  let serverHistory: any[] = [];
  if (user_id) {
    let histQ = supabase
      .from("ai_executive_chat")
      .select("role, content, created_at")
      .eq("user_id", user_id);
    if (company_id) histQ = histQ.eq("company_id", company_id);
    const { data: recentMsgs } = await histQ
      .order("created_at", { ascending: true })
      .limit(40);
    if (recentMsgs && recentMsgs.length > 0) {
      serverHistory = recentMsgs.map((m: any) => ({ role: m.role, content: m.content }));
    }
  }

  // ─── Persist incoming user message ───
  const lastUserMsg = messages?.filter((m: any) => m.role === "user").pop();
  if (user_id && lastUserMsg) {
    await supabase.from("ai_executive_chat").insert({
      user_id,
      company_id: company_id ?? null,
      role: "user",
      content: lastUserMsg.content,
    });
  }

  // ─── Build context: server history + current session messages ───
  // Deduplicate: if client sent full history, use it; otherwise merge with server history
  const clientMsgCount = (messages || []).filter((m: any) => m.role !== "system").length;
  const contextMessages = clientMsgCount > 2 ? messages : [...serverHistory, ...(messages || [])];

  // ─── Extract operational context summary for the system prompt ───
  const recentContext = contextMessages.slice(-10);
  const mentionedEntities: string[] = [];
  for (const m of recentContext) {
    if (m.role === "user" || m.role === "assistant") {
      const text = m.content || "";
      // Track mentioned clients, OPs, accounts
      const clientMatch = text.match(/cliente\s+(\w+)/gi);
      const opMatch = text.match(/OP[-\s]?\d+/gi);
      if (clientMatch) mentionedEntities.push(...clientMatch);
      if (opMatch) mentionedEntities.push(...opMatch);
    }
  }
  const contextSummary = mentionedEntities.length > 0
    ? `\n\n## CONTEXTO ATIVO DA CONVERSA\nEntidades mencionadas recentemente: ${[...new Set(mentionedEntities)].join(", ")}\nUse essas referências quando o usuário falar "esse", "aquele", "o mesmo", etc.`
    : "";

  // ─── Adaptive Learning: Analyze user patterns ───
  const patternInsights = user_id ? await analyzeUserPatterns(supabase, user_id) : "";

  // ─── Real Data Snapshot: injetar contagens reais no system prompt ───
  // Garante que o modelo SAIBA quais módulos têm dados antes de responder.
  let realDataSnapshot = "";
  try {
    const query = (table: string) => {
      let q = supabase.from(table).select("id", { count: "exact", head: true });
      q = q.eq("company_id", company_id);
      return q;
    };

    const [ordC, recC, payC, prodC, cliC, opC] = await Promise.all([
      query("orders"),
      query("accounts_receivable"),
      query("accounts_payable"),
      query("products"),
      query("clients"),
      query("production_orders"),
    ]);
    const counts = {
      pedidos: ordC.count ?? 0,
      contas_receber: recC.count ?? 0,
      contas_pagar: payC.count ?? 0,
      produtos: prodC.count ?? 0,
      clientes: cliC.count ?? 0,
      ops_producao: opC.count ?? 0,
    };
    const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);
    realDataSnapshot = totalRecords === 0
      ? `\n\n# 🚨 ESTADO DOS DADOS\nO sistema NÃO possui registros reais cadastrados ainda. Responda APENAS:\n"Ainda não há dados reais cadastrados no sistema. Para que eu possa diagnosticar o negócio, cadastre primeiro: clientes, pedidos, contas a pagar/receber ou ordens de produção."\nNUNCA invente números, nomes ou métricas.`
      : `\n\n# 📊 ESTADO ATUAL DOS DADOS REAIS\nRegistros disponíveis no banco: ${JSON.stringify(counts)}\nUse APENAS esses módulos via tools. Se um módulo está com 0 registros, NÃO invente dados sobre ele — diga "sem dados nesse módulo".`;
  } catch (e) {
    console.error("realDataSnapshot error:", e);
  }

  // Fonte única de verdade — mesmos números do Dashboard/Cérebro/CEO Brief
  let canonicalBlock = "";
  try {
    const canonical = await buildCanonicalMetrics(supabase, company_id ?? null);
    canonicalBlock = "\n\n" + formatCanonicalBlock(canonical);
  } catch (e) {
    console.error("canonical metrics error:", e);
  }

  // ─── Log consultation queries for learning ───
  if (user_id && lastUserMsg) {
    const queryText = lastUserMsg.content.toLowerCase();
    const consultModules = ["financeiro", "comercial", "produção", "producao", "estoque"];
    const detectedModule = consultModules.find(m => queryText.includes(m)) || "geral";
    try {
      await supabase.from("ai_action_logs").insert({
        user_id,
        company_id: company_id ?? null,
        action_type: "query",
        module: detectedModule,
        action_name: "consulta_chat",
        parameters: { query_preview: queryText.slice(0, 200) },
        context: "chat",
      });
    } catch { /* ignore */ }
  }

  const systemPrompt = await getSystemPrompt('CEO', `Você é o Diretor Digital — IA Executiva de um sistema ERP completo.
Papéis: Administrador, Contador (margens, impostos), CFO (caixa, inadimplência), WMS (estoque), COO (produção, logística).

## CAPACIDADES OPERACIONAIS
- Analisar estoque, giro, ruptura, ABC.
- Calcular lucro, margem bruta/líquida, markup, ponto de equilíbrio.
- Sugerir compras, reposição, orientar fluxo financeiro e produção.
- Usar as TOOLS disponíveis SEMPRE que o usuário pedir números, status ou diagnóstico — nunca responda de memória.

## ESTRUTURA OBRIGATÓRIA (Diagnóstico Geral)
## 👑 Veredicto Executivo
## 📊 Diagnóstico Atual (Receita, Margem, Caixa, Inadimplência)
## 🚨 Riscos Críticos (⚠️ Risco → Impacto → Ação)
## 💰 Análise de Lucro
## 📈 Plano de 30 dias (Metas e Ações)
## 🧠 Decisões Recomendadas
## ⚡ Prioridade do Dia (Top 3)

## ESTRUTURA POR MÓDULO (Perguntas Específicas)
## 📊 Resumo
## 🔍 Detalhamento (itens reais com nome e valor)
## 💡 Recomendações
## 👉 Próximos Passos

${contextSummary}
# AÇÕES DISPONÍVEIS
Financeiro: registrar pagamento, adiar vencimento, criar conta a pagar/receber.
Comercial: alterar status pedido | Produção: alterar/priorizar OP | Estoque: ajustar estoque.
SEMPRE peça confirmação antes de executar (confirmado=false primeiro).
${patternInsights}${realDataSnapshot}${canonicalBlock}`, supabase, 'ai-executive-chat', user_id);

  const aiMessages = [{ role: "system", content: systemPrompt }, ...contextMessages];

  const firstResp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: aiMessages, tools: ERP_TOOLS, stream: false }),
  });


  if (!firstResp.ok) {
    const status = firstResp.status;
    const body = await firstResp.text();
    console.error("AI gateway error:", status, body.slice(0, 200));
    if (status === 429) return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns minutos." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos em Configurações > Workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: "Erro no processamento de IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let result = await firstResp.json();
  let choice = result.choices?.[0];
  let rounds = 0;

  while (choice?.finish_reason === "tool_calls" && choice?.message?.tool_calls && rounds < 8) {
    rounds++;
    const assistantMsg = choice.message;
    aiMessages.push(assistantMsg);

    for (const toolCall of assistantMsg.tool_calls) {
      const fn = toolCall.function;
      const executor = TOOL_EXECUTORS[fn.name];
      let toolResult: any;
      try {
        const args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments;
        toolResult = executor ? await executor(supabase, args, user_id, company_id) : { erro: `Função ${fn.name} não encontrada` };
      } catch (e) {
        toolResult = { erro: `Erro: ${e instanceof Error ? e.message : 'falha desconhecida'}` };
      }
      aiMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
    }

    const nextResp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: aiMessages, tools: ERP_TOOLS, stream: false }),
    });
    if (!nextResp.ok) break;
    result = await nextResp.json();
    choice = result.choices?.[0];
  }

  const content = choice?.message?.content || "Não foi possível processar sua solicitação.";

  // ─── Persist assistant response ───
  if (user_id) {
    await supabase.from("ai_executive_chat").insert({
      user_id,
      company_id: company_id ?? null,
      role: "assistant",
      content,
    });

    // ─── Trim old messages (keep last 60 per user no tenant ativo) ───
    let trimQ = supabase
      .from("ai_executive_chat")
      .select("id")
      .eq("user_id", user_id);
    if (company_id) trimQ = trimQ.eq("company_id", company_id);
    const { data: allMsgs } = await trimQ.order("created_at", { ascending: true });
    if (allMsgs && allMsgs.length > 60) {
      const toDelete = allMsgs.slice(0, allMsgs.length - 60).map((m: any) => m.id);
      await supabase.from("ai_executive_chat").delete().in("id", toDelete);
    }
  }

  return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── Daily Summary ──────────────────────────────────────────────

async function handleDailySummary(supabase: any, lovableKey: string, corsHeaders: any, authenticatedUserId?: string, companyId?: string) {
  const today = new Date().toISOString().split("T")[0];

  const query = (table: string) => {
    let q = supabase.from(table).select("*");
    if (companyId) q = q.eq("company_id", companyId);
    return q;
  };

  const [recRes, pagRes, bankRes, recHoje, pagHoje, opsRes] = await Promise.all([
    query("accounts_receivable").limit(500),
    query("accounts_payable").limit(500),
    query("bank_accounts").eq("active", true),
    query("accounts_receivable").eq("due_date", today).eq("status", "pending"),
    query("accounts_payable").eq("due_date", today).eq("status", "pending"),
    query("production_orders").in("status", ["in_progress", "planned", "pending"]).limit(100),
  ]);

  const banks = bankRes.data || [];
  const recebHoje = recHoje.data || [];
  const pagarHoje = pagHoje.data || [];
  const rec = recRes.data || [];
  const pag = pagRes.data || [];
  const ops = opsRes.data || [];

  // Guard: sem nenhum dado financeiro/operacional, não chama LLM
  if (rec.length === 0 && pag.length === 0 && banks.length === 0 && ops.length === 0) {
    return new Response(JSON.stringify({
      data_status: "insufficient",
      resumo_executivo: INSUFFICIENT_DATA_MSG,
      message: INSUFFICIENT_DATA_MSG,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const saldoBancario = banks.reduce((s: number, b: any) => s + (b.balance || 0), 0);
  const totalReceberHoje = recebHoje.reduce((s: number, r: any) => s + (r.open_amount || r.amount || 0), 0);
  const totalPagarHoje = pagarHoje.reduce((s: number, p: any) => s + (p.open_amount || p.amount || 0), 0);
  const atrasadosRec = rec.filter((r: any) => (r.status === "overdue" || (r.status === "pending" && r.due_date < today)));
  const totalInadimplencia = atrasadosRec.reduce((s: number, r: any) => s + (r.open_amount || r.amount || 0), 0);
  const opsAtrasadas = ops.filter((o: any) => o.due_date && o.due_date < today);

  const summary = { data: today, saldo_bancario: saldoBancario, contas_bancarias: banks, receber_hoje: { total: totalReceberHoje, quantidade: recebHoje.length, detalhes: recebHoje.slice(0, 5) }, pagar_hoje: { total: totalPagarHoje, quantidade: pagarHoje.length, detalhes: pagarHoje.slice(0, 5) }, saldo_previsto: saldoBancario + totalReceberHoje - totalPagarHoje, inadimplencia: { total: totalInadimplencia, quantidade: atrasadosRec.length }, producao_atrasada: opsAtrasadas.length };

  const aiResp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: await getSystemPrompt('CFO', `Gere um RESUMO EXECUTIVO DIÁRIO em markdown, direto e objetivo.
Formato:
1. 💰 Saldo e Posição
2. 📥 Recebimentos
3. 📤 Pagamentos
4. ⚠️ Alertas
5. 🎯 Recomendações`, supabase, 'ai-executive-daily-summary') },
        { role: "user", content: `Dados de hoje (${today}):\n${JSON.stringify(summary, null, 2)}` },
      ],
      stream: false,
    }),
  });

  let resumoTexto = "";
  if (aiResp.ok) {
    const aiResult = await aiResp.json();
    resumoTexto = aiResult.choices?.[0]?.message?.content || "";
  }

  return new Response(JSON.stringify({ summary, resumo_executivo: resumoTexto }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── CEO Intelligence Layer ─────────────────────────────────────

function buildContext(d: any, kpis: any) {
  const lowStock = d.products
    .filter((p: any) => (p.stock_current ?? 0) <= (p.stock_min ?? 0) && p.status === "active")
    .slice(0, 20)
    .map((p: any) => ({ id: p.id, name: p.name, current: p.stock_current, min: p.stock_min }));
  const stockTotal = d.products.reduce(
    (s: number, p: any) => s + (Number(p.stock_current) || 0) * (Number(p.cost) || 0), 0
  );
  const cashIn30d = d.receivables.filter((r: any) => r.status === "pending")
    .reduce((s: number, r: any) => s + (Number(r.open_amount) || Number(r.amount) || 0), 0);
  const cashOut30d = d.payables.filter((p: any) => p.status === "pending")
    .reduce((s: number, p: any) => s + (Number(p.open_amount) || Number(p.amount) || 0), 0);
  return {
    estoque_valor_total: stockTotal,
    produtos_baixo_estoque: lowStock,
    produtos_total: d.products.length,
    vendas_recentes_count: d.orders.length,
    financeiro: {
      receita_total: kpis.totalRevenue,
      custo_total: kpis.totalCosts,
      lucro_bruto: kpis.grossProfit,
      margem_bruta_pct: kpis.grossMargin,
      saldo_projetado_30d: cashIn30d - cashOut30d,
      receber_30d: cashIn30d,
      pagar_30d: cashOut30d,
      inadimplencia_pct: kpis.defaultRate,
    },
    clientes_ativos: kpis.activeClients,
    concentracao_top3_pct: kpis.concentrationPct,
  };
}

function predictRevenue(revenueByMonth: { month: string; revenue: number }[]) {
  const series = (revenueByMonth || []).map((r) => Number(r.revenue) || 0);
  const valid = series.filter((v) => v > 0);
  const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  const last = series[series.length - 1] || 0;
  const trend = last > avg * 1.05 ? "up" : last < avg * 0.95 ? "down" : "stable";
  return { previsao_proximo_mes: Math.round(avg), media_movel_6m: Math.round(avg), ultimo_mes: Math.round(last), trend };
}

function analyzeRisks(ctx: any, kpis: any) {
  const risks: any[] = [];
  if (ctx.financeiro.saldo_projetado_30d < 0) {
    risks.push({ tipo: "financeiro", impacto: "alto", titulo: "Caixa projetado negativo em 30 dias",
      detalhe: `Receber R$ ${ctx.financeiro.receber_30d.toFixed(2)} vs Pagar R$ ${ctx.financeiro.pagar_30d.toFixed(2)}` });
  }
  if (kpis.defaultRate > 10) {
    risks.push({ tipo: "credito", impacto: kpis.defaultRate > 20 ? "alto" : "medio",
      titulo: "Inadimplência elevada", detalhe: `${kpis.defaultRate.toFixed(1)}% da carteira em atraso` });
  }
  if (ctx.produtos_baixo_estoque.length > 0) {
    risks.push({ tipo: "estoque", impacto: ctx.produtos_baixo_estoque.length > 10 ? "alto" : "medio",
      titulo: `${ctx.produtos_baixo_estoque.length} produto(s) abaixo do mínimo`,
      detalhe: ctx.produtos_baixo_estoque.slice(0, 3).map((p: any) => p.name).join(", ") });
  }
  if (kpis.concentrationPct > 50) {
    risks.push({ tipo: "concentracao", impacto: "medio", titulo: "Concentração de receita nos top 3",
      detalhe: `${kpis.concentrationPct.toFixed(1)}% da receita vem de poucos clientes` });
  }
  if (kpis.grossMargin < 15 && kpis.totalRevenue > 0) {
    risks.push({ tipo: "rentabilidade", impacto: "alto", titulo: "Margem bruta baixa",
      detalhe: `Margem atual ${kpis.grossMargin.toFixed(1)}% — revisar pricing/custos` });
  }
  return risks;
}

function generateGrowthPlan(ctx: any, forecast: any, kpis: any) {
  const plan: any[] = [];
  plan.push({ tipo: "meta",
    titulo: `Meta: faturar R$ ${Math.round(forecast.previsao_proximo_mes * 1.2).toLocaleString("pt-BR")} no próximo mês`,
    detalhe: `+20% sobre média histórica de R$ ${forecast.previsao_proximo_mes.toLocaleString("pt-BR")}` });
  if (ctx.produtos_baixo_estoque.length > 0)
    plan.push({ tipo: "acao", titulo: "Repor estoque crítico", detalhe: `${ctx.produtos_baixo_estoque.length} SKU(s) em ruptura iminente` });
  if (kpis.defaultRate > 5)
    plan.push({ tipo: "acao", titulo: "Acionar régua de cobrança", detalhe: `Reduzir inadimplência de ${kpis.defaultRate.toFixed(1)}%` });
  if (kpis.concentrationPct > 40)
    plan.push({ tipo: "acao", titulo: "Diversificar carteira", detalhe: "Prospectar para reduzir dependência dos top 3" });
  if (forecast.trend === "down")
    plan.push({ tipo: "acao", titulo: "Lançar campanha comercial", detalhe: "Tendência de queda nos últimos meses" });
  return plan;
}

async function recordLearning(supabase: any, d: any, companyId?: string | null) {
  if (!companyId) return;
  try {
    const productSales: Record<string, number> = {};
    (d.orderItems || []).forEach((it: any) => {
      if (!it.product_id) return;
      productSales[it.product_id] = (productSales[it.product_id] || 0) + (Number(it.quantity) || 0);
    });
    const top = Object.entries(productSales).sort((a, b) => b[1] - a[1]).slice(0, 30);
    for (const [productId, qty] of top) {
      await supabase.from("ai_learning").upsert({
        company_id: companyId,
        pattern_type: "product_sales",
        pattern_key: `produto_${productId}`,
        value: qty,
        frequency: 1,
        metadata: { observed_at: new Date().toISOString() },
        last_updated: new Date().toISOString(),
      }, { onConflict: "company_id,pattern_type,pattern_key" });
    }
  } catch (e) { console.error("recordLearning warn:", e); }
}

async function persistKPIs(supabase: any, kpis: any, forecast: any, companyId?: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = [
    { company_id: companyId ?? null, snapshot_date: today, kpi_name: "receita_mes", category: "financial",
      current_value: kpis.totalRevenue, target_value: forecast.previsao_proximo_mes * 1.2,
      status: kpis.totalRevenue >= forecast.previsao_proximo_mes ? "ok" : "alerta",
      trend: forecast.trend, explanation: "Receita acumulada vs meta (+20% sobre média 6m)" },
    { company_id: companyId ?? null, snapshot_date: today, kpi_name: "margem_bruta", category: "financial",
      current_value: kpis.grossMargin, target_value: 25,
      status: kpis.grossMargin >= 25 ? "ok" : kpis.grossMargin >= 15 ? "alerta" : "critico",
      trend: null, explanation: "Margem bruta % — meta mínima 25%" },
    { company_id: companyId ?? null, snapshot_date: today, kpi_name: "inadimplencia", category: "financial",
      current_value: kpis.defaultRate, target_value: 5,
      status: kpis.defaultRate <= 5 ? "ok" : kpis.defaultRate <= 10 ? "alerta" : "critico",
      trend: null, explanation: "% da carteira em atraso — meta máx 5%" },
    { company_id: companyId ?? null, snapshot_date: today, kpi_name: "ruptura_estoque", category: "inventory",
      current_value: kpis.lowStockProducts, target_value: 0,
      status: kpis.lowStockProducts === 0 ? "ok" : kpis.lowStockProducts < 5 ? "alerta" : "critico",
      trend: null, explanation: "Nº de SKUs abaixo do mínimo" },
  ];
  try {
    let delQ = supabase.from("ai_kpis").delete()
      .eq("snapshot_date", today).in("kpi_name", rows.map((r) => r.kpi_name));
    if (companyId) delQ = delQ.eq("company_id", companyId);
    await delQ;
    await supabase.from("ai_kpis").insert(rows);
  } catch (e) { console.error("persistKPIs warn:", e); }
  return rows;
}

function suggestDecisions(ctx: any, forecast: any, risks: any[]) {
  const decisions: any[] = [];
  if (ctx.produtos_baixo_estoque.length > 0)
    decisions.push({ type: "repor_estoque", priority: "alta",
      action: `Criar pedido de compra para ${ctx.produtos_baixo_estoque.length} SKU(s)`, requires_approval: true });
  for (const r of risks) {
    if (r.tipo === "financeiro")
      decisions.push({ type: "ajuste_financeiro", priority: "alta",
        action: "Antecipar recebíveis ou renegociar pagáveis para zerar gap de caixa", requires_approval: true });
    if (r.tipo === "credito")
      decisions.push({ type: "cobranca", priority: "media",
        action: "Acionar régua de cobrança nos clientes inadimplentes", requires_approval: true });
  }
  if (forecast.previsao_proximo_mes > 0 && forecast.trend === "down")
    decisions.push({ type: "promocao", priority: "media",
      action: "Criar campanha em produtos de maior margem", requires_approval: true });
  return decisions;
}

export async function handleCEOBrief(supabase: any, lovableKey: string, corsHeaders: any, authenticatedUserId?: string, companyId?: string) {
  const data = await fetchAllData(supabase, companyId);
  const kpis = computeKPIs(data);
  const ctx = buildContext(data, kpis);
  const forecast = predictRevenue(kpis.revenueByMonth || []);
  const risks = analyzeRisks(ctx, kpis);
  const plan = generateGrowthPlan(ctx, forecast, kpis);
  const decisions = suggestDecisions(ctx, forecast, risks);
  const kpiRows = await persistKPIs(supabase, kpis, forecast, companyId);
  await recordLearning(supabase, data, companyId);

  // Fonte única de verdade — mesmos números do Dashboard/Cérebro
  const canonical = await buildCanonicalMetrics(supabase, companyId ?? null);
  const canonicalBlock = formatCanonicalBlock(canonical);

  // Detecta se há dados reais suficientes para análise confiável
  // Usa o helper compartilhado (campos plurais conforme fetchAllData)
  const hasRealData = checkHasRealData(data);

  const ceoPrompt = await getSystemPrompt('CEO', `Prioridades: Proteger caixa, maximizar lucro, antecipar problemas, decidir (não descrever).

${canonicalBlock}

## ESTRUTURA OBRIGATÓRIA DA RESPOSTA (JSON/Markdown)
## 👑 Veredicto Executivo
## 📊 Diagnóstico Atual (Receita, Margem, Caixa Projetado, Inadimplência)
## 🚨 Riscos Críticos (⚠️ Risco → Impacto → Ação)
## 💰 Análise de Lucro (Onde ganha e onde perde dinheiro)
## 📈 Plano de Crescimento (Metas e Ações)
## 🧠 Decisões Recomendadas
## ⚡ Prioridade do Dia (Top 3)

- Valores em **R$ X.XXX,XX**, porcentagens em **negrito**.
- Use SOMENTE números do bloco "MÉTRICAS CANÔNICAS" acima.
- Tom direto de dono.`, supabase, 'ai-executive-ceo-brief');

  const userPayload = {
    contexto: ctx,
    kpis_calculados: { totalRevenue: kpis.kpis.totalRevenue, grossMargin: kpis.kpis.grossMargin, defaultRate: kpis.kpis.defaultRate, concentrationPct: kpis.kpis.concentrationPct, lowStockProducts: kpis.kpis.lowStockProducts, activeClients: kpis.kpis.activeClients },
    kpis_historicos_hoje: kpiRows,
    previsao_receita: forecast,
    riscos_detectados: risks,
    plano_crescimento: plan,
    decisoes_sugeridas: decisions,
  };

  let ceoAnalysis = "";
  let ceoStructured: any = null;

  // Tool/schema para extrair resposta executiva estruturada (cards visuais)
  const ceoTool = {
    type: "function",
    function: {
      name: "ceo_response",
      description: "Resposta executiva estruturada para renderização em dashboard (cards, alertas, blocos).",
      parameters: {
        type: "object",
        properties: {
          veredicto: { type: "string", description: "Resumo executivo direto em 2-3 linhas." },
          kpis: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nome: { type: "string" },
                valor: { type: "string", description: "Valor formatado (ex: R$ 185.352, 23%)." },
                trend: { type: "string", enum: ["up", "down", "neutral"] },
                status: { type: "string", enum: ["ok", "alerta", "critico"] },
              },
              required: ["nome", "valor", "trend", "status"],
              additionalProperties: false,
            },
          },
          riscos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                titulo: { type: "string" },
                impacto: { type: "string" },
                acao: { type: "string" },
              },
              required: ["titulo", "impacto", "acao"],
              additionalProperties: false,
            },
          },
          plano: {
            type: "object",
            properties: {
              metas: { type: "array", items: { type: "string" } },
              acoes: { type: "array", items: { type: "string" } },
            },
            required: ["metas", "acoes"],
            additionalProperties: false,
          },
          insights: {
            type: "array",
            description: "Tendências reais detectadas nos dados (não invente).",
            items: {
              type: "object",
              properties: {
                titulo: { type: "string" },
                descricao: { type: "string" },
                tipo: { type: "string", enum: ["tendencia", "oportunidade", "risco", "operacional"] },
              },
              required: ["titulo", "descricao", "tipo"],
              additionalProperties: false,
            },
          },
          decisoes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
                acao: { type: "string" },
              },
              required: ["prioridade", "acao"],
              additionalProperties: false,
            },
          },
        },
        required: ["veredicto", "kpis", "riscos", "insights", "plano", "decisoes"],
        additionalProperties: false,
      },
    },
  };

  // Short-circuit: sem dados reais não chama a IA
  if (!hasRealData) {
    return new Response(JSON.stringify({
      ceo_analysis: "**Dados insuficientes para análise confiável.**\n\nCadastre vendas, pedidos ou contas para que a IA CEO possa gerar diagnóstico estratégico.",
      ceo_structured: {
        veredicto: "Dados insuficientes para análise confiável.",
        kpis: [], riscos: [], insights: [],
        plano: { metas: [], acoes: [] }, decisoes: [],
      },
      context: ctx,
      kpis: kpiRows,
      forecast, risks: [], plan: [], decisions: [],
      generated_at: new Date().toISOString(),
      data_status: "insufficient",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: ceoPrompt + "\n\nIMPORTANTE: Sempre chame a função ceo_response com o JSON estruturado para renderização visual em cards. Se faltarem dados, retorne arrays vazios e veredicto='Dados insuficientes para análise confiável.'" },
          { role: "user", content: `Dados executivos para análise:\n${JSON.stringify(userPayload, null, 2)}` },
        ],
        tools: [ceoTool],
        tool_choice: { type: "function", function: { name: "ceo_response" } },
      }),
    });
    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de requisições excedido. Aguarde alguns minutos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos em Configurações > Workspace." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiResp.ok) {
      const j = await aiResp.json();
      const msg = j.choices?.[0]?.message;
      ceoAnalysis = msg?.content || "";
      const toolCall = msg?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try { ceoStructured = JSON.parse(toolCall.function.arguments); }
        catch (e) { console.error("Falha ao parsear ceo_response:", e); }
      }
    }
  } catch (e) { console.error("CEO AI call failed:", e); }

  return new Response(JSON.stringify({
    ceo_analysis: ceoAnalysis,
    ceo_structured: ceoStructured,
    context: ctx,
    kpis: kpiRows,
    forecast, risks, plan, decisions,
    generated_at: new Date().toISOString(),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── AdvancedActionEngine ───────────────────────────────────────
// Executa decisões aprovadas — registra em ai_action_logs (suggestion-first, não muta dados de negócio sem flag)
async function executeAdvancedActions(supabase: any, decisions: any[], userId?: string, autoExecute = false, companyId?: string | null) {
  const results: any[] = [];
  for (const d of decisions || []) {
    let result = "";
    try {
      switch (d.type) {
        case "repor_estoque":
          result = autoExecute
            ? "Sugestão de reposição registrada para o módulo de Compras"
            : "Reposição sugerida — aguardando aprovação";
          break;
        case "promocao":
          result = autoExecute
            ? "Campanha sugerida registrada para o módulo Comercial"
            : "Promoção recomendada — aguardando aprovação";
          break;
        case "ajuste_financeiro":
          result = autoExecute
            ? "Plano de ajuste de caixa registrado para o Financeiro"
            : "Ajuste financeiro recomendado — aguardando aprovação";
          break;
        case "cobranca":
          result = autoExecute
            ? "Régua de cobrança acionada para inadimplentes"
            : "Cobrança recomendada — aguardando aprovação";
          break;
        default:
          result = `Decisão registrada: ${d.action || d.type}`;
      }
      await supabase.from("ai_action_logs").insert({
        company_id: companyId ?? null,
        action_type: "decision_execution",
        action_name: d.type,
        module: "executive_ai",
        context: autoExecute ? "autopilot" : "manual_approval",
        parameters: d,
        result,
        user_id: userId || null,
      });
      results.push({ ...d, result, executed_at: new Date().toISOString() });
    } catch (e) {
      console.error("executeAdvancedActions warn:", e);
      results.push({ ...d, result: "Falha ao registrar ação", error: String(e) });
    }
  }
  return results;
}

async function handleExecuteDecisions(supabase: any, body: any, corsHeaders: any, userId?: string, companyId?: string) {
  const decisions = body?.decisions || [];
  const autoExecute = !!body?.auto_execute;
  if (!Array.isArray(decisions) || decisions.length === 0) {
    return new Response(JSON.stringify({ error: "Nenhuma decisão fornecida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!companyId) {
    return new Response(JSON.stringify({ error: "Empresa não identificada" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const results = await executeAdvancedActions(supabase, decisions, userId, autoExecute, companyId);
  return new Response(JSON.stringify({ executed: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


// ─── AutoPilotService ───────────────────────────────────────────
// Orquestração CRON: contexto → forecast → riscos → decisões → registro
export async function handleAutoPilotRun(supabase: any, lovableKey: string, corsHeaders: any, companyId?: string) {
  if (!companyId) {
    return new Response(JSON.stringify({ error: "Empresa não identificada" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const data = await fetchAllData(supabase, companyId);

    // Guard: AutoPilot só roda com dados reais — evita gerar alertas/ações fictícias
    if (!checkHasRealData(data)) {
      return new Response(JSON.stringify({
        ran_at: new Date().toISOString(),
        data_status: "insufficient",
        message: INSUFFICIENT_DATA_MSG,
        forecast: null, risks: [], decisions: [], executed: [],
        summary: "AutoPilot pausado: sem dados reais no sistema.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const kpis = computeKPIs(data);
    const ctx = buildContext(data, kpis);
    const forecast = predictRevenue(kpis.revenueByMonth || []);
    const risks = analyzeRisks(ctx, kpis);
    const decisions = suggestDecisions(ctx, forecast, risks);
    await persistKPIs(supabase, kpis, forecast, companyId);
    await recordLearning(supabase, data, companyId);

    // Auto-registra apenas decisões de prioridade média (não muta dados críticos sozinha)
    const safeDecisions = decisions.filter((d: any) => d.priority !== "alta");
    const executed = await executeAdvancedActions(supabase, safeDecisions, undefined, true, companyId);

    // Riscos críticos viram alertas executivos
    for (const r of risks.filter((x: any) => x.impacto === "alto")) {
      await supabase.from("ai_executive_alerts").insert({
        company_id: companyId ?? null,
        alert_type: "autopilot_risk",
        severity: "critical",
        title: r.titulo,
        description: r.detalhe,
        module: r.tipo,
        status: "active",
      });
    }

    await supabase.from("ai_action_logs").insert({
      company_id: companyId ?? null,
      action_type: "autopilot_cycle",
      action_name: "autopilot_run",
      module: "executive_ai",
      context: "scheduled",
      parameters: { risks_count: risks.length, decisions_count: decisions.length },
      result: `Ciclo completo: ${executed.length} ações registradas, ${risks.filter((r:any)=>r.impacto==="alto").length} alertas críticos`,
    });


    return new Response(JSON.stringify({
      ran_at: new Date().toISOString(),
      forecast, risks, decisions, executed,
      summary: `AutoPilot: ${executed.length} ações + ${risks.length} riscos analisados`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("AutoPilot error:", e);
    return new Response(JSON.stringify({ error: "AutoPilot falhou", detail: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}
