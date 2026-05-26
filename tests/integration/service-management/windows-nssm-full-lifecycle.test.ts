/**
 * Integration Test 12.2: Windows NSSM Full Lifecycle
 *
 * Tests the complete service lifecycle on Windows using real NSSM:
 *   install → start → status → restart → stop → uninstall
 *
 * Assertions:
 * - nssm status <name> return values map to ServiceStatus.state
 * - Get-Service confirms Windows service state
 * - Unique service name (UUID) for test isolation
 * - afterEach uses tracking list to clean up registered test services
 *
 * Platform: Windows only (skip on non-Windows)
 * Privileges: Requires Administrator (elevated) session
 * Dependency: NSSM at ~/.specforge/bin/nssm.exe
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { NssmServiceManager } from '../../../packages/service-management/src/service-manager/nssm-service-manager.js';
import type { ServiceInstallSpec } from '../../../packages/service-management/src/types/service-install-spec.js';
import type { ServiceStatus } from '../../../packages/service-management/src/types/service-status.js';

const execFileAsync = promisify(execFile);

const isWindows = process.platform === 'win32';

// ─── Tracking list for test service cleanup (lessons-injected T1) ──────────
const registeredServices: string[] = [];
let tempDir: string;
let manager: NssmServiceManager;

/**
 * Helper: promisified PowerShell command execution
 */
async function runPowerShell(script: string): Promise<string> {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ], { timeout: 15_000 });
  return stdout.trim();
}

/**
 * Helper: assert Get-Service status matches expected state
 */
async function assertGetServiceStatus(
  serviceName: string,
  expectedStatus: string
): Promise<void> {
  const psScript = `(Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue).Status`;
  const actual = await runPowerShell(psScript);
  expect(actual).toBe(expectedStatus);
}

/**
 * Helper: wait for a service to reach a target state with polling
 */
