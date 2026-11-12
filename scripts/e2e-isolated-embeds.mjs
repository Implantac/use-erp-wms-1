// QA-17 — subconjunto restrito de resource embedding para o servidor E2E.
// NAO e PostgREST completo. Apenas tabelas public com FK real, projecoes,
// aliases e hint de FK. Sem !inner, filtros de filhos, casts ou funcoes.
// O SQL gerado e executado pelo servidor sob SET LOCAL ROLE authenticated:
// cada subconsulta continua sujeita aos GRANTs e as policies RLS reais.

export const EMBED_LIMITS = Object.freeze({ characters: 4096, depth: 2, nodes: 80, embeds: 12 });
const validName = (name) => typeof name === 'string' && /^[a-z_][a-z0-9_]*$/i.test(name);
const q = (name) => {
  if (!validName(name)) throw new Error(`identificador invalido no embed: ${JSON.stringify(name)}`);
  return `"${name}"`;
};

export function parseSelectTree(source) {
  if (typeof source !== 'string' || !source.trim() || source.length > EMBED_LIMITS.characters) {
    throw new Error('select vazio ou acima do limite do ambiente isolado');
  }
  let pos = 0, count = 0, embeds = 0;
  const whitespace = () => { while (pos < source.length && /\s/.test(source[pos])) pos++; };
  const name = () => {
    whitespace();
    const match = /^[a-z_][a-z0-9_]*/i.exec(source.slice(pos));
    if (!match) throw new Error(`identificador invalido no select (posicao ${pos})`);
    pos += match[0].length;
    return match[0];
  };
  function list(depth) {
    if (depth > EMBED_LIMITS.depth) throw new Error('profundidade de embed nao suportada');
    const fields = [], keys = new Set();
    while (true) {
      whitespace();
      if (pos >= source.length || source[pos] === ')') throw new Error('select/grupo vazio ou virgula final');
      if (++count > EMBED_LIMITS.nodes) throw new Error('quantidade de campos acima do limite');
      let field;
      if (source[pos] === '*') {
        pos++;
        field = { kind: 'wildcard' };
      } else {
        let resource = name(), alias;
        whitespace();
        if (source[pos] === ':') { pos++; alias = resource; resource = name(); }
        whitespace();
        let hint;
        if (source[pos] === '!') {
          pos++; hint = name(); whitespace();
          if (['inner', 'left'].includes(hint.toLowerCase()) || source[pos] === '!') {
            throw new Error('modificador de join nao suportado: somente hint de FK');
          }
        }
        if (source[pos] === '(') {
          if (++embeds > EMBED_LIMITS.embeds) throw new Error('quantidade de embeds acima do limite');
          pos++;
          const fields = list(depth + 1);
          if (source[pos] !== ')') throw new Error('parentese de fechamento ausente');
          pos++;
          field = { kind: 'embed', resource, alias: alias || resource, hint, fields };
        } else {
          if (hint) throw new Error('hint de FK exige uma relacao com parenteses');
          field = { kind: 'column', name: resource, alias: alias || resource };
        }
      }
      const key = field.kind === 'wildcard' ? '*' : field.alias;
      if (keys.has(key)) throw new Error(`projecao duplicada: ${key}`);
      keys.add(key); fields.push(field);
      whitespace();
      if (source[pos] === ',') { pos++; continue; }
      if (pos >= source.length || source[pos] === ')') return fields;
      throw new Error(`sintaxe de select nao suportada (posicao ${pos})`);
    }
  }
  const tree = list(0);
  whitespace();
  if (pos !== source.length) throw new Error('parenteses/sintaxe invalidos no select');
  return tree;
}

/** Apenas catalogo estrutural. Nunca le dados de negocio como postgres. */
export async function loadRelationshipCatalog(pool) {
  const tables = (await pool.query(`
    SELECT c.relname AS name, array_agg(a.attname::text ORDER BY a.attnum) AS columns
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
       AND a.attnum > 0 AND NOT a.attisdropped
     GROUP BY c.relname
  `)).rows;
  const foreignKeys = (await pool.query(`
    SELECT fk.conname AS name, src.relname AS "sourceTable", dst.relname AS "targetTable",
           ARRAY(SELECT a.attname::text FROM unnest(fk.conkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_catalog.pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = k.attnum
                 ORDER BY k.ord) AS "sourceColumns",
           ARRAY(SELECT a.attname::text FROM unnest(fk.confkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_catalog.pg_attribute a ON a.attrelid = fk.confrelid AND a.attnum = k.attnum
                 ORDER BY k.ord) AS "targetColumns",
           EXISTS (
             SELECT 1 FROM pg_catalog.pg_index i
              WHERE i.indrelid = fk.conrelid AND i.indisunique AND i.indisvalid
                AND i.indpred IS NULL AND i.indexprs IS NULL
                AND i.indnkeyatts = cardinality(fk.conkey)
                AND (SELECT array_agg(k.attnum ORDER BY k.attnum)
                       FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
                      WHERE k.ord <= i.indnkeyatts)
                  = (SELECT array_agg(k.attnum ORDER BY k.attnum) FROM unnest(fk.conkey) k(attnum))
           ) AS "sourceUnique"
      FROM pg_catalog.pg_constraint fk
      JOIN pg_catalog.pg_class src ON src.oid = fk.conrelid
      JOIN pg_catalog.pg_namespace sn ON sn.oid = src.relnamespace
      JOIN pg_catalog.pg_class dst ON dst.oid = fk.confrelid
      JOIN pg_catalog.pg_namespace dn ON dn.oid = dst.relnamespace
     WHERE fk.contype = 'f' AND sn.nspname = 'public' AND dn.nspname = 'public'
       AND fk.convalidated
     ORDER BY src.relname, fk.conname
  `)).rows;
  return { tables: Object.fromEntries(tables.map((t) => [t.name, t.columns])), foreignKeys };
}

