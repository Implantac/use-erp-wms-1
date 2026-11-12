#!/usr/bin/env node
/**
 * QA-UX (rodada 5) — auditoria de RESPONSIVIDADE e ALVOS DE TOQUE.
 *
 * Mede com Chromium real, em 5 viewports e 12 rotas no isolado (r16).
 * 720x450 e reflow equivalente a metade de 1440x900: NAO e zoom nativo.
 * O gate exige cobertura completa e zero defeitos em TODOS os viewports:
 *  - overflow horizontal do documento;
 *  - CABECALHOS DE TABELA QUEBRADOS EM SILABAS (o defeito clinico mais
 *    visivel em 375px: "Parâm/etro", "Categ/oria", "Val/or");
 *  - controles interativos que ficam FORA da viewport, excluindo
 *    deliberadamente drawers/sidebars off-canvas (fechados por design);
 *  - alvos de toque abaixo de 24x24 (WCAG 2.2 / 2.5.8) e 44x44.
 *
 * Uso:
 *   node scripts/ux-responsive-audit.mjs --label=antes --out=/home/user/ux-evidence
 *   node scripts/ux-responsive-audit.mjs --label=depois --assert
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { RESPONSIVE_ROUTES as ROUTES, RESPONSIVE_VIEWPORTS as VIEWPORTS, responsiveProblems, responsivePageState } from './ux-responsive-lib.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179';
const API = 'http://127.0.0.1:54321';
const LABEL = arg('label', 'responsive');
const OUT = arg('out', '/home/user/ux-evidence');
/** A/B controlado: injeta uma estrategia de correcao sem alterar o codigo. */
const PRESET = arg('preset', '');
const ONLY = arg('viewports', '');
const ASSERT = process.argv.includes('--assert');
const PRESET_CSS = {
  'th-nowrap': 'table th { white-space: nowrap !important; }',
  'table-minw': 'table { min-width: 720px !important; }',
  'both': 'table th { white-space: nowrap !important; } table { min-width: 720px !important; }',
  'colspan-fix': 'table td[colspan] > * { position: sticky !important; left: 0 !important; max-width: calc(100vw - 3rem) !important; }',
  'colspan-fix2': 'table td[colspan] > * { position: sticky !important; left: 0 !important; max-width: min(calc(100vw - 3rem), 420px) !important; }',
};
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(OUT, { recursive: true });

// --viewports e --preset sao recursos de diagnostico. --assert continua
// exigindo todos os cinco viewports; CSS injetado nao pode produzir verde.
if (ONLY && ONLY.split(',').some((name) => !VIEWPORTS.some((v) => v.name === name))) {
  throw new Error(`Viewport desconhecido: ${ONLY}`);
}
if (PRESET && !Object.hasOwn(PRESET_CSS, PRESET)) throw new Error(`Preset desconhecido: ${PRESET}`);
if (ASSERT && PRESET) throw new Error('--assert nao aceita --preset: valide o CSS real do produto.');

const GENERATED = path.join(ROOT, '.env.e2e.generated');
if (!fs.existsSync(GENERATED)) throw new Error('Ambiente isolado ausente (.env.e2e.generated)');
const env = Object.fromEntries(fs.readFileSync(GENERATED, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));

const REPORT = {
  label: LABEL, at: new Date().toISOString(), preset: PRESET,
  method: { kind: 'CSS viewport reflow', nativeBrowserZoom: false },
  viewports: [],
};
const browser = await chromium.launch({ headless: true });

