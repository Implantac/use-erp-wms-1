import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../src/hooks/production/useProductionRoutes.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260413135509_ab96916c-2156-4fd2-8e3d-8eeeb0ba76c4.sql', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/modules/production/ProductionRoutesPage.tsx', import.meta.url), 'utf8');

test('etapas dependem da FK com cascade, não de delete antecipado no frontend', () => {
  assert.match(migration, /route_id UUID NOT NULL REFERENCES public\.production_routes\(id\) ON DELETE CASCADE/);
  const removeBlock = hook.slice(hook.indexOf('const remove = async (id: string) => {'), hook.indexOf('return { routes, loading, refetch: fetch, create, update, remove };'));
  assert.doesNotMatch(removeBlock, /from\('production_route_steps'\)\.delete\(/);
  assert.match(removeBlock, /from\('production_routes'\)\.delete\(\)\.eq\('id', id\)\.eq\('company_id', companyId\)\.select\('id'\)/);
  assert.match(removeBlock, /error \|\| !data\?\.length/);
  assert.match(page, /if \(removed\) setDeleteId\(null\)/);
});
