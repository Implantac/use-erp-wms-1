/** QA-18: contrato nao vacuo de feedback antecipado, separado do produto.
 * O limiar de UI nao e importado: mudar o produto nao afrouxa o gate.
 */
export const LOADING_LIMITS = Object.freeze({
  noticeAfterRequestMs: 2000, noticeAfterRetryMs: 800,
  transientFaultDelayMs: 700, slowReadDelayMs: 3500, deadlineMs: 25000,
});
const ROUTES = [
  { id: 'clientes', route: '/comercial/clientes', table: 'orders', fixtureKey: 'orderId' },
  { id: 'pedidos-venda', route: '/comercial/pedidos', table: 'orders', fixtureKey: 'orderId' },
  { id: 'pedidos-compra', route: '/compras/pedidos', table: 'purchase_orders', fixtureKey: 'purchaseId' },
  { id: 'recebimento', route: '/wms/recebimento', table: 'products', fixtureKey: 'productId' },
];
export const LOADING_CASES = Object.freeze([
  ...['persistent-503', 'transient-503', 'slow-read'].flatMap((scenario) => ROUTES.map((r) => ({
    ...r, scenario, viewport: 'desktop', width: 1440, height: 900,
  }))),
  { ...ROUTES[1], scenario: 'slow-read', viewport: 'mobile-320', width: 320, height: 640 },
].map((c) => Object.freeze({ ...c, caseId: `${c.scenario}/${c.id}/${c.viewport}` })));

const finiteTime = (n) => Number.isFinite(n) && n >= 0;
/** setTimeout pode acordar 1ms antes pelo arredondamento do relogio.
 * A injecao deve cumprir o atraso REAL exigido, nao afrouxar o gate. */
