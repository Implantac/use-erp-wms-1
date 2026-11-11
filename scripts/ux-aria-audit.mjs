#!/usr/bin/env node
/**
 * QA-UX (rodada 12) — ARVORE DE ACESSIBILIDADE, NAO ATRIBUTOS DO DOM.
 *
 * A r11 mediu `aria-label` diretamente no DOM. Isso prova o contrato, mas
 * nao prova o que o Chromium REALMENTE expoe a um leitor de tela. Aqui
 * usamos `locator.ariaSnapshot()` (Playwright/CDP Accessibility Tree), que
 * e a mesma arvore consumida por NVDA/VoiceOver — NAO e uma escuta real
 * desses leitores.
 *
 * Mede nos 5 dialogos de negocio, em TODAS as abas:
 *  - nome de cada campo NA ARVORE (papel + nome), nao o atributo DOM;
 *  - campo cujo nome e o proprio `placeholder` (regressao UX9-04);
 *  - campo sem nome, botao sem nome, dialogo sem nome;
 *  - `alert` (r7) e `status` (r8) na arvore global.
 *
 * O `placeholder` e lido no DOM apenas para CLASSIFICAR o nome que veio da
 * arvore: quando o placeholder e promovido a nome, o Playwright deixa de
 * emitir a linha `/placeholder:`, entao compara-la com o YAML seria falso
 * verde. A origem do nome continua sendo a arvore de acessibilidade.
 *
 *   npm run ux:aria -- --label=antes
 *   npm run ux:aria -- --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'aria');
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
/** Union de nos DOM que produzem papeis de campo. `input` cobre textbox
 * implicito; `[role=...]` cobre os componentes Radix (ex.: button[combobox]). */
const FIELD_SELECTOR = [
  '[role="dialog"] input:not([type="hidden"])',
  '[role="dialog"] textarea',
  '[role="dialog"] select',
  '[role="dialog"] [role="combobox"]',
  '[role="dialog"] [role="textbox"]',
  '[role="dialog"] [role="spinbutton"]',
  '[role="dialog"] [role="slider"]',
  '[role="dialog"] [role="checkbox"]',
  '[role="dialog"] [role="radio"]',
  '[role="dialog"] [role="searchbox"]',
].join(',');
const NODE_ROLES = 'textbox|combobox|spinbutton|checkbox|radio|slider|searchbox';

const GENERATED = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado ausente (.env.e2e.generated)');
const env = Object.fromEntries(fs.readFileSync(GENERATED, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));

/** O Playwright entre-aspas o escalar quando o nome contem caracteres YAML:
 *  `- 'textbox "Ex: Sul, Sudeste..."'`. Sem normalizar, o parser perde o no. */
function unquote(line) {
  const m = /^(\s*-\s*)'(.*)'\s*$/.exec(line);
  return m ? `${m[1]}${m[2].replace(/''/g, "'")}` : line;
}

/** Primeira linha do snapshot de UM no: papel + nome (com ou sem dois-pontos). */
function nodeName(yaml) {
  const re = new RegExp(`^\\s*(?:-\\s*)?(${NODE_ROLES})\\s*(?:"([^"]*)")?\\s*:?`);
  const m = re.exec(unquote(String(yaml || '').split('\n')[0] || ''));
  if (!m) return { role: null, name: null };
  return { role: m[1], name: m[2] || null };
}

/** Papeis/nomes do YAML COMPLETO do dialogo/body. Dois-pontos opcional. */
function parseStructure(yaml) {
  const lines = String(yaml || '').split('\n').map(unquote);
  const buttons = [], dialogs = [], live = [];
  for (const line of lines) {
    const bm = /^\s*-\s+button\s*(?:"([^"]*)")?\s*:?/.exec(line);
    if (bm) { buttons.push({ name: bm[1] || null }); continue; }
    const dm = /^\s*-\s+dialog\s*(?:"([^"]*)")?\s*:?/.exec(line);
    if (dm) { dialogs.push({ name: dm[1] || null }); continue; }
    const lm = /^\s*-\s+(alert|status)\s*:/.exec(line);
    if (lm) live.push(lm[1]);
  }
  return { buttons, dialogs, live };
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
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 25000 });
await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 });
await page.waitForTimeout(1500);

