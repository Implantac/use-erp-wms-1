#!/usr/bin/env node
/**
 * QA-UX (rodada 14) — INTERNACIONALIZACAO DOS NOMES NA ARVORE DE ACESSIBILIDADE.
 *
 * r12/r13 provaram que TODOS os controles tem nome. Nao provaram que o nome
 * esta no idioma do usuario. Este audit usa `ariaSnapshot()` (arvore do
 * Chromium, NAO escuta NVDA/VoiceOver) nas 12 rotas + nos 5 dialogos de
 * negocio e reprova nomes de controles que sao verbos/rotulos de UI em
 * ingles (ex.: "Close"), preservando nomes proprios ("Use Success Portal").
 *
 *   npm run ux:i18n -- --label=antes
 *   npm run ux:i18n -- --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'i18n');
const OUT = arg('out', '/home/user/ux-evidence');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'pendencias', path: '/pendencias' },
  { name: 'novo-pedido-alias', path: '/comercial/pedidos/novo' },
  { name: 'pedidos-canonica', path: '/comercial/pedidos' },
  { name: 'sugestao-compra-alias', path: '/compras/sugestoes' },
  { name: 'contas-receber-alias', path: '/financeiro/contas-receber' },
  { name: 'wms-recebimento', path: '/wms/recebimento' },
  { name: 'inventario', path: '/wms/inventario' },
  { name: 'fiscal-notas-alias', path: '/fiscal/notas' },
  { name: 'fiscal-nfe-canonica', path: '/fiscal/nfe' },
  { name: 'manual', path: '/admin/manual' },
  { name: 'ai-config-alias', path: '/admin/ai-config' },
];
const TASKS = [
  { id: 'novo-cliente', route: '/comercial/clientes', open: 'Novo Cliente' },
  { id: 'novo-pedido-venda', route: '/comercial/pedidos', open: 'Novo Pedido' },
  { id: 'novo-apontamento', route: '/producao/apontamento', open: 'Novo Apontamento' },
  { id: 'novo-pedido-compra', route: '/compras/pedidos', open: 'Novo Pedido' },
  { id: 'recebimento-fibra', route: '/wms/recebimento', open: 'Receber pluma/fibra' },
];

/** Nomes EXATOS de UI em ingles. Nomes proprios e termos de negocio
 *  (PIX, RFID, "Use Success Portal", "Dashboard") nao entram na lista. */
const EN_UI = new Set([
  'Close', 'Save', 'Cancel', 'Delete', 'Edit', 'Search', 'Submit', 'Next', 'Back',
  'Open', 'View', 'Loading', 'Retry', 'Confirm', 'Remove', 'Add', 'New', 'Yes',
  'No', 'OK', 'Error', 'Success', 'Settings', 'Help', 'More', 'Less', 'Export',
  'Import', 'Print', 'Filter', 'Select', 'All', 'None', 'Clear', 'Apply', 'Reset',
  'Collapse', 'Expand', 'Toggle', 'Sort', 'Previous', 'Continue', 'Finish', 'Skip',
  'Upload', 'Download', 'Refresh', 'Copy', 'Paste', 'Cut', 'Undo', 'Redo',
  'More pages', 'Previous slide', 'Next slide', 'Toggle Sidebar',
  'Go to previous page', 'Go to next page', 'pagination', 'Pagination',
  'Previous page', 'Next page', 'No results', 'No results found', 'Select all',
]);
const EN_PATTERNS = [
  /^Go to .* page$/i, /^.* slide$/i, /^Toggle .*$/i,
  /^More pages$/i, /^Close$/i,
];

/** Varredura estatica dos componentes base: cobre sheet/paginacao/carrossel
 *  que nao sao abertos nos 12+5 cenarios, sem depender de dados do isolado. */
const BASE_FILES = ['dialog.tsx', 'sheet.tsx', 'pagination.tsx', 'carousel.tsx', 'sidebar.tsx', 'breadcrumb.tsx'];
const FORBIDDEN_SRC = [
  '>Close<', '>Next<', '>Previous<', '>More<',
  'Go to previous page', 'Go to next page', 'More pages',
  'Previous slide', 'Next slide', 'Toggle Sidebar', 'aria-label="pagination"',
];
function scanSource() {
  const out = [];
  for (const f of BASE_FILES) {
    const p = path.join(ROOT, 'src/ui/base', f);
    if (!fs.existsSync(p)) { out.push({ file: f, missing: true }); continue; }
    const txt = fs.readFileSync(p, 'utf8');
    for (const token of FORBIDDEN_SRC) {
      const n = txt.split(token).length - 1;
      if (n) out.push({ file: f, token, count: n });
    }
  }
  return out;
}

