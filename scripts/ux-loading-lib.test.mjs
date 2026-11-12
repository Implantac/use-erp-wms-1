import test from 'node:test';
import assert from 'node:assert/strict';
import { LOADING_CASES, LOADING_LIMITS, loadingProblems, loadingCaseMetrics, waitUntilAtLeast } from './ux-loading-lib.mjs';

function valid() {
  return {
    businessSuccessMocked: false, noNotice: false, errors: [],
    cases: LOADING_CASES.map((c) => {
      const persistent = c.scenario === 'persistent-503', transient = c.scenario === 'transient-503';
      const seq = persistent ? [0, 1, 2, 3, 0, 1, 2, 3] : transient ? [0, 1] : [0];
      const initial = { wall: 9000, notice: false, technicalLeak: false };
      const shown = { wall: 11500, notice: true, phase: 'slow', role: 'status', ariaLive: 'polite', ariaAtomic: 'true', noticeSpinner: false, pointerPassthrough: true, withinViewport: true, noticeText: 'Alguns dados estão demorando para carregar. A consulta continua em andamento.', technicalLeak: false };
      const final = { wall: persistent ? 26000 : 14000, currentPath: c.route, notice: false, mainLoading: false, spinnerCount: 0, contentLength: 300, heading: 'Pedidos', technicalLeak: false, errorBanner: persistent, retryEnabled: persistent };
      return { ...c, finished: true, observationMs: persistent ? 16000 : 4000, jsErrors: [], businessWrites: [],
        attempts: seq.map((sdkRetryCount, i) => ({ n: i + 1, at: 10000 + i * 1000, method: 'GET', path: `/rest/v1/${c.table}`, sdkRetryCount, injected503: persistent || (transient && i === 0), delayMs: !persistent && !transient ? LOADING_LIMITS.slowReadDelayMs : 0, releasedAt: 13500 })),
        responses: seq.map((_, i) => ({ n: i + 1, status: persistent || (transient && i === 0) ? 503 : 200, realApi: !persistent && (!transient || i > 0), rows: 2, fixtureFound: true })),
        timeline: [initial, shown, ...(persistent ? [{ ...shown, wall: 18000, phase: 'retrying', noticeText: 'Estamos tentando novamente…' }] : []), final], final,
      };
    }),
  };
}

test('aceita a matriz completa: quatro rotas, tres cenarios e leitura mobile adicional', () => {
  assert.equal(LOADING_CASES.length, 13);
  assert.deepEqual(loadingProblems(valid()), []);
});

test('calcula latencia a partir da leitura e do retry, sem somar o bootstrap da pagina', () => {
  const r = valid().cases[0]; const m = loadingCaseMetrics(r);
  assert.equal(m.noticeAfterRequestMs, 1500); assert.equal(m.noticeAfterRetryMs, 500);
  assert.equal(m.noticeAtRequestStart, false);
});

test('aviso neutro pode anteceder o retry SDK sem gerar latencia negativa', () => {
  const r = valid().cases.find((c) => c.scenario === 'transient-503');
  r.attempts[1].at = 11700;
  assert.equal(loadingCaseMetrics(r).noticeAfterRetryMs, 0);
});

