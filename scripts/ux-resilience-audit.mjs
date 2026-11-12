#!/usr/bin/env node
/**
 * QA-UX (rodada 7) — RESILIENCIA A FALHAS DE BACKEND.
 *
 * As rodadas 1-6 mediram abertura, erro de validacao e layout. A rodada 7
 * tentou medir o "caminho feliz" e esbarrou numa limitacao conhecida do
 * harness isolado: JOINs como `products?select=*,categories(name)` e
 * `orders?select=*,order_items(*)` retornavam 400. A r17 implementou esse
 * subconjunto com SQL/RLS real, removendo a falha acidental da infraestrutura.
 * O cenario padrao agora INDUZ SOMENTE ERRO 503 nas mesmas leituras de apoio:
 * nunca fabrica lista ou sucesso. --fault=natural conserva o diagnostico sem
 * injecao; --assert continua recusando cenario sem falhas (medicao vazia).
 * As 5 rotas sao visitadas; 4 precisam reproduzir a falha de apoio. A rota
 * de apontamento, que nao tinha esse 400, continua apenas observada.
 *
 * Mede, por rota:
 *  - chamadas HTTP >= 400 contra a API isolada;
 *  - se existe feedback de erro VISIVEL e acionavel;
 *  - se existe controle de nova tentativa (retry/recarregar);
 *  - se vaza erro tecnico (PGRST, 400, JWT, stack, Failed to fetch);
 *  - excecoes JS nao tratadas e pagina presa em "carregando".
 *
 * Uso:
 *   node scripts/ux-resilience-audit.mjs --label=antes --out=/home/user/ux-evidence
 *   node scripts/ux-resilience-audit.mjs --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { assertLoopback } from './e2e-isolated-lib.mjs';
import { createRequire } from 'node:module';
import { RESILIENCE_ROUTES as ROUTES, RESILIENCE_FAULT_PATHS, resilienceProblems, resilienceObservationSchedule } from './ux-resilience-lib.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'resilience');
const OUT = arg('out', '/home/user/ux-evidence');
// SDK travado (postgrest-js 2.108.2): 3 retries (1+2+4s) DENTRO
// de cada tentativa. O QueryClient repete uma vez (+1s): ~15s no total.
// Preservamos snapshot aos 8s e aguardamos consolidacao por condicao,
// com teto de 25s (maximo permitido 30s). Isso NAO e um SLA de latencia
// nem altera retries/headers/politica do produto para passar o teste.
const schedule = resilienceObservationSchedule(Number(arg('wait', '25000')));
const WAIT = schedule.settleTimeoutMs;
if (!/^[a-z0-9_-]+$/i.test(LABEL)) throw new Error('label invalido');
const NO_BANNER = process.argv.includes('--no-banner'); // A/B no mesmo build
const FAULT = arg('fault', 'read-503');
if (!['read-503', 'natural'].includes(FAULT)) throw new Error('fault desconhecido');
assertLoopback(BASE); assertLoopback(API);
const FAULT_PATHS = new Set(RESILIENCE_FAULT_PATHS);
const injectedFaults = [];
let activeRoute = null;
let routeStarted = 0;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

const GENERATED = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado ausente (.env.e2e.generated)');
const env = Object.fromEntries(fs.readFileSync(GENERATED, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
if (env.E2E_ISOLATED_MARKER !== 'QA-01-ISOLATED-E2E' || env.VITE_SUPABASE_URL !== API) {
  throw new Error('Cenario de falha exige o ambiente descartavel marcado e local');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
await context.route('**/*', (route) => {
  const u = new URL(route.request().url());
  return (u.origin === BASE || u.origin === API) ? route.continue() : route.abort();
});
await context.route('**/config.js', (route) => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: `window.__USE_ERP_CONFIG__ = { SUPABASE_URL: ${JSON.stringify(API)}, SUPABASE_PUBLISHABLE_KEY: "e2e-isolated-anon-key" };`,
}));
// QA-17: apenas GET de relacoes conhecidas, apos login e durante a rota
// medida. Auth, RPC, escritas e todas as outras leituras continuam reais.
await context.route(`${API}/rest/v1/**`, (route) => {
  const request = route.request(), url = new URL(request.url());
  if (FAULT === 'read-503' && activeRoute && request.method() === 'GET' && FAULT_PATHS.has(url.pathname)) {
    injectedFaults.push({
      route: activeRoute, path: url.pathname, method: request.method(), status: 503,
      elapsedMs: Date.now() - routeStarted,
      sdkRetryCount: Number(request.headers()['x-retry-count'] || '0'),
    });
    return route.fulfill({
      status: 503, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      body: JSON.stringify({ message: 'QA17_INDUCED_READ_503' }),
    });
  }
  return route.continue();
});
let page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 25000 });
await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 });
await page.waitForTimeout(1500);
// Fechar a pagina de login/home cancela suas consultas pendentes. Cada
// medicao ganha uma pagina nova na MESMA sessao: nenhuma resposta tardia
// do dashboard ou da rota anterior pode ser atribuida a rota seguinte.
await page.close();

