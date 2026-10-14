import { differenceInDays, parseISO, addDays, format } from 'date-fns';
import type {
  OrderLike, CapacityLike, SupplyLike, MaterialItemLike, SheetLike,
  TimeEntryLike, OutsourcingOrderLike, MaterialNeed, SimulationScenario,
  SimulationResult, ActionSuggestion, PCPMetrics, ScheduleSlot,
} from './types';

export class MRPService {
  /**
   * Calculate material needs from production orders and technical sheets
   */
  static calculateNeeds(
    activeOPs: OrderLike[],
    sheets: SheetLike[],
    supplies: SupplyLike[]
  ): MaterialNeed[] {
    const needsMap = new Map<string, { materialCode: string; totalRequired: number; relatedOPs: string[]; unit: string; name: string }>();

    for (const op of activeOPs) {
      const candidates = sheets.filter(s => (op.product_id && s.product_id === op.product_id)
        || (op.product_code && s.product_code === op.product_code));
      if (candidates.length !== 1 || !Array.isArray(candidates[0].materials) || !candidates[0].materials.length) continue;
      const materials = candidates[0].materials;
      const valid = materials.every(mat => {
        const code = (mat.code || mat.componentCode || mat.material_code || '').trim();
        const quantity = mat.quantity ?? mat.qty;
        const waste = mat.waste_pct ?? mat.wastePercentage ?? 0;
        return !!code && !!mat.unit?.trim() && Number.isFinite(quantity) && (quantity ?? 0) > 0
          && Number.isFinite(waste) && waste >= 0;
      });
      const remaining = op.quantity - op.produced_quantity;
      if (!valid || !Number.isFinite(remaining) || remaining <= 0) continue;
      for (const mat of materials) {
        const code = (mat.code || mat.componentCode || mat.material_code || '').trim();
        const unit = mat.unit!.trim();
        const name = mat.name || mat.componentName || mat.material_name || code;
        const needed = remaining * (mat.quantity ?? mat.qty!) * (1 + (mat.waste_pct ?? mat.wastePercentage ?? 0) / 100);
        if (!Number.isFinite(needed) || needed <= 0) continue;
        const key = JSON.stringify([code, unit]);
        const entry = needsMap.get(key) ?? { materialCode: code, totalRequired: 0, relatedOPs: [], unit, name };
        entry.totalRequired += needed;
        if (!entry.relatedOPs.includes(op.order_number)) entry.relatedOPs.push(op.order_number);
        needsMap.set(key, entry);
      }
    }

    return [...needsMap.values()].map(data => {
      const matches = supplies.filter(s => s.code === data.materialCode && s.unit === data.unit
        && Number.isFinite(s.current_quantity) && (s.current_quantity ?? -1) >= 0);
      const coverageKnown = matches.length === 1 && Number.isFinite(data.totalRequired) && data.totalRequired > 0;
      const supply = coverageKnown ? matches[0] : undefined;
      const inStock = supply?.current_quantity ?? 0;
      const deficit = coverageKnown ? Math.max(0, data.totalRequired - inStock) : 0;
      const coveragePct = coverageKnown ? Math.round(Math.min(100, inStock / data.totalRequired * 100)) : 0;
      return {
        materialCode: data.materialCode,
        materialName: data.name,
        unit: data.unit,
        totalRequired: Math.ceil(data.totalRequired * 100) / 100,
        inStock,
        deficit: Math.ceil(deficit * 100) / 100,
        coveragePct,
        coverageKnown,
        relatedOPs: data.relatedOPs,
        status: !coverageKnown ? 'unverified' as const : coveragePct < 50 ? 'critical' as const
          : coveragePct < 100 ? 'partial' as const : 'ok' as const,
      };
    }).sort((a, b) => (a.coverageKnown ? a.coveragePct : 101) - (b.coverageKnown ? b.coveragePct : 101));
  }

  /**
   * Generate smart suggestions based on material needs and OPs
   */
  static generateSuggestions(
    needs: MaterialNeed[],
    activeOPs: OrderLike[],
    capacities: CapacityLike[]
  ): ActionSuggestion[] {
    const suggestions: ActionSuggestion[] = [];

    const unverified = needs.filter(n => !n.coverageKnown);
    if (unverified.length) suggestions.push({
      type: 'alert', severity: 'warning',
      title: `${unverified.length} material(is) sem cobertura verificável`,
      description: 'Código, unidade ou saldo único ausente/incompatível. Revise os cadastros; nenhuma compra ou consumo é autorizado.',
    });

    // Critical material shortages from comparable gross balances only.
    const criticals = needs.filter(n => n.coverageKnown && n.status === 'critical');
    if (criticals.length > 0) {
      suggestions.push({
        type: 'alert',
        severity: 'warning',
        title: `${criticals.length} material(is) com baixa cobertura bruta estimada`,
        description: `Materiais ${criticals.slice(0, 3).map(c => c.materialName).join(', ')}: projeção pelo saldo bruto, sem reservas, bloqueios ou conversões. Verifique disponibilidade real antes de comprar.`,
      });
    }

    // OPs at risk due to material
    const opsAtRisk = new Set<string>();
    criticals.forEach(c => c.relatedOPs.forEach(op => opsAtRisk.add(op)));
    if (opsAtRisk.size > 0) {
      suggestions.push({
        type: 'alert',
        severity: 'warning',
        title: `${opsAtRisk.size} OP(s) para revisar disponibilidade de material`,
        description: `Ordens ${[...opsAtRisk].slice(0, 3).join(', ')}: cobertura estimada com saldo bruto; validar lotes, reservas e unidade antes de agir.`,
      });
    }

    // Overdue OPs
    const today = new Date();
    const overdueOPs = activeOPs.filter(o => o.due_date && new Date(o.due_date) < today);
    overdueOPs.forEach(op => {
      const daysLate = differenceInDays(today, new Date(op.due_date));
      suggestions.push({
        type: 'anticipate',
        severity: daysLate > 5 ? 'critical' : 'warning',
        title: `OP ${op.order_number} atrasada ${daysLate} dia(s)`,
        description: `Produto: ${op.product_name}. Quantidade pendente: ${op.quantity - op.produced_quantity} (unidade da OP). Considere hora extra ou redistribuição.`,
        relatedOP: op.order_number,
        estimatedImpact: `${daysLate} dias de atraso no prazo de entrega`,
      });
    });

    // About-to-be-late OPs
    activeOPs.filter(o => {
      if (!o.due_date || overdueOPs.includes(o)) return false;
      const daysLeft = differenceInDays(new Date(o.due_date), today);
      const remaining = o.quantity - o.produced_quantity;
      const avgTimePerUnit = o.estimated_time_minutes / Math.max(o.quantity, 1);
      const estDaysNeeded = (remaining * avgTimePerUnit) / (8 * 60);
      return estDaysNeeded > daysLeft && daysLeft <= 5;
    }).forEach(op => {
      suggestions.push({
        type: 'anticipate',
        severity: 'warning',
        title: `OP ${op.order_number} pode atrasar`,
        description: `Prazo em ${differenceInDays(new Date(op.due_date), today)} dias, mas estimativa de conclusão é maior. Antecipe ou aumente capacidade.`,
        relatedOP: op.order_number,
      });
    });

    return suggestions.sort((a, b) => {
      const sev = { critical: 0, warning: 1, info: 2 };
      return (sev[a.severity] ?? 2) - (sev[b.severity] ?? 2);
    });
  }
}
