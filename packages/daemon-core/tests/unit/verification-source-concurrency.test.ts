import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureVerificationSource } from '../../src/verification/source-snapshot';

const interception = vi.hoisted(() => ({
  hook: undefined as ((args: unknown[]) => void) | undefined,
}));
vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return {
    ...original,
    execFile: (...args: unknown[]) => {
      interception.hook?.(args);
      return Reflect.apply(original.execFile, original, args);
    },
  };
});
type Callback = (error: Error | null, stdout: string, stderr: string) => void;
const roots: string[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => {
    resolve = accept;
  });
  return { promise, resolve };
}
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-source-concurrency-'));
  roots.push(root);
  const git = (args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
        '-c',
        'user.name=Synthetic',
        '-c',
        'user.email=synthetic@localhost.invalid',
        ...args,
      ],
      { cwd: root, windowsHide: true }
    );
  git(['init', '-q', '-b', 'main']);
  await fs.writeFile(path.join(root, 'value.cjs'), 'module.exports=1;\n');
  git(['add', 'value.cjs']);
  git(['commit', '-q', '-m', 'synthetic snapshot']);
  return root;
}
afterEach(async () => {
  interception.hook = undefined;
  for (const root of roots.splice(0)) {
    if (
      path.dirname(root) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith('sf-source-concurrency-')
    )
      throw Error('UNOWNED_FIXTURE');
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('bounded parallel source reads', () => {
  it.each(['inventory', 'final-identity'])(
    'drains the other %s read before propagating a child failure',
    async pair => {
      const root = await fixture(),
        held = deferred<() => void>(),
        failure = Error('SYNTHETIC_GIT_FAILURE');
      let heads = 0,
        branches = 0,
        settled = false;
      interception.hook = args => {
        const argv = args[1] as string[];
        if (argv.includes('rev-parse') && argv.includes('HEAD')) heads++;
        if (argv.includes('symbolic-ref')) branches++;
        const rejectFirst =
          pair === 'inventory'
            ? argv.includes('--others')
            : argv.includes('rev-parse') && heads === 2;
        const holdSecond =
          pair === 'inventory'
            ? argv.includes('--stage')
            : argv.includes('symbolic-ref') && branches === 2;
        const callback = args[3] as Callback;
        if (rejectFirst) args[3] = () => callback(failure, '', '');
        if (holdSecond)
          args[3] = (error: Error | null, stdout: string, stderr: string) => {
            held.resolve(() => callback(error, stdout, stderr));
          };
      };
      const result = captureVerificationSource(root).then(
        value => {
          settled = true;
          return value;
        },
        error => {
          settled = true;
          return error as unknown;
        }
      );
      const release = await held.promise;
      try {
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(settled).toBe(false);
      } finally {
        release();
      }
      expect(await result).toBe(failure);
    }
  );

  it('rejects configuration drift while both inventory reads are outstanding', async () => {
    const root = await fixture(),
      held = deferred<() => void>();
    interception.hook = args => {
      const argv = args[1] as string[];
      if (!argv.includes('--stage')) return;
      const callback = args[3] as Callback;
      args[3] = (error: Error | null, stdout: string, stderr: string) => {
        held.resolve(() => callback(error, stdout, stderr));
      };
    };
    const result = captureVerificationSource(root).catch((error: unknown) => error);
    const release = await held.promise;
    try {
      await fs.appendFile(path.join(root, '.git', 'config'), '\n# synthetic concurrent drift\n');
    } finally {
      release();
    }
    expect(await result).toMatchObject({ message: 'VERIFICATION_GIT_CHANGED_DURING_SNAPSHOT' });
  });
});
