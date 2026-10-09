#!/usr/bin/env node
/**
 * CI catalog/policy checks, NOT a proof of tenant isolation with real users.
 * Requires an isolated test DB; never treat absent tests/secrets or printed FAIL
 * from a psql script as success. See docs/governance/ENSAIO_RLS_A_B.md.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = '.lovable/tests';
const connection = process.env.RLS_CHECK_DATABASE_URL;
if (!connection) {
  console.error('RLS NÃO EXECUTADO: RLS_CHECK_DATABASE_URL ausente.');
  process.exit(2);
}

let database;
try {
  const url = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.pathname || url.pathname === '/') {
    throw new Error('URL incompleta');
  }
  database = {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get('sslmode') || 'require',
    PGCONNECT_TIMEOUT: '10',
  };
  if (database.PGSSLMODE === 'disable' && !['localhost', '127.0.0.1', '::1'].includes(database.PGHOST)) {
    throw new Error('TLS obrigatório para banco remoto');
  }
} catch {
  console.error('RLS NÃO EXECUTADO: URL de banco inválida ou TLS remoto desativado.');
  process.exit(2);
}

let files;
try { files = readdirSync(dir).filter(name => name.endsWith('.sql')).sort(); }
catch { files = []; }
if (!files.length) {
  console.error('RLS NÃO EXECUTADO: nenhum arquivo de checagem encontrado.');
  process.exit(2);
}

// Static outputs can say FAIL while psql exits 0. Require every script to run
// and reject explicit FAIL in addition to SQL assertions with ON_ERROR_STOP.
let failures = 0;
const scrub = text => {
  let safe = String(text ?? '').replaceAll(connection, '[redacted]');
  if (database.PGPASSWORD) safe = safe.replaceAll(database.PGPASSWORD, '[redacted]');
  return safe.slice(0, 4000);
};
for (const file of files) {
  try {
    const output = execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', join(dir, file)], {
      encoding: 'utf8', timeout: 120000,
      env: { ...process.env, ...database, RLS_CHECK_DATABASE_URL: '' },
    });
    if (/\bFAIL\b/.test(output)) throw new Error('A saída SQL contém FAIL.');
    console.log(`PASS ${file}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${file}: ${scrub(error.message)}`);
    if (error.stdout) console.error(scrub(error.stdout));
    if (error.stderr) console.error(scrub(error.stderr));
  }
}
if (failures) {
  console.error(`RLS REPROVADO: ${failures}/${files.length} checagens falharam. Não confundir estas checagens estáticas com ensaio A/B.`);
  process.exit(1);
}
console.log(`RLS ESTÁTICO OK: ${files.length} scripts executados; isolamento A/B ainda requer npm run test:rls:live.`);