function columnsFor(table, catalog) {
  q(table);
  if (!catalog || !catalog.tables || !Object.hasOwn(catalog.tables, table) || !Array.isArray(catalog.tables[table])) {
    throw new Error(`tabela sem catalogo de relacoes: ${table}`);
  }
  return catalog.tables[table];
}

export function resolveRelationship(parent, node, catalog) {
  columnsFor(parent, catalog);
  if (!Array.isArray(catalog.foreignKeys)) throw new Error('catalogo de FKs ausente');
  const candidates = [];
  for (const fk of catalog.foreignKeys) {
    if (!Array.isArray(fk.sourceColumns) || !Array.isArray(fk.targetColumns) || !fk.sourceColumns.length || fk.sourceColumns.length !== fk.targetColumns.length) {
      throw new Error('catalogo de FK invalido');
    }
    if (node.hint && node.hint !== fk.name && !fk.sourceColumns.includes(node.hint)) continue;
    if (fk.sourceTable === parent && (node.resource === fk.targetTable || node.resource === fk.name || (fk.sourceColumns.length === 1 && node.resource === fk.sourceColumns[0]))) {
      candidates.push({ table: fk.targetTable, parentColumns: fk.sourceColumns, childColumns: fk.targetColumns, many: false, fk: fk.name });
    }
    if (fk.targetTable === parent && node.resource === fk.sourceTable) {
      candidates.push({ table: fk.sourceTable, parentColumns: fk.targetColumns, childColumns: fk.sourceColumns, many: !fk.sourceUnique, fk: fk.name });
    }
  }
  if (candidates.length !== 1) {
    throw new Error(candidates.length ? `relacao ambigua: ${parent}.${node.resource}; informe hint de FK` : `relacao sem FK conhecida: ${parent}.${node.resource}`);
  }
  const relation = candidates[0];
  const parentColumns = columnsFor(parent, catalog), childColumns = columnsFor(relation.table, catalog);
  for (const col of relation.parentColumns) { q(col); if (!parentColumns.includes(col)) throw new Error('coluna de FK ausente'); }
  for (const col of relation.childColumns) { q(col); if (!childColumns.includes(col)) throw new Error('coluna de FK ausente'); }
  return relation;
}

/** SELECT correlacionado: preserva uma linha por pai e o limit/order do
 * pai. Nao usa SECURITY DEFINER, pool privilegiado ou permissao adicional.
 * 1:N -> []; N:1 / 1:1 -> objeto ou null. Nunca LIMIT 1 para ocultar erro.
 */
export function buildEmbeddedProjection(table, select, catalog) {
  const fields = parseSelectTree(select);
  let counter = 0;
  const alias = () => `e2e_rel_${counter++}`;
  const rootAlias = alias();
  function projection(currentTable, fields, currentAlias) {
    const columns = columnsFor(currentTable, catalog);
    const wildcard = fields.some((f) => f.kind === 'wildcard');
    return fields.map((field) => {
      if (field.kind === 'wildcard') return `${q(currentAlias)}.*`;
      q(field.alias);
      if (wildcard && columns.includes(field.alias)) throw new Error(`projecao sobrepoe coluna do wildcard: ${field.alias}`);
      if (field.kind === 'column') {
        if (!columns.includes(field.name)) throw new Error(`coluna desconhecida: ${currentTable}.${field.name}`);
        return `${q(currentAlias)}.${q(field.name)} AS ${q(field.alias)}`;
      }
      const relation = resolveRelationship(currentTable, field, catalog);
      const childAlias = alias(), rowAlias = alias();
      const inner = projection(relation.table, field.fields, childAlias);
      const condition = relation.childColumns.map((col, i) => `${q(childAlias)}.${q(col)} = ${q(currentAlias)}.${q(relation.parentColumns[i])}`).join(' AND ');
      const aggregate = relation.many ? `COALESCE(jsonb_agg(to_jsonb(${q(rowAlias)})), '[]'::jsonb)` : `to_jsonb(${q(rowAlias)})`;
      return `(SELECT ${aggregate} FROM (SELECT ${inner} FROM public.${q(relation.table)} AS ${q(childAlias)} WHERE ${condition}) AS ${q(rowAlias)}) AS ${q(field.alias)}`;
    }).join(', ');
  }
  return { columns: projection(table, fields, rootAlias), alias: rootAlias };
}
