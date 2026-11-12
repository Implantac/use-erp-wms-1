#!/usr/bin/env node
/**
 * QA-UX r17 — leituras relacionadas NAO vazias + efeito em tres telas.
 * API/SQL reais no banco descartavel; configura apenas config.js e bloqueia
 * rede externa. Nao intercepta resposta de negocio, nao submete pedidos,
 * nao afirma venda/compra concluida. Mede listagem/detalhe e selecao de apoio.
 * Requer a API isolada e o Vite local em execucao.
 */
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLoopback, parseEnvFile } from './e2e-isolated-lib.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'related');
const OUT = arg('out', '/home/user/ux-evidence');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assertLoopback(BASE); assertLoopback(API);
if (!/^[a-z0-9_-]+$/i.test(LABEL)) throw new Error('label invalido');
fs.mkdirSync(OUT, { recursive: true });
const env = parseEnvFile(fs.readFileSync(path.join(ROOT, '.env.e2e.generated'), 'utf8'));
if (env.E2E_ISOLATED_MARKER !== 'QA-01-ISOLATED-E2E' || env.VITE_SUPABASE_URL !== API) {
  throw new Error('Marcador/origem do ambiente descartavel incoerente');
}
const fixtures = JSON.parse(env.E2E_RELATED_FIXTURES || 'null');
if (fixtures?.version !== 'QA17') throw new Error('Massa QA17 ausente: medicao seria vazia');
const own = fixtures.tenants.A;
const report = {
  label: LABEL, at: new Date().toISOString(), scope: 'isolated-synthetic',
  businessResponsesMocked: false, orderSubmissionTested: false,
  api: [], journeys: [], errors: [], businessWrites: [],
};
let browser;
try {
  const health = await (await fetch(`${API}/auth/v1/health`)).json();
  expect(health.marker).toBe(env.E2E_ISOLATED_MARKER);
  expect(health.relatedReads.version).toBe('QA-17');
  report.catalog = health.relatedReads;
  const authResponse = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.E2E_ADMIN_EMAIL, password: env.E2E_ADMIN_PASSWORD }),
  });
  expect(authResponse.status).toBe(200);
  const { access_token: token } = await authResponse.json();
  if (!token) throw new Error('Login real nao retornou sessao');
  for (const [table, select, id] of [
    ['products', '*,categories(name)', own.productId],
    ['orders', '*,order_items(*)', own.orderId],
    ['purchase_orders', '*,suppliers(name),purchase_order_items(*)', own.purchaseId],
  ]) {
    const response = await fetch(`${API}/rest/v1/${table}?${new URLSearchParams({ select })}`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY },
    });
    const body = await response.json();
    const row = Array.isArray(body) ? body.find((r) => r.id === id) : null;
    const r = { table, select, status: response.status, rootRows: Array.isArray(body) ? body.length : 0, fixtureFound: !!row };
    if (row) {
      r.toOne = table === 'products' ? row.categories : table === 'purchase_orders' ? row.suppliers : undefined;
      r.childRows = table === 'orders' ? row.order_items?.length : table === 'purchase_orders' ? row.purchase_order_items?.length : undefined;
      r.numericValue = table === 'products' ? row.cost_price : row.total;
      r.numericType = typeof r.numericValue;
    }
    report.api.push(r);
    expect(response.status).toBe(200);
    expect(r.rootRows).toBeGreaterThan(0);
    expect(r.fixtureFound).toBe(true);
    expect(r.numericType).toBe('number');
    expect(r.numericValue).toBe(table === 'products' ? 0 : 30);
    if (table === 'products') expect(r.toOne).toEqual({ name: 'Categoria sintetica QA17 A' });
    else expect(r.childRows).toBe(2);
    if (table === 'purchase_orders') expect(r.toOne).toEqual({ name: 'Fornecedor sintetico QA17 A' });
  }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    return [BASE, API].includes(u.origin) ? route.continue() : route.abort();
  });
  await context.route('**/config.js', (route) => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.__USE_ERP_CONFIG__ = { SUPABASE_URL: ${JSON.stringify(API)}, SUPABASE_PUBLISHABLE_KEY: "e2e-isolated-anon-key" };`,
  }));
  const page = await context.newPage();
  page.on('request', (request) => {
    const u = new URL(request.url());
    if (u.origin === API && /^\/rest\/v1\/(products|orders|order_items|purchase_orders|purchase_order_items|suppliers)$/.test(u.pathname)
      && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method())) {
      report.businessWrites.push({ method: request.method(), path: u.pathname });
    }
  });
  page.on('pageerror', (error) => report.errors.push(`JS: ${error.message.slice(0, 200)}`));
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
  await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });

  async function journey(id, route, task) {
    const r = { id, route, httpErrors: [], relatedResponses: [], checks: {} };
    const onResponse = (response) => {
      const u = new URL(response.url());
      if (u.origin !== API) return;
      if (response.status() >= 400) r.httpErrors.push({ status: response.status(), path: `${u.pathname}?${u.searchParams}` });
      if (u.searchParams.get('select')?.includes('(')) r.relatedResponses.push({ status: response.status(), table: u.pathname.split('/').pop() });
    };
    page.on('response', onResponse);
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await task(r);
      r.backendAlert = await page.locator('[data-ux-backend-error]').isVisible().catch(() => false);
      if (r.backendAlert) throw new Error('Banner de falha de backend no caminho normal');
      expect(r.relatedResponses.length, 'consulta relacionada precisa ocorrer na tela').toBeGreaterThan(0);
      expect(r.httpErrors, 'nenhuma falha HTTP no caminho normal').toEqual([]);
      r.completed = true;
    } catch (error) {
      r.error = String(error.message).slice(0, 300);
      report.errors.push(`${id}: ${r.error}`);
    } finally {
      await page.screenshot({ path: path.join(OUT, `${LABEL}-${id}.png`) }).catch(() => {});
      page.off('response', onResponse);
      report.journeys.push(r);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  await journey('products', '/estoque/produtos?q=QA17-A-OWN', async (r) => {
    const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'QA17-A-OWN', exact: true }) });
    await expect(row).toBeVisible({ timeout: 25000 });
    await expect(row).toContainText('Categoria sintetica QA17 A');
    r.checks.categoryInList = true;
    await row.getByRole('button').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Detalhes do Produto');
    r.checks.categoryInDetails = (await dialog.innerText()).includes('Categoria sintetica QA17 A');
    await expect(dialog, 'categoria do detalhe deve corresponder a listagem').toContainText('Categoria sintetica QA17 A');
  });

  await journey('sales', '/comercial/pedidos', async (r) => {
    const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'PV-QA17-A-01', exact: true }) });
    await expect(row).toContainText('2 itens', { timeout: 25000 });
    const totalKpi = page.getByText('Valor Total', { exact: true }).locator('..');
    await expect(totalKpi).toContainText('R$ 30,00');
    r.checks.totalKpi = (await totalKpi.innerText()).replace(/\s+/g, ' ');
    await row.getByRole('button', { name: 'Ações do pedido PV-QA17-A-01', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Visualizar', exact: true }).click();
    await expect(page.getByRole('dialog').locator('table tbody tr')).toHaveCount(2);
    r.checks.detailItems = await page.getByRole('dialog').locator('table tbody tr').count();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Novo Pedido', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /Selecionar cliente/ }).click();
    await expect(page.getByRole('option').first()).toBeVisible();
    r.checks.clientOptions = await page.getByRole('option').count();
    await page.getByRole('option').first().click();
    await dialog.getByRole('button', { name: /Próximo Passo/i }).click();
    await dialog.getByRole('button', { name: /Adicionar Item/i }).click();
    await dialog.getByRole('button', { name: /Selecionar produto/ }).click();
    const product = page.getByRole('option').filter({ hasText: 'QA17-A-OWN' });
    await expect(product).toBeVisible();
    r.checks.productOptions = await page.getByRole('option').count();
    await product.click();
    dialog = page.getByRole('dialog').first();
    await expect(dialog.getByRole('button', { name: /Próximo Passo/i })).toBeEnabled();
    r.checks.itemsStepCanAdvance = true; // Nao submeter o pedido.
  });

  await journey('purchases', '/compras/pedidos?q=PC-QA17-A-01', async (r) => {
    const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'PC-QA17-A-01', exact: true }) });
    await expect(row).toContainText('Fornecedor sintetico QA17 A', { timeout: 25000 });
    await row.getByRole('button').first().click();
    await page.getByRole('menuitem', { name: 'Visualizar', exact: true }).click();
    await expect(page.getByRole('dialog').locator('table tbody tr')).toHaveCount(2);
    r.checks.detailItems = await page.getByRole('dialog').locator('table tbody tr').count();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Novo Pedido', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Selecione o fornecedor', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Fornecedor sintetico QA17 A', exact: true })).toBeVisible();
    r.checks.supplierOptions = await page.getByRole('option').count();
    await page.getByRole('option', { name: 'Fornecedor sintetico QA17 A', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Selecione o produto', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Produto sintetico QA17 A OWN', exact: true })).toBeVisible();
    r.checks.productOptions = await page.getByRole('option').count();
    await page.getByRole('option', { name: 'Produto sintetico QA17 A OWN', exact: true }).click();
    r.checks.supportingFieldsSelected = true; // Nao clicar em Criar pedido.
  });
} catch (error) {
  report.errors.push(String(error.message).slice(0, 400));
} finally {
  if (browser) await browser.close();
  if (report.api.length !== 3) report.errors.push('Cobertura incompleta das tres consultas originais');
  if (report.journeys.length !== 3) report.errors.push('Cobertura incompleta das tres telas');
  if (report.businessWrites.length) report.errors.push('Auditoria de leitura tentou gravar pedido/cadastro');
  fs.writeFileSync(path.join(OUT, `${LABEL}-related.json`), JSON.stringify(report, null, 2));
}
console.log(`[related] API=${report.api.filter((r) => r.status === 200 && r.fixtureFound).length}/3 | telas=${report.journeys.filter((r) => r.completed).length}/3 | erros=${report.errors.length} | escritasNegocio=${report.businessWrites.length}`);
for (const error of report.errors) console.error(`  - ${error}`);
if (process.argv.includes('--assert') && report.errors.length) process.exitCode = 1;
