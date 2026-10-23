import { sectorKindFromSectorText, type SectorKind } from './sectorProfiles';

/**
 * Filtros de seleção operacional do PCP.
 *
 * Numa tecelagem, "fio de urdume/trama" só pode ser fio: oferecer pluma,
 * corante ou a própria malha como fio é erro de operação. Um produto é
 * classificado como fio quando a categoria/subcategoria indica fio ou o
 * código/nome começa por "Fio" (convenção de cadastro). O produto já
 * salvo no perfil continua visível mesmo fora do filtro, para não travar
 * a edição de OPs antigas.
 */

export interface YarnProductLike {
  id: string;
  code?: string | null;
  name?: string | null;
  category_name?: string | null;
  subcategory?: string | null;
}

function normalize(text: string | null | undefined): string {
  return (text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function isYarnProduct(product: YarnProductLike): boolean {
  if (normalize(product.code).startsWith('fio')) return true;
  if (normalize(product.name).startsWith('fio')) return true;
  if (normalize(product.category_name).includes('fio')) return true;
  if (normalize(product.subcategory).includes('fio')) return true;
  return false;
}

export function filterYarnProducts<T extends YarnProductLike>(products: readonly T[], selectedId?: string | null): T[] {
  const yarns = products.filter(isYarnProduct);
  if (selectedId && !yarns.some((product) => product.id === selectedId)) {
    const selected = products.find((product) => product.id === selectedId);
    if (selected) return [selected, ...yarns];
  }
  return yarns;
}

/**
 * Máquina/recurso pertence ao setor quando o setor cadastrado identifica
 * aquele setor. Sem setor cadastrado (ou setor não têxtil reconhecido), o
 * item não é escondido — esconder equipamento não classificado travaria o
 * cadastro; quem está explicitamente em OUTRO setor têxtil é excluído.
 */
export function machineMatchesSector(machineSector: string | null | undefined, kind: SectorKind): boolean {
  if (!machineSector || !machineSector.trim()) return true;
  const machineKind = sectorKindFromSectorText(machineSector);
  return machineKind === null || machineKind === kind;
}

/** Fibra/pluma: insumo de entrada da fiação (categoria ou nome/código). */
export function isFiberProduct(product: YarnProductLike): boolean {
  if (normalize(product.code).startsWith('pluma') || normalize(product.code).startsWith('fibra')) return true;
  const name = normalize(product.name);
  if (name.includes('pluma') || name.includes('fibra')) return true;
  if (normalize(product.category_name).includes('fibra')) return true;
  if (normalize(product.subcategory).includes('fibra')) return true;
  return false;
}

/** Corante/produto químico de tingimento (categoria ou nome/código). */
export function isDyeProduct(product: YarnProductLike): boolean {
  if (normalize(product.code).startsWith('corante')) return true;
  const name = normalize(product.name);
  if (name.startsWith('corante') || name.startsWith('auxiliar')) return true;
  if (normalize(product.category_name).includes('corante')) return true;
  if (normalize(product.subcategory).includes('corante')) return true;
  return false;
}
