#!/usr/bin/env node
/**
 * QA-UX (rodada 13) — ARVORE DE ACESSIBILIDADE EM TODAS AS ROTAS.
 *
 * A r12 provou nomes/papeis nos 5 dialogos de negocio. Aqui a cobertura e
 * ampliada para as 12 rotas do dia a dia: medimos `body.ariaSnapshot()` e
 * abrimos (sem submeter nada) os dialogos acionados por botoes de criacao /
 * filtro / detalhe. Nenhum dado e gravado; ambiente isolado QA-01.
 *
 * Fonte dos nomes: arvore de acessibilidade do Chromium (ariaSnapshot).
 * NAO e escuta com NVDA/VoiceOver.
 *
 *   npm run ux:aria:routes -- --label=antes
 *   npm run ux:aria:routes -- --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'aria-routes');
const OUT = arg('out', '/home/user/ux-evidence');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

/** Mesmas 12 rotas do dia a dia usadas por `ux:journey` (inclui aliases). */
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
const ROLES = 'button|link|textbox|combobox|checkbox|radio|slider|spinbutton|searchbox|switch|menuitem|menuitemcheckbox|menuitemradio|tab|option|treeitem';
const FIELD_ROLES = 'textbox|combobox|checkbox|radio|slider|spinbutton|searchbox|switch|option|treeitem';
const OPENERS = /^(Novo|Adicionar|Cadastrar|Filtrar|Filtros|Importar|Editar|Detalhes)/i;
const BLOCK = /(Excluir|Remover|Cancelar|Salvar|Confirmar|Exportar|Apagar|Deletar|Finalizar|Encerrar|Sair|Logout)/i;
/** Abridores deterministicos ja conhecidos das r11/r12. A heuristica por
 *  nome varia conforme o estado dos dados; estes garantem cobertura minima
 *  de dialogos sem clicar em nada destrutivo. Nenhum formulario e submetido. */
const KNOWN_OPENERS = {
  'pedidos-canonica': ['Novo Pedido'],
  'novo-pedido-alias': ['Novo Pedido'],
  'contas-receber-alias': ['Novo Lançamento'],
  'wms-recebimento': ['Receber pluma/fibra'],
};

const GENERATED = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado ausente (.env.e2e.generated)');
const env = Object.fromEntries(fs.readFileSync(GENERATED, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));

/** Playwright entre-aspas escalares com caracteres YAML: `- 'button "Ação: x"'`. */
const unquote = (line) => {
  const m = /^(\s*-\s*)'(.*)'\s*$/.exec(line);
  return m ? `${m[1]}${m[2].replace(/''/g, "'")}` : line;
};

function parse(yaml) {
  const lines = String(yaml || '').split('\n').map(unquote);
  const nodes = [], dialogs = [], live = [];
  // Fronteira de token: sem isso `tab` casa com `tablist`/`table`/`tabpanel`
  // e `radio` casa com `radiogroup`, gerando falsos "sem nome" (r13).
  const nodeRe = new RegExp(`^\\s*-\\s+(${ROLES})(?=[\\s:[\\]"]|$)\\s*(?:"([^"]*)")?\\s*(?:\\[[^\\]]*\\])?\\s*:?`);
  for (const line of lines) {
    const nm = nodeRe.exec(line);
    if (nm) { nodes.push({ role: nm[1], name: nm[2] || null }); continue; }
    const dm = /^\s*-\s+dialog\s*(?:"([^"]*)")?\s*:?/.exec(line);
    if (dm) { dialogs.push({ name: dm[1] || null }); continue; }
    const lm = /^\s*-\s+(alert|status)\s*:/.exec(line);
    if (lm) live.push(lm[1]);
  }
  return { nodes, dialogs, live };
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

