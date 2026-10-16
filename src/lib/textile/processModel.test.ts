import { describe, expect, it } from 'vitest';
import { TEXTILE_STAGES, validateTextileTransform, type TextileLotRef } from './processModel';

const fiber: TextileLotRef = { id: 'a', companyId: 'company-a', material: 'fiber', quality: 'released', quantity: 10, unit: 'kg' };
const sliver: TextileLotRef = { ...fiber, id: 'b', material: 'sliver', quality: 'unverified', quantity: 8 };

describe('textile process preflight', () => {
  it('models spinning, woven, knit and dye/finish without assuming capacity or loss', () => {
    expect(new Set(TEXTILE_STAGES.map(stage => stage.route))).toEqual(new Set(['spinning', 'woven', 'knit', 'dye_finish']));
    expect(TEXTILE_STAGES.find(s => s.id === 'weave')?.input).toBe('warp_beam');
    expect(TEXTILE_STAGES.find(s => s.id === 'knit')?.input).toBe('yarn');
    expect(TEXTILE_STAGES.find(s => s.id === 'dye')?.output).toBe('dyed_fabric');
    expect(validateTextileTransform({ companyId: 'company-a', stageId: 'blend_card', inputs: [fiber], output: sliver })).toEqual([]);
  });
  it('rejects cross-tenant, held, duplicated or incompatible lots', () => {
    const errors = validateTextileTransform({ companyId: 'company-a', stageId: 'blend_card',
      inputs: [fiber, { ...fiber, quality: 'held' }], output: { ...sliver, companyId: 'company-b' } });
    expect(errors.join(' ')).toMatch(/mesma empresa/);
    expect(errors.join(' ')).toMatch(/liberados/);
    expect(errors.join(' ')).toMatch(/distintos/);
    expect(validateTextileTransform({ companyId: 'company-a', stageId: 'knit', inputs: [fiber], output: sliver }).join(' ')).toMatch(/incompatível/);
  });
  it('requires positive quantities, explicit units and a reference for cross-unit output', () => {
    const draft = { companyId: 'company-a', stageId: 'blend_card' as const, inputs: [fiber], output: { ...sliver, unit: 'm' } };
    expect(validateTextileTransform(draft).join(' ')).toMatch(/referência aprovada/);
    expect(validateTextileTransform({ ...draft, conversionReference: 'approved-method' })).toEqual([]);
    expect(validateTextileTransform({ ...draft, output: { ...sliver, quantity: Number.NaN, unit: '' } }).join(' ')).toMatch(/Quantidades positivas/);
  });
});
