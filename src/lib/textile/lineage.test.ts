import { describe, expect, it } from 'vitest';
import { traceLineage, validateLineageGraph, type LineageEdge, type LineageLot } from './lineage';
const lots: LineageLot[] = [
  { id: 'fiber-a', companyId: 'a', quantity: 10, unit: 'kg' },
  { id: 'fiber-b', companyId: 'a', quantity: 20, unit: 'kg' },
  { id: 'yarn', companyId: 'a', quantity: 25, unit: 'kg' },
  { id: 'fabric', companyId: 'a', quantity: 100, unit: 'm' },
];
const edge = (operationId: string, inputLotId: string, outputLotId: string, inputUnit = 'kg', outputUnit = 'kg'): LineageEdge => ({
  companyId: 'a', operationId, inputLotId, outputLotId, inputQuantity: 1, outputQuantity: 1,
  inputUnit, outputUnit, ...(inputUnit !== outputUnit ? { conversionReference: 'approved-method' } : {}),
});
const edges = [edge('mix', 'fiber-a', 'yarn'), edge('mix', 'fiber-b', 'yarn'), edge('weave', 'yarn', 'fabric', 'kg', 'm')];
describe('textile lineage preflight', () => {
  it('supports many-to-one input and traces both directions without summing units', () => {
    expect(validateLineageGraph(lots, edges)).toEqual([]);
    expect(traceLineage(lots, edges, 'fabric', 'ancestors').sort()).toEqual(['fiber-a', 'fiber-b', 'yarn']);
    expect(traceLineage(lots, edges, 'fiber-a', 'descendants')).toEqual(['yarn', 'fabric']);
  });
  it('rejects cross-company links, missing lots and self-links', () => {
    expect(validateLineageGraph([...lots, { id: 'foreign', companyId: 'b', quantity: 1, unit: 'kg' }],
      [edge('mix', 'foreign', 'yarn')]).join(' ')).toMatch(/atravessa empresas/);
    expect(validateLineageGraph(lots, [edge('mix', 'missing', 'yarn')]).join(' ')).toMatch(/inválido/);
    expect(validateLineageGraph(lots, [edge('mix', 'yarn', 'yarn')]).join(' ')).toMatch(/inválido/);
  });
  it('rejects cycles, units without conversion and non-finite amounts', () => {
    expect(validateLineageGraph(lots, [...edges, edge('bad', 'fabric', 'fiber-a', 'm', 'kg')]).join(' ')).toMatch(/cíclica/);
    expect(validateLineageGraph(lots, [{ ...edges[2], conversionReference: '' }]).join(' ')).toMatch(/Conversão/);
    expect(validateLineageGraph(lots, [{ ...edges[0], inputQuantity: Number.NaN }]).join(' ')).toMatch(/quantidades/);
    expect(() => traceLineage(lots, [...edges, edge('bad', 'fabric', 'fiber-a', 'm', 'kg')], 'fiber-a', 'descendants')).toThrow();
  });
});
