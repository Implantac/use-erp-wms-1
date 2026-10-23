import { test, expect } from '@playwright/test';

/**
 * Smoke de CLIQUE da jornada (navegador de verdade): login da Loja abre a
 * Central com a Fila do Dia; login do gestor abre o WMS com a caixa de
 * entrada da Fábrica; a tela de NF-e mostra o Assistente fiscal.
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

async function login(page: any, email: string, password: string) {
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
  });

  test('Gestor: WMS abre com Operação da rede hoje e caixa da Fábrica', async ({ page }) => {
    await login(page, managerEmail!, managerPassword!);
    await page.goto('/wms/dashboard');
    await expect(page.getByText('Operação da rede hoje').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Caixa de entrada da Fábrica').first()).toBeVisible({ timeout: 20_000 });
  });

  test('Fiscal: NF-e abre com o Assistente fiscal da empresa', async ({ page }) => {
    await login(page, managerEmail!, managerPassword!);
    await page.goto('/fiscal/nfe');
    await expect(page.getByText('Assistente fiscal da empresa').first()).toBeVisible({ timeout: 20_000 });
  });
});
