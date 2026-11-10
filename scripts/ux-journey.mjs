#!/usr/bin/env node
/**
 * Jornada "como usuario de ERP" sobre o AMBIENTE ISOLADO (QA-01).
 *
 * Pre-requisito: `node scripts/e2e-isolated-server.mjs` em execucao (127.0.0.1:54321)
 * e o frontend Vite local em E2E_BASE_URL (padrao 127.0.0.1:4179).
 *
 * Seguranca:
 *  - nenhuma credencial de producao: login usa as identidades de teste que o
 *    proprio harness gera em `.env.e2e.generated` (arquivo ignorado pelo Git);
 *  - o /config.js publicado e substituido em voo pelo endereco do harness;
 *  - toda origem diferente de localhost:4179 / 127.0.0.1:54321 e abortada;
 *  - Postgres e descartado ao fim; nao ha deploy, piloto nem dados de cliente.
 *
 *   node scripts/ux-journey.mjs --label=antes --out=/home/user/ux-evidence
 *
 * Mede, para cada rota, tempo ate conteudo, erros de console, mensagens
 * tecnicas visiveis ao usuario, estado de carregamento e texto principal.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'jornada');
const OUT = arg('out', '/home/user/ux-evidence');
const GENERATED = path.resolve('tests/harness/../..', '.env.e2e.generated');
fs.mkdirSync(OUT, { recursive: true });

if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado nao encontrado (.env.e2e.generated ausente)');
const env = Object.fromEntries(
  fs.readFileSync(GENERATED, 'utf8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const EMAIL = env.E2E_ADMIN_EMAIL;
const PASSWORD = env.E2E_ADMIN_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error('Identidade de teste ausente no ambiente isolado');

const ROUTES = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'pendencias', path: '/pendencias' },
  { name: 'novo-pedido-alias', path: '/comercial/pedidos/novo' },
  { name: 'pedidos-canonica', path: '/comercial/pedidos' },
  { name: 'sugestao-compra-alias', path: '/compras/sugestoes' },
  { name: 'contas-receber-alias', path: '/financeiro/contas-receber' },
  { name: 'wms-recebimento', path: '/wms/recebimento' },
  { name: 'inventario', path: '/wms/inventario' },
  { name: 'fiscal-notas-alias', path: '/fiscal/notas' },
  { name: 'fiscal-nfe-canonica', path: '/fiscal/nfe' },
  { name: 'manual', path: '/admin/manual' },
  { name: 'ai-config-alias', path: '/admin/ai-config' },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
await context.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.origin === BASE || u.origin === API) return route.continue();
  return route.abort();
});
await context.route('**/config.js', async (route) => route.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: `window.__USE_ERP_CONFIG__ = { SUPABASE_URL: ${JSON.stringify(API)}, SUPABASE_PUBLISHABLE_KEY: "e2e-isolated-anon-key" };`,
}));

