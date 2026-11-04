import { test, expect, type Page } from '@playwright/test';

/**
 * Smoke de CLIQUE da jornada (navegador de verdade): login da Loja abre a
 * Central com a Fila do Dia e formulário; login do gestor abre a Central
 * de Abastecimento com a caixa da Fábrica; NF-e mostra o Assistente fiscal.
 *
 * Não depende de massa operacional: valida que as telas-assinatura de
 * cada papel renderizam. A jornada transacional completa (pedir ->
 * decidir -> expedir -> receber) está em store-journey.spec.ts (API).
 * Sem as variáveis, é ignorado explicitamente. Ver docs/E2E-Lojas.md.
 */
declare const process: { env: Record<string, string | undefined> };

const storeEmail = process.env.E2E_STORE_EMAIL;
const storePassword = process.env.E2E_STORE_PASSWORD;
const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;
const configured = Boolean(storeEmail && storePassword && managerEmail && managerPassword);

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /entrar|login|acessar/i }).first().click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

test.describe('Smoke de clique por papel', () => {
  test.skip(!configured, 'Configure E2E_STORE_EMAIL/PASSWORD e E2E_MANAGER_EMAIL/PASSWORD.');

  test('Loja: Central abre com a Fila do Dia', async ({ page }) => {
    await login(page, storeEmail!, storePassword!);
    await page.goto('/operacional/loja/central');
    await expect(page.getByText('Fila do dia').first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: 'Solicitar', exact: true }).click();
    await expect(page.getByText('Nova Solicitação de Abastecimento')).toBeVisible();
    await expect(page.getByLabel('Produto', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Quantidade', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Solicitar abastecimento', exact: true })).toBeVisible();
    // Não envia: este smoke não deve criar solicitações nem movimentar estoque.
  });

  test('Gestor: abre a Central de Abastecimento e a caixa da Fábrica', async ({ page }) => {
    await login(page, managerEmail!, managerPassword!);
    await page.goto('/operacional/abastecimento');
    await expect(page.getByRole('heading', { name: 'Central de Abastecimento' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Solicitações das Lojas — caixa de entrada da Fábrica/i)).toBeVisible({ timeout: 20_000 });
  });

  test('Fiscal: NF-e abre com o Assistente fiscal da empresa', async ({ page }) => {
    await login(page, managerEmail!, managerPassword!);
    await page.goto('/fiscal/nfe');
    await expect(page.getByText('Assistente fiscal da empresa').first()).toBeVisible({ timeout: 20_000 });
  });
});
