#!/usr/bin/env node
/** QA-19: Chromium + componentes/QueryClient/SDK reais + SQL/RLS descartaveis.
 * Fixture adversarial de COMPONENTE, nao jornada de producao. So injeta 503
 * ou atrasa GET; todo 200 vem da API real, com fixture nao vazia exigida.
 * Interage por botoes/DOM, sem expor ou editar QueryClient pelo browser.
 */
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLoopback, parseEnvFile } from './e2e-isolated-lib.mjs';
import { waitUntilAtLeast } from './ux-loading-lib.mjs';
import { RETRY_CASES, RETRY_TABLES, RETRY_LIMITS, faultTables, retryProblems } from './ux-retry-lib.mjs';
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179', API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'retry'), OUT = arg('out', '/home/user/ux-evidence');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assertLoopback(BASE); assertLoopback(API);
if (!/^[a-z0-9_-]+$/i.test(LABEL)) throw new Error('label invalido');
const env = parseEnvFile(fs.readFileSync(path.join(ROOT, '.env.e2e.generated'), 'utf8'));
if (env.E2E_ISOLATED_MARKER !== 'QA-01-ISOLATED-E2E' || env.VITE_SUPABASE_URL !== API) throw new Error('Requer ambiente descartavel local marcado.');
const fixtures = JSON.parse(env.E2E_RELATED_FIXTURES || 'null');
if (fixtures?.version !== 'QA17') throw new Error('Fixtures QA17 nao vazias ausentes.');
const own = fixtures.tenants.A, expected = { orders: own.orderId, purchase_orders: own.purchaseId, products: own.productId };
fs.mkdirSync(OUT, { recursive: true });
const report = { label: LABEL, scope: 'isolated-component-real-api', businessSuccessMocked: false, method: 'fixture de componente; somente GET real, atraso ou 503; sessao apenas em memoria', limits: RETRY_LIMITS, cases: [], errors: [] };

