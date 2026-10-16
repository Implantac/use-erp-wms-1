#!/usr/bin/env node
// Read-only release guard. Passing this script is NOT operational homologation.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const base = '71a009c962d99780fc096e32d88bd738160a22d8';
const root = resolve(new URL('..', import.meta.url).pathname);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const fail = message => { console.error(`BLOQUEADO: ${message}`); process.exitCode = 1; };
try {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const head = git('rev-parse', 'HEAD');
  const remote = git('ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0];
  const ancestor = git('merge-base', base, head);
  const changes = git('diff', '--name-only', `${base}..HEAD`).split('\n').filter(Boolean);
  const commits = Number(git('rev-list', '--count', `${base}..HEAD`));
  const trackedDirty = git('status', '--porcelain', '--untracked-files=no');
  console.log(JSON.stringify({ base, remote, head, branch, commits, changedFiles: changes.length }, null, 2));
  if (remote !== base) fail('A main remota mudou: atualize e reavalie o lote antes do push.');
  if (ancestor !== base || !Number.isInteger(commits) || commits < 7) fail('Base/commits do lote pós-publicação inesperados.');
  if (trackedDirty) fail('Arquivos rastreados alterados: preserve e revise antes de publicar.');
  if (changes.some(path => path.startsWith('supabase/migrations/') || path.startsWith('supabase/functions/'))) {
    fail('Lote altera migrations/Edge Functions; exige revisão de deploy separada.');
  }
  if (changes.some(path => /^\.env|(?:^|\/)(?:node_modules|package-lock\.json)$/.test(path))) fail('Artefatos locais ou ambiente no lote.');
  for (const draft of ['docs/governance/sql/DRAFT_guard_machine_time_entry_ownership.sql',
    'docs/governance/sql/DRAFT_textile_lineage_contract.sql']) {
    if (!existsSync(resolve(root, draft)) || !changes.includes(draft)) fail(`Rascunho SQL ausente ou fora do lote: ${draft}`);
  }
  if (!process.exitCode) console.log('Preflight de código OK. PENDENTE: Supabase isolado, RLS, RPC, dados aprovados, Lovable preview e aceite operacional. Não executar escritas PCP em produção.');
} catch (error) {
  fail(`Não foi possível verificar git/remoto: ${error instanceof Error ? error.message : String(error)}`);
}