const ROLES = 'button|link|textbox|combobox|checkbox|radio|slider|spinbutton|searchbox|switch|menuitem|menuitemcheckbox|menuitemradio|tab|option|treeitem|navigation|dialog';
const unquote = (line) => {
  const m = /^(\s*-\s*)'(.*)'\s*$/.exec(line);
  return m ? `${m[1]}${m[2].replace(/''/g, "'")}` : line;
};

function parse(yaml) {
  const lines = String(yaml || '').split('\n').map(unquote);
  const nodes = [];
  // Fronteira de token (r13): `tab` nao pode casar com `tablist`.
  const re = new RegExp(`^\\s*-\\s+(${ROLES})(?=[\\s:[\\]"]|$)\\s*(?:"([^"]*)")?\\s*(?:\\[[^\\]]*\\])?\\s*:?`);
  for (const line of lines) {
    const m = re.exec(line);
    if (m) nodes.push({ role: m[1], name: m[2] || null });
  }
  return nodes;
}
const isEnglish = (name) => !!name && (EN_UI.has(name.trim()) || EN_PATTERNS.some((r) => r.test(name.trim())));

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

const report = { label: LABEL, at: new Date().toISOString(), routes: [], dialogs: [], errors: [] };
for (const r of ROUTES) {
  const item = { name: r.name, nodes: [], offenders: [] };
  try {
    await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const x = (document.querySelector('#main-content')?.innerText || '').trim();
      return x.length > 250 && !/^Início\s+\S+\s*Carregando/.test(x);
    }, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    item.nodes = parse(await page.locator('body').ariaSnapshot().catch(() => ''));
    item.offenders = item.nodes.filter((n) => isEnglish(n.name));
  } catch (e) { report.errors.push(`${r.name}: ${String(e.message).slice(0, 120)}`); }
  report.routes.push(item);
}
for (const t of TASKS) {
  const item = { id: t.id, nodes: [], offenders: [] };
  try {
    await page.goto(`${BASE}${t.route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    await page.getByRole('button', { name: t.open, exact: false }).first().click({ timeout: 9000 });
    const dlg = page.locator('[role="dialog"]').first();
    await dlg.waitFor({ state: 'visible', timeout: 9000 });
    await page.waitForTimeout(400);
    item.nodes = parse(await dlg.ariaSnapshot().catch(() => ''));
    item.offenders = item.nodes.filter((n) => isEnglish(n.name));
  } catch (e) { report.errors.push(`${t.id}: ${String(e.message).slice(0, 120)}`); }
  report.dialogs.push(item);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}
await browser.close();
report.sourceOffenders = scanSource();
fs.writeFileSync(path.join(OUT, `${LABEL}-i18n.json`), JSON.stringify(report, null, 2));

const offenders = [
  ...report.routes.flatMap((r) => r.offenders.map((o) => ({ ...o, where: `rota:${r.name}` }))),
  ...report.dialogs.flatMap((d) => d.offenders.map((o) => ({ ...o, where: `dialogo:${d.id}` }))),
];
const totalNodes = report.routes.reduce((s, r) => s + r.nodes.length, 0) + report.dialogs.reduce((s, d) => s + d.nodes.length, 0);
const byName = {};
for (const o of offenders) byName[o.name] = (byName[o.name] || 0) + 1;
console.log(`[i18n] ${report.routes.length} rotas + ${report.dialogs.length} dialogos | nos=${totalNodes} | nomesEmIngles=${offenders.length} | distintos=${Object.keys(byName).length} | stringsBase=${report.sourceOffenders.length} | erros=${report.errors.length}`);
for (const [name, n] of Object.entries(byName).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}x  "${name}"`);
for (const s of report.sourceOffenders.slice(0, 14)) console.log(`  BASE ${s.file}: ${s.token}${s.count > 1 ? ` (${s.count}x)` : ''}`);
if (report.errors.length) console.log('  erros:', report.errors.join(' | '));

if (process.argv.includes('--assert')) {
  const problems = [];
  if (report.routes.length !== ROUTES.length) problems.push(`so ${report.routes.length}/${ROUTES.length} rotas medidas`);
  if (report.dialogs.length !== TASKS.length) problems.push(`so ${report.dialogs.length}/${TASKS.length} dialogos medidos`);
  if (report.errors.length) problems.push(`${report.errors.length} cenarios com erro`);
  if (totalNodes < 100) problems.push(`cenario incompleto: so ${totalNodes} nos na arvore`);
  if (offenders.length) problems.push(`${offenders.length} controles com nome de UI em ingles`);
  if (report.sourceOffenders.length) problems.push(`${report.sourceOffenders.length} strings de UI em ingles nos componentes base`);
  if (problems.length) {
    console.error('UX I18N ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('UX I18N ASSERT OK: 12 rotas e 5 dialogos anunciam controles em PT-BR e os componentes base nao guardam strings de UI em ingles.');
}
