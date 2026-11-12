import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSelectTree, buildEmbeddedProjection, resolveRelationship,
  loadRelationshipCatalog, EMBED_LIMITS,
} from './e2e-isolated-embeds.mjs';
import { buildTableQuery } from './e2e-isolated-lib.mjs';

const fk = (name, sourceTable, sourceColumns, targetTable, targetColumns, sourceUnique = false) => ({
  name, sourceTable, sourceColumns, targetTable, targetColumns, sourceUnique,
});
const catalog = {
  tables: {
    products: ['id', 'company_id', 'category_id', 'code', 'name'],
    categories: ['id', 'company_id', 'name'],
    orders: ['id', 'number', 'client_id', 'bill_to_client_id'],
    order_items: ['id', 'order_id', 'quantity'],
    clients: ['id', 'name'],
    order_details: ['id', 'order_id', 'note'],
    pairs: ['a', 'b', 'value'], pair_refs: ['x', 'y', 'label'],
  },
  foreignKeys: [
    fk('products_category_id_fkey', 'products', ['category_id'], 'categories', ['id']),
    fk('order_items_order_id_fkey', 'order_items', ['order_id'], 'orders', ['id']),
    fk('orders_client_id_fkey', 'orders', ['client_id'], 'clients', ['id']),
    fk('orders_bill_to_client_id_fkey', 'orders', ['bill_to_client_id'], 'clients', ['id']),
    fk('order_details_order_id_key', 'order_details', ['order_id'], 'orders', ['id'], true),
    fk('pair_refs_pair_fkey', 'pair_refs', ['x', 'y'], 'pairs', ['a', 'b']),
  ],
};
const build = (table, select) => buildEmbeddedProjection(table, select, catalog);
const relation = (parent, select) => resolveRelationship(parent, parseSelectTree(select)[0], catalog);

test('parser: wildcard misturado com embeds e virgulas dentro de parenteses', () => {
  const fields = parseSelectTree('*,categories(id,name),orders(id,order_items(id,quantity))');
  assert.equal(fields.length, 3);
  assert.deepEqual(fields[0], { kind: 'wildcard' });
  assert.deepEqual(fields[1].fields.map((f) => f.name), ['id', 'name']);
  assert.equal(fields[2].fields[1].fields[1].name, 'quantity');
});

test('parser: aliases de coluna/recurso, hint de FK e whitespace', () => {
  const fields = parseSelectTree(' codigo : code, categoria : categories ! products_category_id_fkey ( nome : name ) ');
  assert.deepEqual(fields[0], { kind: 'column', name: 'code', alias: 'codigo' });
  assert.equal(fields[1].alias, 'categoria');
  assert.equal(fields[1].resource, 'categories');
  assert.equal(fields[1].hint, 'products_category_id_fkey');
  assert.equal(fields[1].fields[0].alias, 'nome');
});

for (const select of [
  '', ' ', ',', 'id,', ',id', 'categories()', 'categories(id,)', 'categories(,id)',
  'categories(name', 'categories(name))', 'id)', '(id)', 'id,,code', '"name"',
  'public.products(id)', 'id;DROP TABLE products', 'meta->name', 'name::text',
  'categories!inner(name)', 'categories!left(name)', 'categories!fk!inner(name)',
  'id!fk', '*,*', 'id,id', 'x:id,x:code',
]) {
  test(`parser fail-closed: ${JSON.stringify(select)}`, () => {
    assert.throws(() => parseSelectTree(select));
  });
}

test('parser: limita caracteres, profundidade, campos e quantidade de embeds', () => {
  assert.throws(() => parseSelectTree('x'.repeat(EMBED_LIMITS.characters + 1)), /limite/);
  assert.throws(() => parseSelectTree('a(b(c(id)))'), /profundidade/);
  assert.throws(() => parseSelectTree(Array.from({ length: EMBED_LIMITS.nodes + 1 }, (_, i) => `c${i}`).join(',')), /campos/);
  assert.throws(() => parseSelectTree(Array.from({ length: EMBED_LIMITS.embeds + 1 }, (_, i) => `c${i}(id)`).join(',')), /embeds/);
});

test('N:1: objeto correlacionado sem LIMIT 1 e sem colunas nao projetadas', () => {
  const { columns, alias } = build('products', 'code,categories(name)');
  assert.equal(alias, 'e2e_rel_0');
  assert.match(columns, /"e2e_rel_1"\."id" = "e2e_rel_0"\."category_id"/);
  assert.match(columns, /SELECT to_jsonb\("e2e_rel_2"\)/);
  assert.match(columns, /SELECT "e2e_rel_1"\."name" AS "name"/);
  assert.doesNotMatch(columns, /jsonb_agg|LIMIT|JOIN|company_id|SECURITY DEFINER/i);
  assert.equal(relation('products', 'categories(name)').many, false);
});

