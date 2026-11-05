export interface SectorBoardConfig {
  kind: 'fiacao' | 'malharia' | 'tinturaria' | 'beneficiamento';
  title: string;
  machineMatch: string;
  profileTable: string;
  unit: string;
  plannedField: 'planned_output_kg' | 'planned_output_m';
  extraLabel: (profile: any) => string | null;
}

export const SECTOR_BOARDS: Record<'fiacao' | 'malharia' | 'tinturaria' | 'beneficiamento', SectorBoardConfig> = {
  fiacao: {
    kind: 'fiacao',
    title: 'Quadro de Máquinas — Fiação',
    machineMatch: 'fia',
    profileTable: 'spinning_order_profiles',
    unit: 'kg',
    plannedField: 'planned_output_kg',
    extraLabel: (p) => (p?.target_title ? `título ${p.target_title}` : null),
  },
  malharia: {
    kind: 'malharia',
    title: 'Quadro de Teares Circulares — Malharia',
    machineMatch: 'malhar',
    profileTable: 'knitting_order_profiles',
    unit: 'kg',
    plannedField: 'planned_output_kg',
    extraLabel: (p) => (p?.gauge ? `galga ${p.gauge}` : null),
  },
  tinturaria: {
    kind: 'tinturaria',
    title: 'Quadro de Cubas/Máquinas — Tinturaria',
    machineMatch: 'tintur',
    profileTable: 'dyeing_order_profiles',
    unit: 'kg',
    plannedField: 'planned_output_kg',
    extraLabel: (p) =>
      p?.color_name ? `cor ${p.color_name}${p.bath_ratio ? ` · banho 1:${p.bath_ratio}` : ''}` : null,
  },
  beneficiamento: {
    kind: 'beneficiamento',
    title: 'Quadro de Ramas/Máquinas — Beneficiamento',
    machineMatch: 'benefici',
    profileTable: 'beneficiamento_order_profiles',
    unit: 'm',
    plannedField: 'planned_output_m',
    extraLabel: (p) =>
      p?.target_width_cm ? `largura alvo ${p.target_width_cm} cm${p.target_grammage_g_m2 ? ` · ${p.target_grammage_g_m2} g/m²` : ''}` : null,
  },
};
