#!/usr/bin/env node
/**
 * QA-UX (rodada 8 / UX7-03) — CARREGAMENTO E RETENTATIVA VISIVEIS.
 *
 * A rodada 7 mediu que `pedidos-venda` fica em "Carregando pedidos..."
 * enquanto o React Query refaz a consulta (1 retry com backoff), sem
 * indicar ao usuario que esta tentando de novo. O `BackendErrorBanner`
 * so aparece DEPOIS que o erro consolida — ha uma janela silenciosa.
 *
 * Para medir essa janela de forma DETERMINISTICA (sem depender do tempo
 * aleatorio do harness), este audit induz UMA falha 503 com 700ms de
 * atraso na primeira consulta de lista de cada rota. As demais chamadas
 * seguem para a API isolada normalmente. Nao mockamos o backend inteiro:
 * apenas forçamos a retentativa que o produto ja faz.
 *
 * Amostra o DOM a cada 150ms por 6s e mede:
 *  - se aparece aviso de retentativa durante o carregamento;
 *  - a LATENCIA desse aviso a partir do inicio do retry (2a chamada), nao
 *    a partir do inicio da pagina — o primeiro carregamento e legitimo e
 *    nao pode ser cobrado como "silencio" (correcao de viés da r8);
 *  - se o carregamento termina e se vaza erro tecnico.
 *
 * Uso:
 *   node scripts/ux-loading-audit.mjs --label=antes --out=/home/user/ux-evidence
 *   node scripts/ux-loading-audit.mjs --label=depois --assert
 *   node scripts/ux-loading-audit.mjs --label=ab --no-notice   # A/B no mesmo build
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'loading');
const OUT = arg('out', '/home/user/ux-evidence');
const WAIT = Number(arg('wait', '6000'));
const NO_NOTICE = process.argv.includes('--no-notice');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { id: 'pedidos-venda', route: '/comercial/pedidos', pattern: '**/rest/v1/orders?*' },
  { id: 'pedidos-compra', route: '/compras/pedidos', pattern: '**/rest/v1/purchase_orders?*' },
  { id: 'recebimento', route: '/wms/recebimento', pattern: '**/rest/v1/products?*' },
];

const GENERATED = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado ausente (.env.e2e.generated)');
const env = Object.fromEntries(fs.readFileSync(GENERATED, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));

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
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 25000 });
await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 });
await page.waitForTimeout(1500);

const report = { label: LABEL, at: new Date().toISOString(), noNotice: NO_NOTICE, routes: [] };
for (const t of ROUTES) {
  const r = { id: t.id, route: t.route };
  let injected = 0;
  // A 2a chamada e o inicio da RETENTATIVA. O tempo anterior a ela e o
  // primeiro carregamento legitimo — nao pode ser cobrado como "silencio".
  let retryStartedAt = null;
  const handler = async (route) => {
    injected += 1;
    if (injected === 2 && retryStartedAt === null) retryStartedAt = Date.now();
    if (injected === 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"temporary failure"}' });
    } else {
      await route.continue();
    }
  };
  try {
    await page.route(t.pattern, handler);
    await page.goto(`${BASE}${t.route}`, { waitUntil: 'domcontentloaded' });
    if (NO_NOTICE) {
      // A/B controlado: esconde SOMENTE os novos avisos, sem alterar o produto.
      await page.addStyleTag({ content: '[data-ux-retry-notice],[data-ux-retry-message]{display:none!important}' });
    }
    const timeline = await page.evaluate(async (ms) => {
      const samples = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        const main = document.querySelector('#main-content');
        const mainTxt = (main?.innerText || '').trim();
        const bodyTxt = (document.body.innerText || '');
        samples.push({
          t: Math.round(performance.now() - t0),
          wall: Date.now(),
          loading: /carregando/i.test(mainTxt) || !!document.querySelector('[data-ux-loading]'),
          notice: /tentando novamente|demorando para carregar|nova tentativa/i.test(bodyTxt),
          length: mainTxt.length,
        });
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return {
        samples,
        feedbackTexts: [...new Set((document.body.innerText || '').split('\n').map((s) => s.trim())
          .filter((s) => /tentando novamente|demorando para carregar|nova tentativa|não foi possível/i.test(s)))].slice(0, 6),
        technicalLeak: /PGRST|Failed to fetch|HTTP 503|status 503|JWT ausente|temporary failure|Cannot read|SyntaxError/i.test(document.body.innerText || ''),
      };
    }, WAIT);
    r.injectedRequests = injected;
    r.retryStartedAt = retryStartedAt;
    r.retryNoticeShown = timeline.samples.some((s) => s.notice);
    const firstNotice = timeline.samples.find((s) => s.notice);
    r.firstNoticeMs = firstNotice?.t ?? null;
    // Latencia REAL do aviso: quanto tempo o usuario espera DEPOIS que a
    // retentativa comeca. Incluir o primeiro carregamento seria falso positivo.
    r.noticeLatencyMs = firstNotice && retryStartedAt !== null
      ? Math.max(0, firstNotice.wall - retryStartedAt) : null;
    let silentMs = 0;
    for (let i = 1; i < timeline.samples.length; i++) {
      const dt = timeline.samples[i].t - timeline.samples[i - 1].t;
      if (timeline.samples[i].loading && !timeline.samples[i].notice) silentMs += dt;
    }
    r.silentLoadingMs = silentMs;
    r.loadingSamples = timeline.samples.filter((s) => s.loading).length;
    r.finalLoading = timeline.samples.slice(-3).some((s) => s.loading);
    r.feedbackTexts = timeline.feedbackTexts;
    r.technicalLeak = timeline.technicalLeak;
    r.timeline = timeline.samples.map((s) => ({ t: s.t, L: s.loading ? 1 : 0, N: s.notice ? 1 : 0 }));
    await page.unroute(t.pattern, handler);
  } catch (e) {
    r.error = String(e.message).slice(0, 180);
    await page.unroute(t.pattern, handler).catch(() => {});
  }
  report.routes.push(r);
}
await browser.close();
fs.writeFileSync(path.join(OUT, `${LABEL}-loading.json`), JSON.stringify(report, null, 2));

