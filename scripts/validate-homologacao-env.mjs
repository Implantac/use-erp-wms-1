#!/usr/bin/env node
/**
 * Pre-voo do job `authenticated`: valida os segredos de homologacao SEM
 * grava-los, SEM imprimir valores e SEM afrouxar o gate do workflow.
 *
 * A lista canonica e extraida do proprio `.github/workflows/e2e.yml`
 * (`for name in ...; do`), entao este script nao cria uma segunda fonte de
 * verdade: se o workflow mudar, a validacao acompanha.
 *
 * Uso:
 *   node scripts/validate-homologacao-env.mjs            # valida process.env
 *   node scripts/validate-homologacao-env.mjs --list     # so lista os nomes
 *
 * Nunca substitui a execucao dos testes. Exit 0 = pre-voo OK; exit 2 = erro.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const WORKFLOW = path.resolve(HERE, '..', '.github', 'workflows', 'e2e.yml');

/** Extrai os nomes validados pelo step `Validate isolated E2E configuration`. */
export function parseRequiredNames(yaml) {
  const match = /for name in ([^;]+); do/.exec(yaml ?? '');
  if (!match) throw new Error('lista de segredos nao encontrada no workflow e2e.yml');
  const names = match[1].trim().split(/\s+/);
  if (!names.length || names.some((n) => !/^[A-Z][A-Z0-9_]*$/.test(n))) {
    throw new Error('lista de segredos do workflow contem nome invalido');
  }
  // E2E_REQUIRE_ALL e literal no job, nao secret; nunca deve entrar na lista.
  return names.filter((n) => n !== 'E2E_REQUIRE_ALL');
}

const PLACEHOLDER = /^(changeme|change-me|todo|tbd|xxx+|placeholder|none|null|undefined|<[^>]*>|\$\{\{.*\}\})$/i;

/**
 * Valida presenca e higiene basica. Retorna { ok, problems }.
 * `problems` contem apenas NOMES e motivos, nunca valores.
 */
export function validateEnv(names, env) {
  const problems = [];
  for (const name of names) {
    const raw = env?.[name];
    if (typeof raw !== 'string' || raw.trim() === '') {
      problems.push(`${name}: ausente ou vazio`);
      continue;
    }
    const value = raw.trim();
    if (PLACEHOLDER.test(value)) problems.push(`${name}: valor placeholder`);
    if (/^(ghp_|github_pat_|sk-)/i.test(value)) {
      problems.push(`${name}: parece token de acesso pessoal; use credencial de servico`);
    }
    if (name === 'VITE_SUPABASE_URL') {
      if (!/^https?:\/\//i.test(value)) {
        problems.push(`${name}: URL invalida (exige http/https)`);
      } else if (/useerp\.lovable\.app/i.test(value)) {
        problems.push(`${name}: aponta para o deploy de producao conhecido`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

function main() {
  const yaml = fs.readFileSync(WORKFLOW, 'utf8');
  const names = parseRequiredNames(yaml);
  if (process.argv.includes('--list')) {
    for (const name of names) console.log(name);
    console.error(`[homologacao] ${names.length} segredos exigidos pelo gate autenticado`);
    return 0;
  }
  const { ok, problems } = validateEnv(names, process.env);
  if (!ok) {
    for (const problem of problems) console.error(`::error::${problem}`);
    console.error(`[homologacao] pre-voo FALHOU: ${problems.length} problema(s) em ${names.length} segredos. ` +
      'Configure um ambiente de homologacao isolado; testes ausentes nunca sao um gate verde.');
    return 2;
  }
  console.log(`[homologacao] pre-voo OK: ${names.length} segredos presentes, sem placeholders. ` +
    'Valores NAO foram exibidos. Ainda e obrigatorio rodar bun run e2e:critical com skip=0.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
