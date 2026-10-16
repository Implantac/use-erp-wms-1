import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
declare const process: { cwd(): string };

/**
 * Garante que o PDV varejo (`PDVDialog`) só é renderizado pela rota
 * `/comercial/pdv` (Painel Único). Qualquer outro módulo que instancie
 * `<PDVDialog ... />` deve falhar este teste.
 */

const SRC = join(process.cwd(), 'src');
const PDV_SOURCE_FILE = 'components/fiscal/PDVDialog.tsx';
const ALLOWED_RENDERER = 'modules/commercial/SalesDesk.tsx';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('PDV — fonte única', () => {
  const files = walk(SRC);

  it('apenas SalesDesk (rota /comercial/pdv) renderiza <PDVDialog />', () => {
    const renderers = files
      .filter((f) => {
        const rel = relative(SRC, f).replace(/\\/g, '/');
        if (rel === PDV_SOURCE_FILE) return false; // definição do componente
        if (rel.includes('/test/') || rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) return false;
        const src = readFileSync(f, 'utf8');
        return /<\s*PDVDialog[\s/>]/.test(src);
      })
      .map((f) => relative(SRC, f).replace(/\\/g, '/'));

    expect(renderers).toEqual([ALLOWED_RENDERER]);
  });

  it('nenhuma outra rota importa PDVDialog além do SalesDesk', () => {
    const importers = files
      .filter((f) => {
        const rel = relative(SRC, f).replace(/\\/g, '/');
        if (rel === PDV_SOURCE_FILE || rel === ALLOWED_RENDERER) return false;
        if (rel.includes('/test/') || rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) return false;
        return /from\s+['"]@\/components\/fiscal\/PDVDialog['"]/.test(readFileSync(f, 'utf8'));
      })
      .map((f) => relative(SRC, f).replace(/\\/g, '/'));

    expect(importers).toEqual([]);
  });
});
