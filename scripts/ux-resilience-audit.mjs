#!/usr/bin/env node
/**
 * QA-UX (rodada 7) — RESILIENCIA A FALHAS DE BACKEND.
 *
 * As rodadas 1-6 mediram abertura, erro de validacao e layout. A rodada 7
 * tentou medir o "caminho feliz" e esbarrou numa limitacao conhecida do
 * harness isolado: JOINs como `products?select=*,categories(name)` e
 * `orders?select=*,order_items(*)` retornam 400. O efeito colateral e um
 * achado de produto REAL: quando a API falha, as telas ficam silenciosamente
 * vazias — o usuario ve um select sem opcoes e um botao cinza, sem saber
 * se "nao ha dados" ou "o servidor falhou".
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

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'resilience');
const OUT = arg('out', '/home/user/ux-evidence');
// O QueryClient faz 1 retry com backoff; 3s ainda capturava queries em
// `fetching` e produzia resultados instaveis entre execucoes.
const WAIT = Number(arg('wait', '8000'));
const NO_BANNER = process.argv.includes('--no-banner'); // A/B no mesmo build
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { id: 'clientes', route: '/comercial/clientes' },
  { id: 'pedidos-venda', route: '/comercial/pedidos' },
  { id: 'apontamento', route: '/producao/apontamento' },
  { id: 'pedidos-compra', route: '/compras/pedidos' },
  { id: 'recebimento', route: '/wms/recebimento' },
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

const report = { label: LABEL, at: new Date().toISOString(), routes: [] };
for (const t of ROUTES) {
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
    await page.waitForTimeout(WAIT);
    r.httpErrors = calls;
    r.jsErrors = jsErrors;
    r.view = await page.evaluate(() => {
      const main = document.querySelector('#main-content');
      const txt = (main?.innerText || document.body.innerText || '');
      const body = document.body.innerText || '';
      const vis = (x) => { const q = x.getBoundingClientRect(); return q.width > 0 && q.height > 0; };
      const feedback = Array.from(document.querySelectorAll('[role="alert"], .text-destructive, [data-sonner-toast], [data-sonner-toaster], p, span, div'))
        .filter(vis)
        .map((x) => (x.textContent || '').trim())
        .filter((s) => s.length > 12 && s.length < 260)
        .filter((s) => /nao foi possivel|não foi possível|erro ao|falha|indispon|sem conex|tente novamente|tentar novamente|servidor|carregar|recarregar/i.test(s));
      const retry = Array.from(document.querySelectorAll('button, a'))
        .filter(vis)
        .map((b) => ((b.textContent || '').trim() || b.getAttribute('aria-label') || '').trim())
        .filter((s) => /tentar novamente|tente novamente|recarregar|atualizar|recuperar/i.test(s));
      const spinners = Array.from(document.querySelectorAll('.animate-spin, [aria-busy="true"]')).filter(vis).length;
      const loadingText = /^carregando|carregando\.\.\./i.test(txt.trim()) ? 1 : 0;
      return {
        contentLength: txt.trim().length,
        feedback: [...new Set(feedback)].slice(0, 6),
        retryControls: [...new Set(retry)].slice(0, 6),
        technicalLeak: /PGRST|Failed to fetch|HTTP 400|status 400|JWT ausente|Cannot read|undefined is not|SyntaxError|SyntaxError|stack trace|supabaseKey/i.test(body),
        stuckLoading: spinners > 0 || loadingText === 1,
        spinnerCount: spinners,
      };
    });
    r.errorFeedback = r.view.feedback.length > 0;
    r.retryAvailable = r.view.retryControls.length > 0;
    // Uma rota "afetada" e aquela em que alguma consulta de negocio falhou.
    r.affected = r.httpErrors.length > 0;
  } catch (e) {
    r.error = String(e.message).slice(0, 180);
  }
  page.off('response', onRes);
  page.off('pageerror', onErr);
  report.routes.push(r);
}
await browser.close();

fs.writeFileSync(path.join(OUT, `${LABEL}-resilience.json`), JSON.stringify(report, null, 2));

const affected = report.routes.filter((r) => r.affected);
const silent = affected.filter((r) => !r.errorFeedback);
const noRetry = affected.filter((r) => !r.retryAvailable);
const leak = report.routes.filter((r) => r.view?.technicalLeak);
const jsFail = report.routes.filter((r) => r.jsErrors?.length);
const stuck = report.routes.filter((r) => r.view?.stuckLoading);
console.log(`[resilience] ${report.routes.length} rotas | afetadasPor400=${affected.length} | silenciosas=${silent.length} (${silent.map(r=>r.id).join(',')}) | semRetry=${noRetry.length} | vazamentoTecnico=${leak.length} | jsErrors=${jsFail.length} | presasCarregando=${stuck.length}`);
for (const r of report.routes) {
  console.log(`  ${r.id.padEnd(16)} 400=${String(r.httpErrors?.length ?? '-').padEnd(2)} conteudo=${String(r.view?.contentLength ?? '-').padEnd(6)} feedback=${String(r.errorFeedback ?? '-').padEnd(5)} retry=${String(r.retryAvailable ?? '-').padEnd(5)} spinner=${r.view?.spinnerCount ?? '-'} jsErr=${r.jsErrors?.length ?? '-'}${r.error ? ' ERRO:' + r.error.slice(0,40) : ''}`);
  if (r.httpErrors?.length) console.log(`      -> ${r.httpErrors.slice(0, 2).map(c => c.status + ' ' + c.path.slice(0, 90)).join(' | ')}`);
}

if (process.argv.includes('--assert')) {
  const problems = [];
  if (silent.length) problems.push(`falha de backend sem feedback visivel em: ${silent.map(r => r.id).join(', ')}`);
  if (noRetry.length) problems.push(`sem controle de nova tentativa em: ${noRetry.map(r => r.id).join(', ')}`);
  if (leak.length) problems.push(`erro tecnico vazando em: ${leak.map(r => r.id).join(', ')}`);
  if (jsFail.length) problems.push(`excecao JS nao tratada em: ${jsFail.map(r => r.id).join(', ')}`);
  if (stuck.length) problems.push(`tela presa em carregando em: ${stuck.map(r => r.id).join(', ')}`);
  if (!affected.length) problems.push('nenhuma rota afetada: o cenario de falha nao foi reproduzido (medicao vacua)');
  if (problems.length) {
    console.error('UX RESILIENCE ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('UX RESILIENCE ASSERT OK: toda falha de backend tem feedback acionavel, retry e nenhum vazamento tecnico.');
}
