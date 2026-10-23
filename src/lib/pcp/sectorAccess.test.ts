import { describe, expect, it } from 'vitest';
import { canOpenSector, hasSectorLevel, type SectorAccessContext } from './sectorAccess';

const base: SectorAccessContext = { is_admin: false, enforced: false, access: {} };

describe('acesso às centrais por setor (my_sector_access)', () => {
  it('sem contexto (carregando) não esconde nada', () => {
    expect(canOpenSector(null, 'tecelagem')).toBe(true);
    expect(canOpenSector(undefined, 'fiacao')).toBe(true);
  });

  it('admin abre todos os setores', () => {
    const ctx = { ...base, is_admin: true, enforced: true };
    for (const s of ['fiacao', 'tecelagem', 'malharia', 'tinturaria'] as const) {
      expect(canOpenSector(ctx, s)).toBe(true);
    }
  });

  it('modo legado (sem concessões na empresa) não bloqueia ninguém', () => {
    expect(canOpenSector(base, 'tinturaria')).toBe(true);
  });

  it('modo restrito: só abre o setor concedido', () => {
    const ctx: SectorAccessContext = {
      is_admin: false,
      enforced: true,
      access: { tecelagem: 'operator' },
    };
    expect(canOpenSector(ctx, 'tecelagem')).toBe(true);
    expect(canOpenSector(ctx, 'fiacao')).toBe(false);
    expect(canOpenSector(ctx, 'tinturaria')).toBe(false);
  });

  it('níveis: operator não é manager; manager opera e gerencia', () => {
    const op: SectorAccessContext = {
      is_admin: false, enforced: true, access: { tecelagem: 'operator' },
    };
    expect(hasSectorLevel(op, 'tecelagem', 'operator')).toBe(true);
    expect(hasSectorLevel(op, 'tecelagem', 'manager')).toBe(false);

    const mgr: SectorAccessContext = {
      is_admin: false, enforced: true, access: { tinturaria: 'manager' },
    };
    expect(hasSectorLevel(mgr, 'tinturaria', 'manager')).toBe(true);
    expect(hasSectorLevel(mgr, 'tinturaria', 'operator')).toBe(true);
    expect(hasSectorLevel(mgr, 'tinturaria', 'viewer')).toBe(true);
  });
});
