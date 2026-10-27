/**
 * Cálculos de processo dos PCPs setoriais — sempre a partir de valores
 * CONFIGURADOS/medido pela empresa (BOM congelada, perfil da OP). Nada
 * aqui presume receita, dosagem ou tolerância: sem entrada completa, o
 * resultado é `null` e a tela mostra a pendência.
 */

export interface BomComponentLike {
  componentName: string;
  componentUnit: string;
  /** Quantidade do componente por unidade de saída da BOM/snapshot. */
  quantity: number;
}

function positive(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Composição percentual da BOM (por unidade de saída): participação de
 * cada componente na soma das quantidades da BOM. É a composição
 * PLANEJADA da ficha — não mede a mistura real do processo.
 */
export function bomComposition(lines: readonly BomComponentLike[]): Array<{ name: string; unit: string; pct: number }> {
  const total = lines.reduce((sum, line) => sum + positive(line.quantity), 0);
  if (total <= 0) return [];
  return lines
    .filter((line) => positive(line.quantity) > 0)
    .map((line) => ({
      name: line.componentName,
      unit: line.componentUnit,
      pct: (positive(line.quantity) / total) * 100,
    }))
    .sort((a, b) => b.pct - a.pct);
}

/**
 * Volume do banho de tingimento (litros) = peso da partida (kg) × relação
 * de banho (L/kg, como configurada no perfil: "1:X" significa X L/kg).
 * Sem peso ou sem relação configurada, não calcula.
 */
export function bathVolumeLiters(batchWeightKg: number | null | undefined, bathRatio: number | null | undefined): number | null {
  const weight = positive(batchWeightKg);
  const ratio = positive(bathRatio);
  if (weight <= 0 || ratio <= 0) return null;
  return weight * ratio;
}

/**
 * Totais de componentes da BOM para a quantidade planejada da partida:
 * quantidade por unidade de saída × quantidade planejada. É a leitura da
 * receita CONFIGURADA para o tamanho da partida — a unidade exibida é a
 * da linha da BOM, sem conversão presumida.
 */
export function componentTotalsForBatch(
  lines: readonly BomComponentLike[],
  plannedQty: number | null | undefined,
): Array<{ name: string; unit: string; total: number }> {
  const qty = positive(plannedQty);
  if (qty <= 0) return [];
  return lines
    .filter((line) => positive(line.quantity) > 0)
    .map((line) => ({ name: line.componentName, unit: line.componentUnit, total: positive(line.quantity) * qty }))
    .sort((a, b) => b.total - a.total);
}

export interface LabColor {
  l: number;
  a: number;
  b: number;
}

function isCompleteLab(color: Partial<LabColor> | null | undefined): color is LabColor {
  return Boolean(
    color
    && typeof color.l === 'number' && Number.isFinite(color.l)
    && typeof color.a === 'number' && Number.isFinite(color.a)
    && typeof color.b === 'number' && Number.isFinite(color.b),
  );
}

/**
 * ΔE*ab (CIE76) entre a meta e a medição da partida. Só existe com os
 * dois lados completos (meta configurada + medição registrada); a
 * interpretação (aceitável ou não) é da empresa — aqui não há tolerância
 * presumida.
 */
export function deltaE76(target: Partial<LabColor> | null | undefined, measured: Partial<LabColor> | null | undefined): number | null {
  if (!isCompleteLab(target) || !isCompleteLab(measured)) return null;
  return Math.sqrt((target.l - measured.l) ** 2 + (target.a - measured.a) ** 2 + (target.b - measured.b) ** 2);
}
