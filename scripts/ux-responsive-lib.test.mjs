import test from 'node:test';
import assert from 'node:assert/strict';
import { RESPONSIVE_ROUTES, RESPONSIVE_VIEWPORTS, responsiveProblems, responsivePageState } from './ux-responsive-lib.mjs';

// Fixtures validam apenas o contrato do GATE. Nao simulam um resultado do
// produto nem substituem as medicoes Chromium/SQL real do audit A/B.
const fixture = () => ({
  preset: '',
  viewports: RESPONSIVE_VIEWPORTS.map((vp) => ({
    viewport: vp.name, width: vp.width, height: vp.height,
    routes: RESPONSIVE_ROUTES.map((route, i) => ({
      route, currentPath: route, effectiveWidth: vp.width, navigationError: null,
      mainRendered: true, mainTextLength: 300, controlCount: 8, mainHeading: 'Conteudo', pageState: 'content', localErrorAlert: false,
      docOverflow: 0, offscreen: [], tiny: [], clippedColspan: [],
      tables: i < 7 ? [{ ths: 4, wrappedThs: 0, wrapHasScroll: true, wrapFocusable: true, wrapRegion: true }] : [],
    })),
  })),
});
const rejects = (change, pattern) => {
  const report = fixture(); change(report);
  const errors = responsiveProblems(report);
  assert.ok(errors.some((e) => pattern.test(e)), `Esperava ${pattern}; obtive ${errors.join('; ')}`);
};

test('aceita cinco viewports, doze rotas e zero defeitos', () => {
  assert.deepEqual(responsiveProblems(fixture()), []);
});
test('recusa relatorio ausente e viewports ausentes', () => {
  assert.ok(responsiveProblems(null).length);
  assert.ok(responsiveProblems({}).length);
});
test('recusa amostra so de 375px, antes suficiente para o gate', () => {
  rejects((r) => { r.viewports = [r.viewports[1]]; }, /Cobertura/);
});
test('recusa viewport duplicado', () => {
  rejects((r) => { r.viewports[4] = structuredClone(r.viewports[0]); }, /exatamente uma medicao/);
});
test('recusa dimensoes que nao correspondem ao viewport', () => {
  rejects((r) => { r.viewports[0].width = 375; }, /dimensoes/);
});
test('recusa rota ausente', () => {
  rejects((r) => { r.viewports[0].routes.pop(); }, /requer 12 rotas/);
});
test('recusa rota duplicada, mesmo mantendo contagem total', () => {
  rejects((r) => { r.viewports[0].routes[1] = structuredClone(r.viewports[0].routes[0]); }, /exatamente uma medicao/);
});
test('recusa falha de navegacao mesmo se houver DOM residual', () => {
  rejects((r) => { r.viewports[0].routes[0].navigationError = 'timeout sintetico'; }, /falha de navegacao/);
});
test('recusa pagina de login/redirect no lugar da rota pedida', () => {
  rejects((r) => { r.viewports[0].routes[0].currentPath = '/login'; }, /rota efetiva diferente/);
});
test('recusa largura CSS diferente da configurada', () => {
  rejects((r) => { r.viewports[0].routes[0].effectiveWidth = 980; }, /largura CSS efetiva/);
});
test('recusa pagina sem conteudo principal ou controles', () => {
  rejects((r) => { r.viewports[0].routes[0].mainRendered = false; }, /nao renderizados/);
  rejects((r) => { r.viewports[0].routes[0].mainTextLength = 3; }, /nao renderizados/);
  rejects((r) => { r.viewports[0].routes[0].controlCount = 0; }, /nao renderizados/);
});
test('recusa metricas omitidas em vez de confundir com zero', () => {
  rejects((r) => { delete r.viewports[0].routes[0].offscreen; }, /metricas obrigatorias/);
  rejects((r) => { r.viewports[0].routes[0].docOverflow = -1; }, /metricas obrigatorias/);
});
test('recusa cobertura insuficiente de tabelas', () => {
  rejects((r) => { r.viewports[0].routes.forEach((row) => { row.tables = []; }); }, /cobertura de tabelas/);
});
test('recusa metrica de tabela incompleta', () => {
  rejects((r) => { delete r.viewports[0].routes[0].tables[0].wrapFocusable; }, /metrica de tabela incompleta/);
});
test('um unico alvo pequeno em CADA viewport e falha (nao mais baseline 22)', () => {
  for (let i = 0; i < RESPONSIVE_VIEWPORTS.length; i++) {
    rejects((r) => { r.viewports[i].routes[0].tiny.push({ w: 23, h: 24 }); }, /1 alvos menores/);
  }
});
test('um unico controle fora em CADA viewport e falha (nao mais tolerancia 2)', () => {
  for (let i = 0; i < RESPONSIVE_VIEWPORTS.length; i++) {
    rejects((r) => { r.viewports[i].routes[0].offscreen.push({ text: 'Proximo' }); }, /1 controles fora/);
  }
});
test('recusa overflow, cabecalho quebrado e estado vazio cortado', () => {
  rejects((r) => { r.viewports[2].routes[0].docOverflow = 1; }, /overflow horizontal/);
  rejects((r) => { r.viewports[3].routes[0].tables[0].wrappedThs = 1; }, /cabecalhos de tabela/);
  rejects((r) => { r.viewports[4].routes[0].clippedColspan.push('vazio'); }, /estados vazios cortados/);
});
test('regiao que rola precisa de foco E papel de regiao', () => {
  rejects((r) => { r.viewports[0].routes[0].tables[0].wrapFocusable = false; }, /sem foco\/regiao/);
  rejects((r) => { r.viewports[0].routes[0].tables[0].wrapRegion = false; }, /sem foco\/regiao/);
});
test('preset CSS de diagnostico nunca pode passar no gate', () => {
  rejects((r) => { r.preset = 'both'; }, /Preset CSS/);
});

test('recusa spinner mesmo com titulo e texto suficientes no shell', () => {
  rejects((r) => { r.viewports[0].routes[0].pageState = 'loading'; }, /estado de pagina nao medido/);
});
test('estado de erro de usuarios e identificado, nunca confundido com lista carregada', () => {
  const r = fixture();
  const row = r.viewports[0].routes.find((x) => x.route === '/admin/usuarios');
  row.pageState = 'backend-error'; row.localErrorAlert = true;
  assert.deepEqual(responsiveProblems(r), []);
  row.localErrorAlert = false;
  assert.ok(responsiveProblems(r).some((e) => /estado de pagina nao medido/.test(e)));
});
test('nao estende a outra rota a medicao do estado de erro de usuarios', () => {
  rejects((r) => { const row = r.viewports[0].routes[0]; row.pageState = 'backend-error'; row.localErrorAlert = true; }, /estado de pagina nao medido/);
});
test('breadcrumb sozinho nao e conteudo principal, mesmo com controles do shell', () => {
  rejects((r) => { r.viewports[0].routes[0].mainHeading = ''; }, /nao renderizados/);
});

test('indicador de fundo nao e pagina inteira bloqueada', () => {
  assert.equal(responsivePageState({ mainHeading: 'Dashboard', animatedIndicators: 1 }), 'content');
});
test('PageLoading ou main ocupado continuam sendo carregamento mesmo com titulo', () => {
  assert.equal(responsivePageState({ mainHeading: 'Usuarios', markedPageLoaders: 1 }), 'loading');
  assert.equal(responsivePageState({ mainHeading: 'Usuarios', mainBusy: true }), 'loading');
});
test('spinner mudo sem titulo continua bloqueado', () => {
  assert.equal(responsivePageState({ mainHeading: '', animatedIndicators: 1 }), 'loading');
});
