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

// QA-UX (10/11/2026) — regressões da revisão clínica da porta de entrada.
// Ver docs/AVALIACAO-UX-2026-11-10.md para as medições ANTES/DEPOIS.
test('campos apoiam gestor de senhas e leitores de tela', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('#email')).toHaveAttribute('autocomplete', 'username');
  await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.locator('#email')).toHaveJSProperty('required', true);
  await expect(page.locator('#password')).toHaveJSProperty('required', true);
  // O usuário de ERP digita o email todos os dias: o foco já começa nele.
  await expect(page.locator('#email')).toBeFocused();
});

test('submit vazio aponta o campo e foca nele', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('#email-error')).toHaveText('Informe seu email.');
  await expect(page.locator('#password-error')).toHaveText('Informe sua senha.');
  await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#email')).toBeFocused();
});

test('erro de rede recebe mensagem acionável em português', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('usuario@teste.local');
  await page.locator('#password').fill('senha-teste-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Sem conexão com o servidor. Verifique sua internet e tente novamente.')).toBeVisible();
  // Nenhum detalhe técnico deve vazar para o usuário final.
  await expect(page.getByText('Failed to fetch')).toHaveCount(0);
});

test('formulário permanece visível com animações desligadas', async ({ page }) => {
  await page.goto('/login');
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none !important;transition:none !important}' });
  const opacity = await page.locator('.login-card-anim').evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(opacity).toBe(1);
});

test('launchpad legado não aparece na tela de login', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Workflow Switcher')).toHaveCount(0);
});
