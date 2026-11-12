import test from 'node:test';
import assert from 'node:assert/strict';
import { RETRY_CASES, RETRY_TABLES, faultTables, retryProblems } from './ux-retry-lib.mjs';

function valid() {
  return { scope: 'isolated-component-real-api', businessSuccessMocked: false, errors: [], cases: RETRY_CASES.map((spec) => {
    const faults = faultTables(spec.scenario), requests = [], responses = [];
    const add = (table, stage, sdkRetryCount, at, injected503, delayMs) => {
      const q = { n: requests.length + 1, table, method: 'GET', stage, sdkRetryCount, at, injected503, delayMs, releasedAt: at + delayMs };
      requests.push(q); responses.push({ n: q.n, table, stage, status: injected503 ? 503 : 200, realApi: !injected503, rows: injected503 ? 0 : 2, fixtureFound: !injected503 });
    };
    RETRY_TABLES.forEach((t) => add(t, 'initial', 0, 100, false, 0));
    faults.forEach((t) => [0, 1, 2, 3, 0, 1, 2, 3].forEach((v, i) => add(t, 'fault', v, 1000 + i * 1000, true, 0)));
    if (spec.scenario === 'join') add('orders', 'inflight', 0, 18000, false, 3500);
    else faults.forEach((t) => (spec.scenario === 'still-fails' ? [0, 1, 2, 3, 0, 1, 2, 3] : [0]).forEach((v, i) => add(t, 'recovery', v, 19000 + i * 1000, spec.scenario === 'still-fails', spec.scenario === 'still-fails' ? 0 : 3500)));
    const snapshot = (stage) => ({
      technicalLeak: false, banner: stage === 'fault' || stage === 'busy' || stage === 'final' && spec.scenario === 'still-fails',
      retryEnabled: stage === 'fault' || stage === 'final' && spec.scenario === 'still-fails', retryBusy: stage === 'busy',
      bannerInsideViewport: true, retryInsideViewport: true, notice: false,
      panels: RETRY_TABLES.map((table) => ({ table, fixtureFound: true, rows: 2, text: `fixture real ${table}`, controlEnabled: true,
        uses: table === 'products' ? ({ initial: 0, fault: 1, busy: 2, final: 3 })[stage] : 0,
        status: faults.includes(table) && (stage === 'fault' || stage === 'busy' || stage === 'final' && spec.scenario === 'still-fails') ? 'error' : 'success',
        fetchStatus: stage === 'busy' && faults.includes(table) ? 'fetching' : 'idle',
      })),
    });
    return { ...spec, finished: true, requests, responses, jsErrors: [], businessWrites: [], manualClickAt: 19000, faultMs: 15000, recoveryMs: 16000, totalMs: 40000,
      initial: snapshot('initial'), fault: snapshot('fault'), busy: snapshot('busy'), final: snapshot('final') };
  }) };
}

test('quatro casos completos, cache real e recuperacao seletiva satisfazem o gate', () => assert.deepEqual(retryProblems(valid()), []));
test('relatorio ausente falha fechado', () => assert(retryProblems(null).length));

