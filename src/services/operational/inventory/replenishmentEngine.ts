import { stockEngine, ProjectedStockResult } from './stockEngine';
import { supabase } from '@/integrations/supabase/client';

export type SourceType = 'FACTORY' | 'CD' | 'STORE' | 'PURCHASE';

export interface SourceOption {
  branchId: string;
  branchName: string;
  type: SourceType;
  availableQty: number;
}

export interface ReplenishmentRecommendation {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  branchId: string;
  branchName: string;
  companyId?: string;
  minStock: number;
  targetStock: number;
  requiredQty: number;
  suggestedQty: number;
  coverageResult: ProjectedStockResult;
  sourceType: SourceType;
  sourceBranchId?: string;
  sourceBranchName?: string;
  sourceOptions: SourceOption[];
  reason: string;
  urgency: 'critical' | 'attention' | 'normal';
}

const FACTORY_TIPOS = ['industria', 'FACTORY'];
const CD_TIPOS = ['cd', 'DISTRIBUTION_CENTER'];

function classifyBranch(tipo?: string | null): SourceType {
  if (!tipo) return 'STORE';
  if (FACTORY_TIPOS.includes(tipo)) return 'FACTORY';
  if (CD_TIPOS.includes(tipo)) return 'CD';
  return 'STORE';
}

async function loadDemand(branchId: string): Promise<Record<string, number>> {
  const { data } = await (supabase as any).rpc('get_branch_daily_demand', {
    p_branch_id: branchId,
    p_days: 30,
  });
  const map: Record<string, number> = {};
  (data || []).forEach((r: any) => {
    map[r.product_id] = Number(r.daily_demand || 0);
  });
  return map;
}

