import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRequiredNames, validateEnv, WORKFLOW } from './validate-homologacao-env.mjs';

const yaml = fs.readFileSync(WORKFLOW, 'utf8');
const names = parseRequiredNames(yaml);

const complete = Object.fromEntries(names.map((n, i) => [n,
  n === 'VITE_SUPABASE_URL' ? 'https://homologacao.exemplo.test' : `valor-de-teste-${i}`]));

test('a lista canonica vem do workflow e tem 18 segredos', () => {
  assert.equal(names.length, 18, 'o gate valida 18 nomes, nao 19');
  assert.ok(names.includes('VITE_SUPABASE_URL'));
  assert.ok(names.includes('E2E_TENANT_B_PASSWORD'));
  assert.ok(!names.includes('E2E_REQUIRE_ALL'), 'literal nao e segredo');
  assert.equal(new Set(names).size, names.length, 'sem duplicatas');
});

test('pre-voo aceita ambiente completo', () => {
  const { ok, problems } = validateEnv(names, complete);
  assert.equal(ok, true);
  assert.deepEqual(problems, []);
});

test('pre-voo reprova ausentes e vazios sem expor valores', () => {
  const env = { ...complete };
  delete env.E2E_STORE_EMAIL;
  env.E2E_MANAGER_PASSWORD = '   ';
  const { ok, problems } = validateEnv(names, env);
  assert.equal(ok, false);
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p) => !p.includes('valor-de-teste')));
  assert.ok(problems.some((p) => p.startsWith('E2E_STORE_EMAIL')));
  assert.ok(problems.some((p) => p.startsWith('E2E_MANAGER_PASSWORD')));
});

test('pre-voo reprova placeholders, PAT e URL de producao', () => {
  const env = { ...complete,
    E2E_PRODUCT_ID: '<preencher>',
    E2E_STORE_PASSWORD: ['gh', 'p_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].join(''),
    VITE_SUPABASE_URL: 'https://useerp.lovable.app',
  };
  const { ok, problems } = validateEnv(names, env);
  assert.equal(ok, false);
  assert.ok(problems.some((p) => p.includes('placeholder')));
  assert.ok(problems.some((p) => p.includes('token de acesso pessoal')));
  assert.ok(problems.some((p) => p.includes('producao')));
  assert.ok(problems.every((p) => !p.includes(['gh','p_'].join(''))));
});

test('parser recusa workflow sem lista', () => {
  assert.throws(() => parseRequiredNames('name: outro\njobs: {}'), /nao encontrada/);
});
