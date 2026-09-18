import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveOpenCodeConfigRoot,
  resolveSpecForgeHandshakePath,
  resolveSpecForgeUserRoot,
} from '@specforge/types/user-level-paths';
import { ServiceHealthChecker } from '../../src/orchestrator/healthcheck';
import { ServiceLifecycleEventEmitter } from '../../src/orchestrator/lifecycle-events';
import { ReconnectingDaemonClient } from '../../src/plugin/reconnecting-daemon-client';
import { NssmServiceManager } from '../../src/service-manager/nssm-service-manager';

describe('user-level path boundary', () => {
  const expectedUserRoot = path.join(resolveOpenCodeConfigRoot(), 'sf-user');
  const expectedHandshake = resolveSpecForgeHandshakePath();

  it('uses the canonical sf-user root', () => {
    expect(resolveSpecForgeUserRoot()).toBe(expectedUserRoot);
  });

  it('uses the canonical handshake for service health checks', () => {
    const checker = new ServiceHealthChecker();
    expect((checker as unknown as { handshakePath: string }).handshakePath).toBe(expectedHandshake);
    checker.dispose();
  });

  it('uses the canonical handshake for lifecycle events', () => {
    const emitter = new ServiceLifecycleEventEmitter();
    expect((emitter as unknown as { handshakePath: string }).handshakePath).toBe(expectedHandshake);
    emitter.dispose();
  });

  it('uses the canonical handshake for reconnecting clients', () => {
    const client = new ReconnectingDaemonClient();
    const options = (client as unknown as { options: { handshakePath: string } }).options;
    expect(options.handshakePath).toBe(expectedHandshake);
    client.dispose();
  });

  it('uses canonical sf-user bin and service roots for NSSM', async () => {
    const manager = new NssmServiceManager();
    const privateState = manager as unknown as { binDir: string; serviceDir: string };
    expect(privateState.binDir).toBe(path.join(expectedUserRoot, 'bin'));
    expect(privateState.serviceDir).toBe(expectedUserRoot);
    await manager.dispose();
  });
});
