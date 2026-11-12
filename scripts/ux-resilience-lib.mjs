/** QA-UX r17: contrato nao vacuo da auditoria de falhas de leitura.
 * Tempo de estabilizacao nao e SLA: o gate so avalia o estado consolidado
 * dentro de um teto explicito. Erro/timeout/cobertura parcial nunca passam.
 */
export const RESILIENCE_ROUTES = Object.freeze([
  { id: 'clientes', route: '/comercial/clientes', expectFault: true },
  { id: 'pedidos-venda', route: '/comercial/pedidos', expectFault: true },
  { id: 'apontamento', route: '/producao/apontamento', expectFault: false },
  { id: 'pedidos-compra', route: '/compras/pedidos', expectFault: true },
  { id: 'recebimento', route: '/wms/recebimento', expectFault: true },
].map(Object.freeze));

export const RESILIENCE_FAULT_PATHS = Object.freeze([
  '/rest/v1/orders', '/rest/v1/products', '/rest/v1/purchase_orders',
]);

/** Reserva tempo para a condicao apos o snapshot, inclusive --wait=8000.
 * Consumir o teto inteiro num sleep seguido de waitForFunction(1ms) nao
 * prova consolidacao e causava falsos timeouts no controle natural. */
export function resilienceObservationSchedule(settleTimeoutMs) {
  if (!Number.isInteger(settleTimeoutMs) || settleTimeoutMs < 1000 || settleTimeoutMs > 30000) throw new Error('wait deve ser inteiro entre 1000 e 30000ms');
  return { settleTimeoutMs, earlySnapshotMs: Math.min(8000, Math.floor(settleTimeoutMs / 2)) };
}

export function resilienceProblems(report) {
  if (!report || !Array.isArray(report.routes)) return ['Relatorio sem rotas.'];
  const problems = [];
  if (!['read-503', 'natural'].includes(report.fault)) problems.push('Modo de falha invalido.');
  if (!Number.isInteger(report.settleTimeoutMs) || report.settleTimeoutMs < 1000 || report.settleTimeoutMs > 30000) problems.push('Teto de estabilizacao ausente/invalido (maximo 30s).');
  if (report.routes.length !== RESILIENCE_ROUTES.length) problems.push('Cobertura de rotas incompleta.');
  const injections = Array.isArray(report.injectedFaults) ? report.injectedFaults : [];
  if (!Array.isArray(report.injectedFaults)) problems.push('Registro de injecoes ausente.');
  if (injections.some((f) => f?.method !== 'GET' || f.status !== 503 || !RESILIENCE_FAULT_PATHS.includes(f.path) || !RESILIENCE_ROUTES.some((r) => r.id === f.route))) problems.push('Injecao fora do contrato GET/503/leituras conhecidas.');
  if (report.fault === 'natural' && injections.length) problems.push('Modo natural nao admite injecao.');

  let affected = 0;
  for (const expected of RESILIENCE_ROUTES) {
    const matches = report.routes.filter((r) => r?.id === expected.id);
    if (matches.length !== 1) {
      problems.push(`${expected.id}: requer exatamente uma medicao.`);
      continue;
    }
    const r = matches[0];
    if (r.error) problems.push(`${r.id}: erro de execucao: ${r.error}`);
    if (r.route !== expected.route || r.view?.currentPath !== expected.route) problems.push(`${r.id}: rota efetiva diferente do contrato.`);
    if (r.settled !== true || !Number.isFinite(r.observationMs) || r.observationMs < 0 || r.observationMs > report.settleTimeoutMs + 1500) problems.push(`${r.id}: estado nao consolidado dentro do teto.`);
    if (!Array.isArray(r.httpErrors) || !Array.isArray(r.jsErrors) || !r.view || !Array.isArray(r.view.feedback) || !Array.isArray(r.view.retryControls) || !Number.isInteger(r.view.spinnerCount) || r.view.spinnerCount < 0 || !Number.isInteger(r.view.contentLength) || r.view.contentLength < 50) {
      problems.push(`${r.id}: metricas obrigatorias ausentes/invalidas.`);
      continue;
    }
    if (r.httpErrors.length) {
      affected++;
      if (!r.view.feedback.length) problems.push(`${r.id}: falha sem feedback visivel.`);
      if (!r.view.retryControls.length) problems.push(`${r.id}: sem controle de nova tentativa.`);
    }
    if (report.fault === 'read-503' && expected.expectFault && (!injections.some((f) => f.route === r.id) || !r.httpErrors.some((e) => e.status === 503))) problems.push(`${r.id}: 503 nao reproduzido.`);
    if (r.view.technicalLeak !== false) problems.push(`${r.id}: vazamento tecnico ou metrica ausente.`);
    if (r.view.stuckLoading !== false || r.view.spinnerCount > 0) problems.push(`${r.id}: tela presa em carregando ou metrica ausente.`);
    if (r.jsErrors.length) problems.push(`${r.id}: excecao JS nao tratada.`);
  }
  if (!affected) problems.push('Nenhuma rota afetada: medicao vacua.');
  return problems;
}
