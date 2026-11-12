import test from 'node:test';
import assert from 'node:assert/strict';
import { RESILIENCE_ROUTES, resilienceProblems, resilienceObservationSchedule } from './ux-resilience-lib.mjs';

function valid() {
  return {
    fault: 'read-503', settleTimeoutMs: 25000,
    injectedFaults: RESILIENCE_ROUTES.filter((r) => r.expectFault).map((r) => ({ route: r.id, path: '/rest/v1/orders', method: 'GET', status: 503 })),
    routes: RESILIENCE_ROUTES.map((r) => ({
      id: r.id, route: r.route, settled: true, observationMs: 15500,
      httpErrors: r.expectFault ? [{ status: 503, path: '/rest/v1/orders' }] : [],
      jsErrors: [],
      view: { currentPath: r.route, contentLength: 300, feedback: r.expectFault ? ['Nao foi possivel carregar os dados.'] : [], retryControls: r.expectFault ? ['Tentar novamente'] : [], technicalLeak: false, stuckLoading: false, spinnerCount: 0 },
    })),
  };
}

test('aceita cinco rotas completas e as quatro falhas reais do cenario 503', () => {
  assert.deepEqual(resilienceProblems(valid()), []);
});

test('natural sem erros e explicitamente vacuo, mesmo com pagina completa', () => {
  const r = valid(); r.fault = 'natural'; r.injectedFaults = [];
  for (const row of r.routes) row.httpErrors = [];
  assert.match(resilienceProblems(r).join('\n'), /medicao vacua/);
});

test('natural com falha nao induzida ainda pode medir feedback/retry', () => {
  const r = valid(); r.fault = 'natural'; r.injectedFaults = [];
  assert.deepEqual(resilienceProblems(r), []);
});

for (const [name, mutate, expected] of [
  ['relatorio ausente', () => null, /sem rotas/],
  ['cobertura parcial', (r) => { r.routes.pop(); }, /Cobertura|uma medicao/],
  ['rota duplicada', (r) => { r.routes[1] = structuredClone(r.routes[0]); }, /uma medicao/],
  ['redirecionamento para login', (r) => { r.routes[0].view.currentPath = '/login'; }, /rota efetiva/],
  ['erro de navegacao', (r) => { r.routes[0].error = 'navigation failed'; }, /erro de execucao/],
  ['espera esgotada', (r) => { r.routes[0].settled = false; }, /nao consolidado/],
  ['sem metrica de espera', (r) => { delete r.routes[0].observationMs; }, /nao consolidado/],
  ['espera alem do teto', (r) => { r.routes[0].observationMs = 40000; }, /nao consolidado/],
  ['teto ilimitado', (r) => { r.settleTimeoutMs = 999999; }, /Teto/],
  ['sem metrica HTTP', (r) => { delete r.routes[0].httpErrors; }, /metricas obrigatorias/],
  ['pagina vazia', (r) => { r.routes[0].view.contentLength = 0; }, /metricas obrigatorias/],
  ['sem feedback', (r) => { r.routes[0].view.feedback = []; }, /sem feedback/],
  ['sem retry', (r) => { r.routes[0].view.retryControls = []; }, /sem controle/],
  ['marcador tecnico exposto', (r) => { r.routes[0].view.technicalLeak = true; }, /vazamento tecnico/],
  ['metrica de vazamento ausente', (r) => { delete r.routes[0].view.technicalLeak; }, /vazamento tecnico/],
  ['spinner final', (r) => { r.routes[0].view.spinnerCount = 1; }, /carregando/],
  ['erro JS', (r) => { r.routes[0].jsErrors.push('TypeError'); }, /excecao JS/],
  ['503 nao reproduzido em uma rota', (r) => { r.routes[0].httpErrors = []; }, /503 nao reproduzido/],
  ['injecao nao registrada', (r) => { r.injectedFaults = []; }, /503 nao reproduzido/],
  ['injecao de escrita', (r) => { r.injectedFaults[0].method = 'POST'; }, /fora do contrato/],
  ['injecao fora das leituras', (r) => { r.injectedFaults[0].path = '/rest/v1/clients'; }, /fora do contrato/],
  ['sucesso sintetico', (r) => { r.injectedFaults[0].status = 200; }, /fora do contrato/],
  ['modo natural com injecao', (r) => { r.fault = 'natural'; }, /nao admite injecao/],
]) {
  test(`falha fechado: ${name}`, () => {
    const r = valid(); const replacement = mutate(r);
    assert.match(resilienceProblems(replacement === null ? null : r).join('\n'), expected);
  });
}

test('o snapshot reserva tempo para consolidar: teto curto nao vira timeout de 1ms', () => {
  for (const [budget, early] of [[1000, 500], [8000, 4000], [25000, 8000], [30000, 8000]]) {
    assert.deepEqual(resilienceObservationSchedule(budget), { settleTimeoutMs: budget, earlySnapshotMs: early });
    assert.ok(early <= budget / 2);
  }
});

test('orcamento de espera invalido ou ilimitado falha antes de abrir browser', () => {
  for (const invalid of [0, 999, NaN, Infinity, 30001, 25000.5, '25000']) {
    assert.throws(() => resilienceObservationSchedule(invalid), /1000 e 30000/);
  }
});
