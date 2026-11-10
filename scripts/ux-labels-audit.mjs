#!/usr/bin/env node
/**
 * QA-UX (rodada 4) — auditoria de NOMES ACESSÍVEIS, RÓTULOS e CONTRASTE.
 *
 * Mede, com Chromium real no ambiente isolado:
 *  - botoes sem nome acessivel (sem texto, aria-label, title ou labelledby);
 *  - campos de formulario sem rotulo associado (placeholder NAO conta);
 *  - contraste de texto vs fundo efetivo (WCAG AA: >= 4.5, >= 3 para texto
 *    grande), subindo na arvore DOM ate achar um background opaco.
 *
 * Uso:
 *   node scripts/ux-labels-audit.mjs --label=antes --out=/home/user/ux-evidence
 *   node scripts/ux-labels-audit.mjs --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'labels');
const OUT = arg('out', '/home/user/ux-evidence');
/** A/B controlado: injeta o token antigo para medir o "antes" no mesmo codigo. */
const OVERRIDE_MUTED = arg('override-muted', '');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  '/dashboard', '/comercial/pedidos', '/comercial/clientes', '/producao/ordens',
  '/producao/apontamento', '/producao/terminal', '/compras/pedidos',
  '/wms/recebimento', '/wms/dashboard', '/financeiro/receber',
  '/admin/parametros', '/fiscal/nfe',
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
await page.waitForSelector('#email', { timeout: 20000 });
await page.locator('#email').fill(env.E2E_ADMIN_EMAIL);
await page.locator('#password').fill(env.E2E_ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
await page.waitForTimeout(1800);

const AUDIT_FN = () => {
  const parseColor = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map((v) => parseFloat(v.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const effectiveBg = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.95) return c;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0';
  };
  const accessibleName = (el) =>
    (el.getAttribute('aria-label') || '').trim() ||
    (el.getAttribute('title') || '').trim() ||
    (el.textContent || '').trim() ||
    (el.getAttribute('aria-labelledby') ? 'labelledby' : '');

  const main = document.querySelector('#main-content') || document.body;
  const buttons = Array.from(main.querySelectorAll('button')).filter(visible);
  const unnamedButtons = buttons.filter((b) => !accessibleName(b)).map((b) => ({
    html: b.outerHTML.slice(0, 150),
    parent: (b.parentElement?.className || '').toString().slice(0, 60),
  }));

  const fields = Array.from(main.querySelectorAll('input:not([type="hidden"]), select, textarea')).filter(visible);
  const unlabelledFields = fields.filter((f) => {
    if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby')) return false;
    if (f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)) return false;
    if (f.closest('label')) return false;
    return true;
  }).map((f) => ({
    tag: f.tagName, type: f.getAttribute('type') || '',
    placeholder: (f.getAttribute('placeholder') || '').slice(0, 40),
    id: f.id || '',
  }));

  // Contraste: amostra elementos com texto direto (evita duplicar ancestrais).
  const textEls = Array.from(main.querySelectorAll('h1,h2,h3,p,span,td,th,label,button,a,small'))
    .filter((el) => visible(el) && (el.textContent || '').trim().length > 1)
    .filter((el) => !Array.from(el.children).some((c) => (c.textContent || '').trim().length > 1))
    .slice(0, 160);
  const lowContrast = [];
  for (const el of textEls) {
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    if (!fg) continue;
    const bg = effectiveBg(el);
    const r = ratio(fg, bg);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const threshold = large ? 3 : 4.5;
    if (r < threshold) lowContrast.push({
      text: (el.textContent || '').trim().slice(0, 42),
      tag: el.tagName, ratio: Math.round(r * 100) / 100, threshold,
      color: cs.color, size,
    });
  }

  return {
    buttons: buttons.length, unnamedButtons,
    fields: fields.length, unlabelledFields,
    textSampled: textEls.length, lowContrast,
  };
};