const mutations = [
  ['casos ausentes', (r) => { delete r.cases; }],
  ['erro global', (r) => { r.errors.push('failed'); }],
  ['metrica global ausente', (r) => { delete r.errors; }],
  ['sucesso simulado', (r) => { r.businessSuccessMocked = true; }],
  ['escopo de produto falsamente declarado', (r) => { r.scope = 'production'; }],
  ['caso omitido', (r) => { r.cases.pop(); }],
  ['caso duplicado', (r) => { r.cases[1] = structuredClone(r.cases[0]); }],
  ['viewport nao exercitada', (r) => { r.cases[3].width = 375; }],
  ['caso nao terminou', (r) => { r.cases[0].finished = false; }],
  ['excecao capturada', (r) => { r.cases[0].error = 'crash'; }],
  ['GET nao observado', (r) => { r.cases[0].requests = []; }],
  ['resposta nao capturada', (r) => { r.cases[0].responses.pop(); }],
  ['resposta duplicada', (r) => { r.cases[0].responses[1] = structuredClone(r.cases[0].responses[0]); }],
  ['JS error', (r) => { r.cases[0].jsErrors.push('crash'); }],
  ['gravacao de negocio', (r) => { r.cases[0].businessWrites.push({ method: 'POST' }); }],
  ['clique nao observado', (r) => { delete r.cases[0].manualClickAt; }],
  ['timeout omitido', (r) => { delete r.cases[0].faultMs; }],
  ['recuperacao acima do teto', (r) => { r.cases[0].recoveryMs = 25001; }],
  ['mutacao disfarcada de GET', (r) => { r.cases[0].requests[0].method = 'POST'; }],
  ['sucesso vazio', (r) => { r.cases[0].responses[0].rows = 0; }],
  ['fixture nao encontrada na API', (r) => { r.cases[0].responses[0].fixtureFound = false; }],
  ['200 fabricado', (r) => { r.cases[0].responses[0].realApi = false; }],
  ['status nao esperado', (r) => { r.cases[0].responses[3].status = 200; }],
  ['retry SDK reduzido', (r) => { r.cases[0].requests[4].sdkRetryCount = 0; }],
  ['3500ms nao cumpridos por 1ms', (r) => { const q = r.cases[0].requests.at(-1); q.releasedAt = q.at + 3499; }],
  ['atraso programado removido', (r) => { r.cases[0].requests.at(-1).delayMs = 0; }],
  ['bootstrap com erro', (r) => { r.cases[0].initial.panels[0].status = 'error'; }],
  ['dados em cache desapareceram', (r) => { r.cases[0].busy.panels[0].fixtureFound = false; }],
  ['dados em cache substituidos', (r) => { r.cases[0].busy.panels[0].text = 'Sucesso inventado'; }],
  ['controle de dados bloqueado', (r) => { r.cases[0].busy.panels[2].controlEnabled = false; }],
  ['consulta foi afirmada clicada sem uso', (r) => { r.cases[0].busy.panels[2].uses = 1; }],
  ['erro inicial nao consolidou', (r) => { r.cases[0].fault.panels[0].fetchStatus = 'fetching'; }],
  ['alerta mudo', (r) => { r.cases[0].fault.banner = false; }],
  ['retry fora da viewport', (r) => { r.cases[3].fault.retryInsideViewport = false; }],
  ['botao nao aguardou o GET', (r) => { r.cases[0].busy.retryEnabled = true; }],
  ['aria-busy ausente', (r) => { delete r.cases[0].busy.retryBusy; }],
  ['erro final indevidamente escondido', (r) => { r.cases[3].final.banner = false; }],
  ['aviso final preso', (r) => { r.cases[0].final.notice = true; }],
  ['vazamento tecnico', (r) => { r.cases[0].fault.technicalLeak = true; }],
  ['clique antes do GET em voo', (r) => { r.cases[2].manualClickAt = 17999; }],
  ['clique depois do GET em voo', (r) => { r.cases[2].manualClickAt = 22000; }],
  ['descendente saudavel refetchado', (r) => { const c = r.cases[0], n = c.requests.length + 1; c.requests.push({ n, table: 'products', method: 'GET', stage: 'recovery', sdkRetryCount: 0, at: 19000, injected503: false, delayMs: 0, releasedAt: 19000 }); c.responses.push({ n, table: 'products', stage: 'recovery', status: 200, realApi: true, rows: 2, fixtureFound: true }); }],
  ['consulta em voo reiniciada', (r) => { const c = r.cases[2], n = c.requests.length + 1; c.requests.push({ ...c.requests.at(-1), n, stage: 'recovery', at: 19000, releasedAt: 22500 }); c.responses.push({ ...c.responses.at(-1), n, stage: 'recovery' }); }],
];
for (const [name, mutate] of mutations) test(`falha fechado: ${name}`, () => { const r = valid(); mutate(r); assert(retryProblems(r).length > 0); });
