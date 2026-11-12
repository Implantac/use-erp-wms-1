#!/usr/bin/env node
/** QA-UX r18 — feedback ANTES de esgotar os retries internos do SDK.
 * 4 rotas x (503 persistente, 503 unico, leitura lenta) + leitura em 320px.
 * So injeta falha 503 ou ATRASA um GET que segue para SQL/RLS real.
 * Nenhum sucesso/lista e fabricado; nao altera Retry-After nem politica SDK.
 * Um recorder passivo de DOM mede inicio/fim do aviso e seu contrato ARIA.
 * --no-notice e somente controle negativo; nunca pode aprovar --assert.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { assertLoopback, parseEnvFile } from './e2e-isolated-lib.mjs';
import { LOADING_CASES, LOADING_LIMITS, loadingProblems, loadingCaseMetrics, waitUntilAtLeast } from './ux-loading-lib.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'loading');
const OUT = arg('out', '/home/user/ux-evidence');
const NO_NOTICE = process.argv.includes('--no-notice');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assertLoopback(BASE); assertLoopback(API);
if (!/^[a-z0-9_-]+$/i.test(LABEL)) throw new Error('label invalido');
const env = parseEnvFile(fs.readFileSync(path.join(ROOT, '.env.e2e.generated'), 'utf8'));
if (env.E2E_ISOLATED_MARKER !== 'QA-01-ISOLATED-E2E' || env.VITE_SUPABASE_URL !== API) throw new Error('Auditoria exige ambiente descartavel marcado e local.');
const fixtures = JSON.parse(env.E2E_RELATED_FIXTURES || 'null');
if (fixtures?.version !== 'QA17') throw new Error('Fixtures nao vazias QA17 ausentes.');
fs.mkdirSync(OUT, { recursive: true });
const report = {
  label: LABEL, at: new Date().toISOString(), scope: 'local-isolated-synthetic',
  method: 'somente falha 503 ou atraso; sucesso/dados sempre da API real',
  businessSuccessMocked: false, noNotice: NO_NOTICE, limits: LOADING_LIMITS,
  sdkVersion: createRequire(import.meta.url)('@supabase/postgrest-js/package.json').version,
  cases: [], errors: [],
};

async function configure(context) {
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    return [BASE, API].includes(u.origin) ? route.continue() : route.abort();
  });
  await context.route('**/config.js', (route) => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.__USE_ERP_CONFIG__={SUPABASE_URL:${JSON.stringify(API)},SUPABASE_PUBLISHABLE_KEY:"e2e-isolated-anon-key"};`,
  }));
}

