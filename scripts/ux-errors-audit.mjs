#!/usr/bin/env node
/**
 * QA-UX (rodada 15) — ASSOCIACAO PROGRAMATICA ENTRE ERRO E CAMPO.
 *
 * r6 garantiu FOCO no primeiro campo invalido; r11/r12/r13/r14 garantiram
 * NOME, ARVORE e IDIOMA. Falta responder: quando a validacao falha, o erro
 * esta LIGADO ao campo? Se a mensagem e so um <p> solto, quem navega por
 * leitor de tela ouve o nome do campo e nao sabe o que esta errado.
 *
 * Mede, apos um submit vazio em 5 jornadas de negocio:
 *  - campos com aria-invalid="true";
 *  - quantos tem aria-describedby resolvendo para um elemento existente;
 *  - quantos descritores contem texto de erro (e nao so dica/asterisco);
 *  - quantas mensagens de erro visiveis estao SOLTAS (sem nenhum campo
 *    apontando para ellas);
 *  - quantas tem papel vivo (role=alert/status).
 *
 * Ferramenta: DOM real no Chromium + ariaSnapshot() para confirmar a arvore.
 * NAO e escuta com NVDA/VoiceOver. Nenhum dado real: API isolada QA-01.
 *
 *   npm run ux:errors -- --label=antes
 *   npm run ux:errors -- --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'errors');
const OUT = arg('out', '/home/user/ux-evidence');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

const TASKS = [
  { id: 'novo-cliente', route: '/comercial/clientes', open: 'Novo Cliente', submit: /cadastrar cliente/i },
  { id: 'novo-pedido-venda', route: '/comercial/pedidos', open: 'Novo Pedido', submit: /próximo passo/i },
  { id: 'novo-apontamento', route: '/producao/apontamento', open: 'Novo Apontamento', submit: /iniciar/i },
  { id: 'novo-pedido-compra', route: '/compras/pedidos', open: 'Novo Pedido', submit: /criar pedido/i },
  { id: 'recebimento-fibra', route: '/wms/recebimento', open: 'Receber pluma/fibra', submit: /registrar recebimento/i },
];

/** Coleta no DOM real. Nao usa texto "adivinhado": so atributos e relacoes. */
const PROBE = () => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return { dialogFechado: true };
  const vis = (x) => {
    const r = x.getBoundingClientRect(), s = getComputedStyle(x);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const txt = (x) => (x?.textContent || '').replace(/\s+/g, ' ').trim();
  const CONTROLS = 'input:not([type=hidden]):not([type=button]):not([type=submit]),select,textarea,[role="combobox"],[role="textbox"],[role="spinbutton"]';
  const controls = Array.from(d.querySelectorAll(CONTROLS)).filter(vis);

  // Mensagens de erro de CAMPO: folha textual, marcada como destrutiva ou
  // com papel vivo. Exclui toasts, dicas de botao travado e asteriscos.
  const isErrorLeaf = (el) => {
    if (el.children.length) return false;
    if (el.closest('[data-sonner-toast],[data-sonner-toaster],[data-ux-hint]')) return false;
    const t = txt(el);
    if (t.length < 4 || /^[*\s]+$/.test(t)) return false;
    const cls = el.className && typeof el.className === 'string' ? el.className : '';
    return el.getAttribute('role') === 'alert' ||
      /text-destructive|text-red-|border-destructive/.test(cls);
  };
  const errEls = Array.from(d.querySelectorAll('p,span,small,div')).filter((el) => vis(el) && isErrorLeaf(el));
  const referenced = new Set();
  const byId = new Map(errEls.map((el) => [el.id, el]).filter(([id]) => !!id));

  const invalid = controls
    .filter((c) => c.getAttribute('aria-invalid') === 'true')
    .map((c) => {
      const name = c.getAttribute('aria-label') || c.getAttribute('placeholder') ||
        (c.id && d.querySelector(`label[for="${CSS.escape(c.id)}"]`) ? txt(d.querySelector(`label[for="${CSS.escape(c.id)}"]`)) : '') ||
        c.getAttribute('data-field') || c.tagName;
      const ids = (c.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const resolved = ids.map((id) => {
        const el = byId.get(id) || d.querySelector(`#${CSS.escape(id)}`) || document.getElementById(id);
        if (el) referenced.add(el);
        return { id, exists: !!el, text: el ? txt(el).slice(0, 90) : '', role: el?.getAttribute('role') || '' };
      });
      const withText = resolved.filter((r) => r.exists && r.text.length > 3);
      const live = resolved.filter((r) => r.exists && ['alert', 'status'].includes(r.role));
      return {
        name: String(name).slice(0, 60),
        tag: c.tagName, role: c.getAttribute('role') || '',
        describedBy: ids,
        temDescritor: ids.length > 0,
        descritorValido: withText.length > 0,
        descritorVivo: live.length > 0,
        resolved,
      };
    });

  const loose = errEls.filter((el) => !referenced.has(el)).map((el) => ({
    id: el.id || '', role: el.getAttribute('role') || '', text: txt(el).slice(0, 90),
  }));
  const liveErrors = errEls.filter((el) => ['alert', 'status'].includes(el.getAttribute('role') || ''));

  // Informativo: para onde foi o feedback quando o formulario nao tem
  // mensagem de erro junto ao campo (toast, status global, dica de botao).
  const toasts = Array.from(document.querySelectorAll(
    '[data-sonner-toast],[data-sonner-toaster],[role="status"],[role="alert"]'))
    .filter((el) => vis(el))
    .map((el) => ({ role: el.getAttribute('role') || '', text: txt(el).slice(0, 140) }))
    .filter((x) => x.text.length > 4).slice(0, 10);

  return {
    toasts,
    controls: controls.length,
    invalid,
    loose,
    liveErrors: liveErrors.length,
    totalErrors: errEls.length,
    focusName: (() => {
      const ae = document.activeElement;
      return (ae?.getAttribute('aria-label') || ae?.getAttribute('placeholder') || ae?.getAttribute('data-field') || ae?.tagName || '').slice(0, 60);
    })(),
  };
};

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

const report = { label: LABEL, at: new Date().toISOString(), tasks: [], errors: [] };
for (const t of TASKS) {
  const r = { id: t.id, route: t.route };
  try {
    await page.goto(`${BASE}${t.route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const x = (document.querySelector('#main-content')?.innerText || '').trim();
      return x.length > 250 && !/^Início\s+\S+\s*Carregando/.test(x);
    }, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: t.open, exact: false }).first().click({ timeout: 9000 });
    await page.waitForSelector('[role="dialog"]', { timeout: 9000 });
    await page.waitForTimeout(500);

    let submit = null;
    for (const btn of await page.locator('[role="dialog"] button').all()) {
      const s = ((await btn.textContent().catch(() => '')) || '').trim();
      if (t.submit.test(s)) { submit = btn; r.submitLabel = s.slice(0, 40); break; }
    }
    r.submitEnabled = submit ? await submit.isEnabled().catch(() => false) : false;
    if (submit && r.submitEnabled) {
      await submit.click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(1400);
    }
    r.probe = await page.evaluate(PROBE);
    r.aria = (await page.locator('[role="dialog"]').first().ariaSnapshot().catch(() => '')).slice(0, 4000);
  } catch (e) {
    report.errors.push(`${t.id}: ${String(e.message).slice(0, 140)}`);
    r.error = String(e.message).slice(0, 140);
  }
  report.tasks.push(r);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(250);
}
await browser.close();
fs.writeFileSync(path.join(OUT, `${LABEL}-errors.json`), JSON.stringify(report, null, 2));

const inv = report.tasks.flatMap((r) => (r.probe?.invalid || []).map((i) => ({ ...i, jornada: r.id })));
const loose = report.tasks.flatMap((r) => (r.probe?.loose || []).map((l) => ({ ...l, jornada: r.id })));
const semDescritor = inv.filter((i) => !i.temDescritor);
const descritorQuebrado = inv.filter((i) => i.temDescritor && !i.descritorValido);
const semVivo = inv.filter((i) => !i.descritorVivo);
const totalLive = report.tasks.reduce((s, r) => s + (r.probe?.liveErrors || 0), 0);
console.log(`[errors] ${report.tasks.length} jornadas | controles=${report.tasks.reduce((s, r) => s + (r.probe?.controls || 0), 0)} | invalidos=${inv.length} | semDescritor=${semDescritor.length} | descritorQuebrado=${descritorQuebrado.length} | semPapelVivo=${semVivo.length} | errosSoltos=${loose.length} | errosVivos=${totalLive} | erros=${report.errors.length}`);
for (const r of report.tasks) {
  console.log(`  ${r.id.padEnd(22)} submit=${String(r.submitEnabled).padEnd(5)} controles=${String(r.probe?.controls ?? '-').padEnd(3)} invalidos=${String(r.probe?.invalid?.length ?? '-').padEnd(3)} soltos=${String(r.probe?.loose?.length ?? '-').padEnd(3)} vivos=${r.probe?.liveErrors ?? '-'}${r.error ? ' ERRO:' + r.error : ''}`);
}
for (const l of loose.slice(0, 10)) console.log(`    SOLTO [${l.jornada}] role=${l.role || '-'} "${l.text}"`);
if (report.errors.length) console.log('  erros de cenario:', report.errors.join(' | '));

if (process.argv.includes('--assert')) {
  const problems = [];
  if (report.tasks.length !== TASKS.length) problems.push(`so ${report.tasks.length}/${TASKS.length} jornadas`);
  if (report.errors.length) problems.push(`${report.errors.length} cenarios com erro`);
  if (inv.length < 5) problems.push(`cobertura insuficiente: so ${inv.length} campos invalidos medidos`);
  if (semDescritor.length) problems.push(`${semDescritor.length} campos invalidos sem aria-describedby`);
  if (descritorQuebrado.length) problems.push(`${descritorQuebrado.length} aria-describedby que nao resolve em texto de erro`);
  if (semVivo.length) problems.push(`${semVivo.length} descritores sem papel vivo`);
  if (loose.length) problems.push(`${loose.length} mensagens de erro soltas, sem campo apontando para ellas`);
  if (totalLive < 1) problems.push('nenhuma mensagem de erro com papel vivo');
  if (problems.length) {
    console.error('UX ERRORS ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('UX ERRORS ASSERT OK: todo campo invalido aponta para uma mensagem de erro viva e nenhuma mensagem fica solta.');
}
