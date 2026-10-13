import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const tenantAEmail = process.env.E2E_TENANT_A_EMAIL;
const tenantAPassword = process.env.E2E_TENANT_A_PASSWORD;
const tenantBEmail = process.env.E2E_TENANT_B_EMAIL;
const tenantBPassword = process.env.E2E_TENANT_B_PASSWORD;

function required(name: string, value?: string): string {
  if (!value) throw new Error(`${name} é obrigatório para o teste real de isolamento`);
  return value;
}

async function authenticatedClient(email: string, password: string) {
  const client = createClient(required('VITE_SUPABASE_URL', url), required('VITE_SUPABASE_PUBLISHABLE_KEY', anonKey), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  expect(error, `Falha ao autenticar ${email}`).toBeNull();
  expect(data.user).not.toBeNull();
  return client;
}

test.describe('Segurança - Isolamento de Tenant', () => {
  test('empresa B não lê filiais nem produtos da empresa A', async () => {
    const clientA = await authenticatedClient(
      required('E2E_TENANT_A_EMAIL', tenantAEmail),
      required('E2E_TENANT_A_PASSWORD', tenantAPassword),
    );
    const clientB = await authenticatedClient(
      required('E2E_TENANT_B_EMAIL', tenantBEmail),
      required('E2E_TENANT_B_PASSWORD', tenantBPassword),
    );

    const { data: profileA, error: profileError } = await clientA
      .from('profiles')
      .select('company_id')
      .single();
    expect(profileError).toBeNull();
    expect(profileA?.company_id).toBeTruthy();

    const { data: profileB, error: profileBError } = await clientB
      .from('profiles')
      .select('company_id')
      .single();
    expect(profileBError).toBeNull();
    expect(profileB?.company_id).toBeTruthy();

    const companyA = required('company_id da empresa A', profileA?.company_id ?? undefined);
    const companyB = required('company_id da empresa B', profileB?.company_id ?? undefined);
    expect(companyB, 'As identidades A/B devem pertencer a empresas diferentes').not.toBe(companyA);

    // A must see its own seeded rows; otherwise B seeing [] proves nothing.
    // Provision at least one branch and product for A in isolated staging.
    const [ownBranches, ownProducts, branches, products] = await Promise.all([
      clientA.from('branches').select('id, company_id').eq('company_id', companyA).limit(1),
      clientA.from('products').select('id, company_id').eq('company_id', companyA).limit(1),
      clientB.from('branches').select('id, company_id').eq('company_id', companyA),
      clientB.from('products').select('id, company_id').eq('company_id', companyA),
    ]);

    expect(ownBranches.error).toBeNull();
    expect(ownProducts.error).toBeNull();
    expect(ownBranches.data?.length, 'A precisa enxergar filial própria cadastrada').toBeGreaterThan(0);
    expect(ownProducts.data?.length, 'A precisa enxergar produto próprio cadastrado').toBeGreaterThan(0);
    expect(branches.error).toBeNull();
    expect(products.error).toBeNull();
    expect(branches.data).toEqual([]);
    expect(products.data).toEqual([]);

    await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()]);
  });
});