const report = {
  label: LABEL, at: new Date().toISOString(), routes: [], fault: FAULT,
  ...schedule,
  sdkVersion: createRequire(import.meta.url)('@supabase/postgrest-js/package.json').version,
  method: FAULT === 'read-503' ? 'falha 503 induzida em leituras, nunca sucesso' : 'falhas naturais sem injecao',
  injectedFaults,
};
for (const t of ROUTES) {
  page = await context.newPage();
  activeRoute = t.id;
  routeStarted = Date.now();
  const calls = [], jsErrors = [];
  const onRes = (res) => {
    const u = res.url();
    if (u.startsWith(API) && res.status() >= 400)
      calls.push({ status: res.status(), path: u.replace(API, '').slice(0, 150) });
  };
  const onErr = (e) => jsErrors.push(String(e.message).slice(0, 160));
  page.on('response', onRes);
  page.on('pageerror', onErr);
  const r = { id: t.id, route: t.route };
  try {
    await page.goto(`${BASE}${t.route}`, { waitUntil: 'domcontentloaded' });
    if (NO_BANNER) {
      // A/B controlado: esconde SOMENTE o banner global, sem alterar o produto.
      await page.addStyleTag({ content: '[data-ux-backend-error]{display:none!important}' });
    }
    const snapshot = () => page.evaluate(() => {
      const main = document.querySelector('#main-content');
      const txt = (main?.innerText || document.body.innerText || '');
      const body = document.body.innerText || '';
      const vis = (x) => { const q = x.getBoundingClientRect(); const s = getComputedStyle(x); return q.width > 0 && q.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const feedback = Array.from(document.querySelectorAll('[role="alert"], .text-destructive, [data-sonner-toast], [data-sonner-toaster], p, span, div'))
        .filter(vis)
        .map((x) => (x.textContent || '').trim())
        .filter((s) => s.length > 12 && s.length < 260)
        .filter((s) => /nao foi possivel|não foi possível|erro ao|falha|indispon|sem conex|tente novamente|tentar novamente|servidor|carregar|recarregar/i.test(s));
      const retry = Array.from(document.querySelectorAll('button, a'))
        .filter((b) => vis(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true')
        .map((b) => ((b.textContent || '').trim() || b.getAttribute('aria-label') || '').trim())
        .filter((s) => /tentar novamente|tente novamente|recarregar|atualizar|recuperar/i.test(s));
      const spinners = Array.from(document.querySelectorAll('.animate-spin, [aria-busy="true"]')).filter(vis).length;
      const loadingText = /^carregando|carregando\.\.\./i.test(txt.trim()) ? 1 : 0;
      return {
        currentPath: location.pathname, contentLength: txt.trim().length,
        feedback: [...new Set(feedback)].slice(0, 6),
        retryControls: [...new Set(retry)].slice(0, 6),
        technicalLeak: /PGRST|Failed to fetch|HTTP (400|503)|status (400|503)|QA17_INDUCED_READ_503|JWT ausente|Cannot read|undefined is not|SyntaxError|stack trace|supabaseKey/i.test(body),
        stuckLoading: spinners > 0 || loadingText === 1,
        spinnerCount: spinners,
      };
    });
    const observationStarted = Date.now();
    await page.waitForTimeout(schedule.earlySnapshotMs);
    r.earlyView = await snapshot();
    try {
      await page.waitForFunction(({ expectFault, noBanner }) => {
        const visible = (e) => { if (!e) return false; const q = e.getBoundingClientRect(); const s = getComputedStyle(e); return q.width > 0 && q.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
        const main = document.querySelector('#main-content');
        if (!main || (main.innerText || '').trim().length < 50) return false;
        if (Array.from(document.querySelectorAll('.animate-spin,[aria-busy="true"],[data-ux-retry-notice]')).some(visible)) return false;
        if (!expectFault) return true;
        // NO_BANNER continua sendo controle negativo: nao o fazemos passar
        // por conhecer a injecao. A ausencia de feedback/retry falha no gate.
        if (noBanner) return false;
        const banner = document.querySelector('[data-ux-backend-error]');
        return visible(banner) && Array.from(banner.querySelectorAll('button')).some((b) => visible(b) && !b.disabled && /tentar novamente/i.test(b.textContent || ''));
      }, { expectFault: FAULT === 'read-503' && t.expectFault, noBanner: NO_BANNER }, {
        timeout: Math.max(1, WAIT - (Date.now() - observationStarted)),
      });
      r.settled = true;
    } catch (error) {
      r.settled = false;
      r.settleError = String(error.message).slice(0, 180);
    }
    r.observationMs = Date.now() - observationStarted;
    r.view = await snapshot();
    r.httpErrors = calls;
    r.jsErrors = jsErrors;
    r.errorFeedback = r.view.feedback.length > 0;
    r.retryAvailable = r.view.retryControls.length > 0;
    // Uma rota "afetada" e aquela em que alguma consulta de negocio falhou.
    r.affected = r.httpErrors.length > 0;
    r.inducedAttempts = injectedFaults.filter((f) => f.route === t.id).length;
  } catch (e) {
    r.error = String(e.message).slice(0, 180);
  }
  page.off('response', onRes);
  page.off('pageerror', onErr);
  report.routes.push(r);
  activeRoute = null;
  await page.close();
}
await browser.close();
report.problems = resilienceProblems(report);

fs.writeFileSync(path.join(OUT, `${LABEL}-resilience.json`), JSON.stringify(report, null, 2));

const affected = report.routes.filter((r) => r.affected);
const silent = affected.filter((r) => !r.errorFeedback);
const noRetry = affected.filter((r) => !r.retryAvailable);
const leak = report.routes.filter((r) => r.view?.technicalLeak);
const jsFail = report.routes.filter((r) => r.jsErrors?.length);
const stuck = report.routes.filter((r) => r.view?.stuckLoading);
console.log(`[resilience] modo=${FAULT} | ${report.routes.length} rotas | afetadasPorErro=${affected.length} | silenciosas=${silent.length} (${silent.map(r=>r.id).join(',')}) | semRetry=${noRetry.length} | vazamentoTecnico=${leak.length} | jsErrors=${jsFail.length} | presasCarregando=${stuck.length}`);
for (const r of report.routes) {
  console.log(`  ${r.id.padEnd(16)} errosHTTP=${String(r.httpErrors?.length ?? '-').padEnd(2)} conteudo=${String(r.view?.contentLength ?? '-').padEnd(6)} feedback=${String(r.errorFeedback ?? '-').padEnd(5)} retry=${String(r.retryAvailable ?? '-').padEnd(5)} spinner=${r.view?.spinnerCount ?? '-'} consolidou=${r.settled ?? false} esperaMs=${r.observationMs ?? '-'} jsErr=${r.jsErrors?.length ?? '-'}${r.error ? ' ERRO:' + r.error.slice(0,40) : ''}`);
  if (r.httpErrors?.length) console.log(`      -> ${r.httpErrors.slice(0, 2).map(c => c.status + ' ' + c.path.slice(0, 90)).join(' | ')}`);
}

if (process.argv.includes('--assert')) {
  const problems = report.problems;
  if (problems.length) {
    console.error('UX RESILIENCE ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('UX RESILIENCE ASSERT OK: toda falha de backend tem feedback acionavel, retry e nenhum vazamento tecnico.');
}
