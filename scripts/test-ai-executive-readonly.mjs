import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../supabase/functions/ai-executive/index.ts', import.meta.url), 'utf8');
test('model tools propose, never commit payments, stock or OP changes', () => {
  const tool = source.split('async function suggestAction(')[1]?.split('async function executeAnaliseEstrategica')[0];
  assert.ok(tool);
  assert.doesNotMatch(tool, /\.update\(|\.insert\(|\.delete\(|\.rpc\(/);
  assert.match(tool, /status: "sugestao_nao_executada"/);
  assert.match(source, /name: "sugerir_acao"/);
  assert.match(source, /sugerir_acao: suggestAction/);
  assert.doesNotMatch(source, /name: "executar_acao"|executar_acao: executeAcao|async function executeAcao/);
  assert.doesNotMatch(tool, /args\.confirmado/);
});
test('historical service-role consultation requires company filter', () => {
  const historical = source.split('analise_historica: async')[1]?.split('consultar_financeiro:')[0];
  assert.ok(historical);
  assert.match(historical, /if \(!company_id\) return/);
  assert.match(historical, /from\("orders"\).*\.eq\("company_id", company_id\)/);
});
test('AI does not infer cross-unit production efficiency or stock valuation from price', () => {
  assert.doesNotMatch(source, /eficiencia_geral: planned > 0|p\.cost \|\| p\.price/);
  assert.match(source, /eficiencia_geral: null/);
  assert.match(source, /valor_estoque_total: null/);
});
