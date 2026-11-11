#!/usr/bin/env node
/**
 * QA-UX (rodada 9) — CAMINHO FELIZ REAL DE CADASTRO DE CLIENTE.
 *
 * As rodadas 1-8 mediram abertura, validacao, layout, erro e retentativa.
 * Nenhuma tinha CONCLUIDO uma tarefa de negocio. A r7 desistiu porque os
 * selects de apoio vinham vazios por limitacao do harness (JOINs -> 400);
 * o cadastro de Cliente, porem, usa apenas `clients` (200) e validacao
 * local, entao e mensuravel sem mock e sem dados reais.
 *
 * A primeira tentativa revelou um DEFEITO FUNCIONAL GRAVE: o formulario
 * enviava `document_type: 'cnpj'` enquanto a migration 20260702024835 exige
 * `CHECK (document_type IN ('CPF','CNPJ'))`. Todo INSERT falhava (23514) e
 * o toast sanitizado dizia so "Ocorreu um erro inesperado". O E2E isolado
 * (24/24) nunca criava cliente pela UI, entao nao detectava.
 *
 * `--preset=payload-antigo` reescreve SOMENTE o body do POST para
 * minusculas, reproduzindo o bug no MESMO build (A/B controlado).
 *
 * Uso:
 *   node scripts/ux-happy-path-audit.mjs --label=depois --assert
 *   node scripts/ux-happy-path-audit.mjs --label=antes-ab --preset=payload-antigo
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'happy');
const OUT = arg('out', '/home/user/ux-evidence');
const PRESET = arg('preset', '');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

const GENERATED = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado ausente (.env.e2e.generated)');
const env = Object.fromEntries(fs.readFileSync(GENERATED, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));

/** Gera CNPJ sintetico valido e unico por execucao (evita duplicata no seed). */
function makeCnpj() {
  const base = String(Date.now()).slice(-8).padStart(8, '0') + '0001';
  const dv = (b, pesos) => {
    const r = b.split('').reduce((s, d, i) => s + Number(d) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = dv(base, p1), d2 = dv(base + d1, p2);
  const c = base + d1 + d2;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

const CNPJ = makeCnpj();
const NOME = `Cliente Sintético ${String(Date.now()).slice(-6)}`;
const EMAIL = `r9-${String(Date.now()).slice(-6)}@exemplo.invalid`;

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
const inserts = [];
page.on('response', async (res) => {
  if (res.request().method() !== 'POST' || !res.url().includes('/rest/v1/clients')) return;
  let body = '';
  try { body = (await res.text()).slice(0, 300); } catch { /* noop */ }
  inserts.push({ status: res.status(), body });
});
page.on('pageerror', (e) => inserts.push({ jsError: String(e.message).slice(0, 160) }));

if (PRESET === 'payload-antigo') {
  // A/B: devolve o payload minusculo que a UI enviava antes da correcao.
  await context.route('**/rest/v1/clients?*', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    const body = (req.postData() || '').replace(/"document_type"\s*:\s*"CNPJ"/i, '"document_type":"cnpj"')
      .replace(/"document_type"\s*:\s*"CPF"/i, '"document_type":"cpf"');
    return route.continue({ postData: body });
  });
}

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 25000 });
await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 });
await page.waitForTimeout(1200);

