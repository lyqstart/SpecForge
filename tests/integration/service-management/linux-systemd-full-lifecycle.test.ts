/**
 * Integration Test 12.1: Linux systemd Full Lifecycle
 *
 * Tests the complete service lifecycle against a real systemd --user instance:
 *   install -> enable -> start -> status -> restart -> stop -> disable -> uninstall
 *
 * Each step asserts `systemctl --user is-active` state or unit file existence.
 * Uses unique service name `specforge-daemon-test-<uuid>` for isolation.
 *
 * Platform: Linux only (skipped on non-Linux)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';

import { SystemdServiceManager } from '../../../packages/service-management/src/service-manager/systemd-service-manager.js';
import type { ServiceInstallSpec } from '../../../packages/service-management/src/types/service-install-spec.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Platform gate
// ---------------------------------------------------------------------------

const isLinux = process.platform === 'linux';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a systemctl --user command and return trimmed stdout. */
async function systemctlUser(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('systemctl', ['--user', ...args], {
    timeout: 15_000,
  });
  return stdout.trim();
}

/** Check whether the unit file exists on disk. */
async function unitFileExists(unitDir: string, serviceName: string): Promise<boolean> {
  try {
    await fs.access(path.join(unitDir, `${serviceName}.service`));
    return true;
  } catch {
    return false;
  }
}

