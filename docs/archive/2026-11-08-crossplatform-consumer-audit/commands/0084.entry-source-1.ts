import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_WORKSPACE_PACKAGES } from './lib/workspace-packages';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bunExecutable = process.execPath;

console.log('[test-workspace] Deterministic sequential workspace regression start');
console.log(`[test-workspace] Bun executable: ${bunExecutable}`);

const failures: Array<{ packageName: string; exitCode: number }> = [];
for (const packageName of CURRENT_WORKSPACE_PACKAGES) {
  const cwd = path.join(rootDir, 'packages', packageName);
  const manifest = await Bun.file(path.join(cwd, 'package.json')).json() as {
    scripts?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
  };
  if (typeof manifest.scripts?.test !== 'string' || !manifest.scripts.test.trim()) {
    console.log(`\n[test-workspace] SKIP @specforge/${packageName}: no test script`);
    continue;
  }
  const vitestRange = typeof manifest.devDependencies?.vitest === 'string'
    ? manifest.devDependencies.vitest
    : '';
  const workerArgs = /^\D*1(?:\.|$)/.test(vitestRange)
    ? ['--maxWorkers=1', '--minWorkers=1']
    : ['--maxWorkers=1'];
  console.log(`\n[test-workspace] Testing @specforge/${packageName}`);
  const result = Bun.spawnSync({
    cmd: [bunExecutable, 'run', 'test', '--', ...workerArgs],
    cwd,
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  });
  const exitCode = result.exitCode ?? 1;
  if (exitCode !== 0) {
    console.error(`[test-workspace] FAILED @specforge/${packageName} exitCode=${exitCode}`);
    failures.push({ packageName, exitCode });
    continue;
  }
  console.log(`[test-workspace] OK @specforge/${packageName}`);
}

if (failures.length > 0) {
  console.error(
    `\n[test-workspace] FAILED packages: ${failures
      .map(({ packageName, exitCode }) => `@specforge/${packageName}(exit=${exitCode})`)
      .join(', ')}`,
  );
  process.exit(1);
}

console.log('\n[test-workspace] Deterministic sequential workspace regression complete');