test('1:N: array/[] correlacionado, sem JOIN que multiplique os pais', () => {
  const { columns } = build('orders', 'id,order_items(id,quantity)');
  assert.match(columns, /COALESCE\(jsonb_agg\(to_jsonb\("e2e_rel_2"\)\), '\[\]'::jsonb\)/);
  assert.match(columns, /"e2e_rel_1"\."order_id" = "e2e_rel_0"\."id"/);
  assert.doesNotMatch(columns, /\bJOIN\b|\bLIMIT\b/i);
  assert.equal(relation('orders', 'order_items(id)').many, true);
});

test('1:1 inverso usa unicidade estrutural, nao adivinhacao por nome', () => {
  assert.equal(relation('orders', 'order_details(note)').many, false);
  assert.doesNotMatch(build('orders', 'order_details(note)').columns, /jsonb_agg/);
  const notUnique = structuredClone(catalog);
  notUnique.foreignKeys.find((f) => f.sourceTable === 'order_details').sourceUnique = false;
  assert.match(buildEmbeddedProjection('orders', 'order_details(note)', notUnique).columns, /jsonb_agg/);
});

test('FK composta correlaciona TODAS as colunas na ordem do catalogo', () => {
  const { columns } = build('pair_refs', 'label,pairs(value)');
  assert.match(columns, /"e2e_rel_1"\."a" = "e2e_rel_0"\."x" AND "e2e_rel_1"\."b" = "e2e_rel_0"\."y"/);
  assert.equal(relation('pairs', 'pair_refs(label)').many, true);
});

test('FK ambigua exige hint real; nao escolhe a primeira relacao', () => {
  assert.throws(() => build('orders', 'clients(name)'), /ambigua/);
  const a = relation('orders', 'clients!orders_client_id_fkey(name)');
  const b = relation('orders', 'clients!bill_to_client_id(name)');
  assert.deepEqual(a.parentColumns, ['client_id']);
  assert.deepEqual(b.parentColumns, ['bill_to_client_id']);
  assert.throws(() => build('orders', 'clients!inventado(name)'), /sem FK/);
});

test('recurso por nome de FK/coluna e alias somente com relacao existente', () => {
  assert.equal(relation('products', 'categoria:category_id(name)').table, 'categories');
  assert.equal(relation('products', 'categoria:products_category_id_fkey(name)').table, 'categories');
  assert.match(build('products', 'categoria:categories(nome:name)').columns, /AS "nome".*AS "categoria"/);
  assert.throws(() => build('products', 'company_id(name)'), /sem FK/);
  assert.throws(() => build('products', 'sum(code)'), /sem FK/);
  assert.throws(() => build('products', 'orders(id)'), /sem FK/);
});

test('projecoes aninhadas respeitam o catalogo a cada nivel', () => {
  const { columns } = build('orders', 'id,order_items(id,orders(number))');
  assert.match(columns, /"e2e_rel_3"\."id" = "e2e_rel_1"\."order_id"/);
  assert.match(columns, /AS "order_items"/);
  assert.throws(() => build('orders', 'order_items(products(id))'), /sem FK/);
});

test('colunas/tabelas inexistentes e catalogo ausente ou inconsistente falham', () => {
  assert.throws(() => buildEmbeddedProjection('products', 'categories(name)'), /sem catalogo/);
  assert.throws(() => build('missing', 'id'), /sem catalogo/);
  assert.throws(() => build('products', 'inventada,categories(name)'), /coluna desconhecida/);
  assert.throws(() => build('products', 'categories(inventada)'), /coluna desconhecida/);
  assert.throws(() => buildEmbeddedProjection('products', 'categories(name)', { tables: catalog.tables }), /FKs ausente/);
  assert.throws(() => buildEmbeddedProjection('products', 'categories(name)', {
    tables: catalog.tables, foreignKeys: [{ ...catalog.foreignKeys[0], targetColumns: [] }],
  }), /FK invalido/);
  const broken = structuredClone(catalog);
  broken.tables.categories = ['name'];
  assert.throws(() => buildEmbeddedProjection('products', 'categories(name)', broken), /coluna de FK ausente/);
});