for (const vp of VIEWPORTS.filter((v) => !ONLY || ONLY.split(',').includes(v.name))) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 2, locale: 'pt-BR',
  });
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

  const vpResult = { viewport: vp.name, width: vp.width, height: vp.height, routes: [] };
  for (const route of ROUTES) {
    let navigationError = null;
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForFunction(() => {
        const t = (document.querySelector('#main-content')?.innerText || '').trim();
        return t.length > 250 && !/^Início\s+\S+\s*Carregando/.test(t);
      }, { timeout: 7000 }).catch(() => {});
      await page.waitForTimeout(1000);
      if (PRESET_CSS[PRESET]) {
        await page.addStyleTag({ content: PRESET_CSS[PRESET] });
        await page.waitForTimeout(120);
      }
    } catch (error) { navigationError = String(error?.message || error); }

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const visible = (e) => {
        const r = e.getBoundingClientRect(), s = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
      };
      // Um drawer/sidebar FECHADO fica fora da viewport por design — nao e defeito.
      const inClosedDrawer = (e) => {
        let n = e;
        while (n && n !== document.documentElement) {
          if (n.getAttribute?.('aria-hidden') === 'true' || n.getAttribute?.('data-state') === 'closed') return true;
          const t = getComputedStyle(n).transform;
          if (t && t !== 'none' && /matrix\(1, 0, 0, 1, -/.test(t)) return true;
          n = n.parentElement;
        }
        return false;
      };
      const interactive = Array.from(document.querySelectorAll('button,a,input,select,textarea,[role="button"]')).filter(visible);
      const skipLink = (e) => /pular para o conte/i.test((e.textContent || '') + (e.getAttribute('href') || ''));
      // Conteudo dentro de um container que ROLA horizontalmente nao esta
      // "cortado": o usuario alcança pelo scroll. Excluir esse falso positivo.
      const inScrollableX = (e) => {
        let n = e.parentElement;
        while (n && n !== document.documentElement) {
          const cs = getComputedStyle(n);
          if (/auto|scroll/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 2) return true;
          n = n.parentElement;
        }
        return false;
      };

      const offscreen = interactive.filter((e) => {
        if (inClosedDrawer(e) || inScrollableX(e)) return false;
        const r = e.getBoundingClientRect();
        return r.right > innerWidth + 2 || r.left < -2;
      }).map((e) => ({
        tag: e.tagName, text: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 40),
        right: Math.round(e.getBoundingClientRect().right),
      }));

      const onscreen = interactive.filter((e) => !inClosedDrawer(e) && !skipLink(e) &&
        e.getBoundingClientRect().right <= innerWidth + 2 && e.getBoundingClientRect().left >= -2);
      const tiny = onscreen.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width < 24 || r.height < 24;
      }).map((e) => ({ tag: e.tagName, w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), text: (e.textContent || '').trim().slice(0, 25) }));
      const under44 = onscreen.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width < 44 || r.height < 44;
      }).length;

      // Cabecalho QUEBRADO = o texto nao cabe em uma linha na largura
      // disponivel da celula. Medimos a largura natural do texto com um span
      // nowrap que copia a fonte exata do <th> (a altura da celula NAO serve:
      // padding e icones geravam 100% de falsos positivos).
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;left:-99999px;top:0;white-space:nowrap;visibility:hidden;';
      document.body.appendChild(probe);
      const naturalWidth = (th) => {
        const cs = getComputedStyle(th);
        probe.style.font = cs.font;
        probe.style.letterSpacing = cs.letterSpacing;
        probe.style.textTransform = cs.textTransform;
        probe.textContent = (th.innerText || th.textContent || '').trim();
        return probe.getBoundingClientRect().width;
      };
      const tables = [];
      for (const table of Array.from(document.querySelectorAll('table')).filter(visible)) {
        const ths = Array.from(table.querySelectorAll('th')).filter(visible);
        const wrapped = ths.filter((th) => {
          const cs = getComputedStyle(th);
          const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
          return naturalWidth(th) > th.clientWidth - pad + 3;
        });
        const wrap = table.parentElement;
        const wrapCs = wrap ? getComputedStyle(wrap) : null;
        tables.push({
          ths: ths.length, wrappedThs: wrapped.length,
          samples: wrapped.slice(0, 4).map((th) => (th.textContent || '').trim().slice(0, 22)),
          tableW: Math.round(table.getBoundingClientRect().width),
          wrapW: wrap ? Math.round(wrap.getBoundingClientRect().width) : 0,
          wrapScrollable: !!wrapCs && /auto|scroll/.test(wrapCs.overflowX),
          wrapHasScroll: !!wrap && wrap.scrollWidth > wrap.clientWidth + 2,
          // WCAG 2.1.1: uma regiao que rola precisa ser alcancavel por teclado.
          wrapFocusable: !!wrap && wrap.tabIndex >= 0,
          wrapRegion: wrap?.getAttribute('role') === 'region',
        });
      }
      probe.remove();

      // Estado vazio renderizado dentro de <td colSpan> herda a largura da
      // tabela rolavel e pode ficar cortado apos a correcao de nowrap.
      const clippedColspan = Array.from(document.querySelectorAll('td[colspan]')).filter(visible)
        .flatMap((td) => Array.from(td.children))
        .filter((el) => el.getBoundingClientRect().right > innerWidth + 2)
        .map((el) => (el.textContent || '').trim().slice(0, 36));

      const main = document.querySelector('#main-content');
      const mainTextLength = (main?.innerText || '').trim().length;
      const localError = main?.querySelector('[data-ux-users-error]');
      const localErrorAlert = !!localError && visible(localError) && localError.getAttribute('role') === 'alert';
      const animatedIndicators = Array.from(main?.querySelectorAll('.animate-spin') || []).filter(visible).length;
      const markedPageLoaders = Array.from(main?.querySelectorAll('[data-ux-loading="true"]') || []).filter(visible).length;
      return {
        currentPath: location.pathname, effectiveWidth: innerWidth, mainTextLength,
        mainHeading: (main?.querySelector('h1,h2,[role="heading"]')?.textContent || '').trim(),
        localErrorAlert, animatedIndicators, markedPageLoaders,
        mainBusy: main?.getAttribute('aria-busy') === 'true',
        mainRendered: !!main && visible(main) && mainTextLength >= 50,
        controlCount: interactive.filter((e) => !inClosedDrawer(e) && !skipLink(e)).length,
        docOverflow: Math.max(0, de.scrollWidth - de.clientWidth),
        offscreen, tiny, under44, tables, clippedColspan,
      };
    });
    vpResult.routes.push({ route, navigationError, ...m, pageState: responsivePageState(m) });
  }
  REPORT.viewports.push(vpResult);
  await context.close();
}
await browser.close();

