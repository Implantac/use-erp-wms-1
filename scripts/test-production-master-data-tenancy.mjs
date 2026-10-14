import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`../src/hooks/production/useProduction${name}.ts`, import.meta.url), 'utf8');
test('sector, line and resource CRUD is scoped to the active company and ignores late tenant responses', () => {
  for (const [name, table] of [['Sectors', 'production_sectors'], ['Lines', 'production_lines'], ['Resources', 'production_resources']]) {
    const code = read(name);
    assert.match(code, /if \(!companyId\) \{ set(?:Sectors|Lines|Resources)\(\[\]\); setLoading\(false\); return; \}/);
    assert.match(code, /companyIdRef\.current !== companyId/);
    assert.match(code, /\.eq\('company_id', companyId\)/);
    assert.ok(code.includes(`.from('${table}').insert({ ...item, company_id: companyId }`));
    assert.match(code, /if \(error \|\| !data\?\.length\)/);
  }
  for (const name of ['Routes', 'Steps']) assert.match(read(name), /companyIdRef\.current !== companyId/);
});
