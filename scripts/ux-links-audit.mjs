#!/usr/bin/env node
/**
 * QA-UX (2a rodada, 10/11/2026) — auditoria de LINKS por navegação real.
 *
 * Extrai os `href` do menu (src/config/navigation/sections/*.ts), faz login no
 * AMBIENTE ISOLADO e visita cada rota com Chromium de verdade, detectando:
 *   - "Página não encontrada" / 404 dentro do MainLayout;
 *   - loader preso ou conteúdo principal vazio;
 *   - mensagens técnicas vazadas para o usuário.
 *
 * Segurança: identidades de teste do próprio harness (.env.e2e.generated),
 * /config.js substituído em voo, toda origem externa abortada, Postgres
 * descartável em 127.0.0.1. Sem produção, sem dados de cliente, sem segredos.
 *
 *   node scripts/ux-links-audit.mjs --label=antes --out=/home/user/ux-evidence
 *   node scripts/ux-links-audit.mjs --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'links');
const OUT = arg('out', '/home/user/ux-evidence');
const ROOT = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '..');
const SECTIONS = path.join(ROOT, 'src/config/navigation/sections');
fs.mkdirSync(OUT, { recursive: true });

// 1) Links declarados no menu (determinístico, independe de submenu colapsado).
const menuLinks = new Set();
for (const file of fs.readdirSync(SECTIONS).filter((f) => f.endsWith('.ts'))) {
  const src = fs.readFileSync(path.join(SECTIONS, file), 'utf8');
  for (const m of src.matchAll(/href:\s*['"`](\/[^'"`]+)['"`]/g)) {
    const href = m[1].split('?')[0].split('#')[0];
    if (href && !href.includes('${')) menuLinks.add(href);
  }
}

const GENERATED = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado ausente (.env.e2e.generated)');
const env = Object.fromEntries(fs.readFileSync(GENERATED, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
if (!env.E2E_ADMIN_EMAIL || !env.E2E_ADMIN_PASSWORD) throw new Error('Identidade de teste ausente');

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
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)));

// 2) Login.
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 20000 });
await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
await page.waitForTimeout(2000);

// 3) Complementa com os <a href> realmente renderizados no layout.
const domLinks = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a[href^="/"]'))
    .map((a) => a.getAttribute('href').split('?')[0].split('#')[0])
    .filter((h) => h && h !== '/')
);
const allLinks = [...new Set([...menuLinks, ...domLinks])].sort();

const results = [];
for (const href of allLinks) {
  const t = Date.now();
  let timedOut = false;
  try {
    await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForFunction(
      () => (document.querySelector('#main-content')?.innerText ?? '').trim().length > 80,
      { timeout: 4000 }
    );
  } catch { timedOut = true; }
  // Algumas rotas redirecionam (Navigate) logo apos o primeiro paint; tolera
  // a troca de contexto em vez de abortar a auditoria inteira.
  let body = '', main = '';
  try {
    await page.waitForTimeout(150);
    body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    main = (await page.evaluate(() => document.querySelector('#main-content')?.innerText ?? '')).replace(/\s+/g, ' ');
  } catch { body = ''; main = ''; }
  const notFound = /Página não encontrada|404/.test(body);
  const technical = /Failed to fetch|TypeError|ReferenceError|PGRST|permission denied|relation .* does not exist/i.test(body);
  results.push({
    href, ms: Date.now() - t, timedOut, notFound, technical,
    stuckLoading: /Inicializando Ecossistema|Sincronizando Ecossistema/.test(body) && main.length < 80,
    mainLen: main.length,
    finalUrl: page.url().replace(BASE, ''),
    excerpt: main.slice(0, 90),
  });
}

// "Quebrado" = 404 ou area completamente vazia. Timeout isolado NAO e falha:
// varias paginas dependem de Edge Functions/Realtime que o harness nao
// implementa (404/405) e ficam em loading; isso e limitacao do ambiente.
const broken = results.filter((r) => r.notFound || (r.mainLen < 20 && !r.technical));
const slow = results.filter((r) => r.timedOut || r.stuckLoading);
const report = {
  label: LABEL, at: new Date().toISOString(),
  menuLinks: menuLinks.size, domLinks: domLinks.length, totalVisited: results.length,
  broken, slow, technicalLeaks: results.filter((r) => r.technical),
  avgMs: Math.round(results.reduce((s, r) => s + r.ms, 0) / Math.max(1, results.length)),
  pageErrors: [...new Set(pageErrors)].slice(0, 10),
  results,
};
fs.writeFileSync(path.join(OUT, `${LABEL}-links.json`), JSON.stringify(report, null, 2));
console.log(`[links] ${report.totalVisited} rotas visitadas | media ${report.avgMs}ms | quebradas ${broken.length} | lentas no isolado ${slow.length} | vazamentos tecnicos ${report.technicalLeaks.length}`);
for (const b of broken) console.log(`  QUEBRADO ${b.href} (404=${b.notFound} timeout=${b.timedOut} loader=${b.stuckLoading}) -> ${b.finalUrl}`);
await browser.close();

if (process.argv.includes('--assert') && broken.length) {
  console.error(`UX LINKS ASSERT FALHOU: ${broken.length} rota(s) quebrada(s)`);
  process.exit(1);
}
if (process.argv.includes('--assert')) console.log('UX LINKS ASSERT OK: nenhuma rota do menu quebrada.');
