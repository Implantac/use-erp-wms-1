import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUPPLY_CHAIN_STATUS_ORDER } from './supplyChainStatus';

const schema = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260807204950_98108fb8-1d46-406e-9a43-fd72faf1a288.sql'), 'utf8');

describe('supply chain visible stages', () => {
  it('only shows statuses permitted by the existing database CHECK', () => {
    const match = schema.match(/status TEXT NOT NULL DEFAULT 'requested' CHECK \(status IN \(([\s\S]*?)\)\)/);
    expect(match).not.toBeNull();
    const dbStatuses = [...match![1].matchAll(/'([^']+)'/g)].map(result => result[1]);
    expect(dbStatuses).toEqual([...SUPPLY_CHAIN_STATUS_ORDER.slice(0, 2), ...SUPPLY_CHAIN_STATUS_ORDER.slice(2), 'divergent']);
    expect(dbStatuses).not.toContain('reserved');
    expect(dbStatuses).not.toContain('delivered');
  });
  it('ships a database guard for direct authenticated status updates', () => {
    const guard = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008220000_block_unsafe_supply_chain_status_changes.sql'), 'utf8');
    expect(guard).toMatch(/BEFORE UPDATE OF status ON public\.supply_chain_movements/);
    expect(guard).toMatch(/current_user = 'authenticated'/);
    expect(guard).toMatch(/OLD\.status IS DISTINCT FROM NEW\.status/);
  });
});