const r = { label: LABEL, preset: PRESET || 'corrigido', cnpj: CNPJ, nome: NOME };
try {
  await page.goto(`${BASE}/comercial/clientes`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (document.querySelector('#main-content')?.innerText || '').includes('Total de Clientes'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  const beforeText = await page.locator('#main-content').innerText().catch(() => '');
  r.countBefore = Number((beforeText.match(/Total de Clientes\s*\n?\s*(\d+)/) || [])[1] ?? -1);

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
    const label = (await ai.nth(i).getAttribute('aria-label')) || '';
    if (/Cidade/i.test(label)) await ai.nth(i).fill('São Paulo');
  }
  await dlg.locator('button[role="combobox"]').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  const sp = page.getByRole('option', { name: /São Paulo/i }).first();
  if (await sp.count()) await sp.click();
  else await page.keyboard.press('Escape');

  await dlg.getByRole('button', { name: /Cadastrar Cliente/i }).click({ timeout: 8000 });
  // Amostra toasts ao longo de 2s (o toast Radix some rapido).
  const feedback = new Set();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(250);
    const texts = await page.evaluate(() => Array.from(document.querySelectorAll('[data-sonner-toast],[role="alert"],[role="status"],[data-state="open"]'))
      .map((e) => (e.textContent || '').trim()).filter((s) => s.length > 8 && s.length < 220));
    texts.forEach((t) => feedback.add(t));
  }
  r.feedback = [...feedback].slice(0, 8);
  r.successToast = [...feedback].some((t) => /cadastrado com sucesso/i.test(t));
  // O banner da r7 (queries de apoio que falham no harness) e o notice da r8
  // NAO sao o feedback da MUTACAO. Separa-los evita falso positivo.
  r.failureToast = [...feedback].find((t) =>
    /erro|não foi possível|inesperado/i.test(t) &&
    !/carregar alguns dados|demorando para carregar|Verifique sua conexão/i.test(t)) || null;
  r.actionableFailure = !!r.failureToast && /verifique|tente novamente/i.test(r.failureToast);
  r.dialogClosed = (await page.locator('[role="dialog"]').count()) === 0;
  const afterText = await page.locator('#main-content').innerText().catch(() => '');
  r.recordInList = afterText.includes(NOME);
  r.countAfter = Number((afterText.match(/Total de Clientes\s*\n?\s*(\d+)/) || [])[1] ?? -1);
  r.inserts = inserts;
  r.technicalLeak = r.feedback.some((t) => /PGRST|23514|constraint|SQL|document_type/i.test(t));
  r.jsErrors = inserts.filter((x) => x.jsError).length;
} catch (e) {
  r.error = String(e.message).slice(0, 200);
}
await browser.close();
fs.writeFileSync(path.join(OUT, `${LABEL}-happy.json`), JSON.stringify(r, null, 2));

const status = r.inserts?.[0]?.status ?? '-';
console.log(`[happy] preset=${r.preset} | POST=${status} | sucesso=${r.successToast ?? '-'} | dialogoFechado=${r.dialogClosed ?? '-'} | registroNaLista=${r.recordInList ?? '-'} | contagem=${r.countBefore}->${r.countAfter} | vazamento=${r.technicalLeak ?? '-'} | jsErrors=${r.jsErrors ?? '-'}`);
if (r.failureToast) console.log(`  falha: "${r.failureToast.slice(0, 130)}" | acionavel=${r.actionableFailure}`);
if (r.error) console.log('  ERRO:', r.error);

if (process.argv.includes('--assert')) {
  const problems = [];
  if (status !== 201) problems.push(`INSERT nao persistiu (status ${status})`);
  if (!r.successToast) problems.push('sem toast de sucesso');
  if (!r.dialogClosed) problems.push('dialogo nao fechou apos o sucesso');
  if (!r.recordInList) problems.push('registro nao apareceu na lista');
  if (r.countBefore >= 0 && r.countAfter !== r.countBefore + 1) problems.push(`contagem nao incrementou (${r.countBefore}->${r.countAfter})`);
  if (r.technicalLeak) problems.push('erro tecnico vazou para o usuario');
  if (r.jsErrors) problems.push('excecao JS nao tratada');
  if (!inserts.length) problems.push('nenhum INSERT observado: medicao vacua');
  if (problems.length) {
    console.error('UX HAPPY PATH ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('UX HAPPY PATH ASSERT OK: cliente criado, persistido e confirmado na lista, sem vazamento tecnico.');
}
