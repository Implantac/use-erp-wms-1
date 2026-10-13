import { differenceInDays, parseISO, addDays, format } from 'date-fns';
import { formatBRL } from '@/lib/formatters';
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
    const needsMap: Record<string, { totalRequired: number; relatedOPs: string[]; unit: string; name: string }> = {};

    activeOPs.forEach(op => {
      const sheet = sheets.find((s) =>
        s.product_code === op.product_code || s.product_id === op.product_id
      );
      if (sheet && Array.isArray(sheet.materials)) {
        const remaining = Math.max(0, op.quantity - op.produced_quantity);
        sheet.materials.forEach((mat) => {
          const code = mat.code || mat.componentCode || mat.material_code || '';
          const name = mat.name || mat.componentName || mat.material_name || code;
          const qtyPerUnit = mat.quantity || mat.qty || 0;
          const waste = mat.waste_pct || mat.wastePercentage || 0;
          const needed = remaining * qtyPerUnit * (1 + waste / 100);
          if (!needsMap[code]) needsMap[code] = { totalRequired: 0, relatedOPs: [], unit: mat.unit || 'UN', name };
          needsMap[code].totalRequired += needed;
          if (!needsMap[code].relatedOPs.includes(op.order_number)) needsMap[code].relatedOPs.push(op.order_number);
        });
      }
    });

    return Object.entries(needsMap).map(([code, data]) => {
      const supply = supplies.find((s) => s.code === code || s.name === data.name);
      const inStock = supply?.current_quantity || 0;
      const deficit = Math.max(0, data.totalRequired - inStock);
      const coveragePct = data.totalRequired > 0 ? Math.min(100, (inStock / data.totalRequired) * 100) : 100;
      let status: 'ok' | 'partial' | 'critical' = 'ok';
      if (coveragePct < 50) status = 'critical';
      else if (coveragePct < 100) status = 'partial';

      return {
        materialCode: code,
        materialName: data.name,
        unit: data.unit,
        totalRequired: Math.ceil(data.totalRequired * 100) / 100,
        inStock,
        deficit: Math.ceil(deficit * 100) / 100,
        coveragePct: Math.round(coveragePct),
        relatedOPs: data.relatedOPs,
        status,
        unitCost: supply?.unit_cost || 0,
      };
    }).sort((a, b) => a.coveragePct - b.coveragePct);
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

    // Critical material shortages
    const criticals = needs.filter(n => n.status === 'critical');
    if (criticals.length > 0) {
      suggestions.push({
        type: 'alert',
        severity: 'warning',
        title: `${criticals.length} material(is) com baixa cobertura bruta estimada`,
        description: `Materiais ${criticals.slice(0, 3).map(c => c.materialName).join(', ')}: projeção pelo saldo bruto, sem reservas, bloqueios ou conversões. Verifique disponibilidade real antes de comprar.`,
        estimatedImpact: `Custo hipotético do déficit bruto: ${formatBRL(criticals.reduce((s, c) => s + c.deficit * c.unitCost, 0))}; não é pedido aprovado`,
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
        description: `Produto: ${op.product_name}. Pendente: ${op.quantity - op.produced_quantity} un. Considere hora extra ou redistribuição.`,
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
