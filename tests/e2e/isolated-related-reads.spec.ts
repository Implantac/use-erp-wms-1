import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generated, login, loginAs, required, UUID } from './isolated-helpers';

type Tenant = {
  label: 'A' | 'B'; companyId: string; branchId: string;
  categoryId: string; supplierId: string; productId: string;
  nullCategoryProductId: string; foreignCategoryProductId: string; sharedCategoryProductId: string;
  orderId: string; emptyOrderId: string; orderItemIds: string[];
  purchaseId: string; emptyPurchaseId: string; foreignSupplierPurchaseId: string;
  purchaseItemIds: string[]; hiddenPurchaseItemId: string;
};
type RelatedFixtures = { version: string; sharedCategoryId: string; tenants: Record<'A' | 'B', Tenant> };

/**
 * QA-17 — contratos de resource embedding sobre SQL real/RLS real.
 * A massa e criada SOMENTE no boot do banco descartavel. Nenhuma resposta
 * e interceptada; nenhum GRANT/policy/trigger e alterado para passar.
 * Provas positivas NAO vazias precedem as negativas de isolamento.
 */
test.describe('QA-17 — consultas relacionadas, projecao e RLS', () => {
  let fixtures: RelatedFixtures;
  let actors: Record<'A' | 'B', SupabaseClient>;

  test.beforeAll(async () => {
    const env = generated();
    expect(env.E2E_ISOLATED_MARKER).toBe('QA-01-ISOLATED-E2E');
    expect(new URL(required('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL)).hostname).toBe('127.0.0.1');
    fixtures = JSON.parse(required('E2E_RELATED_FIXTURES', env.E2E_RELATED_FIXTURES)) as RelatedFixtures;
    expect(fixtures.version).toBe('QA17');
    expect(fixtures.sharedCategoryId).toMatch(UUID);
    expect(fixtures.tenants.A.companyId).toBe(env.E2E_COMPANY_ID);
    expect(fixtures.tenants.B.companyId).toBe(env.E2E_TENANT_B_COMPANY_ID);
    expect(fixtures.tenants.A.companyId).not.toBe(fixtures.tenants.B.companyId);
    for (const t of Object.values(fixtures.tenants)) {
      for (const [key, value] of Object.entries(t)) {
        if (key === 'label') continue;
        for (const id of Array.isArray(value) ? value : [value]) expect(id, `fixture ${key}`).toMatch(UUID);
      }
    }
    actors = {
      A: await loginAs('manager'),
      B: await login(required('E2E_TENANT_B_EMAIL', env.E2E_TENANT_B_EMAIL),
        required('E2E_TENANT_B_PASSWORD', env.E2E_TENANT_B_PASSWORD)),
    };
  });

  test('boot expoe catalogo de FKs reais e limites do subconjunto', async ({ request }) => {
    const response = await request.get('/auth/v1/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.isolated).toBe(true);
    // LOJ-05A acrescenta uma migration; manter igualdade exata, não relaxar o gate.
    expect(body.migrations).toBe(505);
    expect(body.relatedReads.version).toBe('QA-17');
    expect(body.relatedReads.maxDepth).toBe(2);
    expect(body.relatedReads.foreignKeys).toBeGreaterThan(0);
  });

  for (const label of ['A', 'B'] as const) {
    test(`tenant ${label}: as tres consultas originais retornam objetos/arrays nao vazios`, async () => {
      const client = actors[label], t = fixtures.tenants[label];
      const products = await client.from('products').select('*,categories(name)').eq('id', t.productId);
      expect(products.error, products.error?.message).toBeNull();
      expect(products.status).toBe(200);
      expect(products.data).toHaveLength(1);
      expect(products.data?.[0].id).toBe(t.productId);
      expect(products.data?.[0].company_id).toBe(t.companyId);
      expect(products.data?.[0].categories).toEqual({ name: `Categoria sintetica QA17 ${label}` });

      const sales = await client.from('orders').select('*,order_items(*)').eq('id', t.orderId);
      expect(sales.error, sales.error?.message).toBeNull();
      expect(sales.status).toBe(200);
      expect(sales.data).toHaveLength(1); // dois filhos nao duplicam o pai
      expect(sales.data?.[0].company_id).toBe(t.companyId);
      expect(sales.data?.[0].branch_id).toBe(t.branchId);
      expect(sales.data?.[0].canal_operacional).toBe('ATACADO_INDUSTRIA');
      expect(sales.data?.[0].order_items.map((i: { id: string }) => i.id).sort()).toEqual([...t.orderItemIds].sort());
      expect(sales.data?.[0].order_items.every((i: { company_id: string }) => i.company_id === t.companyId)).toBe(true);

      const purchases = await client.from('purchase_orders')
        .select('*,suppliers(name),purchase_order_items(*)').eq('id', t.purchaseId);
      expect(purchases.error, purchases.error?.message).toBeNull();
      expect(purchases.status).toBe(200);
      expect(purchases.data).toHaveLength(1);
      expect(purchases.data?.[0].company_id).toBe(t.companyId);
      expect(purchases.data?.[0].suppliers).toEqual({ name: `Fornecedor sintetico QA17 ${label}` });
      expect(purchases.data?.[0].purchase_order_items.map((i: { id: string }) => i.id).sort()).toEqual([...t.purchaseItemIds].sort());
    });

    test(`tenant ${label}: pai visivel nao libera categoria/fornecedor/itens de outro tenant`, async () => {
      const other = label === 'A' ? 'B' : 'A';
      const client = actors[label], peerClient = actors[other];
      const t = fixtures.tenants[label], peer = fixtures.tenants[other];

      // Primeiro comprova via API autenticada que os filhos EXISTEM e sao
      // legiveis por seus donos. Nao e uma negativa sobre massa vazia.
      const category = await peerClient.from('categories').select('id,name').eq('id', peer.categoryId).single();
      const supplier = await peerClient.from('suppliers').select('id,name').eq('id', peer.supplierId).single();
      const hiddenItem = await peerClient.from('purchase_order_items')
        .select('id,company_id,purchase_order_id').eq('id', t.hiddenPurchaseItemId).single();
      for (const r of [category, supplier, hiddenItem]) expect(r.error, r.error?.message).toBeNull();
      expect(category.data?.id).toBe(peer.categoryId);
      expect(supplier.data?.id).toBe(peer.supplierId);
      expect(hiddenItem.data).toEqual({
        id: t.hiddenPurchaseItemId, company_id: peer.companyId, purchase_order_id: t.emptyPurchaseId,
      });

      const product = await client.from('products')
        .select('id,category_id,categories(name)').eq('id', t.foreignCategoryProductId).single();
      expect(product.error, product.error?.message).toBeNull();
      expect(product.data).toEqual({ id: t.foreignCategoryProductId, category_id: peer.categoryId, categories: null });
      const purchase = await client.from('purchase_orders')
        .select('id,supplier_id,suppliers(name)').eq('id', t.foreignSupplierPurchaseId).single();
      expect(purchase.error, purchase.error?.message).toBeNull();
      expect(purchase.data).toEqual({ id: t.foreignSupplierPurchaseId, supplier_id: peer.supplierId, suppliers: null });

      const emptyForOwner = await client.from('purchase_orders')
        .select('id,suppliers(name),purchase_order_items(id,company_id)').eq('id', t.emptyPurchaseId).single();
      expect(emptyForOwner.error, emptyForOwner.error?.message).toBeNull();
      expect(emptyForOwner.data).toEqual({ id: t.emptyPurchaseId, suppliers: null, purchase_order_items: [] });
      for (const [table, id] of [
        ['categories', peer.categoryId], ['suppliers', peer.supplierId],
        ['purchase_order_items', t.hiddenPurchaseItemId],
      ]) {
        const direct = await client.from(table).select('id').eq('id', id);
        expect(direct.error, direct.error?.message).toBeNull();
        expect(direct.data, `RLS do filho ${table}`).toEqual([]);
      }
    });
  }

  test('FK nula -> null; colecao sem filhos -> []; categoria compartilhada segue policy real', async () => {
    for (const label of ['A', 'B'] as const) {
      const client = actors[label], t = fixtures.tenants[label];
      const product = await client.from('products')
        .select('id,categories(name)').eq('id', t.nullCategoryProductId).single();
      const sale = await client.from('orders').select('id,order_items(id)').eq('id', t.emptyOrderId).single();
      expect(product.error, product.error?.message).toBeNull();
      expect(sale.error, sale.error?.message).toBeNull();
      expect(product.data).toEqual({ id: t.nullCategoryProductId, categories: null });
      expect(sale.data).toEqual({ id: t.emptyOrderId, order_items: [] });
      const shared = await client.from('products')
        .select('id,categories(id,name,company_id)').eq('id', t.sharedCategoryProductId).single();
      expect(shared.error, shared.error?.message).toBeNull();
      expect(shared.data).toEqual({
        id: t.sharedCategoryProductId,
        categories: { id: fixtures.sharedCategoryId, name: 'Categoria compartilhada sintetica QA17', company_id: null },
      }); // Nao impor filtro company_id inventado no tradutor.
    }
  });

  test('isolamento A↔B tambem na raiz, com positivos nao vazios antes das negativas', async () => {
    for (const label of ['A', 'B'] as const) {
      const peer = label === 'A' ? 'B' : 'A';
      const t = fixtures.tenants[label];
      for (const [table, select, id] of [
        ['products', 'id,categories(name)', t.productId],
        ['orders', 'id,order_items(id)', t.orderId],
        ['purchase_orders', 'id,suppliers(name),purchase_order_items(id)', t.purchaseId],
      ]) {
        const own = await actors[label].from(table).select(select).eq('id', id);
        expect(own.error, own.error?.message).toBeNull();
        expect(own.data).toHaveLength(1);
        const denied = await actors[peer].from(table).select(select).eq('id', id);
        expect(denied.error, denied.error?.message).toBeNull();
        expect(denied.data, `${peer} nao le raiz ${table} de ${label}`).toEqual([]);
      }
    }
  });

  test('aliases, hint de FK e projecao aninhada nao expoem campos extras', async () => {
    const t = fixtures.tenants.A;
    const product = await actors.A.from('products')
      .select('codigo:code,categoria:categories!products_category_id_fkey(rotulo:name)').eq('id', t.productId).single();
    expect(product.error, product.error?.message).toBeNull();
    expect(product.data).toEqual({ codigo: 'QA17-A-OWN', categoria: { rotulo: 'Categoria sintetica QA17 A' } });
    const sale = await actors.A.from('orders')
      .select('numero:number,itens:order_items(qty:quantity,produto:products(codigo:code))').eq('id', t.orderId).single();
    expect(sale.error, sale.error?.message).toBeNull();
    expect(Object.keys(sale.data || {}).sort()).toEqual(['itens', 'numero']);
    expect(sale.data?.numero).toBe('PV-QA17-A-01');
    expect(sale.data?.itens.map((i: { qty: number }) => i.qty).sort()).toEqual([1, 2]);
    for (const item of sale.data?.itens || []) {
      expect(Object.keys(item).sort()).toEqual(['produto', 'qty']);
      // O client sem Database generico nao infere cardinalidade de FK.
      // Verificar o objeto REAL, sem cast que fabrique um tipo de sucesso.
      expect(item.produto).toEqual({ codigo: 'QA17-A-OWN' });
    }
  });

  test('order/limit/offset paginam pais, nao filhos; alias nao sequestra ORDER BY', async () => {
    const t = fixtures.tenants.A;
    const list = await actors.A.from('purchase_orders').select('number,purchase_order_items(id)')
      .like('number', 'PC-QA17-A-%').order('number').range(0, 1);
    expect(list.error, list.error?.message).toBeNull();
    expect(list.data?.map((p) => p.number)).toEqual(['PC-QA17-A-01', 'PC-QA17-A-02']);
    expect(list.data?.map((p) => p.purchase_order_items.length)).toEqual([2, 0]);
    const page = await actors.A.from('purchase_orders').select('number,purchase_order_items(id)')
      .like('number', 'PC-QA17-A-%').order('number', { ascending: false }).range(1, 1);
    expect(page.error, page.error?.message).toBeNull();
    expect(page.data?.map((p) => p.number)).toEqual(['PC-QA17-A-02']);
    const renamed = await actors.A.from('purchase_orders').select('number:id,purchase_order_items(id)')
      .like('number', 'PC-QA17-A-%').order('number');
    expect(renamed.error, renamed.error?.message).toBeNull();
    expect(renamed.data?.map((p) => p.number)).toEqual([t.purchaseId, t.emptyPurchaseId, t.foreignSupplierPurchaseId]);
    const zero = await actors.A.from('orders').select('id,order_items(id)').limit(0);
    expect(zero.error, zero.error?.message).toBeNull();
    expect(zero.data).toEqual([]);
  });

  test('escalares JSON da raiz e dos filhos preservam numeros, booleanos e nulos', async () => {
    const t = fixtures.tenants.A;
    const plain = await actors.A.from('orders').select('total,discount,delivery_date').eq('id', t.orderId).single();
    const embedded = await actors.A.from('orders')
      .select('total,discount,delivery_date,order_items(quantity,total)').eq('id', t.orderId).single();
    expect(plain.error, plain.error?.message).toBeNull();
    expect(embedded.error, embedded.error?.message).toBeNull();
    expect(plain.data).toEqual({ total: 30, discount: 0, delivery_date: null });
    expect(embedded.data).toEqual({
      ...plain.data,
      order_items: expect.arrayContaining([{ quantity: 1, total: 10 }, { quantity: 2, total: 20 }]),
    });
    expect(embedded.data?.order_items).toHaveLength(2);
    const category = await actors.A.from('categories').select('id,active').eq('id', t.categoryId).single();
    expect(category.error, category.error?.message).toBeNull();
    expect(category.data).toEqual({ id: t.categoryId, active: true });
  });

  test('single preserva objeto e 406/PGRST116 para zero ou multiplos pais', async () => {
    const t = fixtures.tenants.A;
    const one = await actors.A.from('orders').select('id,order_items(id)').eq('id', t.orderId).single();
    expect(one.error, one.error?.message).toBeNull();
    expect(one.data?.id).toBe(t.orderId);
    expect(one.data?.order_items).toHaveLength(2);
    const many = await actors.A.from('orders').select('id,order_items(id)').in('id', [t.orderId, t.emptyOrderId]).single();
    const none = await actors.A.from('orders').select('id,order_items(id)').eq('id', fixtures.tenants.B.orderId).single();
    for (const r of [many, none]) {
      expect(r.status).toBe(406);
      expect(r.error?.code).toBe('PGRST116');
      expect(r.data).toBeNull();
    }
    const optional = await actors.A.from('orders').select('id,order_items(id)').eq('id', fixtures.tenants.B.orderId).maybeSingle();
    expect(optional.error, optional.error?.message).toBeNull();
    expect(optional.data).toBeNull();
  });

  test('sintaxes nao suportadas e filtros de filhos falham fechado, sem resposta parcial', async () => {
    for (const select of [
      'id,categories!inner(name)', 'id,categories(inexistente)', 'id,sem_fk(name)',
      'id,categories(name', 'id,categories(name::text)', '*,name,categories(name)',
      'id,categories(products(categories(name)))',
    ]) {
      const r = await actors.A.from('products').select(select);
      expect(r.status, select).toBe(400);
      expect(r.error, select).not.toBeNull();
      expect(r.data, select).toBeNull();
    }
    const childFilter = await actors.A.from('products').select('id,categories(name)').filter('categories.name', 'eq', 'x');
    expect(childFilter.status).toBe(400);
    expect(childFilter.data).toBeNull();
    // O erro anterior nao altera schema/dados nem derruba o transporte.
    const healthy = await actors.A.from('products').select('id,categories(name)').eq('id', fixtures.tenants.A.productId);
    expect(healthy.error, healthy.error?.message).toBeNull();
    expect(healthy.data).toHaveLength(1);
  });

  test('embeds sem JWT valido nao consultam dados', async ({ request }) => {
    const headersList: Record<string, string>[] = [{}, { Authorization: 'Bearer invalido' }];
    for (const headers of headersList) {
      const r = await request.get('/rest/v1/products?select=id,categories(name)', { headers });
      expect(r.status()).toBe(401);
      expect(await r.json()).toMatchObject({ message: 'JWT ausente ou invalido; RLS nao foi aplicada' });
    }
  });
});
