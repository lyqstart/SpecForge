import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServiceHealthChecker } from '../../src/orchestrator/healthcheck.js';
import { ServiceLifecycleEventEmitter } from '../../src/orchestrator/lifecycle-events.js';

type HandshakeReader = {
  readHandshake(): Promise<unknown>;
};

describe('service-management handshake consumers', () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  async function malformedHandshakePath(): Promise<string> {
    root = await mkdtemp(join(tmpdir(), 'specforge-handshake-consumer-'));
    const handshakePath = join(root, 'daemon.sock.json');
    await writeFile(
      handshakePath,
      JSON.stringify({ schema_version: '1.0', port: 3847, token: 'token' }),
      'utf8',
    );
    return handshakePath;
  }

  it('health checker rejects a partial handshake before HTTP', async () => {
    const checker = new ServiceHealthChecker({
      handshakePath: await malformedHandshakePath(),
    });

    await expect(
      (checker as unknown as HandshakeReader).readHandshake(),
    ).rejects.toThrow();
    checker.dispose();
  });

  it('lifecycle emitter rejects a partial handshake before HTTP', async () => {
    const emitter = new ServiceLifecycleEventEmitter({
      handshakePath: await malformedHandshakePath(),
    });

    await expect(
      (emitter as unknown as HandshakeReader).readHandshake(),
    ).rejects.toThrow();
    emitter.dispose();
  });
});
