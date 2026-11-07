import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ROOT, OVERLAY, BOOTSTRAP, TEMPLATE, WORKFLOW, DOCKERIGNORE,
  requiredNames, publishedPorts, checkOverlay, checkBootstrap,
  checkEnvTemplate, checkDockerignore, validateAll,
} from './validate-homologacao-compose.mjs';

const read = (p) => fs.readFileSync(p, 'utf8');
const REAL = {
  workflow: read(WORKFLOW), overlay: read(OVERLAY), bootstrap: read(BOOTSTRAP),
  template: read(TEMPLATE), dockerignore: read(DOCKERIGNORE),
};
const NAMES = requiredNames(REAL.workflow);

// Montado em runtime: o gate SEC-02 barra o literal completo em arquivo versionado.
const GH = ['gh', 'p_'].join('') + 'A'.repeat(24);
const JWT = ['ey', 'J'].join('') + 'A'.repeat(24);

test('workflow e a unica fonte de verdade: 18 segredos, sem E2E_REQUIRE_ALL', () => {
  assert.equal(NAMES.length, 18);
  assert.ok(!NAMES.includes('E2E_REQUIRE_ALL'));
  assert.ok(NAMES.includes('E2E_WEAVING_LOT_ID'));
});

test('publishedPorts reconhece array inline com !reset e bind de loopback', () => {
  const ports = publishedPorts(REAL.overlay);
  assert.equal(ports.length, 1);
  assert.ok(ports[0].startsWith('127.0.0.1:'));
});

test('integracao: os quatro artefatos reais passam em todas as invariantes', () => {
  const { problems, names } = validateAll(REAL);
  assert.deepEqual(problems, []);
  assert.equal(names.length, 18);
});

test('overlay reprova ausencia de !reset (Compose concatenaria as portas)', () => {
  const bad = REAL.overlay.replace('ports: !reset', 'ports:');
  assert.ok(checkOverlay(bad).some((p) => p.includes('!reset')));
});

test('overlay reprova publicacao sem bind de loopback', () => {
  const bad = REAL.overlay.replace('127.0.0.1:${WEB_PORT:-8080}:80', '${WEB_PORT:-8080}:80');
  assert.ok(checkOverlay(bad).some((p) => p.includes('loopback')));
});

test('overlay reprova imagem :latest, privileged, host network e socket do Docker', () => {
  assert.ok(checkOverlay(REAL.overlay + '\n    image: x:latest\n').some((p) => p.includes(':latest')));
  assert.ok(checkOverlay(REAL.overlay + '\n    privileged: true\n').some((p) => p.includes('privileged')));
  assert.ok(checkOverlay(REAL.overlay + '\n    network_mode: host\n').some((p) => p.includes('network_mode')));
  assert.ok(checkOverlay(REAL.overlay + '\n    - /var/run/docker.sock:/x\n').some((p) => p.includes('socket')));
});

test('overlay exige ANON_KEY com falha fechada e reprova valor literal de segredo', () => {
  const noFailClosed = REAL.overlay.replace('${ANON_KEY:?ANON_KEY ausente — rode generate-env.mjs}', '${ANON_KEY}');
  assert.ok(checkOverlay(noFailClosed).some((p) => p.includes('falha fechada')));
  assert.ok(checkOverlay(REAL.overlay + '\n      JWT_SECRET: 123456\n').some((p) => p.includes('valor literal')));
});

test('overlay reprova host de producao e credencial literal', () => {
  assert.ok(checkOverlay(REAL.overlay + '\n# useerp.lovable.app\n').some((p) => p.includes('producao')));
  assert.ok(checkOverlay(REAL.overlay + '\n# ' + GH + '\n').some((p) => p.includes('credencial literal')));
  assert.ok(checkOverlay(REAL.overlay + '\n# ' + JWT + '\n').some((p) => p.includes('credencial literal')));
});

test('bootstrap real passa; cada invariante removido e reprovado', () => {
  assert.deepEqual(checkBootstrap(REAL.bootstrap), []);
  for (const needle of [
    'set -euo pipefail', 'validate-homologacao-env.mjs', 'validate-homologacao-compose.mjs',
    'config -q', 'E2E_REQUIRE_ALL=1', 'bun run e2e:critical', 'trap ', 'down -v',
  ]) {
    const bad = REAL.bootstrap.split(needle).join('REMOVIDO');
    assert.ok(checkBootstrap(bad).length > 0, `deveria reprovar sem ${needle}`);
  }
});

test('bootstrap reprova push remoto, link, --migrate, bind aberto e anti-skip desligado', () => {
  for (const needle of [
    'supabase db push', 'supabase link', '--migrate', '0.0.0.0', 'E2E_REQUIRE_ALL=0', 'useerp.lovable.app',
  ]) {
    assert.ok(checkBootstrap(REAL.bootstrap + '\n# ' + needle + '\n').length > 0, `deveria reprovar ${needle}`);
  }
});

test('template contem os 18 nomes e apenas placeholders/valores tecnicos locais', () => {
  assert.deepEqual(checkEnvTemplate(REAL.template, NAMES), []);
});

test('template reprova nome ausente, valor real, host de producao e token', () => {
  assert.ok(checkEnvTemplate(REAL.template.replace('E2E_WEAVING_LOT_ID=', '# E2E_WEAVING_LOT_ID='), NAMES)
    .some((p) => p.includes('E2E_WEAVING_LOT_ID ausente')));
  assert.ok(checkEnvTemplate(REAL.template.replace('VITE_SUPABASE_URL=<URL_LOOPBACK_DO_WEB>', 'VITE_SUPABASE_URL=https://useerp.lovable.app'), NAMES)
    .some((p) => p.includes('producao')));
  assert.ok(checkEnvTemplate(REAL.template.replace('E2E_STORE_PASSWORD=<SENHA_DO_OPERADOR_DE_LOJA>', 'E2E_STORE_PASSWORD=senhaReal123'), NAMES)
    .some((p) => p.includes('nao e placeholder')));
  assert.ok(checkEnvTemplate(REAL.template + '\n# ' + GH + '\n', NAMES)
    .some((p) => p.includes('credencial literal')));
});

test('.dockerignore precisa ignorar .env e .env.* para nao vazar segredos no build', () => {
  assert.deepEqual(checkDockerignore(REAL.dockerignore), []);
  assert.ok(checkDockerignore('node_modules\n').some((p) => p.includes('.env')));
  assert.ok(checkDockerignore('.env\n').some((p) => p.includes('.env.*')));
});

test('validateAll reprova contagem de segredos diferente de 18', () => {
  const bad = { ...REAL, workflow: REAL.workflow.replace('E2E_WEAVING_LOT_ID;', ';') };
  assert.ok(validateAll(bad).problems.some((p) => p.includes('esperados 18')));
});
