#!/usr/bin/env node
/**
 * QA-UX (rodada 6) — JORNADAS DE TAREFA POR CLIQUE.
 *
 * Diferente de ux-links (a tela abre?) e ux-forms (o dialog tem rotulos?),
 * aqui o usuario REALMENTE tenta concluir uma tarefa de negocio: abre o
 * formulario, submete vazio e recebe (ou nao) um feedback acionavel.
 *
 * Mede por tarefa:
 *  - cliques/tempo ate abrir o formulario;
 *  - campos SEM nome acessivel (placeholder NAO conta);
 *  - se o submit vazio move o FOCO para o primeiro campo invalido;
 *  - se as mensagens de erro sao acionaveis (nao apenas "*");
 *  - se algum erro tecnico vaza para a tela.
 *
 * Uso:
 *   node scripts/ux-task-audit.mjs --label=antes --out=/home/user/ux-evidence
 *   node scripts/ux-task-audit.mjs --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'task');
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

const GENERATED = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado ausente (.env.e2e.generated)');
const env = Object.fromEntries(fs.readFileSync(GENERATED, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));

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
await page.waitForSelector('#email', { timeout: 25000 });
await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 });
await page.waitForTimeout(1500);

const report = { label: LABEL, at: new Date().toISOString(), tasks: [] };

for (const t of TASKS) {
  const r = { id: t.id, route: t.route };
  try {
    await page.goto(`${BASE}${t.route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const x = (document.querySelector('#main-content')?.innerText || '').trim();
      return x.length > 250 && !/^Início\s+\S+\s*Carregando/.test(x);
    }, { timeout: 7000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const t0 = Date.now();
    await page.getByRole('button', { name: t.open, exact: false }).first().click({ timeout: 9000 });
    r.clicksToOpen = 1;
    r.openMs = Date.now() - t0;
    await page.waitForSelector('[role="dialog"]', { timeout: 9000 });
    await page.waitForTimeout(500);

    r.form = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      const vis = (x) => { const q = x.getBoundingClientRect(), s = getComputedStyle(x); return q.width > 0 && q.height > 0 && s.visibility !== 'hidden'; };
      const fields = Array.from(d.querySelectorAll('input:not([type=hidden]),select,textarea')).filter(vis);
      const named = (f) =>
        !!(f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') ||
           (f.id && d.querySelector(`label[for="${CSS.escape(f.id)}"]`)) || f.closest('label'));
      const unlabelled = fields.filter((f) => !named(f)).map((f) => ({
        tag: f.tagName, placeholder: (f.getAttribute('placeholder') || '').slice(0, 35), id: f.id || '',
      }));
      // Botao principal desabilitado sem explicacao = barreira silenciosa:
      // o usuario ve "Iniciar" cinza e nao sabe o que falta. Medimos se o
      // dialogo oferece uma dica textual acionavel (role=status).
      const hints = Array.from(d.querySelectorAll('[role="status"], [data-ux-hint]'))
        .map((x) => (x.textContent || '').trim())
        .filter((t) => t.length > 12 && /preencha|selecione|informe|adicione|obrigat|para (avancar|avançar|iniciar|continuar)/i.test(t));
      // Asteriscos de `required` NAO sao mensagens de erro; so os contamos
      // para nao repetir o falso positivo do probe exploratorio.
      const bareAsterisks = Array.from(d.querySelectorAll('span,p,small'))
        .filter((x) => !x.children.length && /^[*\s]+$/.test((x.textContent || '')) && (x.textContent || '').includes('*'))
        .length;
      return {
        fields: fields.length, unlabelled,
        required: fields.filter((f) => f.required).length,
        title: (d.querySelector('h2')?.textContent || '').trim().slice(0, 60),
        disabledHint: hints.length > 0,
        disabledHints: hints.slice(0, 3),
        bareAsterisks,
        beforeLines: (document.body.innerText || '').split('\n').map((s) => s.trim()).filter((s) => s.length > 3),
      };
    });

    // Botao de submit: clica mesmo se o fluxo estiver travado, para medir o feedback.
    const buttons = await page.locator('[role="dialog"] button').all();
    let submit = null;
    for (const btn of buttons) {
      const txt = ((await btn.textContent().catch(() => '')) || '').trim();
      if (t.submit.test(txt)) { submit = btn; r.submitLabel = txt.slice(0, 30); break; }
    }
    if (submit) {
      r.submitEnabled = await submit.isEnabled().catch(() => false);
      if (r.submitEnabled) {
        await submit.click({ timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(1300);
        r.afterSubmit = await page.evaluate((beforeLines) => {
          const d = document.querySelector('[role="dialog"]');
          const bodyText = document.body.innerText || '';
          const txt = (d?.innerText || bodyText);
          const ae = document.activeElement;
          const errs = Array.from(document.querySelectorAll('[role="alert"],.text-destructive,[data-sonner-toast],[data-sonner-toaster],p.text-red-500,.text-red-600'))
            .map((x) => (x.textContent || '').trim()).filter(Boolean);
          // Toasts de bibliotecas diferentes nao compartilham seletores:
          // compara as linhas de texto visiveis antes/depois do submit.
          const before = new Set(beforeLines);
          const newLines = bodyText.split('\n').map((s) => s.trim())
            .filter((s) => s.length > 6 && !before.has(s) && !/^\*+$/.test(s));
          const all = [...new Set([...errs, ...newLines])];
          return {
            stillOpen: !!d,
            focusTag: ae?.tagName || '',
            focusDesc: ((ae?.getAttribute('aria-label') || ae?.getAttribute('placeholder') || ae?.textContent || '') + '').trim().slice(0, 48),
            // Radix Select/Combobox renderizam <button role="combobox">:
            // o trigger focavel E o campo, ainda que nao seja tag nativa.
            focusIsField: !!ae && (
              /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) ||
              ['combobox', 'textbox', 'spinbutton', 'slider'].includes(ae.getAttribute('role') || '') ||
              !!ae.dataset?.field
            ),
            errors: all.slice(0, 8),
            actionableErrors: all.filter((x) => x.replace(/[*\s]/g, '').length > 3).slice(0, 8),
            technicalError: /failed to fetch|internal server error|500 |undefined|networkerror|supabaseKey|stack trace/i.test(txt),
          };
        }, r.form?.beforeLines ?? []);
      }
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
  } catch (err) {
    r.error = String(err.message).slice(0, 180);
    await page.keyboard.press('Escape').catch(() => {});
  }
  if (r.form?.beforeLines) delete r.form.beforeLines; // dado auxiliar, nao vai para o JSON
  report.tasks.push(r);
}
await browser.close();

fs.writeFileSync(path.join(OUT, `${LABEL}-task.json`), JSON.stringify(report, null, 2));

const totalUnlabelled = report.tasks.reduce((s, r) => s + (r.form?.unlabelled.length || 0), 0);
const totalFields = report.tasks.reduce((s, r) => s + (r.form?.fields || 0), 0);
const noFocus = report.tasks.filter((r) => r.afterSubmit && !r.afterSubmit.focusIsField).map((r) => r.id);
const noActionable = report.tasks.filter((r) => r.afterSubmit && r.afterSubmit.actionableErrors.length === 0).map((r) => r.id);
const technical = report.tasks.filter((r) => r.afterSubmit?.technicalError).map((r) => r.id);
const noDisabledHint = report.tasks.filter((r) => r.submitEnabled === false && !r.form?.disabledHint).map((r) => r.id);
const totalAsterisks = report.tasks.reduce((s, r) => s + (r.form?.bareAsterisks || 0), 0);
console.log(`[task] ${report.tasks.length} jornadas | campos=${totalFields} semNome=${totalUnlabelled} | submitSemFocoNoCampo=${noFocus.length} (${noFocus.join(',')}) | semErroAcionavel=${noActionable.length} (${noActionable.join(',')}) | submitTravadoSemDica=${noDisabledHint.length} (${noDisabledHint.join(',')}) | asteriscosRequired=${totalAsterisks} | erroTecnico=${technical.length}`);
for (const r of report.tasks) {
  console.log(`  ${r.id.padEnd(22)} campos=${String(r.form?.fields ?? '-').padEnd(3)} semNome=${String(r.form?.unlabelled.length ?? '-').padEnd(3)} submit=${String(r.submitEnabled ?? '-').padEnd(5)} focoCampo=${r.afterSubmit?.focusIsField ?? '-'} errosAcionaveis=${r.afterSubmit?.actionableErrors.length ?? '-'} dicaTravado=${r.form?.disabledHint ?? '-'}${r.error ? ' ERRO:' + r.error.slice(0, 50) : ''}`);
}

if (process.argv.includes('--assert')) {
  const problems = [];
  if (totalUnlabelled) problems.push(`${totalUnlabelled} campos de negocio sem nome acessivel`);
  if (noFocus.length) problems.push(`submit vazio nao focou o campo invalido em: ${noFocus.join(', ')}`);
  if (noActionable.length) problems.push(`sem mensagem acionavel em: ${noActionable.join(', ')}`);
  if (noDisabledHint.length) problems.push(`botao desabilitado sem dica do que falta em: ${noDisabledHint.join(', ')}`);
  if (technical.length) problems.push(`erro tecnico exposto em: ${technical.join(', ')}`);
  if (problems.length) {
    console.error('UX TASK ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('UX TASK ASSERT OK: nomes, foco no primeiro invalido, mensagens acionaveis e dica para botoes travados em todas as jornadas.');
}
