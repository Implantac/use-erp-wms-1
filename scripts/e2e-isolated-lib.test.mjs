import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLoopback, buildRpcCall, buildTableQuery, parseEnvFile,
  quoteIdent, signJwt, verifyJwt,
} from './e2e-isolated-lib.mjs';

const SECRET = 'unit-test-secret';

test('JWT: assina, verifica e rejeita adulteracao, expiracao e segredo errado', () => {
  const token = signJwt({ sub: 'user-1', email: 'a@b.test' }, SECRET);
  const claims = verifyJwt(token, SECRET);
  assert.equal(claims.sub, 'user-1');
  assert.equal(claims.role, 'authenticated');
  assert.equal(verifyJwt(token, 'outro-segredo'), null);
  // Adulteracao DETERMINISTICA do payload. Trocar apenas o ultimo caractere
  // da assinatura base64url pode preservar os bytes decodificados (os 2 bits
  // de padding nao sao significativos), tornando o teste flaky conforme o iat
  // muda a cada execucao. Manter a assinatura e alterar o payload garante que
  // o HMAC nunca confira.
  const parts = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({
    aud: 'authenticated', role: 'authenticated',
    sub: 'atacante', email: 'a@b.test',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  assert.equal(verifyJwt(`${parts[0]}.${forgedPayload}.${parts[2]}`, SECRET), null);
  assert.equal(verifyJwt('lixo', SECRET), null);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'user-1', exp: 1 })).toString('base64url');
  const expired = `${header}.${payload}.assinatura`;
  assert.equal(verifyJwt(expired, SECRET), null);
});

test('loopback: so aceita origens locais', () => {
  assert.equal(assertLoopback('http://127.0.0.1:54321').port, '54321');
  assert.equal(assertLoopback('http://localhost:4179').hostname, 'localhost');
  assert.throws(() => assertLoopback('https://projeto.supabase.co'), /exige loopback/);
  assert.throws(() => assertLoopback('https://empresa.com.br'), /exige loopback/);
});

test('quoteIdent bloqueia injecao de identificador', () => {
  assert.equal(quoteIdent('stock_balances'), '"stock_balances"');
  assert.throws(() => quoteIdent('public.companies; DROP TABLE users'), /invalido/);
  assert.throws(() => quoteIdent('1x'), /invalido/);
});

test('PostgREST: select, eq, in, is, order e limit viram SQL parametrizado', () => {
  const params = new URLSearchParams({
    select: 'id, requested_qty, shipped_qty',
    transfer_id: 'eq.e3000000-0000-4000-8000-000000000050',
    current_status: 'in.(APROVADA,EXPEDIDA)',
    deleted_at: 'is.null',
    order: 'created_at.desc',
    limit: '5',
  });
  const { sql, values } = buildTableQuery('stock_transfer_items', params);
  assert.match(sql, /SELECT "id", "requested_qty", "shipped_qty" FROM public\."stock_transfer_items"/);
  assert.match(sql, /"transfer_id" = \$1/);
  assert.match(sql, /"current_status" IN \(\$2, \$3\)/);
  assert.match(sql, /"deleted_at" IS NULL/);
  assert.match(sql, /ORDER BY "created_at" DESC LIMIT \$4/);
  assert.deepEqual(values, [
    'e3000000-0000-4000-8000-000000000050', 'APROVADA', 'EXPEDIDA', 5,
  ]);
});

test('PostgREST: filtros desconhecidos e colunas invalidas falham fechado', () => {
  assert.throws(
    () => buildTableQuery('products', new URLSearchParams({ code: 'cs.(x)' })),
    /nao suportado/,
  );
  assert.throws(
    () => buildTableQuery('products', new URLSearchParams({ 'bad;drop': 'eq.1' })),
    /invalido/,
  );
});

test('RPC: usa nomes reais de pg_proc e serializa objetos como jsonb', () => {
  const meta = {
    argnames: ['p_transfer_id', 'p_to_status', 'p_items', 'p_notes'],
    retset: false,
  };
  const { sql, values } = buildRpcCall('transition_stock_transfer', {
    p_transfer_id: 'abc', p_to_status: 'EXPEDIDA',
    p_items: [{ item_id: 'i1', quantity: 5 }], p_notes: 'E2E',
  }, meta);
  assert.match(sql, /"p_transfer_id" => \$1/);
  assert.match(sql, /"p_items" => \$3/);
  assert.match(sql, /to_jsonb\(public\."transition_stock_transfer"/);
  assert.equal(values[2], JSON.stringify([{ item_id: 'i1', quantity: 5 }]));
});

test('RPC: funcao SETOF agrega em array e argumentos desconhecidos sao recusados', () => {
  const { sql } = buildRpcCall('factory_inbox', {}, { argnames: [], retset: true });
  assert.match(sql, /jsonb_agg/);
  assert.match(sql, /public\."factory_inbox"\(\)/);
  assert.throws(
    () => buildRpcCall('factory_inbox', { p_nao_existe: 1 }, { argnames: [], retset: true }),
    /desconhecidos/,
  );
});

test('dotenv gerado: comentarios e linhas vazias sao ignorados', () => {
  assert.deepEqual(parseEnvFile('# gerado\nA=1\n\nB=http://127.0.0.1:1\nSEM_IGUAL\n'), {
    A: '1', B: 'http://127.0.0.1:1',
  });
});
