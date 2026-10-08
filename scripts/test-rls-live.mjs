#!/usr/bin/env node
// Destructive-free RLS integration check against an isolated, seeded TEST project.
// Never use a service-role key: the two clients must authenticate as ordinary users.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const required = [
  'RLS_TEST_SUPABASE_URL', 'RLS_TEST_ANON_KEY',
  'RLS_A_EMAIL', 'RLS_A_PASSWORD', 'RLS_A_COMPANY_ID', 'RLS_A_STOCK_BALANCE_ID', 'RLS_A_NFE_ID',
  'RLS_B_EMAIL', 'RLS_B_PASSWORD', 'RLS_B_COMPANY_ID', 'RLS_B_STOCK_BALANCE_ID', 'RLS_B_NFE_ID',
];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  console.error(`RLS LIVE NÃO EXECUTADO: variáveis ausentes: ${missing.join(', ')}`);
  process.exit(2);
}

const env = process.env;
if (env.RLS_TEST_ANON_KEY.startsWith('sb_secret_')) {
  console.error('RLS LIVE BLOQUEADO: chave secreta não é chave pública de cliente.');
  process.exit(2);
}
// Legacy anon JWTs embed their role. Reject privileged credentials before making any request.
if (env.RLS_TEST_ANON_KEY.split('.').length === 3) {
  let role;
  try { role = JSON.parse(Buffer.from(env.RLS_TEST_ANON_KEY.split('.')[1], 'base64url').toString('utf8')).role; }
  catch { console.error('RLS LIVE BLOQUEADO: JWT da chave pública inválido.'); process.exit(2); }
  if (role !== 'anon') {
    console.error('RLS LIVE BLOQUEADO: chave JWT sem papel anon; nunca use service_role.');
    process.exit(2);
  }
} else if (!env.RLS_TEST_ANON_KEY.startsWith('sb_publishable_')) {
  console.error('RLS LIVE BLOQUEADO: chave pública Supabase não reconhecida.');
  process.exit(2);
}
const tenant = prefix => ({
  email: env[`RLS_${prefix}_EMAIL`], password: env[`RLS_${prefix}_PASSWORD`],
  companyId: env[`RLS_${prefix}_COMPANY_ID`],
  stockId: env[`RLS_${prefix}_STOCK_BALANCE_ID`], nfeId: env[`RLS_${prefix}_NFE_ID`],
});
const a = tenant('A');
const b = tenant('B');
assert.notEqual(a.companyId, b.companyId, 'O ensaio requer empresas distintas');
assert.notEqual(a.email, b.email, 'O ensaio requer usuários distintos');
for (const [key, x, y] of [['stock_balances', a.stockId, b.stockId], ['nfe', a.nfeId, b.nfeId]]) {
  assert.notEqual(x, y, `${key}: fixtures distintas são obrigatórias`);
}
const createUserClient = async account => {
  const client = createClient(env.RLS_TEST_SUPABASE_URL, env.RLS_TEST_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error || !data.user) throw new Error(`Login de ${account.email} falhou: ${error?.message ?? 'sem usuário'}`);
  return client;
};

const check = async (client, label, own, other) => {
  for (const [table, fixture] of [['stock_balances', 'stockId'], ['nfe', 'nfeId']]) {
    // No company filter: RLS itself must enforce tenant isolation.
    const ownResult = await client.from(table).select('id,company_id').eq('id', own[fixture]);
    if (ownResult.error) throw new Error(`${label} ${table}: leitura própria falhou: ${ownResult.error.message}`);
    assert.equal(ownResult.data.length, 1, `${label} ${table}: fixture própria ausente ou invisível (teste inconclusivo)`);
    assert.equal(ownResult.data[0].company_id, own.companyId, `${label} ${table}: fixture própria com empresa incorreta`);

    const crossResult = await client.from(table).select('id,company_id').eq('id', other[fixture]);
    if (crossResult.error) throw new Error(`${label} ${table}: consulta cruzada falhou: ${crossResult.error.message}`);
    assert.equal(crossResult.data.length, 0, `${label} ${table}: VAZAMENTO de dados da outra empresa`);
    console.log(`PASS ${label} ${table}: própria visível; outra empresa invisível`);
  }
};

try {
  const [clientA, clientB] = await Promise.all([createUserClient(a), createUserClient(b)]);
  await check(clientA, 'A', a, b);
  await check(clientB, 'B', b, a);
  console.log('RLS LIVE APROVADO: duas empresas, dois usuários, dois tipos de registro, ambos os sentidos.');
} catch (error) {
  console.error('RLS LIVE FALHOU:', error.message);
  process.exitCode = 1;
}
