import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';

let root: string;
let client: typeof import('../../setup/userlevel-opencode/tools/lib/thin-client');
const context = () => ({ directory: join(root, 'project'), sessionID: 'unit-session', messageID: 'unit-message', agent: 'sf-verifier' });
const args = { work_item_id: 'WI-9001', file_type: 'evidence_manifest' };
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { 'content-type': 'application/json' } });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'sf-consumer-http-test-'));
  const config = join(root, 'config');
  mkdirSync(join(config, 'sf-user/runtime'), { recursive: true });
  mkdirSync(join(root, 'project'));
  writeFileSync(join(config, 'sf-user/runtime/handshake.json'), JSON.stringify({
    pid: process.pid, port: 12345, token: 'synthetic-unit-token', bound_to: '127.0.0.1',
    startedAt: Date.now(), schema_version: '1.0', artifact_contract_versions: { task_document: 'task-document/v1' },
  }));
  vi.stubEnv('OPENCODE_CONFIG_DIR', config);
  vi.resetModules();
  client = await import('../../setup/userlevel-opencode/tools/lib/thin-client');
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('sf-consumer-http-test-')) throw Error('UNSAFE_TEST_CLEANUP');
  rmSync(root, { recursive: true, force: true });
});

function delayedOwner(milliseconds: number, committed: () => void) {
  return vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((resolveReply, reject) => {
    setTimeout(() => { committed(); resolveReply(response({ success: true, committed: true })); }, milliseconds);
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
}

describe('verification-consumer request outcome boundary', () => {
  it('reproduces the old30s timeout without treating it as rollback of the owner write', async () => {
    let committed = false;
    const fetch = delayedOwner(35000, () => { committed = true; }); vi.stubGlobal('fetch', fetch);
    const pending = new client.DaemonClient(30000).invokeTool('sf_artifact_write', args, context(), { retry: false }).catch(error => error);
    await vi.advanceTimersByTimeAsync(30000);
    expect((await pending).message).toContain('timed out (30000ms)'); expect(committed).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(committed).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('waits for a supported35s common-consumer result and does not repeat the request', async () => {
    const fetch = delayedOwner(35000, () => {}); vi.stubGlobal('fetch', fetch);
    const pending = client.invokeVerificationConsumerTool('sf_artifact_write', args, context());
    await vi.advanceTimersByTimeAsync(35000);
    expect(await pending).toEqual({ success: true, committed: true }); expect(fetch).toHaveBeenCalledTimes(1);
    expect(client.VERIFICATION_CONSUMER_HTTP_TIMEOUT_MS).toBeLessThanOrEqual(180000);
  });

  it('returns unknown outcome after the bounded deadline, without claiming a failed or rolled-back owner operation', async () => {
    const fetch = vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })); vi.stubGlobal('fetch', fetch);
    const pending = client.invokeVerificationConsumerTool('sf_close_gate', args, context());
    await vi.advanceTimersByTimeAsync(client.VERIFICATION_CONSUMER_HTTP_TIMEOUT_MS);
    expect(await pending).toMatchObject({ success: false, error: 'DAEMON_OPERATION_OUTCOME_UNKNOWN', retry_allowed: false, reconciliation_required: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not automatically resend a request when the connection fails', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')); vi.stubGlobal('fetch', fetch);
    expect(await client.invokeVerificationConsumerTool('sf_gate_run', args, context())).toMatchObject({ error: 'DAEMON_OPERATION_OUTCOME_UNKNOWN', retry_allowed: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps a definite owner rejection unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ success: false, error: 'INVALID_ARTIFACT_JSON', retry_allowed: true })));
    expect(await client.invokeVerificationConsumerTool('sf_artifact_write', args, context())).toEqual({ success: false, error: 'INVALID_ARTIFACT_JSON', retry_allowed: true });
  });

  it('keeps a missing handshake as a known pre-request failure', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    unlinkSync(join(root, 'config/sf-user/runtime/handshake.json'));
    await expect(client.invokeVerificationConsumerTool('sf_verification_gate', args, context())).rejects.toThrow('handshake file not found');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('routes the actual four public wrappers to the shared policy while keeping ordinary artifacts on their existing route', async () => {
    const shared = vi.fn().mockResolvedValue({ success: true }), ordinary = vi.fn().mockResolvedValue({ success: true });
    const tool = Object.assign((definition: unknown) => definition, { schema: z });
    function load(name: string) {
      const source = readFileSync(resolve(import.meta.dirname, '../../setup/userlevel-opencode/tools', name + '.ts'), 'utf8');
      const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      const exports: any = {};
      Function('require', 'exports', output)((name: string) => {
        if (name === '@opencode-ai/plugin') return { tool };
        if (name === './lib/thin-client') return { invokeVerificationConsumerTool: shared, daemon: { invokeTool: ordinary } };
        throw Error('UNEXPECTED_WRAPPER_DEPENDENCY:' + name);
      }, exports);
      return exports.default;
    }
    for (const name of ['sf_artifact_write', 'sf_verification_gate', 'sf_gate_run', 'sf_close_gate']) {
      await load(name).execute(args, context()); expect(shared.mock.calls.at(-1)?.[0]).toBe(name);
    }
    await load('sf_artifact_write').execute({ ...args, file_type: 'work_log', run_id: 'unit' }, context());
    expect(shared).toHaveBeenCalledTimes(4); expect(ordinary).toHaveBeenCalledTimes(1);
  });
});
