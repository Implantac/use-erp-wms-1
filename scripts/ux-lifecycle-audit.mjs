#!/usr/bin/env node
/**
 * QA-UX (rodada 10) — CICLO DE VIDA COMPLETO DO CLIENTE PELA UI.
 *
 * A r9 provou que `criar` funciona (400 -> 201), mas declarou em seu §6
 * que `editar` e `excluir` NAO haviam sido medidos. Esta rodada fecha essa
 * lacuna: criar -> editar -> excluir, com dados sinteticos, contra o
 * Postgres isolado sob RLS, SEM mock de backend.
 *
 * Mede por etapa: verbo HTTP/status, toast, fechamento do dialogo,
 * registro visivel/ausente na lista, contagem "Total de Clientes",
 * vazamento tecnico e excecoes JS. `--assert` recusa medicao vazia.
 *
 * Uso: npm run ux:lifecycle -- --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'lifecycle');
const OUT = arg('out', '/home/user/ux-evidence');
/** Induz FALHA no DELETE (nunca forca sucesso): A/B do UX10-01. */
const FAILURE = process.argv.includes('--inject-delete-failure');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

const GENERATED = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado ausente (.env.e2e.generated)');
const env = Object.fromEntries(fs.readFileSync(GENERATED, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));

function makeCnpj() {
  const base = String(Date.now()).slice(-8).padStart(8, '0') + '0001';
  const dv = (b, pesos) => {
    const rStr = b.split('').reduce((s, d, i) => s + Number(d) * pesos[i], 0) % 11;
    return rStr < 2 ? 0 : 11 - rStr;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = dv(base, p1);
  const d2 = dv(base + d1, p2);
  const c = base + d1 + d2;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

const stamp = String(Date.now()).slice(-6);
const CNPJ = makeCnpj();
const NOME = `Cliente Sintético ${stamp}`;
const NOME_EDITADO = `${NOME} (editado)`;
const EMAIL = `r10-${stamp}@exemplo.invalid`;

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

if (FAILURE) {
  // Registrada por ultimo -> tem precedencia. Reproduz o 405 que o harness
  // devolvia ANTES da extensao QA-10, sem alterar o produto entre as medicoes.
  await context.route('**/rest/v1/clients?*', (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    return route.fulfill({
      status: 405, contentType: 'application/json',
      body: JSON.stringify({ message: 'metodo/rota nao suportados: DELETE /rest/v1/clients', code: 'PGRST000' }),
    });
  });
}

const page = await context.newPage();
const mutations = [];
page.on('response', (res) => {
  const m = res.request().method();
  if (!['POST', 'PATCH', 'DELETE'].includes(m)) return;
  if (!res.url().includes('/rest/v1/clients')) return;
  mutations.push({ method: m, status: res.status(), url: res.url().replace(API, '').slice(0, 100) });
});
const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(String(e.message).slice(0, 160)));

/** Amostra toasts por 2 s: o Toaster do Radix some rapido. */
async function collectToasts() {
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(250);
    const texts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-sonner-toast],[role="alert"],[role="status"],[data-state="open"]'))
        .map((e) => (e.textContent || '').trim())
        .filter((s) => s.length > 8 && s.length < 220));
    texts.forEach((t) => seen.add(t));
  }
  return [...seen];
}
const has = (arr, re) => arr.some((t) => re.test(t));
const countClients = async () => {
  const txt = await page.locator('#main-content').innerText().catch(() => '');
  return { n: Number((txt.match(/Total de Clientes\s*\n?\s*(\d+)/) || [])[1] ?? -1), txt };
};
const openMenu = async (nome) => {
  await page.getByRole('button', { name: `Ações do cliente ${nome}` }).first().click({ timeout: 10000 });
  await page.waitForTimeout(250);
};

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 25000 });
await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 });
await page.waitForTimeout(1200);

