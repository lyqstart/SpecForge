import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OpenCodeHttpRuntimeClient } from '@specforge/opencode-adapter';
import { Daemon } from '../../src/daemon/Daemon';
import { CurrentTestDaemonConfig } from '../helpers/current-daemon-test-config';
import { canonicalVerificationJson, verificationId } from '../../src/verification/owner-store';

describe('required verification real Daemon factory and native HTTP boundary', () => {
  let root: string;
  let daemon: Daemon;
  let handshake: { port: number; token: string };
  const sourceReader = () =>
    vi.spyOn(OpenCodeHttpRuntimeClient.prototype, 'readRequiredVerificationSource');
  let reader: ReturnType<typeof sourceReader>;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-required-daemon-wiring-'));
    vi.stubEnv('OPENCODE_CONFIG_DIR', path.join(root, 'private-config'));
    // The source adapter is synthetic here; no actual user Kernel is contacted.
    vi.stubEnv('OPENCODE_SERVER_URL', 'http://127.0.0.1:1');
    reader = sourceReader().mockImplementation(async input => ({
      source: 'required-verification-source/v1',
      sessionId: input.sessionId,
      callId: input.callId,
      messageId: 'msg_fixturecall',
      tool: input.tool,
      inputSha256: verificationId(canonicalVerificationJson(input.args)),
      agent: 'sf-orchestrator',
      directory: input.directory,
      userSessionId: input.sessionId,
      userMessageId: 'msg_fixtureuser',
      userTextSha256: verificationId('synthetic source, no declaration'),
      userCreatedAt: Date.now() - 1,
      observedAt: new Date().toISOString(),
      declaration: null,
      chainSha256: verificationId('synthetic source chain'),
    }));
    const config = new CurrentTestDaemonConfig(root);
    // Use the production composition root, not a hand-assembled HTTPServer dependency object.
    daemon = new Daemon(config);
    await daemon.start();
    handshake = JSON.parse(await fs.readFile(config.getHandshakeFile(), 'utf8'));
  }, 30000);

  afterEach(async () => {
    if (daemon?.isDaemonRunning()) await daemon.stop();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (root) {
      const resolved = path.resolve(root);
      if (
        path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
        !path.basename(resolved).startsWith('sf-required-daemon-wiring-')
      )
        throw new Error('UNSAFE_TEST_CLEANUP');
      await fs.rm(resolved, { recursive: true, force: true });
    }
  }, 15000);

  const request = async (
    invocation: unknown = { sessionID: 'ses_fixture', callID: 'call_fixture' },
    authenticated = true,
    omitInvocation = false
  ) => {
    const response = await fetch(
      `http://127.0.0.1:${handshake.port}/api/v1/v11/write-guard/native`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authenticated ? { Authorization: `Bearer ${handshake.token}` } : {}),
        },
        body: JSON.stringify({
          projectPath: root,
          tool: 'sf_gate_run',
          args: { work_item_id: 'WI-0001' },
          ...(omitInvocation ? {} : { invocation }),
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    return { status: response.status, body: await response.json() };
  };

  it('passes the actual HTTP native call to the verifier wired by Daemon', async () => {
    const result = await request();
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ allowed: true });
    expect(reader).toHaveBeenCalledWith({
      sessionId: 'ses_fixture',
      callId: 'call_fixture',
      directory: root,
      tool: 'sf_gate_run',
      args: { work_item_id: 'WI-0001' },
    });
    await expect(fs.stat(path.join(root, '.specforge'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves a real source-verifier refusal with no governance writes', async () => {
    reader.mockRejectedValue(new Error('REQUIRED_VERIFICATION_SOURCE_LIVE_CALL'));
    const result = await request();
    expect(result.body.data).toEqual({
      allowed: false,
      reason: 'REQUIRED_VERIFICATION_SOURCE_LIVE_CALL',
    });
    expect(reader).toHaveBeenCalledTimes(1);
    await expect(fs.stat(path.join(root, '.specforge'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a missing invocation before consulting the source adapter', async () => {
    const result = await request(undefined, true, true);
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({
      allowed: false,
      reason: 'REQUIRED_VERIFICATION_SOURCE_IDENTITY_REQUIRED',
    });
    expect(reader).not.toHaveBeenCalled();
    await expect(fs.stat(path.join(root, '.specforge'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects unauthenticated HTTP before consulting the source adapter', async () => {
    expect((await request(undefined, false)).status).toBe(401);
    expect(reader).not.toHaveBeenCalled();
  });
});