const noNotice = report.routes.filter((r) => !r.retryNoticeShown);
const lateNotice = report.routes.filter((r) => r.noticeLatencyMs === null || r.noticeLatencyMs > 800);
const stuck = report.routes.filter((r) => r.finalLoading);
const leak = report.routes.filter((r) => r.technicalLeak);
const notInjected = report.routes.filter((r) => !r.injectedRequests);
console.log(`[loading] ${report.routes.length} rotas | semAvisoDeRetry=${noNotice.length} (${noNotice.map(r=>r.id).join(',')}) | avisoAposRetry>800ms=${lateNotice.length} | presasCarregando=${stuck.length} | vazamentoTecnico=${leak.length}`);
for (const r of report.routes) {
  console.log(`  ${r.id.padEnd(16)} 503induzidas=${String(r.injectedRequests ?? '-').padEnd(2)} amostrasCarregando=${String(r.loadingSamples ?? '-').padEnd(3)} aviso=${String(r.retryNoticeShown ?? '-').padEnd(5)} 1oAviso=${String(r.firstNoticeMs ?? '-').padEnd(5)}ms latenciaAposRetry=${String(r.noticeLatencyMs ?? '-').padEnd(5)}ms silencio1oLoad=${String(r.silentLoadingMs ?? '-').padEnd(5)}ms finalCarregando=${String(r.finalLoading ?? '-').padEnd(5)}${r.error ? ' ERRO:' + r.error.slice(0,40) : ''}`);
  if (r.feedbackTexts?.length) console.log(`      -> ${r.feedbackTexts.slice(0, 2).join(' | ').slice(0, 150)}`);
}

if (process.argv.includes('--assert')) {
  const problems = [];
  if (notInjected.length) problems.push(`cenario de retentativa nao induzido em: ${notInjected.map(r => r.id).join(', ')}`);
  if (noNotice.length) problems.push(`carregamento sem aviso de retentativa em: ${noNotice.map(r => r.id).join(', ')}`);
  if (lateNotice.length) problems.push(`aviso apareceu mais de 800ms APOS o inicio do retry em: ${lateNotice.map(r => `${r.id} (${r.noticeLatencyMs}ms)`).join(', ')}`);
  const foreverLoading = report.routes.filter((r) => (r.silentLoadingMs || 0) > 4500);
  if (foreverLoading.length) problems.push(`carregamento sem fim em: ${foreverLoading.map(r => r.id).join(', ')}`);
  if (stuck.length) problems.push(`tela ainda carregando ao final em: ${stuck.map(r => r.id).join(', ')}`);
  if (leak.length) problems.push(`erro tecnico vazando em: ${leak.map(r => r.id).join(', ')}`);
  if (problems.length) {
    console.error('UX LOADING ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('UX LOADING ASSERT OK: toda retentativa e anunciada em menos de 800ms, sem carregamento sem fim e sem vazamento tecnico.');
}
