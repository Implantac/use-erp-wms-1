#!/usr/bin/env node
/**
 * QA-UX (rodada 11) — NOME ACESSIVEL vs. ROTULO VISIVEL (UX9-04/UX10-03).
 *
 * O `ux:task` (r6) considera QUALQUER `aria-label` como "nomeado". Isso
 * deixou passar um defeito real: o campo CEP tem `<Label>CEP *</Label>`
 * solto e `<Input placeholder="00000-000" />`. A r4 deriva `aria-label`
 * do placeholder e a r6 (`labelledRef`) nao sobrescreve nomes existentes.
 * Resultado: o leitor de tela anuncia "00000-000" em vez de "CEP".
 *
 * Este audit percorre TODAS as abas dos 5 dialogos de negocio e compara
 * o nome acessivel de cada campo com o rotulo visivel associavel.
 *
 *   npm run ux:names -- --label=antes
 *   npm run ux:names -- --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'names');
const OUT = arg('out', '/home/user/ux-evidence');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

const TASKS = [
  { id: 'novo-cliente', route: '/comercial/clientes', open: 'Novo Cliente' },
  { id: 'novo-pedido-venda', route: '/comercial/pedidos', open: 'Novo Pedido' },
  { id: 'novo-apontamento', route: '/producao/apontamento', open: 'Novo Apontamento' },
  { id: 'novo-pedido-compra', route: '/compras/pedidos', open: 'Novo Pedido' },
  { id: 'recebimento-fibra', route: '/wms/recebimento', open: 'Receber pluma/fibra' },
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

/** Coleta campos de QUALQUER aba do dialogo. */
async function inspectDialog() {
  return page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return null;
    const vis = (x) => {
      const q = x.getBoundingClientRect(), s = getComputedStyle(x);
      return q.width > 0 && q.height > 0 && s.visibility !== 'hidden';
    };
    const norm = (s) => String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    // Mesma heuristic a de `labelledRef.findVisibleLabel` (rodada 11):
    // sobe ate 2 niveis porque varios campos ficam dentro de um wrapper
    // (CEP + botao de busca), com o <Label> irmao do wrapper, nao do input.
    const CONTROL = 'input,select,textarea,[role="combobox"],[role="textbox"]';
    const txt = (el) => (el?.textContent || '').trim();
    const visibleLabel = (f) => {
      if (f.id) {
        const forLabel = d.querySelector(`label[for="${CSS.escape(f.id)}"]`);
        if (txt(forLabel)) return txt(forLabel);
      }
      const wrapped = txt(f.closest('label'));
      if (wrapped) return wrapped;
      let current = f;
      for (let depth = 0; depth <= 2 && current; depth++) {
        let sib = current.previousElementSibling;
        while (sib) {
          if (sib.matches(CONTROL)) break;
          if (sib.tagName === 'LABEL' && txt(sib)) return txt(sib);
          sib = sib.previousElementSibling;
        }
        const parent = current.parentElement;
        if (parent) {
          const labels = Array.from(parent.children).filter((c) => c.tagName === 'LABEL');
          const controls = Array.from(parent.children).filter((c) => c.matches(CONTROL));
          if (labels.length === 1 && controls.length <= 1 && txt(labels[0])) return txt(labels[0]);
        }
        current = parent;
        if (current?.getAttribute('role') === 'dialog') break;
      }
      return '';
    };
    return Array.from(d.querySelectorAll('input:not([type=hidden]),select,textarea'))
      .filter(vis)
      .map((f) => {
        const ariaLabel = f.getAttribute('aria-label');
        const placeholder = f.getAttribute('placeholder');
        const vLabel = visibleLabel(f);
        const ariaLabelledBy = f.getAttribute('aria-labelledby');
        const id = f.id || '';
        const named = !!(ariaLabel || ariaLabelledBy || (id && d.querySelector(`label[for="${CSS.escape(id)}"]`)) || f.closest('label'));
        const mismatch = !!(ariaLabel && vLabel && norm(ariaLabel) !== norm(vLabel));
        return {
          tag: f.tagName, type: f.getAttribute('type') || '',
          ariaLabel, placeholder, visibleLabel: vLabel || null,
          id, ariaLabelledBy,
          labelSource: f.getAttribute('data-ux-label-source') || null,
          named, mismatch,
          placeholderAsName: !!(ariaLabel && placeholder && ariaLabel === placeholder && vLabel),
        };
      });
  });
}

const report = { label: LABEL, at: new Date().toISOString(), tasks: [] };
for (const t of TASKS) {
  const r = { id: t.id, route: t.route, tabs: [] };
  try {
    await page.goto(`${BASE}${t.route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const x = (document.querySelector('#main-content')?.innerText || '').trim();
      return x.length > 250 && !/^Início\s+\S+\s*Carregando/.test(x);
    }, { timeout: 7000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: t.open, exact: false }).first().click({ timeout: 9000 });
    await page.waitForSelector('[role="dialog"]', { timeout: 9000 });
    await page.waitForTimeout(500);

    const tabNames = await page.locator('[role="dialog"] [role="tab"]').allTextContents();
    const tabs = tabNames.length ? tabNames.map((s) => s.trim()).filter(Boolean) : ['(sem abas)'];
    for (const tab of tabs) {
      if (tab !== '(sem abas)') {
        await page.locator('[role="dialog"] [role="tab"]', { hasText: tab }).first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
      const fields = await inspectDialog();
      r.tabs.push({ tab, fields: fields || [] });
    }
  } catch (e) {
    r.error = String(e.message).slice(0, 180);
  }
  report.tasks.push(r);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}
await browser.close();
fs.writeFileSync(path.join(OUT, `${LABEL}-names.json`), JSON.stringify(report, null, 2));

const all = report.tasks.flatMap((r) => r.tabs.flatMap((t) => t.fields.map((f) => ({ ...f, task: r.id, tab: t.tab }))));
const mismatches = all.filter((f) => f.mismatch);
const placeholders = all.filter((f) => f.placeholderAsName);
const unnamed = all.filter((f) => !f.named);
console.log(`[names] ${report.tasks.length} jornadas | campos=${all.length} | semNome=${unnamed.length} | nomeDivergente=${mismatches.length} | placeholderComoNome=${placeholders.length}`);
for (const f of mismatches.slice(0, 15)) {
  console.log(`  ${f.task}/${f.tab}: aria-label="${f.ariaLabel}" mas rotulo visivel="${f.visibleLabel}" (placeholder="${f.placeholder || ''}")`);
}
if (report.tasks.some((r) => r.error)) console.log('  erros:', report.tasks.filter((r) => r.error).map((r) => `${r.id}: ${r.error}`).join(' | '));

if (process.argv.includes('--assert')) {
  const problems = [];
  if (!all.length) problems.push('medicao vazia: nenhum campo inspecionado');
  if (unnamed.length) problems.push(`${unnamed.length} campos sem nome acessivel`);
  if (mismatches.length) problems.push(`${mismatches.length} campos com nome acessivel divergente do rotulo visivel`);
  if (placeholders.length) problems.push(`${placeholders.length} campos usando placeholder como nome apesar de haver rotulo visivel`);
  if (problems.length) {
    console.error('UX NAMES ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('UX NAMES ASSERT OK: todo campo e anunciado pelo rotulo visivel em todas as abas, sem placeholder como nome.');
}
