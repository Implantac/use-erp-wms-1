import { test, expect } from '@playwright/test';
import { generated, login, loginAs, required, userId, UUID } from './isolated-helpers';

/**
 * QA-04 — isolamento MULTI-TENANT real, sem nenhuma credencial de homologacao.
 * O boot cria um segundo tenant completo (empresa + filial + produto + admin
 * proprio), entao "B nao ve A" nao pode ser apenas um banco vazio: o teste
 * prova primeiro que cada tenant enxerga a SUA massa. Todas as consultas
 * rodam sob SET LOCAL ROLE authenticated com auth.uid() real.
 *
 * Substitui, no ambiente isolado, a intencao de tenant-isolation.spec.ts
 * (job legado `authenticated`, que exige 4 segredos de homologacao). O spec
 * legado NAO foi removido nem o gate de validacao foi afrouxado.
 */
test.describe('QA-04 — isolamento de tenant no ambiente isolado', () => {
  test('cada tenant ve a propria massa e nenhum ve a do outro', async () => {
    const env = generated();
    const companyA = required('E2E_COMPANY_ID', env.E2E_COMPANY_ID);
    const companyB = required('E2E_TENANT_B_COMPANY_ID', env.E2E_TENANT_B_COMPANY_ID);
    expect(companyA).toMatch(UUID);
    expect(companyB).toMatch(UUID);
    expect(companyB, 'os tenants precisam ser empresas distintas').not.toBe(companyA);

    const a = await loginAs('manager');
    const b = await login(
      required('E2E_TENANT_B_EMAIL', env.E2E_TENANT_B_EMAIL),
      required('E2E_TENANT_B_PASSWORD', env.E2E_TENANT_B_PASSWORD),
    );
    const uidA = await userId(a);
    const uidB = await userId(b);
    expect(uidA).not.toBe(uidB);
    expect(uidB).toBe(required('E2E_TENANT_B_USER_ID', env.E2E_TENANT_B_USER_ID));

    const profileA = await a.from('profiles').select('company_id').eq('id', uidA).single();
    const profileB = await b.from('profiles').select('company_id').eq('id', uidB).single();
    expect(profileA.error, profileA.error?.message).toBeNull();
    expect(profileB.error, profileB.error?.message).toBeNull();
    expect(String(profileA.data?.company_id)).toBe(companyA);
    expect(String(profileB.data?.company_id)).toBe(companyB);

    // Prova de nao-vacuidade: cada tenant PRECISA enxergar a propria massa.
    const ownA = await Promise.all([
      a.from('branches').select('id').eq('company_id', companyA).limit(1),
      a.from('products').select('id').eq('company_id', companyA).limit(1),
      a.from('companies').select('id').eq('id', companyA),
    ]);
    for (const r of ownA) expect(r.error, r.error?.message).toBeNull();
    expect(ownA[0].data?.length, 'A precisa enxergar filial propria').toBeGreaterThan(0);
    expect(ownA[1].data?.length, 'A precisa enxergar produto proprio').toBeGreaterThan(0);
    expect(ownA[2].data?.length, 'A precisa enxergar a propria empresa').toBeGreaterThan(0);

    const ownB = await Promise.all([
      b.from('branches').select('id').eq('company_id', companyB),
      b.from('products').select('id').eq('company_id', companyB),
      b.from('companies').select('id').eq('id', companyB),
    ]);
    for (const r of ownB) expect(r.error, r.error?.message).toBeNull();
    expect(ownB[0].data?.length, 'B precisa enxergar filial propria').toBeGreaterThan(0);
    expect(ownB[1].data?.length, 'B precisa enxergar produto proprio').toBeGreaterThan(0);
    expect(ownB[2].data?.length, 'B precisa enxergar a propria empresa').toBeGreaterThan(0);
    expect(String(ownB[0].data?.[0]?.id)).toBe(required('E2E_TENANT_B_BRANCH_ID', env.E2E_TENANT_B_BRANCH_ID));
    expect(String(ownB[1].data?.[0]?.id)).toBe(required('E2E_TENANT_B_PRODUCT_ID', env.E2E_TENANT_B_PRODUCT_ID));

    // RLS: B nao le filiais, produtos nem empresa de A.
    const leak = await Promise.all([
      b.from('branches').select('id, company_id').eq('company_id', companyA),
      b.from('products').select('id, company_id').eq('company_id', companyA),
      b.from('companies').select('id').eq('id', companyA),
    ]);
    for (const r of leak) expect(r.error, r.error?.message).toBeNull();
    expect(leak[0].data, 'vazamento de filial entre tenants').toEqual([]);
    expect(leak[1].data, 'vazamento de produto entre tenants').toEqual([]);
    expect(leak[2].data, 'vazamento de empresa entre tenants').toEqual([]);

    // Simetria: A tambem nao le a massa de B.
    const reverse = await Promise.all([
      a.from('branches').select('id').eq('company_id', companyB),
      a.from('products').select('id').eq('company_id', companyB),
      a.from('companies').select('id').eq('id', companyB),
    ]);
    for (const r of reverse) expect(r.error, r.error?.message).toBeNull();
    expect(reverse[0].data).toEqual([]);
    expect(reverse[1].data).toEqual([]);
    expect(reverse[2].data).toEqual([]);
  });

  test('tenant B e barrado ao operar unidade de A, mas opera a sua', async () => {
    const env = generated();
    const b = await login(
      required('E2E_TENANT_B_EMAIL', env.E2E_TENANT_B_EMAIL),
      required('E2E_TENANT_B_PASSWORD', env.E2E_TENANT_B_PASSWORD),
    );
    const branchA = required('E2E_STORE_BRANCH_ID', env.E2E_STORE_BRANCH_ID);
    const productA = required('E2E_PRODUCT_ID', env.E2E_PRODUCT_ID);

    const denied = await b.rpc('create_supply_request', {
      p_branch_id: branchA, p_product_id: productA,
      p_quantity: 1, p_notes: 'QA-04 tentativa cross-tenant',
    });
    expect(denied.error, 'unidade de outro tenant deve ser recusada').not.toBeNull();
    expect(denied.error?.message).toContain('empresa');

    const leaked = await b.from('supply_requests')
      .select('id').eq('requester_branch_id', branchA);
    expect(leaked.error, leaked.error?.message).toBeNull();
    expect(leaked.data, 'a tentativa negada nao pode gravar solicitacao').toEqual([]);

    const allowed = await b.rpc('create_supply_request', {
      p_branch_id: required('E2E_TENANT_B_BRANCH_ID', env.E2E_TENANT_B_BRANCH_ID),
      p_product_id: required('E2E_TENANT_B_PRODUCT_ID', env.E2E_TENANT_B_PRODUCT_ID),
      p_quantity: 1, p_notes: 'QA-04 tenant B',
    });
    expect(allowed.error, 'B deve operar normalmente no proprio tenant').toBeNull();
    expect(String((allowed.data as { status?: string })?.status)).toBe('PENDENTE');
  });
});
