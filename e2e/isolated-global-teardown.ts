import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * QA-01 — o reset do ambiente nao pode depender de o Playwright entregar
 * SIGTERM ao webServer. globalTeardown roda mesmo quando a suite falha.
 */
export default function globalTeardown(): void {
  const candidates = [
    resolve(process.cwd(), 'scripts/e2e-isolated-server.mjs'),
    resolve(process.cwd(), '..', 'scripts/e2e-isolated-server.mjs'),
  ];
  const script = candidates.find(existsSync);
  if (!script) {
    throw new Error('nao foi possivel localizar scripts/e2e-isolated-server.mjs para o teardown');
  }
  const result = spawnSync(process.execPath, [script, '--teardown'], { encoding: 'utf8' });
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.status !== 0) {
    console.error(result.stderr || 'teardown sem saida');
    throw new Error('teardown do ambiente E2E isolado falhou');
  }
}