const page = await context.newPage();
const consoleErrors = [];
const httpErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 220)); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 220)}`));
page.on('response', (r) => {
  if (r.status() >= 400) httpErrors.push({ status: r.status(), url: new URL(r.url()).pathname.slice(0, 100) });
});

const result = { label: LABEL, at: new Date().toISOString(), login: {}, routes: [], palette: {}, keyboard: {} };

// ---- 1) LOGIN como usuario de ERP -------------------------------------------
const tLogin = Date.now();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 20000 });
await page.locator('#email').fill(EMAIL);
await page.locator('#password').fill(PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
let loggedIn = false;
try {
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
  loggedIn = true;
} catch { /* permanece no login */ }
result.login = {
  ms: Date.now() - tLogin,
  loggedIn,
  finalUrl: page.url().replace(BASE, ''),
  bodyText: (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300),
};

if (loggedIn) {
  await page.waitForTimeout(2500); // hidratacao do tenant
  result.login.afterHydrationUrl = page.url().replace(BASE, '');
  result.login.afterHydrationText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 500);
  await page.screenshot({ path: path.join(OUT, `${LABEL}-dashboard.png`), fullPage: false });

  // ---- 2) PALETA DE FLUXOS Ctrl+K ------------------------------------------
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  result.palette = await page.evaluate(() => ({
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
    dialogOpen: !!document.querySelector('[role="dialog"]'),
    placeholder: document.querySelector('[role="dialog"] input')?.getAttribute('placeholder') || '',
    visibleItems: Array.from(document.querySelectorAll('[cmdk-item], [role="option"]')).slice(0, 6).map((e) => e.textContent?.trim().slice(0, 40)),
    floatingSwitcherVisible: !!Array.from(document.querySelectorAll('button')).find((b) => /Workflow Switcher/i.test(b.textContent || '')),
  }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Clique no launchpad legado: para onde ele realmente leva o usuario?
  try {
    const legacy = page.locator('button').filter({ hasText: /Workflow Switcher/i }).first();
    if (await legacy.isVisible({ timeout: 1500 })) {
      await legacy.click();
      await page.waitForTimeout(300);
      result.palette.legacyDialogItems = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[cmdk-item], [role="option"]')).slice(0, 12).map((e) => e.textContent?.trim().slice(0, 45))
      );
      await page.keyboard.press('Escape');
    }
  } catch { /* botao nao encontrado */ }

  // ---- 3) ROTAS DO DIA-A-DIA ------------------------------------------------
  for (const r of ROUTES) {
    const t = Date.now();
    const errorsBefore = consoleErrors.length;
    const httpBefore = httpErrors.length;
    let timedOut = false;
    try {
      await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
      // Espera o CONTEUDO PRINCIPAL aparecer de verdade (nao so o menu/breadcrumb).
      await page.waitForFunction(
        () => (document.querySelector('#main-content')?.innerText ?? '').trim().length > 200,
        { timeout: 6000 }
      );
    } catch { timedOut = true; }
    const ms = Date.now() - t;
    const bodyText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    const mainText = (await page.evaluate(() => document.querySelector('#main-content')?.innerText ?? '')).replace(/\s+/g, ' ');
    const technical = /Failed to fetch|fetch failed|TypeError|ReferenceError|PGRST|JWT|permission denied|relation .* does not exist|500 Internal|Erro ao carregar|Cannot read/i.test(bodyText);
    const stuckLoading = /Inicializando Ecossistema|Carregando\.\.\./.test(bodyText);
    const emptyState = /Nenhum|não há|vazio|sem dados|Empty|Nada por aqui/i.test(mainText);
    const notFound = /Página não encontrada|404/.test(bodyText) || /Página não encontrada|404/.test(mainText);
    result.routes.push({
      name: r.name, path: r.path, ms, timedOut, technical, stuckLoading, emptyState, notFound,
      mainText: mainText.slice(0, 260), mainLen: mainText.length,
      text: bodyText.slice(0, 220), newConsoleErrors: consoleErrors.slice(errorsBefore, errorsBefore + 3),
      newHttpErrors: httpErrors.slice(httpBefore, httpBefore + 3),
      url: page.url().replace(BASE, ''),
    });
    await page.screenshot({ path: path.join(OUT, `${LABEL}-${r.name}.png`), fullPage: false });
  }

  // ---- 4) Ctrl+K no Manual: promessa do placeholder continua valida? --------
  try {
    await page.goto(`${BASE}/admin/manual`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1800);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(350);
    result.manualCtrlK = await page.evaluate(() => ({
      globalDialogOpen: !!document.querySelector('[role="dialog"]'),
      focusedPlaceholder: document.activeElement?.getAttribute('placeholder') || '',
      activeTag: document.activeElement?.tagName || '',
    }));
  } catch (e) {
    result.manualCtrlK = { error: String(e).slice(0, 120) };
  }

  // ---- 5) TECLADO na rota de pedidos (S005 do cliente) ----------------------
  await page.goto(`${BASE}/comercial/pedidos`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const firstTab = await page.evaluate(() => {
    document.body.focus();
    return document.activeElement?.tagName || '';
  });
  await page.keyboard.press('Tab');
  const focus1 = await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label'), name: document.activeElement?.getAttribute('name'), id: document.activeElement?.id }));
  const inputs = await page.evaluate(() => ({
    total: document.querySelectorAll('input, select, textarea, button').length,
    withAutocomplete: document.querySelectorAll('[autocomplete]').length,
    withLabel: document.querySelectorAll('label').length,
    required: document.querySelectorAll('[required]').length,
  }));
  result.keyboard = { firstTab, focus1, inputs };
}

result.consoleErrors = consoleErrors.slice(0, 20);
result.httpErrors = httpErrors.slice(0, 25);
result.uniqueHttpFailures = [...new Set(httpErrors.map((e) => `${e.status} ${e.url}`))].slice(0, 25);
fs.writeFileSync(path.join(OUT, `${LABEL}-journey.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();

// --assert: usado como gate de regressão das melhorias de UX.
if (process.argv.includes('--assert')) {
  const issues = [];
  if (!result.login.loggedIn) issues.push('login nao concluiu');
  result.routes.filter((r) => r.notFound || r.timedOut)
    .forEach((r) => issues.push(`rota ${r.path} nao carregou (404 ou timeout)`));
  if (result.palette.floatingSwitcherVisible) issues.push('launchpad legado ainda visivel');
  if (result.palette.dialogCount !== 1) issues.push(`Ctrl+K abriu ${result.palette.dialogCount} dialogos (esperado 1)`);
  if (result.manualCtrlK?.globalDialogOpen) issues.push('Ctrl+K no Manual abriu a paleta global em vez da busca local');
  if (issues.length) {
    console.error('UX ASSERT FALHOU: ' + issues.join(' | '));
    process.exit(1);
  }
  console.log(`UX ASSERT OK: login, ${result.routes.length} rotas, paleta unica e Ctrl+K local verificados.`);
}