export async function waitUntilAtLeast(deadline, { now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  if (!finiteTime(deadline)) throw new Error('deadline invalido');
  let at = now();
  while (at < deadline) {
    await sleep(Math.max(1, deadline - at));
    at = now();
  }
  return at;
}

export function loadingCaseMetrics(row) {
  const attempts = Array.isArray(row?.attempts) ? row.attempts : [];
  const samples = Array.isArray(row?.timeline) ? row.timeline : [];
  const firstAt = attempts[0]?.at;
  const firstNotice = samples.find((s) => s.notice && finiteTime(s.wall) && s.wall >= firstAt);
  const retry = attempts.find((a) => a.sdkRetryCount > 0);
  const preceding = samples.filter((s) => s.wall <= firstAt).at(-1);
  return {
    firstNotice,
    noticeAtRequestStart: preceding?.notice === true,
    noticeAfterRequestMs: firstNotice && finiteTime(firstAt) ? firstNotice.wall - firstAt : null,
    noticeAfterRetryMs: firstNotice && retry ? Math.max(0, firstNotice.wall - retry.at) : null,
    attemptCount: attempts.length,
  };
}

export function loadingProblems(report) {
  if (!report || !Array.isArray(report.cases)) return ['Relatorio sem casos.'];
  const problems = [];
  if (!Array.isArray(report.errors) || report.errors.length) problems.push('Erro global de execucao ou metrica ausente.');
  if (report.businessSuccessMocked !== false) problems.push('Sucesso simulado ou metodo nao declarado.');
  if (report.noNotice !== false) problems.push('Controle sem aviso nao pode produzir aceite.');
  if (report.cases.length !== LOADING_CASES.length) problems.push(`Cobertura: requer ${LOADING_CASES.length} casos.`);
  for (const expected of LOADING_CASES) {
    const matches = report.cases.filter((r) => r?.caseId === expected.caseId);
    const prefix = expected.caseId;
    if (matches.length !== 1) { problems.push(`${prefix}: requer exatamente uma medicao.`); continue; }
    const r = matches[0];
    if (r.error || r.finished !== true) problems.push(`${prefix}: erro de execucao ou estado nao consolidado.`);
    if (r.route !== expected.route || r.scenario !== expected.scenario || r.viewport !== expected.viewport || r.width !== expected.width || r.height !== expected.height || r.final?.currentPath !== expected.route) problems.push(`${prefix}: rota/cenario/viewport diferente do contrato.`);
    if (!Array.isArray(r.attempts) || !r.attempts.length || !Array.isArray(r.responses) || !r.responses.length || !Array.isArray(r.timeline) || !r.timeline.length || !Array.isArray(r.jsErrors) || !Array.isArray(r.businessWrites)) {
      problems.push(`${prefix}: metricas obrigatorias ausentes; medicao vazia.`); continue;
    }
    if (r.jsErrors.length || r.businessWrites.length) problems.push(`${prefix}: excecao JS ou escrita de negocio.`);
    const { firstNotice, noticeAtRequestStart, noticeAfterRequestMs, noticeAfterRetryMs } = loadingCaseMetrics(r);
    if (noticeAtRequestStart) problems.push(`${prefix}: aviso preexistente; cenario contaminado.`);
    if (!finiteTime(noticeAfterRequestMs) || noticeAfterRequestMs > LOADING_LIMITS.noticeAfterRequestMs) problems.push(`${prefix}: aviso ausente ou depois de ${LOADING_LIMITS.noticeAfterRequestMs}ms da leitura.`);
    if (!firstNotice || firstNotice.phase !== 'slow' || firstNotice.role !== 'status' || firstNotice.ariaLive !== 'polite' || firstNotice.ariaAtomic !== 'true' || firstNotice.noticeSpinner !== false || firstNotice.pointerPassthrough !== true || firstNotice.withinViewport !== true) problems.push(`${prefix}: aviso inicial sem contrato acessivel/nao bloqueante.`);
    if (firstNotice && (!/demorando para carregar/i.test(firstNotice.noticeText || '') || /tentando novamente|erro|falha|nao foi possivel|não foi possível/i.test(firstNotice.noticeText || ''))) problems.push(`${prefix}: texto inicial afirma retry/falha sem confirmacao.`);
    if (r.timeline.some((s) => s.technicalLeak !== false) || r.final?.technicalLeak !== false) problems.push(`${prefix}: vazamento tecnico ou metrica ausente.`);
    if (r.attempts.some((a, i) => a.n !== i + 1 || a.method !== 'GET' || a.path !== `/rest/v1/${expected.table}` || !finiteTime(a.at) || !Number.isInteger(a.sdkRetryCount) || a.sdkRetryCount < 0 || a.sdkRetryCount > 3)) problems.push(`${prefix}: tentativa fora do contrato de leitura.`);
    if (!finiteTime(r.observationMs) || r.observationMs > LOADING_LIMITS.deadlineMs + 1500) problems.push(`${prefix}: observacao fora do teto.`);
    if (!r.final || r.final.notice !== false || r.final.mainLoading !== false || r.final.spinnerCount !== 0 || !Number.isInteger(r.final.contentLength) || r.final.contentLength < 50 || !r.final.heading?.trim()) problems.push(`${prefix}: carregamento/aviso final ou pagina vazia.`);

    const persistent = expected.scenario === 'persistent-503';
    const transient = expected.scenario === 'transient-503';
    const expectedAttempts = persistent ? 8 : transient ? 2 : 1;
    const retrySequence = persistent ? [0, 1, 2, 3, 0, 1, 2, 3] : transient ? [0, 1] : [0];
    if (r.attempts.length !== expectedAttempts || JSON.stringify(r.attempts.map((a) => a.sdkRetryCount)) !== JSON.stringify(retrySequence)) problems.push(`${prefix}: politica/numero de tentativas mudou ou cenario incompleto.`);
    if (r.responses.length !== expectedAttempts || r.responses.some((x, i) => x.n !== i + 1 || x.status !== (persistent || (transient && i === 0) ? 503 : 200))) problems.push(`${prefix}: respostas/falhas esperadas nao reproduzidas.`);
    if (persistent || transient) {
      if (!finiteTime(noticeAfterRetryMs) || noticeAfterRetryMs > LOADING_LIMITS.noticeAfterRetryMs) problems.push(`${prefix}: aviso ausente ou >800ms apos inicio do retry SDK.`);
      if (r.attempts.filter((a) => a.injected503 === true).length !== (persistent ? 8 : 1)) problems.push(`${prefix}: injecao 503 invalida/vazia.`);
    } else {
      if (r.attempts.some((a) => a.injected503 !== false) || r.attempts[0].delayMs !== LOADING_LIMITS.slowReadDelayMs || !finiteTime(r.attempts[0].releasedAt) || r.attempts[0].releasedAt - r.attempts[0].at < LOADING_LIMITS.slowReadDelayMs) problems.push(`${prefix}: leitura lenta real nao foi reproduzida.`);
    }
    if (persistent) {
      if (r.final?.errorBanner !== true || r.final?.retryEnabled !== true || !r.timeline.some((s) => s.notice && s.phase === 'retrying')) problems.push(`${prefix}: transicao retry/erro final sem feedback acionavel.`);
    } else {
      if (r.final?.errorBanner !== false || !r.responses.some((x) => x.status === 200 && x.realApi === true && x.rows > 0 && x.fixtureFound === true)) problems.push(`${prefix}: sucesso real nao vazio nao comprovado.`);
      if (r.timeline.some((s) => s.notice && (s.phase !== 'slow' || /tentando novamente/i.test(s.noticeText || '')))) problems.push(`${prefix}: UI afirma retry nao confirmado pelo QueryClient.`);
    }
  }
  return problems;
}
