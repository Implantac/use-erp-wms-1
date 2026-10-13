import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const path of ['GlobalSettings.tsx', 'enterprise-config/EnterpriseConfig.tsx']) {
  test(`${path} não herda estado de outro cliente e confirma update`, () => {
    const source = readFileSync(new URL(`../src/modules/admin/${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /setSettings\(prev => \(\{ \.\.\.prev, \.\.\.\(company\.settings/);
    assert.match(source, /setLoadedCompanyId\(company\?\.id \?\? null\)/);
    assert.match(source, /loadedCompanyId !== company\.id/);
    assert.match(source, /\.select\('id'\)/);
    assert.match(source, /!data\?\.length/);
    assert.match(source, /company\.settings as Record<string, unknown>/);
  });
}