for (const [name, mutate, expected] of [
  ['relatorio nulo', () => null, /sem casos/],
  ['erro global', (r) => { r.errors.push('falha no setup'); }, /Erro global/],
  ['cobertura parcial', (r) => { r.cases.pop(); }, /Cobertura|uma medicao/],
  ['caso duplicado', (r) => { r.cases[1] = structuredClone(r.cases[0]); }, /uma medicao/],
  ['sucesso simulado', (r) => { r.businessSuccessMocked = true; }, /Sucesso simulado/],
  ['controle CSS negativo', (r) => { r.noNotice = true; }, /Controle sem aviso/],
  ['redirecionamento para login', (r) => { r.cases[0].final.currentPath = '/login'; }, /rota\/cenario/],
  ['viewport incorreto', (r) => { r.cases.at(-1).width = 375; }, /viewport/],
  ['timeout de execucao', (r) => { r.cases[0].finished = false; }, /nao consolidado/],
  ['erro de execucao', (r) => { r.cases[0].error = 'navegacao falhou'; }, /erro de execucao/],
  ['sem requests', (r) => { r.cases[0].attempts = []; }, /medicao vazia/],
  ['sem timeline', (r) => { r.cases[0].timeline = []; }, /medicao vazia/],
  ['aviso ausente', (r) => { r.cases[0].timeline.forEach((s) => { s.notice = false; }); }, /aviso ausente/],
  ['aviso tardio', (r) => { r.cases[0].timeline[1].wall = 12500; }, /depois de 2000ms/],
  ['aviso preexistente', (r) => { r.cases[0].timeline[0].notice = true; }, /preexistente/],
  ['latencia de retry >800ms', (r) => { r.cases[0].timeline[1].wall = 11900; }, />800ms/],
  ['alerta indevido em vez de status', (r) => { r.cases[0].timeline[1].role = 'alert'; }, /contrato acessivel/],
  ['live assertive', (r) => { r.cases[0].timeline[1].ariaLive = 'assertive'; }, /contrato acessivel/],
  ['aviso sem atomic', (r) => { delete r.cases[0].timeline[1].ariaAtomic; }, /contrato acessivel/],
  ['aviso com spinner', (r) => { r.cases[0].timeline[1].noticeSpinner = true; }, /contrato acessivel/],
  ['aviso intercepta ponteiro', (r) => { r.cases[0].timeline[1].pointerPassthrough = false; }, /contrato acessivel/],
  ['aviso fora de tela', (r) => { r.cases[0].timeline[1].withinViewport = false; }, /contrato acessivel/],
  ['retry inicial nao confirmado', (r) => { r.cases[0].timeline[1].noticeText = 'Estamos tentando novamente'; }, /texto inicial/],
  ['vazamento tecnico', (r) => { r.cases[0].timeline[1].technicalLeak = true; }, /vazamento tecnico/],
  ['excecao JS', (r) => { r.cases[0].jsErrors.push('TypeError'); }, /excecao JS/],
  ['mutacao de negocio', (r) => { r.cases[0].businessWrites.push({ method: 'POST' }); }, /escrita de negocio/],
  ['metodo indevido', (r) => { r.cases[0].attempts[0].method = 'POST'; }, /contrato de leitura/],
  ['retries reduzidos para passar', (r) => { r.cases[0].attempts.pop(); }, /politica\/numero/],
  ['sequencia de retry alterada', (r) => { r.cases[0].attempts[1].sdkRetryCount = 0; }, /politica\/numero/],
  ['sem falha reproduzida', (r) => { r.cases[0].responses[0].status = 200; }, /falhas esperadas/],
  ['injecao nao registrada', (r) => { r.cases[0].attempts[0].injected503 = false; }, /injecao 503/],
  ['observacao ilimitada', (r) => { r.cases[0].observationMs = 40000; }, /fora do teto/],
  ['pagina final vazia', (r) => { r.cases[0].final.contentLength = 0; }, /pagina vazia/],
  ['aviso final remanescente', (r) => { r.cases[0].final.notice = true; }, /aviso final/],
  ['spinner final', (r) => { r.cases[0].final.spinnerCount = 1; }, /carregamento/],
  ['erro final sem retry', (r) => { r.cases[0].final.retryEnabled = false; }, /feedback acionavel/],
  ['retry confirmado nao anunciado', (r) => { r.cases[0].timeline[2].notice = false; }, /transicao retry/],
  ['sucesso vazio', (r) => { r.cases[4].responses[1].rows = 0; }, /nao vazio/],
  ['fixture nao encontrada', (r) => { r.cases[4].responses[1].fixtureFound = false; }, /nao vazio/],
  ['200 nao veio da API', (r) => { r.cases[4].responses[1].realApi = false; }, /nao vazio/],
  ['retry falso na leitura sem erro', (r) => { r.cases[8].timeline[1].phase = 'retrying'; }, /afirma retry/],
  ['leitura lenta nao atrasada', (r) => { r.cases[8].attempts[0].releasedAt = 10000; }, /lenta real/],
  ['3499ms nao satisfazem o atraso minimo de 3500ms', (r) => { r.cases[8].attempts[0].releasedAt = 13499; }, /lenta real/],
  ['503 na leitura saudavel', (r) => { r.cases[8].attempts[0].injected503 = true; }, /lenta real/],
]) {
  test(`falha fechado: ${name}`, () => {
    const r = valid(); const replacement = mutate(r);
    assert.match(loadingProblems(replacement === null ? null : r).join('\n'), expected);
  });
}

test('timer que acorda 1ms cedo espera o restante, sem mudar o limiar do gate', async () => {
  let clock = 10000; const sleeps = [];
  const released = await waitUntilAtLeast(13500, {
    now: () => clock,
    sleep: async (ms) => { sleeps.push(ms); clock += sleeps.length === 1 ? ms - 1 : ms; },
  });
  assert.deepEqual(sleeps, [3500, 1]); assert.equal(released, 13500);
});
