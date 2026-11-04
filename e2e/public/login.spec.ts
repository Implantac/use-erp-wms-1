import { test, expect } from '@playwright/test';

// Bloqueia toda origem externa, inclusive uma configuração de runtime inesperada.
test.beforeEach(async ({ context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4179' && !/^\/(auth|rest|storage|functions)\/v1\//.test(url.pathname)) {
      await route.continue();
    } else {
      await route.abort();
    }
  });
});

test('rota protegida exige login', async ({ page }) => {
  await page.goto('/operacional/abastecimento');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
});

test('mostrar e ocultar senha por clique', async ({ page }) => {
  await page.goto('/login');
  const password = page.locator('#password');
  await password.fill('teste-local');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar senha' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('abre recuperação e volta ao login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Esqueceu a senha?' }).click();
  await expect(page.getByText('Recuperar Senha')).toBeVisible();
  await expect(page.locator('#reset-email')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao login' }).click();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
});