// Executado antes do JS da pagina; so observa DOM, sem criar aviso/estado.
function installRecorder({ noNotice }) {
  const start = () => {
    if (noNotice) {
      const style = document.createElement('style');
      style.textContent = '[data-ux-retry-notice],[data-ux-retry-message]{display:none!important}';
      document.head.appendChild(style);
    }
    const samples = [];
    const visible = (node) => {
      if (!node) return false;
      const r = node.getBoundingClientRect(), css = getComputedStyle(node);
      return r.width > 0 && r.height > 0 && css.display !== 'none' && css.visibility !== 'hidden' && css.opacity !== '0';
    };
    const snapshot = () => {
      const main = document.querySelector('#main-content');
      const node = document.querySelector('[data-ux-retry-notice]');
      const shown = visible(node), rect = shown ? node.getBoundingClientRect() : null;
      const banner = document.querySelector('[data-ux-backend-error]');
      const retry = banner?.querySelector('button');
      const hit = rect ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
      return {
        currentPath: location.pathname, notice: shown,
        phase: shown ? node.getAttribute('data-ux-loading-phase') : null,
        noticeText: shown ? (node.textContent || '').trim() : '',
        role: shown ? node.getAttribute('role') : null,
        ariaLive: shown ? node.getAttribute('aria-live') : null,
        ariaAtomic: shown ? node.getAttribute('aria-atomic') : null,
        noticeSpinner: shown ? !!node.querySelector('.animate-spin,[aria-busy="true"]') : false,
        pointerPassthrough: shown ? getComputedStyle(node).pointerEvents === 'none' && !!hit && !node.contains(hit) : null,
        withinViewport: rect ? rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight : null,
        noticeRect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
        mainLoading: !!main && (main.getAttribute('aria-busy') === 'true' || Array.from(main.querySelectorAll('[data-ux-loading]')).some(visible)),
        spinnerCount: Array.from(main?.querySelectorAll('.animate-spin,[aria-busy="true"]') || []).filter(visible).length,
        contentLength: (main?.innerText || '').trim().length,
        heading: (main?.querySelector('h1,h2,[role="heading"]')?.textContent || '').trim(),
        errorBanner: visible(banner), retryEnabled: visible(banner) && visible(retry) && !retry.disabled,
        technicalLeak: /QA18_INDUCED_READ_503|PGRST|Failed to fetch|HTTP 503|status 503|JWT ausente|Cannot read|SyntaxError|stack trace/i.test(document.body.innerText || ''),
      };
    };
    let previous = '';
    const record = (force = false) => {
      const state = snapshot(), signature = JSON.stringify(state);
      if (force || signature !== previous) samples.push({ wall: Date.now(), ...state });
      previous = signature;
    };
    const observer = new MutationObserver(() => record());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    const interval = setInterval(() => record(), 100);
    record(true);
    window.__qaLoadingFeedback = {
      stop: () => { observer.disconnect(); clearInterval(interval); record(true); return { timeline: samples, final: samples.at(-1) }; },
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

let browser;
try {
  const health = await (await fetch(`${API}/auth/v1/health`)).json();
  if (health.marker !== env.E2E_ISOLATED_MARKER || health.relatedReads?.version !== 'QA-17') throw new Error('API nao e o descartavel esperado.');
  browser = await chromium.launch({ headless: true });
  const login = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  await configure(login);
  const loginPage = await login.newPage();
  await loginPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await loginPage.locator('#email').fill(env.E2E_ADMIN_EMAIL);
  await loginPage.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
  await loginPage.getByRole('button', { name: 'Entrar', exact: true }).click();
  await loginPage.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
  // Sessao apenas em memoria. Fechar a home evita atribuir suas respostas
  // tardias a Clientes; cada caso tem contexto/pagina novos, sem cache.
  const storageState = await login.storageState();
  await login.close();

  for (const c of LOADING_CASES) {
    const r = { ...c, attempts: [], responses: [], timeline: [], jsErrors: [], businessWrites: [] };
    const context = await browser.newContext({
      storageState, viewport: { width: c.width, height: c.height },
      isMobile: c.viewport === 'mobile-320', hasTouch: c.viewport === 'mobile-320', locale: 'pt-BR',
    });
    const responseJobs = [], screenshotJobs = [], attemptsByRequest = new Map();
    let succeeded = false;
    try {
      await configure(context);
      await context.addInitScript(installRecorder, { noNotice: NO_NOTICE });
      const page = await context.newPage();
      page.on('pageerror', (e) => r.jsErrors.push(String(e.message).slice(0, 180)));
      page.on('request', (req) => {
        const u = new URL(req.url());
        if (u.origin === API && /^\/rest\/v1\/(products|orders|order_items|purchase_orders|purchase_order_items|suppliers|clients)$/.test(u.pathname) && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method())) r.businessWrites.push({ method: req.method(), path: u.pathname });
      });
      page.on('response', (res) => {
        const attempt = attemptsByRequest.get(res.request());
        if (!attempt) return;
        const job = (async () => {
          const record = { n: attempt.n, status: res.status(), at: Date.now(), realApi: !attempt.injected503 };
          if (res.status() === 200) {
            const body = await res.json();
            record.rows = Array.isArray(body) ? body.length : 0;
            record.fixtureFound = Array.isArray(body) && body.some((row) => row.id === fixtures.tenants.A[c.fixtureKey]);
            succeeded = true;
          }
          r.responses.push(record);
        })().catch((e) => { r.error = `Falha ao medir resposta: ${String(e.message).slice(0, 160)}`; });
        responseJobs.push(job);
      });
      await page.route(`${API}/rest/v1/${c.table}*`, async (route) => {
        const req = route.request(), u = new URL(req.url());
        if (req.method() !== 'GET' || u.pathname !== `/rest/v1/${c.table}`) return route.continue();
        const n = r.attempts.length + 1;
        const injected503 = c.scenario === 'persistent-503' || (c.scenario === 'transient-503' && n === 1);
        const delayMs = c.scenario === 'slow-read' && n === 1 ? LOADING_LIMITS.slowReadDelayMs : c.scenario === 'transient-503' && n === 1 ? LOADING_LIMITS.transientFaultDelayMs : 0;
        const attempt = { n, at: Date.now(), method: req.method(), path: u.pathname, sdkRetryCount: Number(req.headers()['x-retry-count'] || '0'), injected503, delayMs };
        r.attempts.push(attempt); attemptsByRequest.set(req, attempt);
        if (n === 1 && (c.viewport === 'mobile-320' || c.scenario === 'persistent-503' && c.id === 'pedidos-venda')) {
          r.earlyScreenshot = `${LABEL}-${c.caseId.replaceAll('/', '-')}-at-2100ms.png`;
          screenshotJobs.push((async () => {
            await new Promise((resolve) => setTimeout(resolve, 2100));
            await page.screenshot({ path: path.join(OUT, r.earlyScreenshot) });
          })().catch((e) => { r.screenshotError = String(e.message).slice(0, 180); }));
        }
        attempt.releasedAt = delayMs ? await waitUntilAtLeast(attempt.at + delayMs) : Date.now();
        if (injected503) return route.fulfill({
          status: 503, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,apikey,x-client-info,content-type,x-retry-count,accept-profile', 'access-control-allow-methods': 'GET,OPTIONS' },
          body: JSON.stringify({ message: 'QA18_INDUCED_READ_503' }),
        });
        return route.continue();
      });
      const started = Date.now();
      await page.goto(`${BASE}${c.route}`, { waitUntil: 'domcontentloaded' });
      const persistent = c.scenario === 'persistent-503';
      await page.waitForFunction((expectError) => {
        const visible = (e) => { if (!e) return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).display !== 'none'; };
        const main = document.querySelector('#main-content'), banner = document.querySelector('[data-ux-backend-error]');
        if (!main || (main.innerText || '').trim().length < 50 || !main.querySelector('h1,h2,[role="heading"]')) return false;
        if (Array.from(main.querySelectorAll('[data-ux-loading],.animate-spin,[aria-busy="true"]')).some(visible)) return false;
        if (expectError) return visible(banner) && !!banner.querySelector('button:not(:disabled)');
        return !visible(banner);
      }, persistent, { timeout: LOADING_LIMITS.deadlineMs });
      if (!persistent) {
        // Espera pelo GET real mesmo quando o apoio nao bloqueia a tabela.
        const deadline = started + LOADING_LIMITS.deadlineMs;
        while (!succeeded && !r.error && Date.now() < deadline) await page.waitForTimeout(50);
        if (!succeeded) throw new Error('GET real de sucesso nao terminou dentro do teto.');
      }
      await page.waitForFunction(() => {
        const n = document.querySelector('[data-ux-retry-notice]');
        return !n || getComputedStyle(n).display === 'none' || n.getBoundingClientRect().width === 0;
      }, null, { timeout: Math.max(1, LOADING_LIMITS.deadlineMs - (Date.now() - started)) });
      await page.waitForTimeout(300);
      await Promise.all([...responseJobs, ...screenshotJobs]);
      const measured = await page.evaluate(() => window.__qaLoadingFeedback.stop());
      r.timeline = measured.timeline; r.final = measured.final;
      r.observationMs = Date.now() - (r.attempts[0]?.at ?? started);
      r.finished = true;
      const metrics = loadingCaseMetrics(r);
      r.metrics = { noticeAtRequestStart: metrics.noticeAtRequestStart, noticeAfterRequestMs: metrics.noticeAfterRequestMs, noticeAfterRetryMs: metrics.noticeAfterRetryMs, attemptCount: metrics.attemptCount };
      r.responses.sort((a, b) => a.n - b.n);
      // A captura final nao e uma prova do estado intermediario; esse estado
      // esta na timeline/primeira observacao, sem CSS ou aviso injetado.
      if (c.viewport === 'mobile-320' || persistent && c.id === 'pedidos-venda') await page.screenshot({ path: path.join(OUT, `${LABEL}-${c.caseId.replaceAll('/', '-')}-final.png`) });
    } catch (e) {
      r.error = r.error || String(e.message).slice(0, 300);
      r.finished = false;
    } finally {
      await context.close();
      report.cases.push(r);
      console.log(`[loading] ${c.caseId} | tentativas=${r.attempts.length} aviso=${r.metrics?.noticeAfterRequestMs ?? '-'}ms aposRetry=${r.metrics?.noticeAfterRetryMs ?? '-'}ms final=${r.finished ?? false}${r.error ? ` ERRO=${r.error}` : ''}`);
    }
  }
} catch (e) {
  report.errors.push(String(e.message).slice(0, 300));
} finally {
  if (browser) await browser.close();
  report.problems = loadingProblems(report);
  fs.writeFileSync(path.join(OUT, `${LABEL}-loading.json`), JSON.stringify(report, null, 2));
}
console.log(`[loading] ${report.cases.length}/${LOADING_CASES.length} casos | falhas=${report.problems.length} | sucessoSimulado=false`);
for (const p of report.problems) console.error(`  - ${p}`);
if (process.argv.includes('--assert') && report.problems.length) process.exitCode = 1;
