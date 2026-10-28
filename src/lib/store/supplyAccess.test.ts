import { describe, expect, it } from 'vitest';
import { canManageSupply, resolveGroupRoot } from './supplyAccess';

const zipo = { id: 'zipo', parent_company_id: null };
const loja = { id: 'farm', parent_company_id: 'zipo' };
const companies = [zipo, loja];

describe('resolveGroupRoot', () => {
  it('sobe da Loja para a indústria-raiz', () => {
    expect(resolveGroupRoot(companies, 'farm')).toBe('zipo');
    expect(resolveGroupRoot(companies, 'zipo')).toBe('zipo');
  });
});

describe('canManageSupply', () => {
  it('gestor da fábrica (admin na raiz) gerencia', () => {
    const r = canManageSupply({ companies, roles: [{ company_id: 'zipo', role: 'admin' }], isSystemAdmin: false, currentCompanyId: 'farm' });
    expect(r.canManage).toBe(true);
    expect(r.rootCompanyId).toBe('zipo');
  });

  it('operador da Loja NÃO gerencia (só solicita e recebe)', () => {
    const r = canManageSupply({ companies, roles: [{ company_id: 'farm', role: 'operator' }], isSystemAdmin: false, currentCompanyId: 'farm' });
    expect(r.canManage).toBe(false);
  });

  it('admin só da Loja (sem papel na raiz) não decide pela fábrica', () => {
    const r = canManageSupply({ companies, roles: [{ company_id: 'farm', role: 'admin' }], isSystemAdmin: false, currentCompanyId: 'farm' });
    expect(r.canManage).toBe(false);
  });

  it('system_admin gerencia qualquer grupo', () => {
    const r = canManageSupply({ companies, roles: [], isSystemAdmin: true, currentCompanyId: 'farm' });
    expect(r.canManage).toBe(true);
  });
});