async function snapshot(page) {
  return page.evaluate(() => {
    const visible = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; };
    const inside = (e) => { if (!visible(e)) return false; const r = e.getBoundingClientRect(); return r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight; };
    const banner = document.querySelector('[data-ux-backend-error]'), button = banner?.querySelector('button');
    return {
      banner: visible(banner), retryEnabled: visible(button) && !button.disabled,
      retryBusy: visible(button) && button.getAttribute('aria-busy') === 'true',
      bannerInsideViewport: inside(banner), retryInsideViewport: inside(button),
      bannerHeight: visible(banner) ? Math.round(banner.getBoundingClientRect().height) : null,
      notice: visible(document.querySelector('[data-ux-retry-notice]')),
      technicalLeak: /QA19_INDUCED|PGRST|JWT ausente|HTTP 503|SQLSTATE|stack trace|Cannot read/i.test(document.body.innerText || ''),
      panels: Array.from(document.querySelectorAll('[data-qa-panel]')).map((p) => ({
        table: p.getAttribute('data-qa-panel'), status: p.getAttribute('data-status'), fetchStatus: p.getAttribute('data-fetch-status'),
        fixtureFound: p.getAttribute('data-has-fixture') === 'true', rows: Number.parseInt(p.querySelector('[data-qa-rows]')?.textContent || '0', 10),
        text: p.querySelector('[data-qa-fixture]')?.textContent?.trim() || '',
        controlEnabled: !p.querySelector('[data-qa-use]')?.disabled,
        uses: Number(p.querySelector('[data-qa-uses]')?.textContent || '0'),
      })),
    };
  });
}
async function waitState(page, errors) {
  await page.waitForFunction((errors) => {
    const panels = Array.from(document.querySelectorAll('[data-qa-panel]'));
    return panels.length === 3 && panels.every((p) => p.getAttribute('data-has-fixture') === 'true' && p.getAttribute('data-fetch-status') === 'idle' && p.getAttribute('data-status') === (errors.includes(p.getAttribute('data-qa-panel')) ? 'error' : 'success'));
  }, errors, { timeout: RETRY_LIMITS.phaseDeadlineMs });
}
let browser;
try {
  const health = await (await fetch(`${API}/auth/v1/health`)).json();
  if (health.marker !== env.E2E_ISOLATED_MARKER || health.relatedReads?.version !== 'QA-17') throw new Error('API diferente do descartavel esperado.');
  const auth = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.E2E_ADMIN_EMAIL, password: env.E2E_ADMIN_PASSWORD }) });
  if (auth.status !== 200) throw new Error('Login real falhou.');
  const { access_token: accessToken } = await auth.json();
  if (!accessToken) throw new Error('Sessao real ausente.');
  browser = await chromium.launch({ headless: true });
  for (const spec of RETRY_CASES) {
    const r = { ...spec, requests: [], responses: [], jsErrors: [], businessWrites: [], finished: false };
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height } });
    const page = await context.newPage(), faults = faultTables(spec.scenario);
    let stage = 'initial';
    const lookup = new Map(), captures = [];
    const started = Date.now();
    try {
      await context.route('**/*', (route) => [BASE, API].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
      await context.addInitScript((bootstrap) => { window.__QA19_RETRY__ = bootstrap; }, { marker: env.E2E_ISOLATED_MARKER, api: API, anonKey: env.VITE_SUPABASE_PUBLISHABLE_KEY, accessToken, expected });
      page.on('pageerror', (e) => r.jsErrors.push(String(e.message).slice(0, 200)));
      await context.route(`${API}/rest/v1/**`, async (route) => {
        const request = route.request(), table = new URL(request.url()).pathname.split('/').pop();
        if (request.method() !== 'GET') {
          r.businessWrites.push({ method: request.method(), table });
          return route.abort();
        }
        if (!RETRY_TABLES.includes(table)) return route.continue();
        const capturedStage = stage, isFault = capturedStage === 'fault' && faults.includes(table) || capturedStage === 'recovery' && spec.scenario === 'still-fails' && faults.includes(table);
        const delayMs = capturedStage === 'inflight' || capturedStage === 'recovery' && spec.scenario !== 'still-fails' && faults.includes(table) ? RETRY_LIMITS.delayMs : 0;
        const q = { n: r.requests.length + 1, table, method: request.method(), stage: capturedStage, at: Date.now(), sdkRetryCount: Number(request.headers()['x-retry-count'] || 0), injected503: isFault, delayMs };
        r.requests.push(q); lookup.set(request, q);
        try {
          q.releasedAt = delayMs ? await waitUntilAtLeast(q.at + delayMs) : Date.now();
          if (isFault) return await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA19_INDUCED_READ_503' }) });
          await route.continue(); // 200 e corpo continuam da API verdadeira.
        } catch (e) { r.jsErrors.push(`route: ${String(e.message).slice(0, 180)}`); }
      });
      page.on('response', (response) => {
        const q = lookup.get(response.request());
        if (!q) return;
        const capture = (async () => {
          const s = { n: q.n, table: q.table, stage: q.stage, status: response.status(), at: Date.now(), realApi: !q.injected503, rows: 0, fixtureFound: false };
          if (!q.injected503) {
            const rows = await response.json();
            s.rows = Array.isArray(rows) ? rows.length : 0;
            s.fixtureFound = Array.isArray(rows) && rows.some((v) => v.id === expected[q.table]);
          }
          r.responses.push(s);
        })().catch((e) => r.jsErrors.push(`response: ${String(e.message).slice(0, 180)}`));
        captures.push(capture);
      });
      await page.goto(`${BASE}/tests/ux/retry-recovery.html`, { waitUntil: 'domcontentloaded' });
      await waitState(page, []);
      r.initial = await snapshot(page);
      stage = 'fault'; const faultStart = Date.now();
      for (const table of faults) await page.locator(`[data-qa-refresh="${table}"]`).click();
      await waitState(page, faults);
      await expect(page.locator('[data-ux-backend-error] button')).toBeEnabled();
      r.faultMs = Date.now() - faultStart;
      await page.locator('[data-qa-use="products"]').click();
      await expect(page.locator('[data-qa-uses="products"]')).toHaveText('1');
      r.fault = await snapshot(page);
      if (spec.width === 320) await page.screenshot({ path: path.join(OUT, `${LABEL}-${spec.id}-fault.png`) });
      if (spec.scenario === 'join') {
        stage = 'inflight';
        await page.locator('[data-qa-refresh="orders"]').click();
        await expect.poll(() => r.requests.filter((q) => q.stage === 'inflight').length).toBe(1);
      }
      stage = 'recovery'; r.manualClickAt = Date.now();
      await page.locator('[data-ux-backend-error] button').click();
      await page.locator('[data-qa-use="products"]').click();
      await expect(page.locator('[data-qa-uses="products"]')).toHaveText('2');
      r.busy = await snapshot(page);
      if (spec.id === 'prefix') await page.screenshot({ path: path.join(OUT, `${LABEL}-${spec.id}-busy.png`) });
      await waitState(page, spec.scenario === 'still-fails' ? faults : []);
      if (spec.scenario === 'still-fails') await expect(page.locator('[data-ux-backend-error] button')).toBeEnabled();
      else await expect(page.locator('[data-ux-backend-error]')).toHaveCount(0);
      await page.waitForTimeout(400); // janela para detectar repeticao nao solicitada.
      r.recoveryMs = Date.now() - r.manualClickAt;
      await page.locator('[data-qa-use="products"]').click();
      await expect(page.locator('[data-qa-uses="products"]')).toHaveText('3');
      r.final = await snapshot(page);
      await Promise.all(captures);
      if (spec.id === 'prefix') await page.screenshot({ path: path.join(OUT, `${LABEL}-${spec.id}-final.png`) });
      r.finished = true;
    } catch (e) { r.error = String(e.message).slice(0, 350); }
    finally {
      r.totalMs = Date.now() - started;
      await context.close();
      report.cases.push(r);
      console.log(`[retry] ${r.id} | terminou=${r.finished} GET=${r.requests.length} recuperacao=${r.requests.filter((q) => q.stage === 'recovery').map((q) => q.table).join(',') || 'aderiu ao existente'}${r.error ? ` ERRO=${r.error}` : ''}`);
    }
  }
} catch (e) { report.errors.push(String(e.message).slice(0, 300)); }
finally {
  if (browser) await browser.close();
  report.problems = retryProblems(report);
  fs.writeFileSync(path.join(OUT, `${LABEL}-retry.json`), JSON.stringify(report, null, 2));
}
console.log(`[retry] ${report.cases.length}/${RETRY_CASES.length} casos | problemas=${report.problems.length} | sucessoSimulado=false`);
for (const p of report.problems) console.error(`  - ${p}`);
if (process.argv.includes('--assert') && report.problems.length) process.exitCode = 1;
