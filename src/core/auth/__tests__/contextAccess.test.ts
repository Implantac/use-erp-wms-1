import { describe, expect, it } from 'vitest';
import { evaluateContextAccess, getRouteContextCriteria } from '../contextAccess';
import { getNavigationForContext } from '@/config/navigation';

const storeContext = {
  unitType: 'STORE' as const,
  channel: 'VAREJO_PDV' as const,
  scope: 'SINGLE_UNIT' as const,
  role: 'operator' as const,
  permissions: ['sales.read'],
};

describe('contextAccess', () => {
  it('permite o PDV no contexto de loja e varejo', () => {
    const criteria = getRouteContextCriteria('/comercial/pdv');
    expect(criteria).not.toBeNull();
    expect(evaluateContextAccess(criteria ?? {}, storeContext)).toEqual({ allowed: true, reason: null });
  });

  it('bloqueia produção no contexto de loja', () => {
    const criteria = getRouteContextCriteria('/producao/pcp');
    expect(evaluateContextAccess(criteria ?? {}, storeContext)).toEqual({ allowed: false, reason: 'unit-type' });
  });

  it('bloqueia página unitária na visão consolidada', () => {
    const criteria = getRouteContextCriteria('/wms/recebimento');
    const result = evaluateContextAccess(criteria ?? {}, {
      ...storeContext,
      unitType: 'DISTRIBUTION_CENTER',
      channel: 'CONSOLIDADO',
      scope: 'CONSOLIDATED',
    });
    expect(result.allowed).toBe(false);
  });

  it('permite área administrativa somente aos perfis autorizados', () => {
    const criteria = getRouteContextCriteria('/admin/usuarios');
    expect(evaluateContextAccess(criteria ?? {}, storeContext).reason).toBe('role');
    expect(evaluateContextAccess(criteria ?? {}, { ...storeContext, role: 'admin' }).allowed).toBe(true);
  });

  it('nega permissões não concedidas; papel de visualizador não equivale a acesso total', () => {
    const restricted = { ...storeContext, role: 'viewer' as const, permissions: [] };
    expect(evaluateContextAccess({ permission: 'financial.write' }, restricted)).toEqual({ allowed: false, reason: 'permission' });
    expect(evaluateContextAccess({ permission: 'financial.write' }, { ...restricted, permissions: ['financial.write'] }).allowed).toBe(true);
  });

  it('mantém rotas gerais sem restrição contextual', () => {
    expect(getRouteContextCriteria('/dashboard')).toBeNull();
    expect(getRouteContextCriteria('/financeiro/dashboard')).toBeNull();
  });

  it('remove grupos e filhos incompatíveis do menu da loja', () => {
    const sections = getNavigationForContext(storeContext);
    const items = sections.flatMap((section) => section.items);
    expect(items.some((item) => item.title === 'Produção (PCP)')).toBe(false);
    expect(items.some((item) => item.title === 'WMS Avançado')).toBe(false);
    expect(items.some((item) => item.children?.some((child) => child.href === '/comercial/pdv'))).toBe(true);
  });
});