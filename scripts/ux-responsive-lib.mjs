/** QA-UX r16: contrato puro do audit responsivo, testavel sem abrir browser.
 * Limites antigos eram 22 alvos <24px e 2 controles fora em 375px.
 * Agora sao ZERO em TODOS os cinco viewports; cobertura parcial nao passa.
 * 720x450 mede reflow equivalente a metade de 1440x900, nao zoom nativo.
 */
export const RESPONSIVE_ROUTES = Object.freeze([
  '/dashboard', '/comercial/pedidos', '/comercial/clientes', '/producao/ordens',
  '/producao/apontamento', '/compras/pedidos', '/wms/recebimento', '/wms/dashboard',
  '/financeiro/receber', '/admin/parametros', '/admin/usuarios', '/fiscal/nfe',
]);

export const RESPONSIVE_VIEWPORTS = Object.freeze([
  { name: 'mobile-320', width: 320, height: 640, isMobile: true, hasTouch: true },
  { name: 'mobile', width: 375, height: 812, isMobile: true, hasTouch: true },
  { name: 'reflow-720', width: 720, height: 450, isMobile: false, hasTouch: false },
  { name: 'tablet', width: 768, height: 1024, isMobile: false, hasTouch: false },
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
].map(Object.freeze));

const count = (value) => Number.isInteger(value) && value >= 0;
const ARRAYS = ['offscreen', 'tiny', 'clippedColspan', 'tables'];

/** Um indicador de conexao/consulta em segundo plano nao bloqueia a
 * pagina inteira. Mantemos suas contagens no JSON, mas a classificacao
 * usa PageLoading/aria-busy do MAIN, ou spinner sem titulo de pagina. */
export function responsivePageState({ localErrorAlert = false, markedPageLoaders = 0, mainBusy = false, mainHeading = '', animatedIndicators = 0 }) {
  if (localErrorAlert) return 'backend-error';
  if (markedPageLoaders > 0 || mainBusy || (!mainHeading.trim() && animatedIndicators > 0)) return 'loading';
  return 'content';
}

/** Retorna TODAS as falhas, inclusive falta de cobertura. Nao aceita
 * opcoes que possam reduzir o contrato usado pelo CLI com --assert. */
export function responsiveProblems(report) {
  const problems = [];
  if (!report || !Array.isArray(report.viewports)) return ['Relatorio sem viewports.'];
  if (report.preset) problems.push('Preset CSS de diagnostico nao pode gerar aceite no gate.');
  if (report.viewports.length !== RESPONSIVE_VIEWPORTS.length) {
    problems.push(`Cobertura: requer ${RESPONSIVE_VIEWPORTS.length} viewports, recebeu ${report.viewports.length}.`);
  }

  for (const expected of RESPONSIVE_VIEWPORTS) {
    const matches = report.viewports.filter((v) => v?.viewport === expected.name);
    if (matches.length !== 1) {
      problems.push(`Cobertura ${expected.name}: requer exatamente uma medicao, recebeu ${matches.length}.`);
      continue;
    }
    const v = matches[0];
    const prefix = `${expected.name} (${expected.width}px)`;
    if (v.width !== expected.width || v.height !== expected.height) {
      problems.push(`${prefix}: dimensoes diferentes do contrato.`);
    }
    if (!Array.isArray(v.routes)) {
      problems.push(`${prefix}: rotas ausentes.`);
      continue;
    }
    if (v.routes.length !== RESPONSIVE_ROUTES.length) {
      problems.push(`${prefix}: requer ${RESPONSIVE_ROUTES.length} rotas, recebeu ${v.routes.length}.`);
    }
    let wrapped = 0, offscreen = 0, overflow = 0, tiny = 0, clipped = 0, unfocusable = 0, tables = 0;
    for (const route of RESPONSIVE_ROUTES) {
      const rows = v.routes.filter((r) => r?.route === route);
      if (rows.length !== 1) {
        problems.push(`${prefix}${route}: requer exatamente uma medicao, recebeu ${rows.length}.`);
        continue;
      }
      const r = rows[0];
      if (r.navigationError) problems.push(`${prefix}${route}: falha de navegacao: ${r.navigationError}`);
      if (r.currentPath !== route) problems.push(`${prefix}${route}: rota efetiva diferente (${r.currentPath ?? 'ausente'}).`);
      if (r.effectiveWidth !== expected.width) problems.push(`${prefix}${route}: largura CSS efetiva incorreta.`);
      if (r.mainRendered !== true || !count(r.mainTextLength) || r.mainTextLength < 50 || !count(r.controlCount) || r.controlCount < 1 || typeof r.mainHeading !== 'string' || r.mainHeading.trim().length < 3) {
        problems.push(`${prefix}${route}: conteudo principal/controles nao renderizados.`);
      }
      // A Edge Function admin-users nao existe neste harness. Medir o
      // estado de ERRO explicito da rota e valido para GEOMETRIA, nao e
      // uma lista de usuarios testada nem caminho feliz. Spinner nao vale.
      if (r.pageState !== responsivePageState(r) || (r.pageState !== 'content' && !(route === '/admin/usuarios' && r.pageState === 'backend-error' && r.localErrorAlert === true))) {
        problems.push(`${prefix}${route}: estado de pagina nao medido/valido (${r.pageState ?? 'ausente'}).`);
      }
      if (!ARRAYS.every((key) => Array.isArray(r[key])) || !count(r.docOverflow)) {
        problems.push(`${prefix}${route}: metricas obrigatorias ausentes ou invalidas.`);
        continue;
      }
      offscreen += r.offscreen.length;
      tiny += r.tiny.length;
      clipped += r.clippedColspan.length;
      overflow += r.docOverflow;
      tables += r.tables.length;
      for (const t of r.tables) {
        if (!t || !count(t.wrappedThs) || !count(t.ths) || !['wrapHasScroll', 'wrapFocusable', 'wrapRegion'].every((key) => typeof t[key] === 'boolean')) {
          problems.push(`${prefix}${route}: metrica de tabela incompleta.`);
          continue;
        }
        wrapped += t.wrappedThs;
        if (t.wrapHasScroll && !(t.wrapFocusable && t.wrapRegion)) unfocusable++;
      }
    }
    // O isolado destas 12 rotas renderiza pelo menos 7 tabelas. Uma pagina
    // vazia ou um carregamento incompleto nao pode parecer "zero defeitos".
    if (tables < 7) problems.push(`${prefix}: cobertura de tabelas insuficiente (${tables} < 7).`);
    if (wrapped) problems.push(`${prefix}: ${wrapped} cabecalhos de tabela quebrados.`);
    if (offscreen) problems.push(`${prefix}: ${offscreen} controles fora da viewport.`);
    if (overflow) problems.push(`${prefix}: ${overflow}px de overflow horizontal do documento.`);
    if (unfocusable) problems.push(`${prefix}: ${unfocusable} regioes rolaveis sem foco/regiao.`);
    if (clipped) problems.push(`${prefix}: ${clipped} estados vazios cortados.`);
    if (tiny) problems.push(`${prefix}: ${tiny} alvos menores que 24px.`);
  }
  return problems;
}
