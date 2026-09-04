import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TASK_STEPS = Object.freeze({
  test: [['scripts/test-workspace.ts']],
  build: [
    ['scripts/render-workflow-docs.ts'],
    ['scripts/build-workspace.ts'],
  ],
  lint: [
    ['scripts/render-workflow-docs.ts', '--check'],
    ['run', '--filter', './packages/*', 'lint'],
  ],
  'render-workflows': [['scripts/render-workflow-docs.ts']],
  'check-workflows': [['scripts/render-workflow-docs.ts', '--check']],
});

export function resolveInvokingBun(environment = process.env) {
  const executable = environment.npm_execpath;
  const executableName = executable ? path.basename(executable).toLowerCase() : '';
  if (!executable || (executableName !== 'bun' && executableName !== 'bun.exe')) {
    throw new Error(
      `ROOT_TASK_REQUIRES_BUN: invoke with bun run; npm_execpath=${executable ?? '<missing>'}`,
    );
  }
  return executable;
}

export function rootTaskSteps(task) {
  const steps = TASK_STEPS[task];
  if (!steps) {
    throw new Error(`UNKNOWN_ROOT_TASK: ${task}`);
  }
  return steps.map((args) => [...args]);
}

function runStep(bunExecutable, args) {
  console.log(`[root-task] ${bunExecutable} ${args.join(' ')}`);
  const result = spawnSync(bunExecutable, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  const exitCode = result.status ?? 1;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

function main() {
  const task = process.argv[2];
  const bunExecutable = resolveInvokingBun();
  if (!existsSync(bunExecutable)) {
    throw new Error(`INVOKING_BUN_NOT_FOUND: ${bunExecutable}`);
  }

  const version = spawnSync(bunExecutable, ['--version'], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: 'utf8',
  });
  if (version.error || version.status !== 0) {
    throw version.error ?? new Error(`INVOKING_BUN_VERSION_FAILED: exit=${version.status}`);
  }

  console.log(`[root-task] Bun executable: ${bunExecutable}`);
  console.log(`[root-task] Bun version: ${version.stdout.trim()}`);
  for (const args of rootTaskSteps(task)) {
    runStep(bunExecutable, args);
  }
  console.log(`[root-task] Complete: ${task}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
