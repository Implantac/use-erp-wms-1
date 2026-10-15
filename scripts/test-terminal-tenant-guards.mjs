import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const terminal = readFileSync(new URL('../src/modules/production/OperatorTerminal.tsx', import.meta.url), 'utf8');
test('alerts use only the selected company, never a profile fallback', () => {
  assert.match(terminal, /const companyId = company\?\.id;/);
  assert.doesNotMatch(terminal, /getState\(\)\.activeCompanyId|from\('profiles'\)|getUser\(\)/);
  assert.match(terminal, /if \(!companyId\)/);
});
test('a stale machine selection cannot silently become an unassigned entry', () => {
  assert.match(terminal, /m\.id === selectedMachineId && m\.status === 'available'/);
  assert.match(terminal, /if \(selectedMachineId && !machine\)/);
});
test('operator field is locked on active entry and the name is explicitly not identity', () => {
  assert.match(terminal, /disabled=\{!!currentEntry \|\| reportingProblem\}/);
  assert.match(terminal, /não confirma identidade nem autorização/);
});
test('failed separate OP status update is not silently hidden', () => {
  assert.match(terminal, /if \(!await updateOrder\(order\.id/);
  assert.match(terminal, /Apontamento criado, mas a OP não avançou/);
});