const report = { label: LABEL, at: new Date().toISOString(), routes: [] };
for (const r of ROUTES) {
  const item = { ...r, yaml: '', nodes: [], dialogs: [], live: [], opened: [] };
  try {
    await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const x = (document.querySelector('#main-content')?.innerText || '').trim();
      return x.length > 250 && !/^Início\s+\S+\s*Carregando/.test(x);
    }, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1400);
    item.yaml = await page.locator('body').ariaSnapshot().catch(() => '');
    const p = parse(item.yaml);
    item.nodes = p.nodes; item.dialogs = p.dialogs; item.live = p.live;

    // Abre (sem submeter) ate 2 dialogos por rota, a partir de nomes da PROPRIA
    // arvore. Nenhum botao destrutivo / de submit e acionado.
    const heuristic = p.nodes
      .filter((n) => n.role === 'button' && n.name && OPENERS.test(n.name) && !BLOCK.test(n.name))
      .map((n) => n.name);
    const candidates = [...new Set([...(KNOWN_OPENERS[r.name] || []), ...heuristic])].slice(0, 3);
    for (const name of candidates) {
      const open = { name, dialog: null, fields: 0, unnamedFields: 0, unnamedButtons: 0 };
      try {
        // `exact: false`: o nome na arvore pode ser um recorte do texto real
        // do botao (ex.: "Novo Pedido" vs "Novo Pedido de Venda"). Uma
        // segunda tentativa cobre rotas alias que ainda estejam redirecionando.
        const tryClick = async () => {
          const btn = page.getByRole('button', { name, exact: false }).first();
          if (await btn.count().catch(() => 0)) return btn.click({ timeout: 4000 });
          return page.locator('button').filter({ hasText: name }).first().click({ timeout: 4000 });
        };
        try { await tryClick(); }
        catch { await page.waitForTimeout(700); await tryClick(); }
        const dlg = page.locator('[role="dialog"]').first();
        if (await dlg.isVisible({ timeout: 1200 }).catch(() => false)) {
          const dy = await dlg.ariaSnapshot().catch(() => '');
          const dp = parse(dy);
          open.dialog = dp.dialogs[0]?.name ?? null;
          open.hasDialog = true;
          open.fields = dp.nodes.filter((n) => new RegExp(`^(${FIELD_ROLES})$`).test(n.role)).length;
          open.unnamedFields = dp.nodes.filter((n) => new RegExp(`^(${FIELD_ROLES})$`).test(n.role) && !n.name).length;
          open.unnamedButtons = dp.nodes.filter((n) => n.role === 'button' && !n.name).length;
          open.yaml = dy;
        } else open.hasDialog = false;
      } catch (e) { open.error = String(e.message).slice(0, 120); }
      item.opened.push(open);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(250);
    }
  } catch (e) {
    item.error = String(e.message).slice(0, 180);
  }
  report.routes.push(item);
}
await browser.close();
fs.writeFileSync(path.join(OUT, `${LABEL}-aria-routes.json`), JSON.stringify(report, null, 2));

const allNodes = report.routes.flatMap((r) => r.nodes.map((n) => ({ ...n, route: r.name })));
const unnamed = allNodes.filter((n) => !n.name);
const unnamedFields = unnamed.filter((n) => new RegExp(`^(${FIELD_ROLES})$`).test(n.role));
const unnamedButtons = unnamed.filter((n) => n.role === 'button');
const unnamedLinks = unnamed.filter((n) => n.role === 'link');
const opened = report.routes.flatMap((r) => r.opened.map((o) => ({ ...o, route: r.name })));
const dialogsOpened = opened.filter((o) => o.hasDialog);
const unnamedOpenedDialogs = dialogsOpened.filter((o) => !o.dialog);
const unnamedOpenedFields = dialogsOpened.reduce((s, o) => s + o.unnamedFields, 0);
const unnamedOpenedButtons = dialogsOpened.reduce((s, o) => s + o.unnamedButtons, 0);
const liveRoles = [...new Set(report.routes.flatMap((r) => r.live))];
const errors = report.routes.filter((r) => r.error);

console.log(`[aria:routes] ${report.routes.length} rotas | nos=${allNodes.length} semNome=${unnamed.length} (campos=${unnamedFields.length} botoes=${unnamedButtons.length} links=${unnamedLinks.length}) | dialogosAbertos=${dialogsOpened.length} semNome=${unnamedOpenedDialogs.length} camposSemNome=${unnamedOpenedFields} botoesSemNome=${unnamedOpenedButtons} | papeisVivos=[${liveRoles.join(',')}] | erros=${errors.length}`);
for (const n of unnamed.slice(0, 14)) console.log(`  SEM NOME: ${n.route} ${n.role}`);
for (const o of unnamedOpenedDialogs.slice(0, 8)) console.log(`  DIALOGO SEM NOME: ${o.route} via "${o.name}"`);
if (errors.length) console.log('  erros:', errors.map((r) => `${r.name}: ${r.error}`).join(' | '));

if (process.argv.includes('--assert')) {
  const problems = [];
  if (report.routes.length !== ROUTES.length) problems.push(`so ${report.routes.length}/${ROUTES.length} rotas medidas`);
  if (errors.length) problems.push(`${errors.length} rotas com erro`);
  if (allNodes.length < 100) problems.push(`cenario incompleto: so ${allNodes.length} nos interativos na arvore`);
  if (dialogsOpened.length < 3) problems.push(`so ${dialogsOpened.length} dialogos abertos (cobertura insuficiente)`);
  if (unnamed.length) problems.push(`${unnamed.length} nos interativos sem nome nas 12 rotas`);
  if (unnamedOpenedDialogs.length) problems.push(`${unnamedOpenedDialogs.length} dialogos abertos sem nome`);
  if (unnamedOpenedFields) problems.push(`${unnamedOpenedFields} campos sem nome nos dialogos abertos`);
  if (unnamedOpenedButtons) problems.push(`${unnamedOpenedButtons} botoes sem nome nos dialogos abertos`);
  if (problems.length) {
    console.error('UX ARIA ROUTES ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('UX ARIA ROUTES ASSERT OK: 12 rotas e dialogos acionaveis expoem nomes na arvore de acessibilidade.');
}