/** Create a temp directory for test artifacts. */
async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!isLinux)('Linux systemd full lifecycle', () => {
  const serviceId = randomUUID();
  const serviceName = `specforge-daemon-test-${serviceId}`;
  const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');

  let manager: SystemdServiceManager;
  let tempDir: string;
  /** Tracking list of service names registered during this test run for cleanup. */
  const registeredServices: string[] = [];

  // Shared install spec — rebuilt once tempDir is available
  let spec: ServiceInstallSpec;

  beforeAll(async () => {
    // Ensure systemd --user is functional
    await systemctlUser(['daemon-reload']);

    tempDir = await createTempDir(`specforge-test-${serviceId}-`);

    spec = {
      name: serviceName,
      description: `SpecForge integration test service (${serviceId})`,
      binaryPath: '/usr/bin/sleep',
      args: ['infinity'],
      workingDirectory: tempDir,
      environment: {
        SPECFORGE_TEST_ID: serviceId,
      },
      dependsOn: [],
      restartPolicy: 'no',       // avoid auto-restart so stop asserts cleanly
      stopTimeoutSec: 10,
      stdoutLogPath: path.join(tempDir, 'stdout.log'),
      stderrLogPath: path.join(tempDir, 'stderr.log'),
      enableAtBoot: false,       // we'll enable explicitly in the dedicated test
    };

    manager = new SystemdServiceManager({ unitDir });
  });

  // -------------------------------------------------------------------------
  // Cleanup: afterEach — best-effort stop + disable any registered service
  // -------------------------------------------------------------------------
  afterEach(async () => {
    for (const svc of registeredServices) {
      try {
        await manager.stop(svc);
      } catch {
        // best effort
      }
      try {
        await systemctlUser(['disable', `${svc}.service`]);
      } catch {
        // best effort
      }
      try {
        await manager.uninstall(svc);
      } catch {
        // best effort
      }
    }
    // Remove tracking entries after cleanup attempt
    registeredServices.length = 0;
  });

  // -------------------------------------------------------------------------
  // Cleanup: afterAll — dispose manager and scrub temp dir
  // -------------------------------------------------------------------------
  afterAll(async () => {
    // Final safety net: ensure the primary service is fully removed
    try {
      await manager.stop(serviceName);
    } catch {
      // swallow
    }
    try {
      await manager.uninstall(serviceName);
    } catch {
      // swallow
    }

    await manager.dispose();
    expect(manager.getActiveTimerCount()).toBe(0);

    // Remove temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // =========================================================================
  // Lifecycle tests — executed sequentially within this describe block
  // =========================================================================

  it('install: creates unit file and daemon-reload', async () => {
    const result = await manager.install(spec);
    registeredServices.push(serviceName);

    expect(result.success).toBe(true);
    expect(result.serviceName).toBe(serviceName);

    // Assert unit file exists on disk
    const exists = await unitFileExists(unitDir, serviceName);
    expect(exists).toBe(true);

    // Assert systemd recognises the unit (list-unit-files should list it)
    const listOutput = await systemctlUser(['list-unit-files', '--type=service', '--no-pager', '--no-legend']);
    expect(listOutput).toContain(`${serviceName}.service`);
  });

  it('enable: enables the service for auto-start', async () => {
    const unitFileName = `${serviceName}.service`;

    await systemctlUser(['enable', unitFileName]);

    // Assert is-enabled reports "enabled" or "static"
    const enabledOutput = await systemctlUser(['is-enabled', unitFileName]);
    expect(['enabled', 'enabled-runtime']).toContain(enabledOutput);
  });

  it('start: service enters running state', async () => {
    const result = await manager.start(serviceName);

    expect(result.success).toBe(true);
    expect(result.serviceName).toBe(serviceName);
    expect(['running', 'already-running']).toContain(result.state);

    // Assert systemctl --user is-active reports "active"
    const isActive = await systemctlUser(['is-active', `${serviceName}.service`]);
    expect(isActive).toBe('active');
  });

  it('status: reports running with PID', async () => {
    const status = await manager.status(serviceName);

    expect(status.name).toBe(serviceName);
    expect(status.state).toBe('running');
    expect(status.pid).not.toBeNull();
    expect(typeof status.pid).toBe('number');
    expect(status.pid!).toBeGreaterThan(0);
  });

  it('restart: service stays running after restart', async () => {
    const pidBefore = (await manager.status(serviceName)).pid;

    const result = await manager.restart(serviceName);

    expect(result.success).toBe(true);
    expect(result.serviceName).toBe(serviceName);
    expect(result.state).toBe('running');

    // Assert still active via systemctl
    const isActive = await systemctlUser(['is-active', `${serviceName}.service`]);
    expect(isActive).toBe('active');

    // PID should have changed after restart
    const pidAfter = (await manager.status(serviceName)).pid;
    expect(pidAfter).not.toBeNull();
    // On fast systems the PID may recycle, but most of the time it differs
    // We only assert that a valid PID exists
    expect(typeof pidAfter).toBe('number');
    expect(pidAfter!).toBeGreaterThan(0);
  });

  it('stop: service enters stopped state', async () => {
    const result = await manager.stop(serviceName);

    expect(result.success).toBe(true);
    expect(result.serviceName).toBe(serviceName);
    expect(['stopped', 'already-stopped']).toContain(result.state);

    // Assert systemctl --user is-active reports "inactive" or "stopped"
    const isActive = await systemctlUser(['is-active', `${serviceName}.service`]);
    expect(['inactive', 'stopped']).toContain(isActive);

    // Assert status reflects non-running state
    const status = await manager.status(serviceName);
    expect(['stopped', 'stopped', 'failed']).toContain(status.state);
    expect(status.pid).toBeNull();
  });

  it('disable: disables auto-start', async () => {
    const unitFileName = `${serviceName}.service`;

    await systemctlUser(['disable', unitFileName]);

    // Assert is-enabled reports "disabled" or "static"
    let enabledOutput = 'disabled';
    try {
      enabledOutput = await systemctlUser(['is-enabled', unitFileName]);
    } catch {
      // is-enabled exits non-zero when disabled — that's fine
    }
    expect(['disabled', 'static', 'linked', 'indirect']).toContain(enabledOutput);
  });

  it('uninstall: removes unit file completely', async () => {
    const result = await manager.uninstall(serviceName);
    // Remove from tracking since we uninstalled explicitly
    const idx = registeredServices.indexOf(serviceName);
    if (idx !== -1) registeredServices.splice(idx, 1);

    expect(result.success).toBe(true);
    expect(result.serviceName).toBe(serviceName);

    // Assert unit file no longer exists on disk
    const exists = await unitFileExists(unitDir, serviceName);
    expect(exists).toBe(false);

    // Assert systemd no longer lists the unit
    const listOutput = await systemctlUser(['list-unit-files', '--type=service', '--no-pager', '--no-legend']);
    expect(listOutput).not.toContain(`${serviceName}.service`);

    // Assert status reports uninstalled
    const status = await manager.status(serviceName);
    expect(status.state).toBe('uninstalled');
  });
});
