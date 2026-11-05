// QA-01 — funcoes puras do ambiente E2E isolado. Sem efeitos colaterais:
// podem ser testadas sem Postgres nem navegador (scripts/e2e-isolated-lib.test.mjs).
import { createHmac, timingSafeEqual } from 'node:crypto';

const OPS = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
  like: 'LIKE', ilike: 'ILIKE',
};

export function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`identificador invalido: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function signJwt(claims, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    aud: 'authenticated', role: 'authenticated', iat: now,
    exp: now + 3600, ...claims,
  }));
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyJwt(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  let actual;
  try {
    actual = Buffer.from(parts[2], 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims.sub || Math.floor(Date.now() / 1000) >= Number(claims.exp)) return null;
  return claims;
}

/** Recusa qualquer origem que nao seja loopback: nenhum acesso a producao. */
export function assertLoopback(url) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname)) {
    throw new Error(`ambiente E2E isolado exige loopback, recebido ${parsed.hostname}`);
  }
  return parsed;
}

/**
 * Traduz o subconjunto de PostgREST usado pela suíte (`select`, filtros
 * `eq/neq/gt/.../in/is`, `order`, `limit`) para SQL parametrizado.
 */
export function buildTableQuery(table, searchParams, single = false) {
  const select = searchParams.get('select') || '*';
  const columns = select === '*'
    ? '*'
    : select.split(',').map((c) => quoteIdent(c.trim())).join(', ');
  const where = [];
  const values = [];
  const ignored = new Set(['select', 'order', 'limit', 'offset', 'apikey']);

  for (const [key, raw] of searchParams.entries()) {
    if (ignored.has(key)) continue;
    const match = /^(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.(.+)$/s.exec(raw);
    if (!match) throw new Error(`filtro PostgREST nao suportado: ${key}=${raw}`);
    const [, op, rawValue] = match;
    const column = quoteIdent(key);
    if (op === 'is') {
      if (!['null', 'true', 'false'].includes(rawValue)) {
        throw new Error(`valor invalido para is.: ${rawValue}`);
      }
      where.push(`${column} IS ${rawValue === 'null' ? 'NULL' : `${rawValue.toUpperCase()}`}`);
    } else if (op === 'in') {
      const list = rawValue.replace(/^\(/, '').replace(/\)$/, '').split(',');
      const placeholders = list.map((v) => {
        values.push(v);
        return `$${values.length}`;
      });
      where.push(`${column} IN (${placeholders.join(', ')})`);
    } else {
      values.push(rawValue);
      where.push(`${column} ${OPS[op]} $${values.length}`);
    }
  }

  let sql = `SELECT ${columns} FROM public.${quoteIdent(table)}`;
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  const order = searchParams.get('order');
  if (order) {
    const [col, direction] = order.split('.');
    sql += ` ORDER BY ${quoteIdent(col)} ${/^desc$/i.test(direction || '') ? 'DESC' : 'ASC'}`;
  }
  const limit = Number(searchParams.get('limit'));
  if (Number.isInteger(limit) && limit > 0) {
    values.push(limit);
    sql += ` LIMIT $${values.length}`;
  }
  return { sql, values, single };
}

/** Serializa valores do body para parametros do driver pg. */
function paramValue(value) {
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return value;
}

/**
 * Monta a chamada RPC usando os nomes reais dos argumentos lidos de pg_proc.
 * Funcoes SETOF/TABLE viram array JSON; as demais viram o valor de retorno.
 */
export function buildRpcCall(fn, body, meta) {
  const argnames = meta?.argnames ?? [];
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const chosen = argnames.filter((name) => Object.prototype.hasOwnProperty.call(input, name));
  const unknown = Object.keys(input).filter((key) => !argnames.includes(key));
  if (unknown.length) {
    throw new Error(`argumentos desconhecidos para ${fn}: ${unknown.join(', ')}`);
  }
  const values = chosen.map((name) => paramValue(input[name]));
  const args = chosen.map((name, i) => `${quoteIdent(name)} => $${i + 1}`).join(', ');
  const call = `public.${quoteIdent(fn)}(${args})`;
  const sql = meta?.retset
    ? `SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) AS body FROM ${call} AS r`
    : `SELECT to_jsonb(${call}) AS body`;
  return { sql, values };
}

export function parseEnvFile(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}
