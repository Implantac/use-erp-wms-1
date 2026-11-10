#!/usr/bin/env node
/**
 * QA-UX (2a rodada) — mede a experiência de LANÇAMENTO por teclado (S005).
 *
 * A planilha "Solicitações para a USE" pede explicitamente:
 *   S005 "Verificar lançamento com TAB (facilitador)".
 *
 * Este script loga no AMBIENTE ISOLADO, abre formulários operacionais e mede:
 *  - labels associadas (label[for] x input[id]);
 *  - autoComplete / required / aria-invalid;
 *  - ordem real dos primeiros TABs;
 *  - se Enter em um campo de texto submete o formulário (armadilha clássica
 *    de ERP: o operador digita, dá Enter e perde o rascunho).
 *
 * Sem produção, sem dados de cliente, sem segredos. Uso:
 *   node scripts/ux-forms-audit.mjs --label=antes --out=/home/user/ux-evidence
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'forms');
const OUT = arg('out', '/home/user/ux-evidence');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

const GENERATED = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado ausente');
const env = Object.fromEntries(fs.readFileSync(GENERATED, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));

const FORM_ROUTES = [
  { name: 'apontamento', path: '/producao/apontamento' },
  { name: 'terminal', path: '/producao/terminal' },
  { name: 'ordens-producao', path: '/producao/ordens' },
  { name: 'pedidos-venda', path: '/comercial/pedidos' },
  { name: 'pedidos-compra', path: '/compras/pedidos' },
  { name: 'recebimento', path: '/wms/recebimento' },
  { name: 'admin-usuarios', path: '/admin/usuarios' },
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

const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 20000 });
await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
await page.waitForTimeout(2000);

const result = { label: LABEL, at: new Date().toISOString(), forms: [] };
for (const r of FORM_ROUTES) {
  const t = Date.now();
  try {
    await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(2600); // lazy chunks + consultas ao isolado
  } catch { /* segue com o que renderizou */ }

  // O lançamento real acontece dentro de um dialog aberto por "Novo ...".
  // Medir só a lista não representaria o trabalho do operador (S005).
  let dialogOpen = false;
  try {
    const trigger = page.locator('#main-content button')
      .filter({ hasText: /^(Novo|Receber|Cadastrar|Adicionar|Registrar|Lançar)/i }).first();
    if (await trigger.count() && await trigger.isVisible({ timeout: 1200 })) {
      await trigger.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 3000 });
      dialogOpen = true;
      await page.waitForTimeout(500);
    }
  } catch { /* rota sem dialog de cadastro */ }

  const metrics = await page.evaluate(() => {
    const main = document.querySelector('[role="dialog"]') || document.querySelector('#main-content') || document.body;
    const fields = Array.from(main.querySelectorAll('input, select, textarea'));
    const labels = Array.from(main.querySelectorAll('label'));
    const labelWithFor = labels.filter((l) => l.getAttribute('for'));
    const fieldsWithId = fields.filter((f) => f.id && !/^radix|^:/.test(f.id));
    const validPairs = labelWithFor.filter((l) => document.getElementById(l.getAttribute('for')));
    return {
      fields: fields.length,
      labels: labels.length,
      labelsWithFor: labelWithFor.length,
      validLabelPairs: validPairs.length,
      fieldsWithId: fieldsWithId.length,
      withAutocomplete: main.querySelectorAll('[autocomplete]').length,
      withRequired: main.querySelectorAll('[required]').length,
      withAriaInvalid: main.querySelectorAll('[aria-invalid]').length,
      forms: main.querySelectorAll('form').length,
      text: (main.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
    };
  });
  metrics.dialogOpen = dialogOpen;

  // Ordem real de TAB a partir do primeiro campo do formulário aberto.
  const tabOrder = [];
  const scope = dialogOpen ? '[role="dialog"]' : '#main-content';
  try {
    const first = page.locator(`${scope} input, ${scope} select, ${scope} textarea, ${scope} button`).first();
    if (await first.count()) {
      await first.focus();
      for (let i = 0; i < 8; i++) {
        tabOrder.push(await page.evaluate(() => {
          const el = document.activeElement;
          return el ? (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.id || el.textContent?.trim().slice(0, 22) || el.tagName) : '?';
        }));
        await page.keyboard.press('Tab');
      }
    }
  } catch { /* sem campos */ }

  // Prova do facilitador S005: ENTER deve mover o foco ao proximo campo.
  let enterMovesFocus = null;
  if (dialogOpen) {
    try {
      const inputs = page.locator('[role="dialog"] input:not([type="hidden"])');
      if (await inputs.count() >= 2) {
        await inputs.first().focus();
        const before = await page.evaluate(() => document.activeElement?.getAttribute('placeholder') || document.activeElement?.id || document.activeElement?.tagName);
        await page.keyboard.press('Enter');
        const after = await page.evaluate(() => document.activeElement?.getAttribute('placeholder') || document.activeElement?.id || document.activeElement?.tagName);
        enterMovesFocus = { before, after, moved: !!before && before !== after };
      }
    } catch { /* dialog sem campos suficientes */ }
  }

  result.forms.push({ name: r.name, path: r.path, ms: Date.now() - t, ...metrics, tabOrder, enterMovesFocus });
}

fs.writeFileSync(path.join(OUT, `${LABEL}-forms.json`), JSON.stringify(result, null, 2));
for (const f of result.forms) {
  console.log(`[forms] ${f.name.padEnd(18)} dialog=${f.dialogOpen ? 'sim' : 'nao'} campos=${String(f.fields).padEnd(3)} labels=${String(f.labels).padEnd(3)} paresValidos=${String(f.validLabelPairs).padEnd(3)} autoComplete=${f.withAutocomplete} required=${f.withRequired} | ${f.text.slice(0, 70)}`);
}
await browser.close();
