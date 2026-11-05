#!/usr/bin/env node
/**
 * Typecheck that cannot succeed vacuously.
 *
 * The root tsconfig intentionally contains only project references. Running
 * `tsgo --noEmit` there checks zero files, so CI must select each referenced
 * configuration explicitly and prove that the expected sources were listed.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const checks = [
  { name: 'app', config: 'tsconfig.app.json', requiredRoot: path.resolve('src') },
  { name: 'node', config: 'tsconfig.node.json', requiredRoot: null },
];

const executable = process.platform === 'win32' ? 'tsgo.CMD' : 'tsgo';

for (const check of checks) {
  const result = spawnSync(
    executable,
    ['-p', check.config, '--noEmit', '--listFiles', '--pretty', 'false'],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  );

  if (result.error) {
    console.error(`[typecheck:${check.name}] failed to start tsgo: ${result.error.message}`);
    process.exit(2);
  }

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (result.status !== 0) {
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    console.error(`[typecheck:${check.name}] tsgo exited with ${result.status ?? 'unknown'}`);
    process.exit(result.status ?? 2);
  }

  const files = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('TS'));
  const expectedFiles = check.requiredRoot
    ? files.filter((file) => {
        const absolute = path.resolve(file);
        return absolute.startsWith(check.requiredRoot + path.sep);
      })
    : files.filter((file) => path.resolve(file) === path.resolve('vite.config.ts'));

  if (expectedFiles.length === 0) {
    console.error(
      `[typecheck:${check.name}] no expected source files were checked; refusing a vacuous success`,
    );
    process.exit(3);
  }

  console.log(
    `[typecheck:${check.name}] passed: ${files.length} files total, ${expectedFiles.length} expected source files`,
  );
}
