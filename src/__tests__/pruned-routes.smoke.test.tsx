import { describe, expect, it } from 'vitest';

// Fumaça das rotas podadas: importar os módulos já monta os arrays de
// <Route> (JSX executa na construção) — se o PrunedRoute não estiver
// importado em algum deles, o ReferenceError aparece AQUI e não no
// navegador do cliente (bug real de 2026-10-23).
import { ProductionRoutes } from '@/routes/ProductionRoutes';
import SectorPcpCentral from '@/modules/production/SectorPcpCentral';
import { CommercialRoutes } from '@/routes/CommercialRoutes';

describe('rotas de Produção/Comercial com guarda da poda', () => {
  it('central de PCP por setor importa (guarda contra import faltando)', () => {
    expect(typeof SectorPcpCentral).toBe('function');
  });

  it('módulos importam e os arrays têm rotas', () => {
    expect(Array.isArray(ProductionRoutes)).toBe(true);
    expect(ProductionRoutes.length).toBeGreaterThan(0);
    expect(Array.isArray(CommercialRoutes)).toBe(true);
    expect(CommercialRoutes.length).toBeGreaterThan(0);
  });
});
