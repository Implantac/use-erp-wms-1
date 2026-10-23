import type { SectorKind } from './sectorProfiles';

export type SectorAccessLevel = 'viewer' | 'operator' | 'manager';

/**
 * Contexto de acesso setorial do usuário (RPC `my_sector_access`).
 * - `is_admin`: administrador da empresa (acesso total);
 * - `enforced`: a empresa já configurou concessões (modo restrito ligado);
 * - `access`: nível por setor concedido ao usuário.
 */
export interface SectorAccessContext {
  is_admin: boolean;
  enforced: boolean;
  access: Partial<Record<SectorKind, SectorAccessLevel>>;
}

const LEVEL_RANK: Record<SectorAccessLevel, number> = {
  viewer: 1,
  operator: 2,
  manager: 3,
};

/**
 * A interface abre a central? A verdade é o banco (as RPCs de escrita
 * validam com `assert_sector_access`); aqui é só apresentação. Sem contexto
 * (carregando/erro de RPC em banco antigo), não esconde nada — fail-open de
 * tela, nunca de escrita.
 */
export function canOpenSector(
  ctx: SectorAccessContext | null | undefined,
  sector: SectorKind,
): boolean {
  if (!ctx) return true;
  if (ctx.is_admin || !ctx.enforced) return true;
  return Boolean(ctx.access[sector]);
}

/** O usuário atinge o nível mínimo no setor? (mesma regra do banco) */
export function hasSectorLevel(
  ctx: SectorAccessContext | null | undefined,
  sector: SectorKind,
  min: SectorAccessLevel,
): boolean {
  if (!ctx) return true;
  if (ctx.is_admin || !ctx.enforced) return true;
  const have = ctx.access[sector];
  return have != null && LEVEL_RANK[have] >= LEVEL_RANK[min];
}
