/**
 * Setores têxteis com PCP próprio e seus vocabulários operacionais.
 *
 * Cada tipo de produção (fiação, malharia, tecelagem, tinturaria) tem
 * recurso, unidade, perfil técnico e eventos diferentes — por isso cada um
 * tem sua central sobre o mesmo motor de execução. Nenhum parâmetro de
 * processo é presumido aqui: títulos, relações de banho, galgas e tempos
 * são sempre configurados pela empresa na ficha/OP.
 */

export type SectorKind = 'fiacao' | 'malharia' | 'tecelagem' | 'tinturaria' | 'beneficiamento';

/** Setores com perfil/eventos próprios nesta leva (tecelagem tem tabelas legadas próprias). */
export type SectorProfileKind = Exclude<SectorKind, 'tecelagem'>;

export const SECTOR_LABELS: Record<SectorKind, string> = {
  fiacao: 'Fiação',
  malharia: 'Malharia',
  tecelagem: 'Tecelagem',
  tinturaria: 'Tinturaria',
  beneficiamento: 'Beneficiamento/Acabamento',
};

/** Trechos (minúsculos, sem acento) que identificam o setor de uma OP. */
export const SECTOR_MATCHERS: Record<SectorKind, readonly string[]> = {
  fiacao: ['fiacao', 'filatorio', 'spinning'],
  malharia: ['malharia', 'knitting', 'circular'],
  tecelagem: ['tecelagem', 'tecel', 'loom', 'tear'],
  tinturaria: ['tinturaria', 'tingimento', 'dyeing'],
  beneficiamento: ['beneficiamento', 'finishing'],
};

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Identifica o setor a partir do texto de setor da OP. Malharia é testada
 * antes de tecelagem porque "tear circular" contém "tear".
 */
export function sectorKindFromSectorText(sector: string | null | undefined): SectorKind | null {
  if (!sector) return null;
  const normalized = normalize(sector);
  const order: SectorKind[] = ['fiacao', 'malharia', 'beneficiamento', 'tinturaria', 'tecelagem'];
  for (const kind of order) {
    if (SECTOR_MATCHERS[kind].some((matcher) => normalized.includes(matcher))) return kind;
  }
  return null;
}

/** Unidade de apontamento de quantidade nos eventos de cada setor. */
export const SECTOR_EVENT_QUANTITY_UNIT: Record<SectorProfileKind, string> = {
  fiacao: 'kg',
  malharia: 'kg',
  tinturaria: 'kg',
  beneficiamento: 'm',
};

const COMMON_EVENT_TYPES = [
  'setup',
  'start',
  'pause',
  'resume',
  'stop',
  'quality_hold',
  'quality_release',
  'inspection',
  'note',
] as const;

/** Vocabulário de eventos executáveis por setor (espelha a migration). */
export const SECTOR_EVENT_TYPES: Record<SectorProfileKind, readonly string[]> = {
  fiacao: [...COMMON_EVENT_TYPES, 'doffing', 'fiber_break'],
  malharia: [...COMMON_EVENT_TYPES, 'yarn_break', 'roll_change'],
  tinturaria: [...COMMON_EVENT_TYPES, 'bath_start', 'wash', 'unload', 'color_hold', 'color_release', 're_dye'],
  beneficiamento: [...COMMON_EVENT_TYPES, 'rama_start', 'width_check', 'shrinkage_check', 'roll_change'],
};

export const SECTOR_EVENT_LABELS: Record<string, string> = {
  setup: 'Preparação/setup',
  start: 'Início',
  pause: 'Pausa',
  resume: 'Retomada',
  stop: 'Parada',
  quality_hold: 'Bloqueio de qualidade',
  quality_release: 'Liberação de qualidade',
  inspection: 'Inspeção',
  note: 'Observação',
  doffing: 'Tirada (descarregamento do filatório)',
  fiber_break: 'Ruptura de fio',
  yarn_break: 'Quebra de fio',
  roll_change: 'Troca de rolo',
  bath_start: 'Início do banho',
  wash: 'Lavagem/enxágue',
  unload: 'Descarga',
  color_hold: 'Retenção para acerto de cor',
  color_release: 'Cor liberada',
  re_dye: 'Retingimento',
  rama_start: 'Início na rama',
  width_check: 'Conferência de largura',
  shrinkage_check: 'Medição de encolhimento',
};

