/** QA-19: gate independente da selecao de retry do produto. */
export const RETRY_TABLES = Object.freeze(['orders', 'purchase_orders', 'products']);
export const RETRY_CASES = Object.freeze([
  { id: 'prefix', scenario: 'prefix', width: 1440, height: 900 },
  { id: 'overlap', scenario: 'overlap', width: 1440, height: 900 },
  { id: 'join', scenario: 'join', width: 1440, height: 900 },
  { id: 'still-fails-320', scenario: 'still-fails', width: 320, height: 640 },
].map(Object.freeze));
export const RETRY_LIMITS = Object.freeze({ delayMs: 3500, phaseDeadlineMs: 25000, totalDeadlineMs: 60000 });
const finite = (n) => Number.isFinite(n) && n >= 0;
export const faultTables = (scenario) => scenario === 'overlap' ? ['orders', 'purchase_orders'] : ['orders'];
const sequence = [0, 1, 2, 3, 0, 1, 2, 3];

export function retryProblems(report) {
  if (!report || !Array.isArray(report.cases)) return ['Relatorio sem casos.'];
  const issues = [];
  if (report.scope !== 'isolated-component-real-api' || report.businessSuccessMocked !== false || !Array.isArray(report.errors) || report.errors.length) issues.push('Escopo, sucesso simulado ou erro global.');
  if (report.cases.length !== RETRY_CASES.length) issues.push('Cobertura incompleta.');
  for (const expected of RETRY_CASES) {
    const rows = report.cases.filter((r) => r?.id === expected.id), prefix = expected.id;
    const bad = (message) => issues.push(`${prefix}: ${message}`);
    if (rows.length !== 1) { bad('requer exatamente um caso.'); continue; }
    const r = rows[0], faults = faultTables(expected.scenario);
    if (r.error || r.finished !== true || r.scenario !== expected.scenario || r.width !== expected.width || r.height !== expected.height) bad('erro, estado pendente ou cenario/viewport incorreto.');
    if (!Array.isArray(r.requests) || !r.requests.length || !Array.isArray(r.responses) || !Array.isArray(r.jsErrors) || !Array.isArray(r.businessWrites)) { bad('metricas obrigatorias ausentes.'); continue; }
    if (r.jsErrors.length || r.businessWrites.length) bad('excecao JS ou mutacao de negocio.');
    if (!finite(r.faultMs) || !finite(r.recoveryMs) || !finite(r.totalMs) || r.faultMs > RETRY_LIMITS.phaseDeadlineMs || r.recoveryMs > RETRY_LIMITS.phaseDeadlineMs || r.totalMs > RETRY_LIMITS.totalDeadlineMs || !finite(r.manualClickAt)) bad('tempos ausentes/fora do teto ou clique nao comprovado.');
    if (r.requests.some((q, i) => q.n !== i + 1 || q.method !== 'GET' || !RETRY_TABLES.includes(q.table) || !['initial', 'fault', 'inflight', 'recovery'].includes(q.stage) || !finite(q.at) || !Number.isInteger(q.sdkRetryCount))) bad('requisicao fora do contrato.');
    if (r.responses.length !== r.requests.length) bad('respostas incompletas.');
    for (const q of r.requests) {
      const matches = r.responses.filter((s) => s.n === q.n), response = matches[0];
      if (matches.length !== 1 || response.table !== q.table || response.stage !== q.stage || response.status !== (q.injected503 ? 503 : 200)) { bad('resposta/falha nao reproduzida.'); continue; }
      if (!q.injected503 && (response.realApi !== true || !Number.isInteger(response.rows) || response.rows < 1 || response.fixtureFound !== true)) bad('sucesso real nao vazio nao comprovado.');
      if (q.delayMs > 0 && (q.delayMs !== RETRY_LIMITS.delayMs || !finite(q.releasedAt) || q.releasedAt - q.at < RETRY_LIMITS.delayMs)) bad('atraso real nao reproduzido.');
    }
    for (const table of RETRY_TABLES) {
      for (const stage of ['initial', 'fault', 'inflight', 'recovery']) {
        const calls = r.requests.filter((q) => q.table === table && q.stage === stage);
        const expectedCount = stage === 'initial' ? 1 : stage === 'fault' ? (faults.includes(table) ? 8 : 0) : stage === 'inflight' ? (expected.scenario === 'join' && table === 'orders' ? 1 : 0) : faults.includes(table) ? (expected.scenario === 'join' ? 0 : expected.scenario === 'still-fails' ? 8 : 1) : 0;
        if (calls.length !== expectedCount) bad(`${stage}/${table}: esperado ${expectedCount} GET; observado ${calls.length}.`);
        const expectedSeq = expectedCount === 8 ? sequence : expectedCount ? [0] : [];
        if (JSON.stringify(calls.map((q) => q.sdkRetryCount)) !== JSON.stringify(expectedSeq)) bad(`${stage}/${table}: sequencia SDK alterada/incompleta.`);
        if (calls.some((q) => q.injected503 !== (stage === 'fault' || stage === 'recovery' && expected.scenario === 'still-fails'))) bad('injecao de falha fora do cenario.');
        const shouldDelay = stage === 'inflight' || stage === 'recovery' && expected.scenario !== 'still-fails';
        if (calls.some((q) => q.delayMs !== (shouldDelay ? RETRY_LIMITS.delayMs : 0))) bad('atraso programado fora do contrato.');
      }
    }
    for (const name of ['initial', 'fault', 'busy', 'final']) {
      const s = r[name];
      if (!s || s.technicalLeak !== false || !Array.isArray(s.panels) || s.panels.length !== RETRY_TABLES.length) { bad(`${name}: snapshot ausente/inseguro.`); continue; }
      for (const table of RETRY_TABLES) {
        const panels = s.panels.filter((p) => p.table === table), p = panels[0];
        if (panels.length !== 1 || p.fixtureFound !== true || !Number.isInteger(p.rows) || p.rows < 1 || p.controlEnabled !== true || !p.text?.trim()) { bad(`${name}: dados reais/controle perdidos em ${table}.`); continue; }
        const original = r.initial?.panels?.find((p) => p.table === table);
        if (original && p.text !== original.text) bad(`${name}: dado exibido foi substituido.`);
        if (name === 'initial' && (p.status !== 'success' || p.fetchStatus !== 'idle')) bad('bootstrap nao saudavel.');
        if (name === 'fault' && (p.status !== (faults.includes(table) ? 'error' : 'success') || p.fetchStatus !== 'idle')) bad('erro final inicial nao comprovado.');
        if (name === 'final' && (p.status !== (expected.scenario === 'still-fails' && faults.includes(table) ? 'error' : 'success') || p.fetchStatus !== 'idle')) bad('estado final incorreto/nao consolidado.');
      }
    }
    if (r.initial?.banner !== false || r.fault?.banner !== true || r.fault?.retryEnabled !== true || r.fault?.bannerInsideViewport !== true || r.fault?.retryInsideViewport !== true) bad('alerta/retry inicial sem geometria/acao.');
    if (r.busy?.banner !== true || r.busy?.retryEnabled !== false || r.busy?.retryBusy !== true) bad('clique nao aguardou a recuperacao.');
    const finalError = expected.scenario === 'still-fails';
    if (r.final?.banner !== finalError || r.final?.notice !== false || finalError && r.final?.retryEnabled !== true) bad('feedback final incorreto.');
    const counts = ['fault', 'busy', 'final'].map((name) => r[name]?.panels?.find((p) => p.table === 'products')?.uses);
    if (JSON.stringify(counts) !== '[1,2,3]') bad('dados em cache nao foram usados por cliques reais.');
    if (expected.scenario === 'join') {
      const inflight = r.requests.find((q) => q.stage === 'inflight');
      if (!inflight || r.manualClickAt <= inflight.at || r.manualClickAt >= inflight.releasedAt) bad('clique nao ocorreu durante o GET ja em voo.');
    }
  }
  return issues;
}
