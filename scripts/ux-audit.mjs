#!/usr/bin/env node
/**
 * Auditoria de UX "como usuario" — QA-UX (10/11/2026).
 *
 * Navega num FRONTEND LOCAL com Chromium de verdade, SEM backend externo:
 *  - o /config.js de producao e substituido em voo por um apontamento inert;
 *  - TODA origem externa e abortada (nunca fala com Supabase/Lovable reais);
 *  - nenhuma credencial real e usada (apenas valores de teste obviamente invalidos).
 *
 * Nao faz login autenticado, nao usa dados de cliente e nao publica nada.
 * Serve para medir o ANTES e o DEPOIS das melhorias de experiencia.
 *
 *   node scripts/ux-audit.mjs --label=antes --out=/home/user/ux-evidence
 *
 * Requer um servidor Vite em E2E_BASE_URL (padrao http://127.0.0.1:4179).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const LABEL = arg('label', 'auditoria');
const OUT = arg('out', '/home/user/ux-evidence');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' });

// Bloqueio geral: so a origem local e permitida.
await context.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.origin === BASE) return route.continue();
  return route.abort();
});
// Registrado DEPOIS => tem precedencia: neutraliza o config.js publicado.
await context.route('**/config.js', async (route) => route.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: 'window.__USE_ERP_CONFIG__ = { SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_PUBLISHABLE_KEY: "offline-test-key" };',
}));

const page = await context.newPage();
const consoleErrors = [];
const failedRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on('requestfailed', (r) => failedRequests.push(new URL(r.url()).host));

const t0 = Date.now();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 20000 });
const interactiveMs = Date.now() - t0;

// 1) O usuario consegue VER o formulario se a animacao CSS nao rodar?
await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
const visual = await page.evaluate(() => {
  // Aceita tanto a implementação antiga (opacity/animation inline) quanto a
  // nova (classes CSS), para que ANTES e DEPOIS sejam comparáveis.
  const probe = (...selectors) => {
    const el = selectors.map((s) => document.querySelector(s)).find(Boolean);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { opacity: Number(cs.opacity), visible: cs.visibility, w: Math.round(r.width), h: Math.round(r.height) };
  };
  return {
    card: probe('.login-card-anim', '[style*="login-card-rise"]'),
    container: probe('.login-entrance', '[style*="login-slide-up"]'),
    title: probe('h1'),
    emailInput: probe('#email'),
  };
});

// 2) Teclado: onde o foco COMECA e para onde vai o primeiro TAB? (S005)
const initialFocus = await page.evaluate(() => ({
  id: document.activeElement?.id || '',
  tag: document.activeElement?.tagName || '',
}));
await page.keyboard.press('Tab');
const firstTab = await page.evaluate(() => ({
  id: document.activeElement?.id || '',
  tag: document.activeElement?.tagName || '',
  text: (document.activeElement?.textContent || '').trim().slice(0, 40),
}));
const tabOrder = [];
for (let i = 0; i < 8; i++) {
  tabOrder.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 24) || '?'));
  await page.keyboard.press('Tab');
}

// 3) Atributos de acessibilidade e gestor de senhas.
const attrs = await page.evaluate(() => {
  const g = (id) => {
    const el = document.getElementById(id);
    return el ? {
      autocomplete: el.getAttribute('autocomplete'),
      required: el.hasAttribute('required'),
      ariaInvalid: el.getAttribute('aria-invalid'),
      ariaDescribedby: el.getAttribute('aria-describedby'),
      type: el.getAttribute('type'),
    } : null;
  };
  return {
    email: g('email'), password: g('password'),
    liveRegions: document.querySelectorAll('[aria-live], [role="alert"]').length,
    activeElementAfterTabLoop: document.activeElement?.id || '',
  };
});

// 4) Submeter vazio: o usuario sabe QUAL campo corrigir?
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email');
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForTimeout(600);
const emptySubmit = await page.evaluate(() => ({
  focusedAfterError: document.activeElement?.id || document.activeElement?.tagName || '',
  invalidFields: document.querySelectorAll('[aria-invalid="true"]').length,
  inlineErrors: document.querySelectorAll('[role="alert"], [aria-live="polite"], [aria-live="assertive"]').length,
  visibleText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
}));

// 5) Credencial invalida: quanto tempo ate o feedback e o que diz?
await page.locator('#email').fill('usuario.invalido@teste.local');
await page.locator('#password').fill('senha-invalida-123');
const tErr = Date.now();
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
let errorText = '';
try {
  await page.waitForFunction(() => /erro|inválid|falha|não foi|indispon|fetch|network|conexão|servidor|internet|incorretos|tente novamente/i.test(document.body.innerText), { timeout: 8000 });
  errorText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 500);
} catch { errorText = '(nenhum feedback textual detectado em 8s)'; }
const feedbackMs = Date.now() - tErr;

await page.screenshot({ path: path.join(OUT, `${LABEL}-login-desktop.png`), fullPage: true });

// 6) Chao de fabrica: 375x667.
await page.setViewportSize({ width: 375, height: 667 });
await page.waitForTimeout(300);
const mobile = await page.evaluate(() => ({
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  buttonVisible: !!document.querySelector('button[type="submit"]')?.getBoundingClientRect().height,
}));
await page.screenshot({ path: path.join(OUT, `${LABEL}-login-mobile.png`), fullPage: true });

// 7) Usuario com preferencia de movimento reduzido: a tela continua visivel?
const reducedContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR', reducedMotion: 'reduce' });
await reducedContext.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.origin === BASE) return route.continue();
  return route.abort();
});
await reducedContext.route('**/config.js', async (route) => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: 'window.__USE_ERP_CONFIG__ = { SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_PUBLISHABLE_KEY: "offline-test-key" };',
}));
const reducedPage = await reducedContext.newPage();
await reducedPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await reducedPage.waitForSelector('#email', { timeout: 20000 });
const reducedMotionVisual = await reducedPage.evaluate(() => {
  const probe = (sel) => {
    const el = document.querySelector(sel);
    return el ? Number(getComputedStyle(el).opacity) : null;
  };
  return {
    container: probe('.login-entrance'), title: probe('h1'),
    card: probe('.login-card-anim'), emailInput: probe('#email'),
  };
});
await reducedContext.close();

const metrics = {
  label: LABEL, base: BASE, at: new Date().toISOString(),
  interactiveMs, visual, initialFocus, firstTab, tabOrder, attrs, emptySubmit,
  feedbackMs, errorText, mobile, reducedMotionVisual,
  consoleErrors: consoleErrors.slice(0, 12),
  failedRequestHosts: [...new Set(failedRequests)].slice(0, 12),
};
fs.writeFileSync(path.join(OUT, `${LABEL}-metrics.json`), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