const report = { label: LABEL, at: new Date().toISOString(), routes: [] };
for (const route of ROUTES) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
    // Nao medir enquanto o chunk lazy ainda carrega: "Carregando pedidos..."
    // so com breadcrumb gerava uma amostra falsamente vazia.
    await page.waitForFunction(
      () => {
        const t = (document.querySelector('#main-content')?.innerText || '').trim();
        return t.length > 250 && !/^Início\s+\S+\s*Carregando/.test(t);
      },
      { timeout: 6000 }
    ).catch(() => {});
    await page.waitForTimeout(1200);
    if (OVERRIDE_MUTED) {
      await page.addStyleTag({ content: `:root { --muted-foreground: 215 16% ${OVERRIDE_MUTED}% !important; }` });
      await page.waitForTimeout(120);
    }
  } catch { /* mede o que renderizou */ }
  const m = await page.evaluate(AUDIT_FN);
  report.routes.push({ route, ...m });
}
fs.writeFileSync(path.join(OUT, `${LABEL}-labels.json`), JSON.stringify(report, null, 2));

const sum = (k) => report.routes.reduce((s, r) => s + r[k].length, 0);
console.log(`[labels] ${report.routes.length} rotas | botoes=${report.routes.reduce((s,r)=>s+r.buttons,0)} sem nome=${sum('unnamedButtons')} | campos=${report.routes.reduce((s,r)=>s+r.fields,0)} sem rotulo=${sum('unlabelledFields')} | textos=${report.routes.reduce((s,r)=>s+r.textSampled,0)} contraste baixo=${sum('lowContrast')}`);
for (const r of report.routes) {
  if (r.unnamedButtons.length || r.unlabelledFields.length || r.lowContrast.length)
    console.log(`  ${r.route.padEnd(28)} semNome=${r.unnamedButtons.length} semRotulo=${r.unlabelledFields.length} contrasteBaixo=${r.lowContrast.length}`);
}
await browser.close();

if (process.argv.includes('--assert')) {
  /**
   * Divida de IDENTIDADE VISUAL, congelada e explicitamente reportada.
   *
   * Estas sao as cores semanticas da marca (primary laranja, success verde,
   * info azul, roxo de grafico, amber-800) usadas como TEXTO. Corrigi-las
   * exigiria alterar 779 + 185 + 37 ocorrencias e a paleta definida no
   * briefing de produto — decisao de design, nao uma correcao tecnica.
   *
   * O assert NAO as ignora: exige que o conjunto seja exatamente o registrado
   * abaixo (cores e contagem maxima). Qualquer cor nova com contraste baixo,
   * qualquer regressao de --muted-foreground/--warning, ou qualquer piora
   * nesta divida faz o assert falhar.
   */
  const BRAND_COLORS = new Set([
    'rgb(242, 149, 44)', // --primary (laranja da marca)
    'rgb(32, 177, 109)', // --success
    'rgb(32, 148, 243)', // --info
    'rgb(168, 85, 247)', // roxo literal em grafico do WMS
    'rgb(161, 98, 7)',   // amber-800 (4.48, marginal)
  ]);
  const BASELINE_BRAND_PENDING = 11; // medido em 2026-11-10, rodada 4

  const all = report.routes.flatMap((r) => r.lowContrast);
  const brand = all.filter((x) => BRAND_COLORS.has(x.color));
  const other = all.filter((x) => !BRAND_COLORS.has(x.color));
  const problems = [];
  if (sum('unnamedButtons')) problems.push(`${sum('unnamedButtons')} botoes sem nome`);
  if (sum('unlabelledFields')) problems.push(`${sum('unlabelledFields')} campos sem rotulo`);
  if (other.length) problems.push(`${other.length} contrastes baixos fora da divida congelada: ${[...new Set(other.map((x) => x.color))].join(', ')}`);
  if (brand.length > BASELINE_BRAND_PENDING) problems.push(`divida de identidade visual cresceu: ${brand.length} > ${BASELINE_BRAND_PENDING}`);

  if (problems.length) {
    console.error('UX LABELS ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log(`UX LABELS ASSERT OK: 0 botoes sem nome, 0 campos sem rotulo, 0 regressoes de contraste.`);
  console.log(`  Divida de identidade visual CONGELADA e reportada: ${brand.length} textos (baseline ${BASELINE_BRAND_PENDING}) — aguardando decisao de design.`);
}
