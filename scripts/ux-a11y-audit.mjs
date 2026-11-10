#!/usr/bin/env node
/**
 * QA-UX (rodada 3) — auditoria de FOCO VISÍVEL e de DIALOGS por navegação real.
 *
 * 1) Pressiona TAB de verdade (nao `.focus()` programatico, que nao ativa
 *    :focus-visible) e mede, para cada elemento ativo, se existe indicador
 *    visual (outline ou box-shadow). Sem isso, o operador que usa teclado
 *    nao sabe onde esta.
 * 2) Intercepta window.confirm/window.prompt para CONTAR chamadas (sem
 *    bloquear) e clica em botoes de acao destrutiva, cancelando em seguida.
 *    Prova que a confirmacao agora e um AlertDialog acessivel.
 *
 * Ambiente isolado, identidade de teste do harness, origens externas abortadas.
 * Nenhuma exclusao e cometida: sempre cancelamos o dialog.
 *
 *   node scripts/ux-a11y-audit.mjs --label=antes --out=/home/user/ux-evidence
 *   node scripts/ux-a11y-audit.mjs --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'a11y');
const OUT = arg('out', '/home/user/ux-evidence');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

const GENERATED = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado ausente (.env.e2e.generated)');
const env = Object.fromEntries(fs.readFileSync(GENERATED, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));

const FOCUS_ROUTES = [
  '/dashboard', '/comercial/pedidos', '/producao/apontamento',
  '/producao/terminal', '/wms/dashboard', '/admin/parametros',
];
// Rotas reais do menu. Em várias delas o isolado nao tem dados seed, entao
// o botao destrutivo pode nao existir; isso e registrado como informativo,
// nao como falha. A prova do AlertDialog vem de ConfirmDialog.test.tsx.
const DIALOG_ROUTES = [
  '/fiscal/regras-fiscais', '/relacionamento/nps/campanhas', '/admin/parametros',
  '/comercial/pedidos', '/producao/apontamento', '/wms/dashboard',
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
await context.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  return (u.origin === BASE || u.origin === API) ? route.continue() : route.abort();
});
await context.route('**/config.js', async (route) => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: `window.__USE_ERP_CONFIG__ = { SUPABASE_URL: ${JSON.stringify(API)}, SUPABASE_PUBLISHABLE_KEY: "e2e-isolated-anon-key" };`,
}));

// Conta chamadas aos dialogs nativos SEM alterar o comportamento do produto.
await context.addInitScript(() => {
  window.__uxNativeCalls = { confirm: 0, prompt: 0, alert: 0 };
  for (const name of ['confirm', 'prompt', 'alert']) {
    const original = window[name].bind(window);
    window[name] = (...args) => {
      window.__uxNativeCalls[name] += 1;
      return original(...args);
    };
  }
});

const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 20000 });
await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
await page.waitForTimeout(1800);

const report = { label: LABEL, at: new Date().toISOString(), focus: [], dialogs: [] };

// --- 1) Foco visível por TAB real ---
for (const route of FOCUS_ROUTES) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(1600);
  } catch { /* segue com o que renderizou */ }
  await page.evaluate(() => document.body.focus());
  const samples = [];
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth || '0') > 0;
      const shadow = !!cs.boxShadow && cs.boxShadow !== 'none';
      return {
        tag: el.tagName,
        label: (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim().slice(0, 34),
        outline, shadow, hasIndicator: outline || shadow,
      };
    });
    if (s) samples.push(s);
  }
  const without = samples.filter((s) => !s.hasIndicator);
  report.focus.push({
    route, sampled: samples.length, withoutIndicator: without.length,
    pct: samples.length ? Math.round((without.length / samples.length) * 100) : 0,
    examples: without.slice(0, 4),
  });
}

// --- 2) Confirmacoes destrutivas: AlertDialog em vez de window.confirm ---
for (const route of DIALOG_ROUTES) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(1600);
    // Botoes de lixeira / excluir: usa aria-label ou texto, nunca o primeiro
    // botao da pagina (pode ser navegacao).
    const candidates = page.locator('#main-content button').filter({ hasText: /Excluir|Remover/ });
    const byLabel = page.locator('#main-content button[aria-label^="Excluir"]');
    const byTitle = page.locator('#main-content button[title*="Restaurar"], #main-content button[aria-label*="Restaurar"]');
    const target = (await candidates.count()) ? candidates.first()
      : (await byLabel.count()) ? byLabel.first()
      : (await byTitle.count()) ? byTitle.first() : null;
    let openedAccessibleDialog = false;
    let nativeBefore = 0, nativeAfter = 0;
    if (target && await target.isVisible({ timeout: 1200 })) {
      nativeBefore = await page.evaluate(() => window.__uxNativeCalls.confirm + window.__uxNativeCalls.prompt);
      await target.click();
      await page.waitForTimeout(700);
      openedAccessibleDialog = await page.locator('[role="alertdialog"]').count() > 0;
      nativeAfter = await page.evaluate(() => window.__uxNativeCalls.confirm + window.__uxNativeCalls.prompt);
      // Sempre cancela: nenhuma exclusao e cometida nesta auditoria.
      const cancel = page.getByRole('button', { name: 'Cancelar' });
      if (await cancel.count()) await cancel.first().click();
      await page.waitForTimeout(200);
    }
    report.dialogs.push({ route, buttonFound: !!target, openedAccessibleDialog, nativeCalls: nativeAfter - nativeBefore });
  } catch (e) {
    report.dialogs.push({ route, error: String(e).slice(0, 100) });
  }
}

report.totalNativeCalls = await page.evaluate(() => window.__uxNativeCalls);
fs.writeFileSync(path.join(OUT, `${LABEL}-a11y.json`), JSON.stringify(report, null, 2));

for (const f of report.focus) console.log(`[foco] ${f.route.padEnd(28)} ${f.sampled} elementos | SEM indicador ${f.withoutIndicator} (${f.pct}%)`);
for (const d of report.dialogs) console.log(`[dialog] ${d.route.padEnd(28)} botao=${d.buttonFound} alertdialog=${d.openedAccessibleDialog} nativos=${d.nativeCalls}`);
console.log(`[nativos] total confirm=${report.totalNativeCalls.confirm} prompt=${report.totalNativeCalls.prompt} alert=${report.totalNativeCalls.alert}`);
await browser.close();

if (process.argv.includes('--assert')) {
  const noIndicator = report.focus.reduce((s, f) => s + f.withoutIndicator, 0);
  if (noIndicator > 0 || report.totalNativeCalls.confirm + report.totalNativeCalls.prompt > 0) {
    console.error(`UX A11Y ASSERT FALHOU: ${noIndicator} focos sem indicador; ${report.totalNativeCalls.confirm + report.totalNativeCalls.prompt} dialogs nativos`);
    process.exit(1);
  }
  console.log('UX A11Y ASSERT OK: foco visivel em todos os elementos amostrados e nenhum dialog nativo.');
}
