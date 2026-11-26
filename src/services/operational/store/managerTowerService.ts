import { supabase } from '@/integrations/supabase/client';
import { computeCoverage, type CoverageResult, type CoverageStatus } from '@/lib/manager/coverageMath';
import { replenishmentEngine, type ReplenishmentRecommendation } from '@/services/operational/inventory/replenishmentEngine';
import {
  pendingSettlement,
  suggestConsignmentTransfers,
  type ConsignTransferSuggestion,
} from '@/lib/manager/consignmentMath';
import { consignmentService, type ConsignmentNetworkRow } from './consignmentService';

/**
 * Visão do GESTOR DA FÁBRICA sobre as lojas:
 *  - resumo por loja (estoque próprio, consignado, rupturas, em trânsito);
 *  - cobertura/ruptura produto × loja com data prevista;
 *  - sugestões de reposição (remanear × CD × fábrica × produzir);
 *  - remanejo de consignadas por giro.
 */

const FACTORY_TIPOS = ['industria', 'FACTORY'];
const CD_TIPOS = ['cd', 'DISTRIBUTION_CENTER'];

export type UnitKind = 'FACTORY' | 'CD' | 'STORE';

export function classifyUnitKind(tipo?: string | null): UnitKind {
  if (!tipo) return 'STORE';
  if (FACTORY_TIPOS.includes(tipo)) return 'FACTORY';
  if (CD_TIPOS.includes(tipo)) return 'CD';
  return 'STORE';
}

export interface ManagerBranchRow {
  id: string;
  name: string;
  tipo: string;
  kind: UnitKind;
}

export interface StoreSummaryRow {
  branch: ManagerBranchRow;
  /** Valor do estoque próprio (custo) */
  stockValue: number;
  /** SKUs com ruptura (projeção crítica) */
  ruptureCount: number;
  /** Menor cobertura entre os SKUs com giro (dias) — null sem base */
  minCoverageDays: number | null;
  /** Peças em consignação nesta loja */
  consignedQty: number;
  /** Valor de consignação sob a loja */
  consignedValue: number;
  /** Vendido em consignação ainda não liquidado */
  consignmentPending: number;
  /** Transferências em trânsito com destino nesta loja */
  inTransitCount: number;
  /** Tarefas operacionais pendentes críticas */
  openCriticalTasks: number;
}

export interface CoverageRow {
  branchId: string;
  branchName: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  coverage: CoverageResult;
}