const r = { label: LABEL, nome: NOME, nomeEditado: NOME_EDITADO, cnpj: CNPJ, steps: {} };
try {
  await page.goto(`${BASE}/comercial/clientes`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (document.querySelector('#main-content')?.innerText || '').includes('Total de Clientes'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  r.countStart = (await countClients()).n;

  // ---------- 1. CRIAR ----------
  await page.getByRole('button', { name: /Novo Cliente/i }).first().click({ timeout: 15000 });
  const dlg = page.locator('[role="dialog"]');
  await dlg.waitFor({ timeout: 10000 });
  const inp = (i) => dlg.locator('input:visible').nth(i);
  await inp(0).fill(CNPJ);
  await inp(1).fill(NOME);
  await inp(3).fill(EMAIL);
  await inp(4).fill('1133334444');
  await dlg.getByRole('tab', { name: 'Endereço' }).click();
  await page.waitForTimeout(300);
  const ai = dlg.locator('input:visible');
  await ai.nth(0).fill('01310-100');
  for (let i = 0; i < await ai.count(); i++) {
    if (/Cidade/i.test((await ai.nth(i).getAttribute('aria-label')) || '')) await ai.nth(i).fill('São Paulo');
  }
  await dlg.locator('button[role="combobox"]').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  const sp = page.getByRole('option', { name: /São Paulo/i }).first();
  if (await sp.count()) await sp.click(); else await page.keyboard.press('Escape');
  await dlg.getByRole('button', { name: /Cadastrar Cliente/i }).click({ timeout: 8000 });
  const createToasts = await collectToasts();
  const afterCreate = await countClients();
  r.steps.create = {
    toasts: createToasts.slice(0, 5),
    successToast: has(createToasts, /Cliente cadastrado com sucesso/i),
    dialogClosed: (await page.locator('[role="dialog"]').count()) === 0,
    recordInList: afterCreate.txt.includes(NOME),
    count: afterCreate.n,
  };

  // ---------- 2. EDITAR ----------
  await openMenu(NOME);
  await page.getByRole('menuitem', { name: /Editar/i }).click({ timeout: 8000 });
  const editDlg = page.locator('[role="dialog"]');
  await editDlg.waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  const editInputs = editDlg.locator('input:visible');
  r.steps.edit = { fieldsVisible: await editInputs.count() };
  const nameField = editInputs.nth(1); // Razão Social, mesma ordem da criacao
  r.steps.edit.prefilledName = await nameField.inputValue();
  await nameField.fill(NOME_EDITADO);
  await editDlg.getByRole('button', { name: /Salvar Alterações/i }).click({ timeout: 8000 });
  const editToasts = await collectToasts();
  const afterEdit = await countClients();
  Object.assign(r.steps.edit, {
    toasts: editToasts.slice(0, 5),
    successToast: has(editToasts, /Cliente atualizado com sucesso/i),
    dialogClosed: (await page.locator('[role="dialog"]').count()) === 0,
    editedInList: afterEdit.txt.includes(NOME_EDITADO),
    oldNameGone: !afterEdit.txt.includes(NOME_EDITADO) ? null : !afterEdit.txt.includes(`${NOME}\n`),
    count: afterEdit.n,
  });

  // ---------- 3. EXCLUIR ----------
  await openMenu(NOME_EDITADO);
  await page.getByRole('menuitem', { name: /Excluir/i }).click({ timeout: 8000 });
  const confirm = page.locator('[role="alertdialog"]');
  await confirm.waitFor({ timeout: 10000 });
  r.steps.delete = { confirmationShown: await confirm.isVisible(), confirmationText: (await confirm.innerText()).slice(0, 180) };
  await confirm.getByRole('button', { name: /^Excluir$/i }).click({ timeout: 8000 });
  const deleteToasts = await collectToasts();
  const afterDelete = await countClients();
  Object.assign(r.steps.delete, {
    toasts: deleteToasts.slice(0, 5),
    successToast: has(deleteToasts, /Cliente excluído com sucesso/i),
    dialogClosed: (await page.locator('[role="alertdialog"]').count()) === 0,
    /** UX10-01: em falha a confirmacao deve PERMANECER aberta. */
    confirmStillOpen: (await page.locator('[role="alertdialog"]').count()) > 0,
    // Separa o toast da MUTACAO do BackendErrorBanner da r7 (que aparece
    // pelos 400 das consultas de apoio do harness) — evita falso positivo.
    errorToast: deleteToasts.find((t) =>
      /^Erro|não foi possível|verifique/i.test(t) &&
      !/carregar alguns dados|Verifique sua conexão|demorando para carregar/i.test(t)) || null,
    actionableError: deleteToasts.some((t) => /Verifique os dados e tente novamente/i.test(t)),
    recordGone: !afterDelete.txt.includes(NOME_EDITADO),
    count: afterDelete.n,
  });

  r.mutations = mutations;
  r.jsErrors = jsErrors.length;
  r.jsErrorSamples = jsErrors.slice(0, 3);
  const allTexts = [
    ...(r.steps.create.toasts || []), ...(r.steps.edit.toasts || []), ...(r.steps.delete.toasts || []),
  ];
  r.technicalLeak = allTexts.some((t) =>
    /PGRST|23514|constraint|SQL|document_type|JWT|metodo\/rota|rest\/v1|method not allowed/i.test(t));
} catch (e) {
  r.error = String(e.message).slice(0, 220);
  r.mutations = mutations;
  r.jsErrors = jsErrors.length;
}
await browser.close();
fs.writeFileSync(path.join(OUT, `${LABEL}-lifecycle.json`), JSON.stringify(r, null, 2));

const s = (k) => r.steps[k] || {};
const statusOf = (m) => mutations.filter((x) => x.method === m).map((x) => x.status).join(',') || '-';
console.log(`[lifecycle] POST=${statusOf('POST')} PATCH=${statusOf('PATCH')} DELETE=${statusOf('DELETE')} | contagem ${r.countStart}->${s('create').count}->${s('edit').count}->${s('delete').count}`);
console.log(`  criar: sucesso=${s('create').successToast} fechou=${s('create').dialogClosed} naLista=${s('create').recordInList}`);
console.log(`  editar: prefill="${s('edit').prefilledName ?? '-'}" sucesso=${s('edit').successToast} fechou=${s('edit').dialogClosed} editadoNaLista=${s('edit').editedInList}`);
console.log(`  excluir: confirmacao=${s('delete').confirmationShown} sucesso=${s('delete').successToast} removido=${s('delete').recordGone} dialogoAbertoAposFalha=${s('delete').confirmStillOpen}`);
if (s('delete').errorToast) console.log(`  erro: "${s('delete').errorToast.slice(0, 120)}" | acionavel=${s('delete').actionableError}`);
console.log(`  modo=${FAILURE ? 'FALHA INDUZIDA' : 'ciclo completo'} | vazamento=${r.technicalLeak ?? '-'} jsErrors=${r.jsErrors ?? '-'}`);
if (r.error) console.log('  ERRO:', r.error);

if (process.argv.includes('--assert')) {
  const problems = [];
  const expectStatus = (m, ok) => { const v = statusOf(m); if (v !== ok) problems.push(`${m} esperado ${ok}, obtido ${v}`); };
  expectStatus('POST', '201');
  expectStatus('PATCH', '200');
  expectStatus('DELETE', FAILURE ? '405' : '200');
  if (!s('create').successToast || !s('create').dialogClosed || !s('create').recordInList) problems.push('criacao nao confirmada');
  if (!s('edit').successToast || !s('edit').dialogClosed || !s('edit').editedInList) problems.push('edicao nao confirmada');
  if (s('edit').prefilledName !== NOME) problems.push(`formulario de edicao nao reidratou o nome (obtido "${s('edit').prefilledName}")`);
  if (!s('delete').confirmationShown) problems.push('exclusao sem dialogo de confirmacao');
  if (FAILURE) {
    if (!s('delete').confirmStillOpen) problems.push('UX10-01: confirmacao fechou antes de saber se o DELETE falhou');
    if (!s('delete').actionableError) problems.push('falha de exclusao sem mensagem acionavel');
    if (s('delete').recordGone) problems.push('registro desapareceu da lista mesmo com DELETE falho');
    if (s('delete').successToast) problems.push('toast de sucesso em exclusao que falhou');
  } else {
    if (!s('delete').successToast || !s('delete').recordGone) problems.push('exclusao nao confirmada');
    if (!s('delete').dialogClosed) problems.push('confirmacao nao fechou apos exclusao bem-sucedida');
    if (r.countStart >= 0 && s('create').count === r.countStart + 1 && s('edit').count === r.countStart + 1 && s('delete').count !== r.countStart) {
      problems.push(`contagem nao voltou ao inicio (${r.countStart} -> ${s('delete').count})`);
    }
  }
  if (r.technicalLeak) problems.push('erro tecnico vazou para o usuario');
  if (r.jsErrors) problems.push('excecao JS nao tratada');
  if (mutations.length < 3) problems.push('medicao vazia: nem todos os verbos foram observados');
  if (problems.length) {
    console.error('UX LIFECYCLE ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log(FAILURE
    ? 'UX LIFECYCLE ASSERT OK (falha): a confirmacao permanece aberta, o erro e acionavel e o registro nao some.'
    : 'UX LIFECYCLE ASSERT OK: criar, editar e excluir cliente funcionam pela UI, com confirmacao e sem vazamento tecnico.');
}