export const replenishmentEngine = {
  /**
   * Analisa toda a posição de estoque da unidade e devolve as necessidades de
   * reposição já com a melhor origem prescrita.
   *
   * Prioridade de origem: Fábrica/Indústria -> CD -> Loja com excesso -> Compra.
   */
  async getNetworkRecommendations(branchId: string): Promise<ReplenishmentRecommendation[]> {
    if (!branchId) return [];

    const { data: branch } = await (supabase as any)
      .from('branches')
      .select('id, name, tipo, company_id')
      .eq('id', branchId)
      .maybeSingle();

    if (!branch) return [];
    const companyId = branch.company_id;

    const [balancesRes, policiesRes, networkRes, branchesRes, demand] = await Promise.all([
      (supabase as any)
        .from('stock_balances')
        .select('*')
        .eq('branch_id', branchId),
      (supabase as any)
        .from('replenishment_policies')
        .select('*')
        .eq('branch_id', branchId)
        .eq('is_active', true),
      (supabase as any)
        .from('stock_balances')
        .select('product_id, branch_id, quantity, reserved_qty, in_transit_qty')
        .eq('company_id', companyId)
        .neq('branch_id', branchId),
      (supabase as any)
        .from('branches')
        .select('id, name, tipo')
        .eq('company_id', companyId)
        .eq('is_active', true),
      loadDemand(branchId),
    ]);

    const balances = balancesRes.data || [];
    const productIds = [...new Set(balances.map((b: any) => b.product_id).filter(Boolean))];
    if (productIds.length > 0) {
      const { data: prods } = await (supabase as any)
        .from('products')
        .select('id, name, code, unit, min_stock, max_stock, abc_classification, image_url')
        .in('id', productIds);
      const byId = new Map((prods || []).map((pr: any) => [pr.id, pr]));
      for (const b of balances) b.products = byId.get(b.product_id) || {};
    }
    const policies = policiesRes.data || [];
    const network = networkRes.data || [];
    const branchMap = new Map<string, any>((branchesRes.data || []).map((b: any) => [b.id, b]));

    const policyByProduct = new Map<string, any>(policies.map((p: any) => [p.product_id, p]));

    const recommendations: ReplenishmentRecommendation[] = [];

    for (const row of balances) {
      const productId = row.product_id;
      if (!productId) continue;

      const product = row.products || {};
      const policy = policyByProduct.get(productId);
      const dailyDemand = demand[productId] || 0;

      const minStock = Number(policy?.min_stock ?? product.min_stock ?? 0);
      const coverageTarget = Number(policy?.target_coverage_days ?? 0);
      const targetStock = Number(
        policy?.max_stock ??
          (coverageTarget > 0 && dailyDemand > 0 ? Math.ceil(coverageTarget * dailyDemand) : 0) ??
          0,
      ) || Number(product.max_stock ?? 0) || Math.max(minStock * 3, 0);

      const analysis = stockEngine.calculateProjected(row, {
        dailyDemand,
        minStock,
        maxStock: targetStock || undefined,
      });

      if (analysis.status !== 'critical' && analysis.status !== 'attention') continue;

      const requiredQty = Math.ceil(Math.max(0, (targetStock || minStock) - analysis.projected));
      if (requiredQty <= 0) continue;

      // Origens possíveis na malha
      const sourceOptions: SourceOption[] = network
        .filter((s: any) => s.product_id === productId)
        .map((s: any) => {
          const b = branchMap.get(s.branch_id);
          const type = classifyBranch(b?.tipo);
          const available = Number(s.quantity || 0) - Number(s.reserved_qty || 0);
          const sourceMax = Number(s.products?.max_stock ?? 0);
          // Loja só cede o que estiver acima do seu próprio nível saudável
          const cedible = type === 'STORE' ? Math.max(0, available - (sourceMax || available * 0.5)) : available;
          return {
            branchId: s.branch_id,
            branchName: b?.name || 'Unidade',
            type,
            availableQty: Math.floor(cedible),
          };
        })
        .filter((o: SourceOption) => o.availableQty > 0 && branchMap.has(o.branchId))
        .sort((a: SourceOption, b: SourceOption) => {
          const rank = { FACTORY: 0, CD: 1, STORE: 2, PURCHASE: 3 } as Record<SourceType, number>;
          if (rank[a.type] !== rank[b.type]) return rank[a.type] - rank[b.type];
          return b.availableQty - a.availableQty;
        });

      const best =
        sourceOptions.find((o) => o.availableQty >= requiredQty) || sourceOptions[0] || null;

      const urgency: 'critical' | 'attention' =
        analysis.status === 'critical' ? 'critical' : 'attention';

      const coverageTxt =
        analysis.dailyDemand > 0
          ? `Cobertura de ${analysis.coverageDays.toFixed(1)} dia(s)`
          : 'Sem histórico de saída recente';

      let reason: string;
      if (!best) {
        reason = `${coverageTxt}. Sem disponibilidade na rede — necessário pedido de compra/produção.`;
      } else if (best.type === 'FACTORY') {
        reason = `${coverageTxt}. Pedido à fábrica ${best.branchName} (${best.availableQty} un disponíveis).`;
      } else if (best.type === 'CD') {
        reason = `${coverageTxt}. Reposição pelo CD ${best.branchName}.`;
      } else {
        reason = `${coverageTxt}. Remanejamento da ${best.branchName}, que está com sobra de ${best.availableQty} un.`;
      }

      recommendations.push({
        productId,
        productCode: product.code || row.product_code || '',
        productName: product.name || row.product_name || 'Produto',
        unit: row.unit || product.unit || 'UN',
        branchId,
        branchName: branch.name,
        companyId,
        minStock,
        targetStock: targetStock || minStock,
        requiredQty,
        suggestedQty: best ? Math.min(requiredQty, best.availableQty) : requiredQty,
        coverageResult: analysis,
        sourceType: best ? best.type : 'PURCHASE',
        sourceBranchId: best?.branchId,
        sourceBranchName: best?.branchName,
        sourceOptions,
        reason,
        urgency,
      });
    }

    return recommendations.sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency === 'critical' ? -1 : 1;
      return a.coverageResult.coverageDays - b.coverageResult.coverageDays;
    });
  },

  /** Recomendação pontual para um SKU (usada pelo StoreOrchestrator). */
  async getPrescriptiveRecommendation(
    productId: string,
    branchId: string,
  ): Promise<ReplenishmentRecommendation | null> {
    const all = await this.getNetworkRecommendations(branchId);
    return all.find((r) => r.productId === productId) || null;
  },
};
