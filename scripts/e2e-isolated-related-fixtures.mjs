// QA-17 — dados sinteticos APENAS para o boot do Postgres descartavel.
// Nao altera policies, GRANTs, triggers, constraints ou dados de producao.
// Algumas FKs apontam deliberadamente para outro tenant (a FK real permite):
// servem para provar que uma raiz visivel NAO torna o filho legivel sem RLS.
// Nenhuma trigger e desabilitada. order_items respeita a guarda de tenant.

export async function seedRelatedReadFixtures(pool, { companyA, companyB, branchA, branchB }) {
  if (!companyA || !companyB || companyA === companyB || !branchA || !branchB) {
    throw new Error('QA-17 exige dois tenants/filiais distintos e nao vazios');
  }
  const conn = await pool.connect();
  const insert = async (sql, values) => {
    const id = (await conn.query(sql, values)).rows[0]?.id;
    if (!id) throw new Error('QA-17: fixture nao persistiu');
    return id;
  };
  const tenants = {
    A: { companyId: companyA, branchId: branchA, label: 'A' },
    B: { companyId: companyB, branchId: branchB, label: 'B' },
  };
  try {
    await conn.query('BEGIN');
    await conn.query(`SELECT set_config('request.jwt.claims', '{}', true)`);
    const sharedCategoryId = await insert(
      `INSERT INTO public.categories (company_id, name)
       VALUES (NULL, 'Categoria compartilhada sintetica QA17') RETURNING id`, []);
    for (const t of Object.values(tenants)) {
      t.categoryId = await insert(
        `INSERT INTO public.categories (company_id, name) VALUES ($1, $2) RETURNING id`,
        [t.companyId, `Categoria sintetica QA17 ${t.label}`]);
      t.supplierId = await insert(
        `INSERT INTO public.suppliers (company_id, code, name, document)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [t.companyId, `QA17-${t.label}`, `Fornecedor sintetico QA17 ${t.label}`,
          `0000000000170${t.label === 'A' ? '1' : '2'}`]);
    }
    for (const t of Object.values(tenants)) {
      const peer = tenants[t.label === 'A' ? 'B' : 'A'];
      for (const [key, code, category] of [
        ['productId', 'OWN', t.categoryId],
        ['nullCategoryProductId', 'NONE', null],
        ['foreignCategoryProductId', 'FOREIGN', peer.categoryId],
        ['sharedCategoryProductId', 'SHARED', sharedCategoryId],
      ]) {
        t[key] = await insert(
          `INSERT INTO public.products (company_id, code, name, category_id, unit)
           VALUES ($1, $2, $3, $4, 'UN') RETURNING id`,
          [t.companyId, `QA17-${t.label}-${code}`, `Produto sintetico QA17 ${t.label} ${code}`, category]);
      }
      for (const [key, suffix, total] of [['orderId', '01', 30], ['emptyOrderId', '02', 0]]) {
        t[key] = await insert(
          `INSERT INTO public.orders
             (company_id, branch_id, number, client_name, subtotal, total, canal_operacional, notes)
           VALUES ($1, $2, $3, $4, $5, $5, 'ATACADO_INDUSTRIA'::public.canal_operacional,
                   'Massa sintetica QA17, sem valor comercial') RETURNING id`,
          [t.companyId, t.branchId, `PV-QA17-${t.label}-${suffix}`, `Cliente sintetico QA17 ${t.label}`, total]);
      }
      t.orderItemIds = [];
      for (const quantity of [1, 2]) {
        t.orderItemIds.push(await insert(
          `INSERT INTO public.order_items
             (company_id, order_id, product_id, product_name, product_code, quantity, unit_price, total)
           VALUES ($1, $2, $3, $4, $5, $6, 10, $7) RETURNING id`,
          [t.companyId, t.orderId, t.productId, `Produto sintetico QA17 ${t.label} OWN`,
            `QA17-${t.label}-OWN`, quantity, quantity * 10]));
      }
      for (const [key, suffix, supplier, total] of [
        ['purchaseId', '01', t.supplierId, 30],
        ['emptyPurchaseId', '02', null, 0],
        ['foreignSupplierPurchaseId', '03', peer.supplierId, 0],
      ]) {
        t[key] = await insert(
          `INSERT INTO public.purchase_orders
             (company_id, number, supplier_id, supplier_name, subtotal, total, notes)
           VALUES ($1, $2, $3, $4, $5, $5, 'Massa sintetica QA17, inclusive FKs adversariais') RETURNING id`,
          [t.companyId, `PC-QA17-${t.label}-${suffix}`, supplier, `Fornecedor sintetico QA17 ${t.label}`, total]);
      }
      t.purchaseItemIds = [];
      for (const quantity of [1, 2]) {
        t.purchaseItemIds.push(await insert(
          `INSERT INTO public.purchase_order_items
             (company_id, purchase_order_id, product_id, product_name, product_code, quantity, unit_price, total)
           VALUES ($1, $2, $3, $4, $5, $6, 10, $7) RETURNING id`,
          [t.companyId, t.purchaseId, t.productId, `Produto sintetico QA17 ${t.label} OWN`,
            `QA17-${t.label}-OWN`, quantity, quantity * 10]));
      }
    }
    for (const t of Object.values(tenants)) {
      const peer = tenants[t.label === 'A' ? 'B' : 'A'];
      // Filho de OUTRO tenant sob um pai visivel: deve resultar em [] para
      // o dono do pai, mas ser comprovadamente nao vazio para o dono do filho.
      // Esta FK e permitida pelas constraints reais de purchase_order_items.
      t.hiddenPurchaseItemId = await insert(
        `INSERT INTO public.purchase_order_items
           (company_id, purchase_order_id, product_id, product_name, product_code, quantity, unit_price, total)
         VALUES ($1, $2, $3, $4, $5, 99, 1, 99) RETURNING id`,
        [peer.companyId, t.emptyPurchaseId, peer.productId,
          `Filho adversarial QA17 ${peer.label} em pai ${t.label}`, `QA17-HIDDEN-${peer.label}-IN-${t.label}`]);
    }
    await conn.query('COMMIT');
    return { version: 'QA17', sharedCategoryId, tenants };
  } catch (error) {
    await conn.query('ROLLBACK').catch(() => {});
    throw new Error(`fixtures de relacoes QA-17: ${error.message}`);
  } finally {
    conn.release();
  }
}