test('wildcard nao permite chaves sobrepostas, inclusive alias de relacao', () => {
  assert.throws(() => build('products', '*,name,categories(name)'), /sobrepoe/);
  assert.throws(() => build('products', '*,name:categories(name)'), /sobrepoe/);
  assert.throws(() => build('products', 'categories(*,name)'), /sobrepoe/);
  assert.throws(() => build('products', 'categories(name),categories(id)'), /duplicada/);
  assert.match(build('products', '*,categories(name)').columns, /^"e2e_rel_0"\.\*,/);
});

test('identificadores maliciosos nao entram no SQL, nem vindos de catalogo adulterado', () => {
  assert.throws(() => build('products; DROP TABLE products', 'categories(name)'), /identificador invalido/);
  assert.throws(() => build('products', 'categories(name);DROP TABLE products'));
  const broken = structuredClone(catalog);
  broken.foreignKeys[0].targetTable = 'categories;DROP';
  assert.throws(() => buildEmbeddedProjection('products', 'category_id(name)', broken), /identificador invalido/);
});

test('query integrada: valores parametrizados, filtro/order do PAI qualificados', () => {
  const input = "x' OR TRUE;--";
  const { sql, values, single } = buildTableQuery('products', new URLSearchParams({
    select: 'code:name,categories(name)', code: `eq.${input}`,
    order: 'code.desc.nullslast,id.asc', limit: '2', offset: '1',
  }), true, catalog);
  assert.match(sql, /FROM public\."products" AS "e2e_rel_0" WHERE "e2e_rel_0"\."code" = \$1/);
  assert.match(sql, /ORDER BY "e2e_rel_0"\."code" DESC NULLS LAST, "e2e_rel_0"\."id" ASC LIMIT \$2 OFFSET \$3$/);
  assert.ok(!sql.includes(input));
  assert.deepEqual(values, [input, 2, 1]);
  assert.equal(single, true);
});

test('paginacao: limit=0 e offset=0 sao aplicados, nao ignorados', () => {
  const { sql, values } = buildTableQuery('products', new URLSearchParams({ limit: '0', offset: '0', order: 'name.nullsfirst' }));
  assert.match(sql, /ORDER BY "name" ASC NULLS FIRST LIMIT \$1 OFFSET \$2$/);
  assert.deepEqual(values, [0, 0]);
});

for (const [parameter, value] of [
  ['limit', '-1'], ['limit', '2.5'], ['limit', 'NaN'], ['limit', ''],
  ['limit', '9007199254740992'], ['offset', '-1'], ['offset', '1 OR TRUE'],
  ['order', 'name.wrong'], ['order', 'name.desc;DROP'], ['order', 'name.asc,'],
  ['order', 'categories.name.asc'], ['select', ''], ['select', '*,id'],
]) {
  test(`query fail-closed: ${parameter}=${JSON.stringify(value)}`, () => {
    assert.throws(() => buildTableQuery('products', new URLSearchParams({ [parameter]: value }), false, catalog));
  });
}

test('filtros/ordenacao de filhos nao suportados nao viram sucesso parcial', () => {
  assert.throws(() => buildTableQuery('products', new URLSearchParams({
    select: 'categories(name)', 'categories.name': 'eq.x',
  }), false, catalog), /identificador invalido/);
  assert.throws(() => buildTableQuery('products', new URLSearchParams({
    select: 'categories(name)', 'categories.order': 'name.asc',
  }), false, catalog), /filtro PostgREST nao suportado/);
});

test('catalogo carrega so metadados public e conserva FK/colunas/unique retornados pelo PG', async () => {
  const calls = [];
  const pool = { query: async (sql) => {
    calls.push(sql);
    return { rows: calls.length === 1
      ? [{ name: 'products', columns: catalog.tables.products }]
      : catalog.foreignKeys };
  } };
  const loaded = await loadRelationshipCatalog(pool);
  assert.deepEqual(loaded.tables, { products: catalog.tables.products });
  assert.deepEqual(loaded.foreignKeys, catalog.foreignKeys);
  assert.equal(calls.length, 2);
  for (const sql of calls) assert.doesNotMatch(sql, /FROM public\.|ALTER TABLE|GRANT|SET ROLE|SECURITY DEFINER/i);
  assert.match(calls[0], /n\.nspname = 'public'/);
  // pg nao decodifica name[] por padrao; text[] precisa ser explicito.
  assert.match(calls[0], /array_agg\(a\.attname::text/);
  assert.equal((calls[1].match(/SELECT a\.attname::text/g) || []).length, 2);
  assert.match(calls[1], /fk\.convalidated/);
  assert.match(calls[1], /i\.indisunique AND i\.indisvalid/);
  assert.match(calls[1], /i\.indpred IS NULL AND i\.indexprs IS NULL/);
  assert.match(calls[1], /ORDER BY k\.ord/);
});