async function waitForState(
  targetState: ServiceStatus['state'],
  serviceName: string,
  maxAttempts: number = 20,
  intervalMs: number = 500
): Promise<ServiceStatus> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await manager.status(serviceName);
    if (status.state === targetState) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const finalStatus = await manager.status(serviceName);
  throw new Error(
    `Service "${serviceName}" did not reach state "${targetState}" within ${
      maxAttempts * intervalMs
    }ms. Final state: "${finalStatus.state}"`
  );
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe.skipIf(!isWindows)('Windows NSSM full lifecycle', () => {
  let serviceName: string;
  let spec: ServiceInstallSpec;

  beforeAll(async () => {
    // Generate unique service name for isolation
    const uuid = randomUUID().slice(0, 8);
    serviceName = `sf-test-${uuid}`;

    // Create temp directory for logs and working dir
    tempDir = await mkdtemp(path.join(tmpdir(), `sf-nssm-test-`));

    // Create a simple long-running script as the service binary
    // Uses ping -t 127.0.0.1 which runs indefinitely on Windows
    const stdoutLogPath = path.join(tempDir, 'stdout.log');
    const stderrLogPath = path.join(tempDir, 'stderr.log');

    spec = {
      name: serviceName,
      description: `SpecForge integration test service ${serviceName}`,
      binaryPath: 'ping.exe',
      args: ['-t', '127.0.0.1'],
      workingDirectory: tempDir,
      environment: {},
      dependsOn: [],
      restartPolicy: 'on-failure',
      stopTimeoutSec: 10,
      enableAtBoot: false,
      stdoutLogPath,
      stderrLogPath,
    };

    // Create manager pointing to default NSSM location
    manager = new NssmServiceManager();
  }, 60_000);

  afterEach(() => {
    // Safety check: verify no leaked timers after each test.
    // The tracking list is used by afterAll for actual service cleanup.
    // afterEach does NOT stop/uninstall between sequential lifecycle tests
    // because each test depends on the state left by the previous test.
    expect(manager.getActiveTimerCount()).toBe(0);
  });

  afterAll(async () => {
    // Clean up tracked services: stop and remove any registered test services
    for (const name of registeredServices) {
      try {
        await manager.stop(name).catch(() => {});
        await manager.uninstall(name).catch(() => {});
      } catch {
        // Best-effort cleanup
      }
    }
    registeredServices.length = 0;

    // Dispose manager and verify no active timers
    await manager.dispose();
    expect(manager.disposed).toBe(true);
    expect(manager.getActiveTimerCount()).toBe(0);

    // Clean up temp directory
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
  }, 30_000);

  // ─── Test 1: Environment Precheck ──────────────────────────────────────

  it('should pass environment precheck with NSSM available and elevated', async () => {
    const precheck = await manager.precheckEnvironment();

    expect(precheck.platform).toBe('win32');
    expect(precheck.nssmAvailable).toBe(true);
    expect(precheck.nssmExePath).toBeTruthy();
    expect(precheck.isElevated).toBe(true);

    // Must have no NSSM blockers
    const blockerCodes = precheck.blockers.map((b) => b.code);
    expect(blockerCodes).not.toContain('NSSM_NOT_FOUND');
  });

  // ─── Test 2: Install Service ───────────────────────────────────────────

  it('should install service via NSSM', async () => {
    const result = await manager.install(spec);

    expect(result.success).toBe(true);
    expect(result.serviceName).toBe(serviceName);
    expect(result.enabled).toBe(false);

    // Track for cleanup in afterAll
    registeredServices.push(serviceName);

    // Verify via Get-Service that the service exists
    const psScript = `(Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue) -ne $null`;
    const exists = await runPowerShell(psScript);
    expect(exists).toBe('True');

    // Verify nssm status return value maps to 'stopped' (installed but not started)
    const status = await manager.status(serviceName);
    expect(status.state).toBe('stopped');
  });

  // ─── Test 3: Start Service ─────────────────────────────────────────────

  it('should start service and enter running state', async () => {
    const result = await manager.start(serviceName);

    expect(result.success).toBe(true);
    expect(result.serviceName).toBe(serviceName);
    expect(result.state).toBe('running');

    // Verify via Get-Service
    await assertGetServiceStatus(serviceName, 'Running');
  });

  // ─── Test 4: Status Reports Running ────────────────────────────────────

  it('should report running status with PID when available', async () => {
    // Wait for status to stabilize
    const status = await waitForState('running', serviceName);

    expect(status.name).toBe(serviceName);
    expect(status.state).toBe('running');

    // NSSM 2.x nssm status outputs "SERVICE_RUNNING" without PID.
    // PID is only available if the output includes "SERVICE_RUNNING: <pid>"
    // which depends on NSSM version. Verify pid is a positive number when present.
    if (status.pid !== null) {
      expect(typeof status.pid).toBe('number');
      expect(status.pid!).toBeGreaterThan(0);
    }

    // startedAt should be present when running
    if (status.startedAt !== null) {
      expect(typeof status.startedAt).toBe('number');
    }
  });

  // ─── Test 5: Idempotent Start ──────────────────────────────────────────

  it('should return already-running when starting a running service', async () => {
    const result = await manager.start(serviceName);

    expect(result.success).toBe(true);
    expect(result.state).toBe('already-running');
  });

  // ─── Test 6: Restart Service ───────────────────────────────────────────

  it('should restart service and keep it running', async () => {
    const result = await manager.restart(serviceName);

    expect(result.success).toBe(true);
    expect(result.serviceName).toBe(serviceName);
    expect(result.state).toBe('running');

    // Verify via Get-Service that it's running after restart
    await assertGetServiceStatus(serviceName, 'Running');

    // Verify nssm status return value confirms running
    const status = await waitForState('running', serviceName);
    expect(status.state).toBe('running');
  });

  // ─── Test 7: Stop Service ──────────────────────────────────────────────

  it('should stop service and enter stopped state', async () => {
    const result = await manager.stop(serviceName);

    expect(result.success).toBe(true);
    expect(result.serviceName).toBe(serviceName);
    expect(result.state).toBe('stopped');

    // Verify via Get-Service
    await assertGetServiceStatus(serviceName, 'Stopped');

    // Verify nssm status return value
    const status = await manager.status(serviceName);
    expect(status.state).toBe('stopped');
  });

  // ─── Test 8: Idempotent Stop ───────────────────────────────────────────

  it('should return already-stopped when stopping a stopped service', async () => {
    const result = await manager.stop(serviceName);

    expect(result.success).toBe(true);
    expect(result.state).toBe('already-stopped');
  });

  // ─── Test 9: Uninstall Service ─────────────────────────────────────────

  it('should uninstall service completely', async () => {
    const result = await manager.uninstall(serviceName);

    expect(result.success).toBe(true);
    expect(result.serviceName).toBe(serviceName);

    // Verify via Get-Service that the service no longer exists (authoritative OS check)
    const psScript =
      `(Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue) -eq $null`;
    const isNull = await runPowerShell(psScript);
    expect(isNull).toBe('True');

    // Remove from tracking list since it's fully uninstalled
    const idx = registeredServices.indexOf(serviceName);
    if (idx !== -1) {
      registeredServices.splice(idx, 1);
    }
  });
});