const report = { label: LABEL, at: new Date().toISOString(), tasks: [] };
for (const t of TASKS) {
  const r = { id: t.id, route: t.route, tabs: [], globalDialogs: [], globalLive: [] };
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

    const names = await page.locator('[role="dialog"] [role="tab"]').allTextContents();
    const tabs = names.length ? names.map((s) => s.trim()).filter(Boolean) : ['(sem abas)'];
    for (const tab of tabs) {
      if (tab !== '(sem abas)') {
        await page.locator('[role="dialog"] [role="tab"]', { hasText: tab }).first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
      const dialogYaml = await page.locator('[role="dialog"]').ariaSnapshot().catch(() => '');
      const structure = parseStructure(dialogYaml);
      const fields = [];
      const count = await page.locator(FIELD_SELECTOR).count();
      for (let i = 0; i < count; i++) {
        const loc = page.locator(FIELD_SELECTOR).nth(i);
        if (!(await loc.isVisible().catch(() => false))) continue;
        const yaml = await loc.ariaSnapshot().catch(() => '');
        const { role, name } = nodeName(yaml);
        const dom = await loc.evaluate((el) => ({
          placeholder: el.getAttribute('placeholder'),
          ariaLabel: el.getAttribute('aria-label'),
          tag: el.tagName,
          explicitRole: el.getAttribute('role'),
        })).catch(() => ({ placeholder: null, ariaLabel: null, tag: null, explicitRole: null }));
        fields.push({ role, name, placeholder: dom.placeholder, domAriaLabel: dom.ariaLabel, tag: dom.tag, yaml });
      }
      r.tabs.push({ tab, yaml: dialogYaml, parsed: { fields, buttons: structure.buttons } });
    }
    // Arvore global: papeis vivos das rodadas 7/8 e nome do dialogo.
    const body = parseStructure(await page.locator('body').ariaSnapshot().catch(() => ''));
    r.globalDialogs = body.dialogs;
    r.globalLive = body.live;
  } catch (e) {
    r.error = String(e.message).slice(0, 180);
  }
  report.tasks.push(r);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}
await browser.close();
fs.writeFileSync(path.join(OUT, `${LABEL}-aria.json`), JSON.stringify(report, null, 2));

const allFields = report.tasks.flatMap((r) => r.tabs.flatMap((t) => t.parsed.fields.map((f) => ({ ...f, task: r.id, tab: t.tab }))));
const allButtons = report.tasks.flatMap((r) => r.tabs.flatMap((t) => t.parsed.buttons.map((b) => ({ ...b, task: r.id, tab: t.tab }))));
const unnamedFields = allFields.filter((f) => !f.name);
const placeholderNamed = allFields.filter((f) => f.name && f.placeholder && f.name === f.placeholder);
// Nome da arvore deve ser fiel ao aria-label que o componente entregou (r11).
const treeMismatch = allFields.filter((f) => f.domAriaLabel && f.name !== f.domAriaLabel);
const unnamedButtons = allButtons.filter((b) => !b.name);
const globalDialogs = report.tasks.flatMap((r) => r.globalDialogs || []);
const unnamedDialogs = globalDialogs.filter((d) => !d.name);
const liveRoles = [...new Set(report.tasks.flatMap((r) => r.globalLive || []))];
const taskErrors = report.tasks.filter((r) => r.error);

console.log(`[aria] ${report.tasks.length} jornadas | campos=${allFields.length} semNome=${unnamedFields.length} nome=placeholder=${placeholderNamed.length} arvore!=DOM=${treeMismatch.length} | botoes=${allButtons.length} semNome=${unnamedButtons.length} | dialogos=${globalDialogs.length} semNome=${unnamedDialogs.length} | papeisVivos=[${liveRoles.join(',')}] | erros=${taskErrors.length}`);
for (const f of unnamedFields.slice(0, 10)) console.log(`  SEM NOME: ${f.task}/${f.tab} ${f.role || f.tag}`);
for (const f of placeholderNamed.slice(0, 10)) console.log(`  NOME=PLACEHOLDER: ${f.task}/${f.tab} "${f.name}"`);
for (const f of treeMismatch.slice(0, 10)) console.log(`  ARVORE!=DOM: ${f.task}/${f.tab} arvore="${f.name}" dom="${f.domAriaLabel}"`);
for (const b of unnamedButtons.slice(0, 10)) console.log(`  BOTAO SEM NOME: ${b.task}/${b.tab}`);
if (taskErrors.length) console.log('  erros:', taskErrors.map((r) => `${r.id}: ${r.error}`).join(' | '));

if (process.argv.includes('--assert')) {
  const problems = [];
  // Validadores de cenario: impedem verde por HMR/falha de abertura de dialogo.
  if (taskErrors.length) problems.push(`${taskErrors.length} jornadas nao medidas`);
  if (allFields.length < 35) problems.push(`cenario incompleto: so ${allFields.length} campos na arvore (esperado >=35)`);
  if (globalDialogs.length !== TASKS.length) problems.push(`so ${globalDialogs.length}/${TASKS.length} dialogos na arvore global`);
  if (unnamedFields.length) problems.push(`${unnamedFields.length} campos sem nome na arvore`);
  if (placeholderNamed.length) problems.push(`${placeholderNamed.length} campos anunciados pelo placeholder (regressao UX9-04)`);
  if (treeMismatch.length) problems.push(`${treeMismatch.length} nomes divergentes entre arvore e aria-label entregue`);
  if (unnamedButtons.length) problems.push(`${unnamedButtons.length} botoes sem nome na arvore`);
  if (unnamedDialogs.length) problems.push(`${unnamedDialogs.length} dialogos sem nome acessivel`);
  if (!liveRoles.includes('alert')) problems.push('role=alert (r7) ausente da arvore global');
  if (problems.length) {
    console.error('UX ARIA ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('UX ARIA ASSERT OK: arvore de acessibilidade expoe nomes fieis aos rotulos, campos/botoes/dialogos nomeados e os papeis vivos das rodadas 7/8.');
}
