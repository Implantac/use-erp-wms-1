#!/usr/bin/env node
/** QA-UX r16: exercita SOMENTE falha 503 em admin-users. Login e demais
 * consultas continuam no SQL/RLS isolado. Nao fornece lista ou sucesso
 * sinteticos. Confere limite de retry, alerta local e retry manual real.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new URL(BASE).hostname)) throw new Error('Audit permitido apenas no frontend local isolado.');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = arg('out', '/home/user/ux-evidence');
const LABEL = arg('label', 'users-error');
const generated = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(generated)) throw new Error('Ambiente isolado ausente.');
const env = Object.fromEntries(fs.readFileSync(generated, 'utf8').split('\n')
  .filter((line) => line && !line.startsWith('#') && line.includes('='))
  .map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
fs.mkdirSync(OUT, { recursive: true });

const report = { label: LABEL, method: 'falha 503 induzida, nunca sucesso', route: '/admin/usuarios', viewport: { width: 320, height: 640 }, attempts: [], jsErrors: [] };
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: report.viewport, isMobile: true, hasTouch: true, locale: 'pt-BR' });
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    return (u.origin === BASE || u.origin === API) ? route.continue() : route.abort();
  });
  await context.route('**/config.js', (route) => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.__USE_ERP_CONFIG__={SUPABASE_URL:${JSON.stringify(API)},SUPABASE_PUBLISHABLE_KEY:"e2e-isolated-anon-key"};`,
  }));
  await context.route(`${API}/functions/v1/admin-users`, async (route) => {
    const req = route.request();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let action = null;
    try { action = req.postDataJSON()?.action; } catch { /* registrado como invalido no gate */ }
    report.attempts.push({ method: req.method(), action, status: 503 });
    return route.fulfill({ status: 503, headers, contentType: 'application/json', body: JSON.stringify({ message: 'QA16_UNAVAILABLE_DETAIL_503' }) });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.jsErrors.push(String(error.message).slice(0, 180)));
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
  await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 });
  await page.goto(`${BASE}${report.route}`, { waitUntil: 'domcontentloaded' });
  const snapshot = () => page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const panel = main?.querySelector('[data-ux-users-error]');
    const visible = (node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const retry = panel?.querySelector('button');
    const body = main?.innerText || '';
    const retryRect = retry?.getBoundingClientRect();
    const hit = retryRect ? document.elementFromPoint(retryRect.x + retryRect.width / 2, retryRect.y + retryRect.height / 2) : null;
    const bannerRect = document.querySelector('[data-ux-backend-error]')?.getBoundingClientRect();
    return {
      bannerHeight: bannerRect ? Math.round(bannerRect.height) : 0,
      bannerWithinViewport: !bannerRect || (bannerRect.left >= 0 && bannerRect.right <= innerWidth + 2 && bannerRect.top >= 0 && bannerRect.bottom <= innerHeight),
      retryReceivesPointer: !!retry && !!hit && (retry === hit || retry.contains(hit)),
      localAlert: !!panel && visible(panel) && panel.getAttribute('role') === 'alert',
      actionable: /não foi possível carregar os usuários/i.test(panel?.textContent || '') && /administrador/i.test(panel?.textContent || ''),
      retryEnabled: !!retry && !retry.disabled && /tentar novamente/i.test(retry.textContent || ''),
      spinners: Array.from(main?.querySelectorAll('.animate-spin,[aria-busy="true"]') || []).filter(visible).length,
      misleadingEmptyOrCreate: /Nenhum usuário encontrado|Novo Usuário/.test(body),
      technicalLeak: /QA16_UNAVAILABLE_DETAIL_503|PGRST|Failed to fetch|HTTP 503|stack trace/i.test(body),
    };
  });
  // Longo o suficiente para expor remount/retry continuo, nao so o 1o erro.
  await page.waitForTimeout(6000);
  report.initial = await snapshot();
  report.initialAttempts = report.attempts.length;
  await page.waitForTimeout(3000);
  report.idleExtraAttempts = report.attempts.length - report.initialAttempts;
  report.manualRetryClicked = false;
  if (report.initial.retryEnabled) {
    const before = report.attempts.length;
    await page.locator('[data-ux-users-error]').getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    report.manualRetryClicked = true;
    await page.waitForTimeout(3000);
    report.manualRetryAttempts = report.attempts.length - before;
    report.afterRetry = await snapshot();
    const settled = report.attempts.length;
    await page.waitForTimeout(2000);
    report.afterRetryIdleExtraAttempts = report.attempts.length - settled;
  }
} catch (error) {
  report.error = String(error?.message || error).slice(0, 1800);
} finally {
  await browser.close();
}

const problems = [];
if (report.error) problems.push(`execucao: ${report.error}`);
if (report.initialAttempts !== 2) problems.push(`tentativas iniciais ${report.initialAttempts ?? 'ausente'} != 2 (inicial + 1 retry)`);
if (report.idleExtraAttempts !== 0) problems.push(`novas tentativas sem acao do usuario: ${report.idleExtraAttempts ?? 'ausente'}`);
if (!report.manualRetryClicked || report.manualRetryAttempts !== 2 || report.afterRetryIdleExtraAttempts !== 0) problems.push('retry manual ausente ou nao limitado a mais duas tentativas');
for (const [name, view] of [['inicial', report.initial], ['apos retry', report.afterRetry]]) {
  if (!view?.localAlert || !view?.actionable || !view?.retryEnabled) problems.push(`${name}: falta alerta local acionavel / retry habilitado`);
  if (view?.spinners) problems.push(`${name}: spinner persistente`);
  if (view?.bannerWithinViewport !== true || view?.retryReceivesPointer !== true) problems.push(`${name}: banner fora da tela ou retry encoberto`);
  if (view?.technicalLeak || view?.misleadingEmptyOrCreate) problems.push(`${name}: erro tecnico ou vazio/acao de criacao enganosa`);
}
if (report.jsErrors.length) problems.push('excecao JS nao tratada');
if (report.attempts.some((a) => a.method !== 'POST' || a.action !== 'list' || a.status !== 503)) problems.push('acao inesperada ou cenario de falha invalido');
report.problems = problems;
fs.writeFileSync(path.join(OUT, `${LABEL}-users-error.json`), JSON.stringify(report, null, 2));
console.log(`[users-error] 503 induzido | tentativasIniciais=${report.initialAttempts ?? '-'} | extrasSemAcao=${report.idleExtraAttempts ?? '-'} | retryManual=${report.manualRetryAttempts ?? '-'} | extrasAposRetry=${report.afterRetryIdleExtraAttempts ?? '-'} | alerta=${report.initial?.localAlert ?? false} | bannerAltura=${report.initial?.bannerHeight ?? '-'} | retryClicavel=${report.initial?.retryReceivesPointer ?? false} | spinner=${report.initial?.spinners ?? '-'} | jsErrors=${report.jsErrors.length}`);
if (process.argv.includes('--assert')) {
  if (problems.length) { console.error('UX USERS ERROR ASSERT FALHOU:\n  - ' + problems.join('\n  - ')); process.exit(1); }
  console.log('UX USERS ERROR ASSERT OK: falha explicita, 2 tentativas por ciclo, nenhuma repeticao sem acao, retry manual real e nenhum sucesso sintetico.');
}