export interface ManagerSuggestion extends ReplenishmentRecommendation {
  /** 'REMANEJO' | 'CD' | 'FABRICA' | 'PRODUCAO' */
  action: 'REMANEJO' | 'CD' | 'FABRICA' | 'PRODUCAO';
  actionLabel: string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const managerTowerService = {
  async getBranches(companyId: string): Promise<ManagerBranchRow[]> {
    const { data, error } = await (supabase as any)
      .from('branches')
      .select('id, name, tipo')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string; name: string; tipo: string }>).map((b) => ({
      ...b,
      kind: classifyUnitKind(b.tipo),
    }));
  },

  /** Resumo por loja + fábrica/CD (consolidado do gestor). */
  async getStoreSummaries(companyId: string): Promise<StoreSummaryRow[]> {
    const branches = await this.getBranches(companyId);

    const [balancesRes, consignRes, transitRes, tasksRes] = await Promise.all([
      (supabase as any)
        .from('stock_balances')
        .select('branch_id, quantity, reserved_qty, in_transit_qty, product_id, products(cost_price, min_stock, max_stock)')
        .eq('company_id', companyId),
      consignmentService.getNetwork().catch(() => [] as ConsignmentNetworkRow[]),
      (supabase as any)
        .from('stock_transfer_orders')
        .select('destination_unit_id, current_status')
        .eq('company_id', companyId)
        .eq('current_status', 'EM TRÂNSITO'),
      (supabase as any)
        .from('operational_tasks')
        .select('branch_id')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .in('priority', ['critical', 'high']),
    ]);

    const balances = balancesRes.data ?? [];
    const consignedByBranch = new Map<string, { qty: number; value: number; pending: number }>();
    for (const row of consignRes as ConsignmentNetworkRow[]) {
      const agg = consignedByBranch.get(row.branch_id) ?? { qty: 0, value: 0, pending: 0 };
      agg.qty += num(row.qty_available);
      agg.value += num(row.consigned_value);
      agg.pending += pendingSettlement({
        branchId: row.branch_id,
        productId: row.product_id,
        qtyReceived: 0,
        qtySold: 0,
        qtySponsored: 0,
        qtyReturned: 0,
        qtyTransferredIn: 0,
        qtyTransferredOut: 0,
        consignedValue: 0,
        soldValue: num(row.sold_value),
        settledValue: num(row.settled_value),
      });
      consignedByBranch.set(row.branch_id, agg);
    }

    const transitByBranch = new Map<string, number>();
    for (const t of transitRes.data ?? []) {
      transitByBranch.set(t.destination_unit_id, (transitByBranch.get(t.destination_unit_id) ?? 0) + 1);
    }

    const tasksByBranch = new Map<string, number>();
    for (const t of tasksRes.data ?? []) {
      tasksByBranch.set(t.branch_id, (tasksByBranch.get(t.branch_id) ?? 0) + 1);
    }

    // Ruptura e menor cobertura por loja (só lojas: fábrica/CD não "estoura" em ruptura de PDV)
    const byBranch = new Map<string, { rupture: number; minCoverage: number | null }>();
    for (const b of branches) {
      if (b.kind !== 'STORE') continue;
      byBranch.set(b.id, { rupture: 0, minCoverage: null });
    }
    const storeCoverage = await this.getCoverageRows(companyId, branches).catch(() => [] as CoverageRow[]);
    for (const row of storeCoverage) {
      const agg = byBranch.get(row.branchId);
      if (!agg) continue;
      if (row.coverage.status === 'critical') agg.rupture += 1;
      if (row.coverage.coverageDays !== null) {
        agg.minCoverage =
          agg.minCoverage === null ? row.coverage.coverageDays : Math.min(agg.minCoverage, row.coverage.coverageDays);
      }
    }

    return branches.map((branch) => {
      let stockValue = 0;
      for (const bal of balances) {
        if (bal.branch_id !== branch.id) continue;
        stockValue += num(bal.quantity) * num(bal.products?.cost_price);
      }
      const consigned = consignedByBranch.get(branch.id) ?? { qty: 0, value: 0, pending: 0 };
      const coverageAgg = byBranch.get(branch.id);
      return {
        branch,
        stockValue,
        ruptureCount: coverageAgg?.rupture ?? 0,
        minCoverageDays: coverageAgg?.minCoverage ?? null,
        consignedQty: consigned.qty,
        consignedValue: consigned.value,
        consignmentPending: consigned.pending,
        inTransitCount: transitByBranch.get(branch.id) ?? 0,
        openCriticalTasks: tasksByBranch.get(branch.id) ?? 0,
      };
    });
  },

  /**
   * Cobertura produto × loja para TODAS as lojas (individual e consolidável).
   * Reusa demanda real (get_branch_daily_demand) e políticas de reposição.
   */
  async getCoverageRows(companyId: string, branches?: ManagerBranchRow[]): Promise<CoverageRow[]> {
    const allBranches = branches ?? (await this.getBranches(companyId));
    const stores = allBranches.filter((b) => b.kind === 'STORE');
    const rows: CoverageRow[] = [];

    await Promise.all(
      stores.map(async (store) => {
        const [balancesRes, policiesRes, demandRes] = await Promise.all([
          (supabase as any)
            .from('stock_balances')
            .select('product_id, quantity, reserved_qty, in_transit_qty, product_code, product_name, unit, products(name, code, unit, min_stock, max_stock)')
            .eq('company_id', companyId)
            .eq('branch_id', store.id),
          (supabase as any)
            .from('replenishment_policies')
            .select('product_id, min_stock, max_stock, target_coverage_days')
            .eq('branch_id', store.id)
            .eq('is_active', true),
          (supabase as any).rpc('get_branch_daily_demand', { p_branch_id: store.id, p_days: 30 }),
        ]);

        const balances = balancesRes.data ?? [];
        const policies = new Map(
          ((policiesRes.data ?? []) as Array<Record<string, unknown>>).map((p) => [p.product_id as string, p]),
        );
        const demand = new Map<string, number>();
        for (const d of (demandRes.data ?? []) as Array<{ product_id: string; daily_demand: number }>) {
          demand.set(d.product_id, num(d.daily_demand));
        }

        for (const bal of balances) {
          if (!bal.product_id) continue;
          const policy = policies.get(bal.product_id);
          const product = bal.products ?? {};
          rows.push({
            branchId: store.id,
            branchName: store.name,
            productId: bal.product_id,
            productCode: bal.product_code || product.code || '',
            productName: bal.product_name || product.name || 'Produto',
            unit: bal.unit || product.unit || 'UN',
            coverage: computeCoverage({
              quantity: num(bal.quantity),
              reserved: num(bal.reserved_qty),
              inTransit: num(bal.in_transit_qty),
              dailyDemand: demand.get(bal.product_id) ?? 0,
              minStock: num(policy?.min_stock ?? product.min_stock),
              maxStock: num(policy?.max_stock ?? product.max_stock),
            }),
          });
        }
      }),
    );

    const order: Record<CoverageStatus, number> = {
      critical: 0,
      attention: 1,
      normal: 2,
      excess: 3,
      no_data: 4,
    };
    return rows.sort((a, b) => {
      const byStatus = order[a.coverage.status] - order[b.coverage.status];
      if (byStatus !== 0) return byStatus;
      const ca = a.coverage.coverageDays ?? Number.POSITIVE_INFINITY;
      const cb = b.coverage.coverageDays ?? Number.POSITIVE_INFINITY;
      return ca - cb;
    });
  },

  /**
   * Sugestões de reposição de todas as lojas, com AÇÃO prescrita:
   * remanejar entre lojas (giro), deslocar do CD, pedido à fábrica ou produzir.
   */
  async getSuggestions(companyId: string): Promise<ManagerSuggestion[]> {
    const branches = await this.getBranches(companyId);
    const stores = branches.filter((b) => b.kind === 'STORE');

    const lists = await Promise.all(
      stores.map((store) =>
        replenishmentEngine.getNetworkRecommendations(store.id).catch(() => [] as ReplenishmentRecommendation[]),
      ),
    );

    const actionOf = (r: ReplenishmentRecommendation): ManagerSuggestion['action'] => {
      if (r.sourceType === 'STORE') return 'REMANEJO';
      if (r.sourceType === 'CD') return 'CD';
      if (r.sourceType === 'FACTORY') return 'FABRICA';
      return 'PRODUCAO';
    };
    const labelOf: Record<ManagerSuggestion['action'], string> = {
      REMANEJO: 'Remanejar entre lojas',
      CD: 'Deslocar do CD',
      FABRICA: 'Pedido à fábrica',
      PRODUCAO: 'Produzir / comprar',
    };

    const merged: ManagerSuggestion[] = [];
    for (const list of lists) {
      for (const r of list) {
        const action = actionOf(r);
        merged.push({ ...r, action, actionLabel: labelOf[action] });
      }
    }

    return merged.sort((a, b) => {
      const rank = { critical: 0, attention: 1, normal: 2 } as const;
      const byUrgency = rank[a.urgency] - rank[b.urgency];
      if (byUrgency !== 0) return byUrgency;
      return a.coverageResult.coverageDays - b.coverageResult.coverageDays;
    });
  },

  /** Remanejo de CONSIGNADAS por giro (loja parada → loja em falta). */
  async getConsignmentTransferSuggestions(companyId: string): Promise<ConsignTransferSuggestion[]> {
    const branches = await this.getBranches(companyId);
    const stores = branches.filter((b) => b.kind === 'STORE');
    const [network, coverage] = await Promise.all([
      consignmentService.getNetwork(),
      this.getCoverageRows(companyId, branches).catch(() => [] as CoverageRow[]),
    ]);

    const coverageKey = (branchId: string, productId: string): CoverageRow | undefined =>
      coverage.find((c) => c.branchId === branchId && c.productId === productId);

    // qty_available já vem calculado da view; o giro diário vem da cobertura da loja
    const stocks = network
      .map((row) => {
        const cov = coverageKey(row.branch_id, row.product_id);
        return {
          branchId: row.branch_id,
          productId: row.product_id,
          available: num(row.qty_available),
          dailyDemand: cov?.coverage.dailyDemand ?? 0,
        };
      })
      .filter((s) => stores.some((st) => st.id === s.branchId) && s.available > 0);

    return suggestConsignmentTransfers(stocks);
  },
};
