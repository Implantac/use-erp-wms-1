import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SECTOR_EVENT_LABELS,
  SECTOR_EVENT_TYPES,
  isValidSectorEvent,
  sectorEventLabel,
  sectorKindFromSectorText,
  type SectorProfileKind,
} from './sectorProfiles';

describe('vocabulário de eventos por setor', () => {
  it('toda chave tem rótulo em português', () => {
    for (const types of Object.values(SECTOR_EVENT_TYPES)) {
      for (const type of types) {
        expect(sectorEventLabel(type)).not.toBe(type);
        expect(SECTOR_EVENT_LABELS[type]).toBeTruthy();
      }
    }
  });

  it('eventos específicos pertencem só ao seu setor', () => {
    expect(isValidSectorEvent('fiacao', 'doffing')).toBe(true);
    expect(isValidSectorEvent('fiacao', 'fiber_break')).toBe(true);
    expect(isValidSectorEvent('tinturaria', 'fiber_break')).toBe(false);
    expect(isValidSectorEvent('tinturaria', 'bath_start')).toBe(true);
    expect(isValidSectorEvent('tinturaria', 're_dye')).toBe(true);
    expect(isValidSectorEvent('malharia', 'roll_change')).toBe(true);
    expect(isValidSectorEvent('malharia', 'bath_start')).toBe(false);
    // Tecelagem tem tabela/RPC próprias: seus eventos não entram neste vocabulário.
    for (const kind of Object.keys(SECTOR_EVENT_TYPES) as SectorProfileKind[]) {
      expect(isValidSectorEvent(kind, 'warp_break')).toBe(false);
      expect(isValidSectorEvent(kind, 'beam_change')).toBe(false);
    }
  });

  it('eventos comuns existem nos três setores', () => {
    for (const kind of ['fiacao', 'malharia', 'tinturaria'] as SectorProfileKind[]) {
      for (const type of ['setup', 'start', 'pause', 'resume', 'stop', 'quality_hold', 'quality_release', 'inspection', 'note']) {
        expect(isValidSectorEvent(kind, type)).toBe(true);
      }
    }
  });
});

describe('identificação do setor da OP', () => {
  it('mapeia os setores reais, com malharia antes de tecelagem', () => {
    expect(sectorKindFromSectorText('Fiação')).toBe('fiacao');
    expect(sectorKindFromSectorText('Malharia')).toBe('malharia');
    expect(sectorKindFromSectorText('Tear Circular')).toBe('malharia');
    expect(sectorKindFromSectorText('Tecelagem')).toBe('tecelagem');
    expect(sectorKindFromSectorText('Tinturaria')).toBe('tinturaria');
    expect(sectorKindFromSectorText('Tinturaria e Acabamento')).toBe('tinturaria');
  });
  it('retorna null para setor ausente ou desconhecido', () => {
    expect(sectorKindFromSectorText(null)).toBeNull();
    expect(sectorKindFromSectorText('')).toBeNull();
    expect(sectorKindFromSectorText('Expedição')).toBeNull();
  });
});

describe('migration 20261019180000 espelha o vocabulário da lib', () => {
  const sql = readFileSync('supabase/migrations/20261019180000_sector_pcp_profiles.sql', 'utf8');

  it('CHECK da tabela cobre exatamente a união dos três setores', () => {
    const checkMatch = sql.match(/sector_production_events_type_check CHECK \(event_type IN \(([\s\S]*?)\)\)/);
    expect(checkMatch).not.toBeNull();
    const inSql = [...checkMatch![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const union = [...new Set(Object.values(SECTOR_EVENT_TYPES).flat())].sort();
    expect(inSql).toEqual(union);
  });

  it('RPC record_sector_event valida o mesmo conjunto por setor', () => {
    const branches = [...sql.matchAll(/WHEN '(\w+)' THEN ARRAY\[([^\]]+)\]/g)];
    expect(branches.length).toBe(3);
    for (const [, sector, list] of branches) {
      const inSql = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
      expect(inSql).toEqual([...SECTOR_EVENT_TYPES[sector as SectorProfileKind]].sort());
    }
  });

  it('cria os três perfis e os eventos com RLS por empresa', () => {
    for (const table of ['spinning_order_profiles', 'knitting_order_profiles', 'dyeing_order_profiles', 'sector_production_events']) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.upsert_sector_order_profile');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.record_sector_event');
  });
});

describe('classificação de desvios por setor (skills §desvios)', () => {
  it('cada setor aceita só a própria taxonomia; vazio é permitido', async () => {
    const { isValidDeviationCategory, deviationCategoryLabel } = await import('./sectorProfiles');
    expect(isValidDeviationCategory('fiacao', 'maquina')).toBe(true);
    expect(isValidDeviationCategory('fiacao', 'cor')).toBe(false);
    expect(isValidDeviationCategory('tinturaria', 'cor')).toBe(true);
    expect(isValidDeviationCategory('tinturaria', 'fio_urdume')).toBe(false);
    expect(isValidDeviationCategory('tecelagem', 'fio_urdume')).toBe(true);
    expect(isValidDeviationCategory('tecelagem', null)).toBe(true);
    expect(deviationCategoryLabel('tinturaria', 'laboratorio')).toBe('Laboratório');
  });
});