fs.writeFileSync(path.join(OUT, `${LABEL}-responsive.json`), JSON.stringify(REPORT, null, 2));

  for (const v of REPORT.viewports) {
    const sum = (k) => v.routes.reduce((s, r) => s + r[k].length, 0);
    const wrapped = v.routes.reduce((s, r) => s + r.tables.reduce((a, t) => a + t.wrappedThs, 0), 0);
    const tables = v.routes.reduce((s, r) => s + r.tables.length, 0);
    console.log(`[responsive] ${v.viewport.padEnd(8)} ${v.width}px | rotas=${v.routes.length}/${ROUTES.length} | estadosErro=${v.routes.filter((r) => r.pageState === 'backend-error').length} | overflowDoc=${v.routes.reduce((s,r)=>s+r.docOverflow,0)} | foraDaViewport=${sum('offscreen')} | alvos<24=${sum('tiny')} | alvos<44=${v.routes.reduce((s,r)=>s+r.under44,0)} | tabelas=${tables} thQuebrados=${wrapped} vaziosCortados=${sum('clippedColspan')}`);
  }
for (const v of REPORT.viewports.filter((x) => x.viewport !== 'desktop')) {
  for (const r of v.routes) {
    const w = r.tables.reduce((a, t) => a + t.wrappedThs, 0);
    if (w || r.offscreen.length || r.docOverflow)
      console.log(`  ${v.viewport}/${r.route.padEnd(25)} thQuebrados=${w} fora=${r.offscreen.length} overflow=${r.docOverflow}`);
  }
}

if (ASSERT) {
  const problems = responsiveProblems(REPORT);
  if (problems.length) {
    console.error('UX RESPONSIVE ASSERT FALHOU:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('UX RESPONSIVE ASSERT OK: 5 viewports x 12 rotas; 0 alvos <24px, 0 controles fora, 0 overflow, 0 cabecalhos/estados vazios cortados; regioes rolaveis focaveis.');
}
