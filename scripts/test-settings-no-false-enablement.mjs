import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/modules/admin/enterprise-config/EnterpriseConfig.tsx', import.meta.url), 'utf8');
test('preferências não são anunciadas como habilitação operacional', () => {
  assert.match(src, /Alterar estas preferências não habilita módulos/);
  assert.match(src, /não concedem acesso, licença ou ativação operacional/);
  assert.doesNotMatch(src, /Módulos Ativos|Módulos Habilitados|O sistema aplicará os seguintes estados padrão/);
});
