import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

const repositoryRoot = resolve(__dirname, '..', '..', '..');
const pluginPath = resolve(
  repositoryRoot,
  'setup',
  'userlevel-opencode',
  'plugins',
  'sf_specforge.ts'
);
const resolverToolPath = resolve(
  repositoryRoot,
  'setup',
  'userlevel-opencode',
  'tools',
  'sf_hard_stop_resolve.ts'
);

describe('user-level plugin HardStop identity contract', () => {
  it('forwards the actual SDK message identity and disables retries for diagnostic grants without requiring a caller callID', async () => {
    const calls: unknown[][] = [];
    class Client {
      constructor(readonly timeout: number) {
        expect(timeout).toBe(180000);
      }
      async invokeTool(...args: unknown[]) {
        calls.push(args);
        return { success: true };
      }
    }
    const factory = Object.assign((definition: unknown) => definition, { schema: z });
    const module = { exports: {} as any };
    const source = ts.transpileModule(readFileSync(resolverToolPath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(source, {
      module,
      exports: module.exports,
      require: (name: string) => {
        if (name === '@opencode-ai/plugin') return { tool: factory };
        if (name === './lib/thin-client')
          return {
            DaemonClient: Client,
            daemon: {
              invokeTool: () => {
                throw new Error('diagnostic grant must not use retrying default client');
              },
            },
          };
        throw new Error('unexpected dependency:' + name);
      },
    });
    const controller = new AbortController();
    const context = {
      sessionID: 'ses_current',
      messageID: 'msg_current',
      agent: 'sf-orchestrator',
      directory: repositoryRoot,
      worktree: repositoryRoot,
      abort: controller.signal,
    };
    const args = {
      work_item_id: 'WI-0001',
      diagnostic_user_message_id: 'msg_user',
      resolution_type: 'user_authorized_retry',
    };
    expect(JSON.parse(await module.exports.default.execute(args, context))).toEqual({
      success: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      'sf_hard_stop_resolve',
      args,
      {
        sessionID: context.sessionID,
        messageID: context.messageID,
        agent: context.agent,
        directory: repositoryRoot,
        worktree: repositoryRoot,
      },
      { signal: controller.signal, retry: false },
    ]);
  });
  it('keeps HardStop persistence entirely outside the thin plugin', () => {
    const source = readFileSync(pluginPath, 'utf-8');

    expect(source).toContain(
      'Business state, WriteGuard decisions and filesystem tools remain Daemon-owned.'
    );
    expect(source).not.toContain('function persistHardStop');
    expect(source).not.toContain('readHardStopRecord');
    expect(source).not.toContain('hard_stop_id');
  });

  it('does not expose plugin guard paths that project HardStop records', () => {
    const source = readFileSync(pluginPath, 'utf-8');

    expect(source).not.toContain('hard_stop_record');
    expect(source).not.toContain('maybePersistHardStopFromGuardResult');
    expect(source).not.toContain('bashGuard');
  });

  it('documents work_item_id-only authoritative latch resolution', () => {
    const source = readFileSync(resolverToolPath, 'utf-8');

    expect(source).toContain('Runtime 会按 work_item_id 定位唯一权威活跃 HardStop');
    expect(source).toContain('省略时由 Runtime 按 work_item_id 定位活跃 HardStop');
  });
});