export function sectorEventLabel(eventType: string): string {
  return SECTOR_EVENT_LABELS[eventType] ?? eventType;
}

export function isValidSectorEvent(kind: SectorProfileKind, eventType: string): boolean {
  return SECTOR_EVENT_TYPES[kind].includes(eventType);
}

/**
 * Classificação de desvios (skills de PCP por setor, §"Tratamento de
 * desvios"). Cada setor classifica a parada/evento na sua própria lista —
 * fiação usa os 6M + energia; tinturaria classifica cor, substrato, receita,
 * produto químico, laboratório etc. A causa nasce "em investigação" e só
 * vira "confirmada" por registro do responsável; nunca é presumida.
 */
export interface DeviationCategory {
  value: string;
  label: string;
}

const OPERATIONAL_DEVIATION_CATEGORIES: readonly DeviationCategory[] = [
  { value: 'material', label: 'Material' },
  { value: 'maquina', label: 'Máquina' },
  { value: 'qualidade', label: 'Qualidade' },
  { value: 'mao_de_obra', label: 'Mão de obra' },
  { value: 'metodo', label: 'Método' },
  { value: 'energia_utilidades', label: 'Energia/utilidades' },
  { value: 'programacao', label: 'Programação' },
];

export const SECTOR_DEVIATION_CATEGORIES: Record<SectorKind, readonly DeviationCategory[]> = {
  fiacao: OPERATIONAL_DEVIATION_CATEGORIES,
  malharia: OPERATIONAL_DEVIATION_CATEGORIES,
  tecelagem: [
    { value: 'fio_urdume', label: 'Fio de urdume' },
    { value: 'fio_trama', label: 'Fio de trama' },
    { value: 'maquina', label: 'Máquina/tear' },
    { value: 'preparacao', label: 'Preparação' },
    { value: 'qualidade', label: 'Qualidade' },
    { value: 'operacao', label: 'Operação' },
    { value: 'material', label: 'Material' },
    { value: 'programacao', label: 'Programação' },
  ],
  tinturaria: [
    { value: 'cor', label: 'Cor' },
    { value: 'substrato', label: 'Substrato' },
    { value: 'maquina', label: 'Máquina' },
    { value: 'receita', label: 'Receita' },
    { value: 'produto_quimico', label: 'Produto químico' },
    { value: 'utilidade', label: 'Utilidade' },
    { value: 'tempo', label: 'Tempo' },
    { value: 'qualidade', label: 'Qualidade' },
    { value: 'manutencao', label: 'Manutenção' },
    { value: 'laboratorio', label: 'Laboratório' },
    { value: 'planejamento', label: 'Planejamento' },
  ],
  beneficiamento: [
    { value: 'largura', label: 'Largura' },
    { value: 'gramatura', label: 'Gramatura' },
    { value: 'encolhimento', label: 'Encolhimento' },
    { value: 'aparencia', label: 'Toque/aparência' },
    { value: 'maquina', label: 'Máquina/rama' },
    { value: 'qualidade', label: 'Qualidade' },
    { value: 'material', label: 'Material' },
    { value: 'programacao', label: 'Programação' },
  ],
};

export const DEVIATION_CAUSE_STATUSES: readonly DeviationCategory[] = [
  { value: 'em_investigacao', label: 'Causa em investigação' },
  { value: 'confirmada', label: 'Causa confirmada' },
];

export function isValidDeviationCategory(kind: SectorKind, category: string | null | undefined): boolean {
  if (!category) return true; // classificação é opcional; nunca presumida
  return SECTOR_DEVIATION_CATEGORIES[kind].some((item) => item.value === category);
}

export function deviationCategoryLabel(kind: SectorKind, category: string | null | undefined): string | null {
  if (!category) return null;
  return SECTOR_DEVIATION_CATEGORIES[kind].find((item) => item.value === category)?.label ?? category;
}
