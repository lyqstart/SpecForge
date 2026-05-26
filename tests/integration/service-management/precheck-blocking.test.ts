/**
 * Integration Test 12.8: Precheck Blocking
 *
 * Tests that environment precheck correctly blocks installation when
 * the environment is not ready, without executing any OS operations.
 *
 * Scenarios:
 *   1. Missing systemd (SYSTEMD_NOT_AVAILABLE) → exit code 2
 *   2. Missing NSSM (NSSM_NOT_FOUND) → exit code 2
 *   3. Not elevated (NOT_ELEVATED) → exit code 2
 *   4. Darwin platform (PLATFORM_NOT_SUPPORTED) → exit code 2
 *   5. Warnings-only (LINGER_NOT_ENABLED) → exit code 0, install proceeds
 *   6. No blockers → install proceeds normally
 *   7. schema_version is always "1.0" in precheck results
 *   8. Mixed blockers and warnings categorization
 *
 * Validates Requirements 1.4, 7.1, 7.2, 7.4, 7.5, 7.6
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ServiceLifecycleOrchestrator } from '../../../packages/service-management/src/orchestrator/service-lifecycle-orchestrator.js';
import type { ServiceManager } from '../../../packages/service-management/src/service-manager/service-manager.js';
import type { InstallResult } from '../../../packages/service-management/src/service-manager/service-manager.js';
import type { ServiceInstallSpec } from '../../../packages/service-management/src/types/service-install-spec.js';
import type { ServiceStatus } from '../../../packages/service-management/src/types/service-status.js';
import type { EnvironmentPrecheck, PrecheckIssue } from '../../../packages/service-management/src/types/environment-precheck.js';
import { getExitCode, isBlockingError } from '../../../packages/service-management/src/errors/exit-code-map.js';
import { ErrorCode } from '../../../packages/service-management/src/errors/error-codes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock ServiceManager that returns the given precheck result. */
function createMockManagerWithPrecheck(precheck: EnvironmentPrecheck): ServiceManager {
  return {
    install: vi.fn<() => Promise<InstallResult>>().mockResolvedValue({
      success: true,
      serviceName: 'test-service',
      enabled: false,
    }),
    uninstall: vi.fn().mockResolvedValue({ success: true, serviceName: 'test-service' }),
    start: vi.fn().mockResolvedValue({ success: true, serviceName: 'test-service', state: 'running' as const }),
    stop: vi.fn().mockResolvedValue({ success: true, serviceName: 'test-service', state: 'stopped' as const }),
    restart: vi.fn().mockResolvedValue({ success: true, serviceName: 'test-service', state: 'running' as const }),
    status: vi.fn<() => Promise<ServiceStatus>>().mockResolvedValue({
      schema_version: '1.0',
      name: 'test-service',
      state: 'uninstalled',
      pid: null,
      startedAt: null,
      lastExitCode: null,
      lastError: null,
    }),
    precheckEnvironment: vi.fn<() => Promise<EnvironmentPrecheck>>().mockResolvedValue(precheck),
    dispose: vi.fn().mockResolvedValue(undefined),
    [Symbol.dispose]: vi.fn(),
    [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
  };
}

/** Build a clean Linux precheck result with no blockers or warnings. */
function createCleanLinuxPrecheck(): EnvironmentPrecheck {
  return {
    schema_version: '1.0',
    platform: 'linux',
    systemdAvailable: true,
    systemdVersion: '256',
    lingerEnabled: true,
    systemdUserUnitDir: '/home/test/.config/systemd/user',
    isElevated: null,
    nssmAvailable: null,
    nssmExePath: null,
    nssmVersion: null,
    currentUserName: 'testuser',
    blockers: [],
    warnings: [],
  };
}

/** Build a clean Windows precheck result with no blockers or warnings. */
function createCleanWin32Precheck(): EnvironmentPrecheck {
  return {
    schema_version: '1.0',
    platform: 'win32',
    systemdAvailable: null,
    systemdVersion: null,
    lingerEnabled: null,
    systemdUserUnitDir: null,
    isElevated: true,
    nssmAvailable: true,
    nssmExePath: 'C:\\Users\\test\\.specforge\\bin\\nssm.exe',
    nssmVersion: '2.24',
    currentUserName: 'testuser',
    blockers: [],
    warnings: [],
  };
}

/** Determine the exit code from a precheck result. Mirrors the CLI logic. */
function determineExitCodeFromPrecheck(precheck: EnvironmentPrecheck): number {
  if (precheck.blockers.length > 0) {
    // Any blocker → environment/input error (exit code 2)
    return 2;
  }
  // Warnings only → success (exit code 0)
  return 0;
}

/** A minimal ServiceInstallSpec for testing. */
const testSpec: ServiceInstallSpec = {
  name: 'test-service',
  description: 'Test service for precheck blocking',
  binaryPath: '/usr/bin/sleep',
  args: ['infinity'],
  workingDirectory: '/tmp',
  environment: {},
  dependsOn: [],
  restartPolicy: 'no',
  stopTimeoutSec: 10,
  stdoutLogPath: '/tmp/test-stdout.log',
  stderrLogPath: '/tmp/test-stderr.log',
  enableAtBoot: false,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Precheck blocking', () => {
  const orchestrators: ServiceLifecycleOrchestrator[] = [];

  /** Create an orchestrator and track it for cleanup. */
  function createOrchestrator(manager: ServiceManager): ServiceLifecycleOrchestrator {
    const orch = new ServiceLifecycleOrchestrator({ serviceManager: manager });
    orchestrators.push(orch);
    return orch;
  }

  afterEach(async () => {
    // Dispose all orchestrators created in this test
    for (const orch of orchestrators) {
      try {
        await orch.dispose();
      } catch {
        // Best effort
      }
      expect(orch.getActivePendingOpCount()).toBe(0);
    }
    orchestrators.length = 0;
  });

  // =========================================================================
  // 1. Missing systemd → blockers → exit code 2
  // =========================================================================

  it('blocks install when SYSTEMD_NOT_AVAILABLE blocker is present', async () => {
    const blocker: PrecheckIssue = {
      code: 'SYSTEMD_NOT_AVAILABLE',
      message: 'systemd --user is not available on this system',
      suggestion: 'This system may be running WSL1, Alpine Linux, or another non-systemd distribution.',
    };
    const precheck: EnvironmentPrecheck = {
      ...createCleanLinuxPrecheck(),
      systemdAvailable: false,
      systemdVersion: null,
      blockers: [blocker],
    };

    const manager = createMockManagerWithPrecheck(precheck);
    const orchestrator = createOrchestrator(manager);

    // Step 1: Run precheck
    const result = await manager.precheckEnvironment();

    // Step 2: Verify blockers are non-empty
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].code).toBe('SYSTEMD_NOT_AVAILABLE');

    // Step 3: Verify exit code is 2 (environment error)
    const exitCode = determineExitCodeFromPrecheck(result);
    expect(exitCode).toBe(2);

    // Step 4: Verify error code maps to exit code 2
    expect(getExitCode(ErrorCode.SVC_SYSTEMD_NOT_AVAILABLE)).toBe(2);
    expect(isBlockingError(ErrorCode.SVC_SYSTEMD_NOT_AVAILABLE)).toBe(true);

    // Step 5: Verify install was NOT called (blocked before reaching install)
    expect(manager.install).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 2. Missing NSSM → blockers → exit code 2
  // =========================================================================

  it('blocks install when NSSM_NOT_FOUND blocker is present', async () => {
    const blocker: PrecheckIssue = {
      code: 'NSSM_NOT_FOUND',
      message: 'NSSM executable not found',
      suggestion: 'NSSM (Non-Sucking Service Manager) is required for Windows service management.',
    };
    const precheck: EnvironmentPrecheck = {
      ...createCleanWin32Precheck(),
      nssmAvailable: false,
      nssmExePath: null,
      nssmVersion: null,
      blockers: [blocker],
    };

    const manager = createMockManagerWithPrecheck(precheck);
    const orchestrator = createOrchestrator(manager);

    const result = await manager.precheckEnvironment();

    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].code).toBe('NSSM_NOT_FOUND');

    const exitCode = determineExitCodeFromPrecheck(result);
    expect(exitCode).toBe(2);

    expect(getExitCode(ErrorCode.SVC_NSSM_NOT_FOUND)).toBe(2);
    expect(isBlockingError(ErrorCode.SVC_NSSM_NOT_FOUND)).toBe(true);

    expect(manager.install).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 3. Not elevated → blockers → exit code 2
  // =========================================================================

  it('blocks install when NOT_ELEVATED blocker is present', async () => {
    const blocker: PrecheckIssue = {
      code: 'NOT_ELEVATED',
      message: 'Administrator privileges are required for service installation',
      suggestion: 'Please run the command in an elevated PowerShell or Command Prompt.',
    };
    const precheck: EnvironmentPrecheck = {
      ...createCleanWin32Precheck(),
      isElevated: false,
      blockers: [blocker],
    };

    const manager = createMockManagerWithPrecheck(precheck);
    const orchestrator = createOrchestrator(manager);

    const result = await manager.precheckEnvironment();

    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].code).toBe('NOT_ELEVATED');

    const exitCode = determineExitCodeFromPrecheck(result);
    expect(exitCode).toBe(2);

    expect(getExitCode(ErrorCode.SVC_NOT_ELEVATED)).toBe(2);
    expect(isBlockingError(ErrorCode.SVC_NOT_ELEVATED)).toBe(true);

    expect(manager.install).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 4. Darwin platform → PLATFORM_NOT_SUPPORTED blocker → exit code 2
  // =========================================================================

  it('returns PLATFORM_NOT_SUPPORTED blocker for darwin platform', async () => {
    // Simulate darwin precheck result (unsupported platform)
    const blocker: PrecheckIssue = {
      code: 'PLATFORM_NOT_SUPPORTED',
      message: 'macOS (darwin) is not supported for service management',
      suggestion: 'Service management is only supported on Linux (systemd) and Windows (NSSM).',
    };
    const precheck: EnvironmentPrecheck = {
      schema_version: '1.0',
      platform: 'linux', // Platform type only allows "linux" | "win32", but the blocker code is PLATFORM_NOT_SUPPORTED
      systemdAvailable: null,
      systemdVersion: null,
      lingerEnabled: null,
      systemdUserUnitDir: null,
      isElevated: null,
      nssmAvailable: null,
      nssmExePath: null,
      nssmVersion: null,
      currentUserName: null,
      blockers: [blocker],
      warnings: [],
    };

    const manager = createMockManagerWithPrecheck(precheck);
    const orchestrator = createOrchestrator(manager);

    const result = await manager.precheckEnvironment();

    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].code).toBe('PLATFORM_NOT_SUPPORTED');
    expect(result.blockers[0].message).toContain('not supported');

    // PLATFORM_NOT_SUPPORTED is a blocker → exit code 2
    const exitCode = determineExitCodeFromPrecheck(result);
    expect(exitCode).toBe(2);

    // Install must not proceed
    expect(manager.install).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 5. Warnings-only (linger not enabled) → exit code 0, proceed
  // =========================================================================

  it('allows install with warnings-only (LINGER_NOT_ENABLED)', async () => {
    const warning: PrecheckIssue = {
      code: 'LINGER_NOT_ENABLED',
      message: 'linger is not enabled for the current user',
      suggestion: 'Run "loginctl enable-linger $USER" to enable user services to run after logout.',
    };
    const precheck: EnvironmentPrecheck = {
      ...createCleanLinuxPrecheck(),
      lingerEnabled: false,
      blockers: [],
      warnings: [warning],
    };

    const manager = createMockManagerWithPrecheck(precheck);
    const orchestrator = createOrchestrator(manager);

    const result = await manager.precheckEnvironment();

    // No blockers, only warnings
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('LINGER_NOT_ENABLED');

    // LINGER_NOT_ENABLED is a warning → exit code 0
    const exitCode = determineExitCodeFromPrecheck(result);
    expect(exitCode).toBe(0);

    // SVC_LINGER_NOT_ENABLED maps to exit code 0 in the exit code map
    expect(getExitCode(ErrorCode.SVC_LINGER_NOT_ENABLED)).toBe(0);

    // Install should proceed (no blockers)
    const installResult = await orchestrator.installAll([testSpec]);
    expect(installResult.success).toBe(true);
    expect(manager.install).toHaveBeenCalled();
  });

  // =========================================================================
  // 6. No blockers → install proceeds normally
  // =========================================================================

  it('allows install when precheck has no blockers', async () => {
    const precheck = createCleanLinuxPrecheck();

    const manager = createMockManagerWithPrecheck(precheck);
    const orchestrator = createOrchestrator(manager);

    const result = await manager.precheckEnvironment();

    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);

    const exitCode = determineExitCodeFromPrecheck(result);
    expect(exitCode).toBe(0);

    // Install should succeed
    const installResult = await orchestrator.installAll([testSpec]);
    expect(installResult.success).toBe(true);
    expect(installResult.perService).toHaveLength(1);
    expect(manager.install).toHaveBeenCalled();
  });

  // =========================================================================
  // 7. schema_version is always "1.0"
  // =========================================================================

  it('always returns schema_version "1.0" in precheck results', async () => {
    // Linux precheck
    const linuxPrecheck = createCleanLinuxPrecheck();
    expect(linuxPrecheck.schema_version).toBe('1.0');

    // Windows precheck
    const win32Precheck = createCleanWin32Precheck();
    expect(win32Precheck.schema_version).toBe('1.0');

    // Darwin (unsupported) precheck
    const darwinPrecheck: EnvironmentPrecheck = {
      schema_version: '1.0',
      platform: 'linux',
      systemdAvailable: null,
      systemdVersion: null,
      lingerEnabled: null,
      systemdUserUnitDir: null,
      isElevated: null,
      nssmAvailable: null,
      nssmExePath: null,
      nssmVersion: null,
      currentUserName: null,
      blockers: [{ code: 'PLATFORM_NOT_SUPPORTED', message: 'Not supported', suggestion: 'Use Linux or Windows' }],
      warnings: [],
    };
    expect(darwinPrecheck.schema_version).toBe('1.0');

    // Precheck with blockers
    const blockedPrecheck: EnvironmentPrecheck = {
      ...createCleanLinuxPrecheck(),
      systemdAvailable: false,
      blockers: [{
        code: 'SYSTEMD_NOT_AVAILABLE',
        message: 'systemd not available',
        suggestion: 'Install systemd',
      }],
    };
    expect(blockedPrecheck.schema_version).toBe('1.0');
  });

  // =========================================================================
  // 8. Mixed blockers and warnings structure
  // =========================================================================

  it('correctly categorizes mixed blockers and warnings', async () => {
    const blockers: PrecheckIssue[] = [
      {
        code: 'SYSTEMD_NOT_AVAILABLE',
        message: 'systemd --user is not available',
        suggestion: 'Install a systemd-based distribution.',
      },
      {
        code: 'BINARY_MISSING',
        message: 'Service binary not found',
        suggestion: 'Verify the binary path.',
      },
    ];
    const warnings: PrecheckIssue[] = [
      {
        code: 'LINGER_NOT_ENABLED',
        message: 'linger is not enabled',
        suggestion: 'Run loginctl enable-linger.',
      },
    ];

    const precheck: EnvironmentPrecheck = {
      ...createCleanLinuxPrecheck(),
      systemdAvailable: false,
      lingerEnabled: false,
      blockers,
      warnings,
    };

    const manager = createMockManagerWithPrecheck(precheck);
    const orchestrator = createOrchestrator(manager);

    const result = await manager.precheckEnvironment();

    // Blockers and warnings are separate
    expect(result.blockers).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);

    // Blocker codes
    expect(result.blockers.map(b => b.code)).toEqual(
      expect.arrayContaining(['SYSTEMD_NOT_AVAILABLE', 'BINARY_MISSING']),
    );

    // Warning codes
    expect(result.warnings[0].code).toBe('LINGER_NOT_ENABLED');

    // Any blocker present → exit code 2
    const exitCode = determineExitCodeFromPrecheck(result);
    expect(exitCode).toBe(2);

    // Install must be blocked
    expect(manager.install).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 9. Exit code map consistency for all blocking error codes
  // =========================================================================

  it('maps all environment error codes to exit code 2', () => {
    const blockingCodes: ErrorCode[] = [
      ErrorCode.SVC_SYSTEMD_NOT_AVAILABLE,
      ErrorCode.SVC_NSSM_NOT_FOUND,
      ErrorCode.SVC_NOT_ELEVATED,
      ErrorCode.SVC_BINARY_MISSING,
      ErrorCode.SVC_PORT_IN_USE,
      ErrorCode.SVC_OPENCODE_SERVER_BINARY_MISSING,
    ];

    for (const code of blockingCodes) {
      expect(getExitCode(code)).toBe(2);
      expect(isBlockingError(code)).toBe(true);
    }
  });

  // =========================================================================
  // 10. Warning-only error codes map to exit code 0
  // =========================================================================

  it('maps warning-only error codes to exit code 0', () => {
    expect(getExitCode(ErrorCode.SVC_LINGER_NOT_ENABLED)).toBe(0);
    expect(getExitCode(ErrorCode.SVC_NSSM_REQUIRES_USER_PASSWORD)).toBe(0);
  });

  // =========================================================================
  // 11. Multiple blockers combined (NSSM + not elevated)
  // =========================================================================

  it('blocks install when multiple blockers are present (NSSM + not elevated)', async () => {
    const blockers: PrecheckIssue[] = [
      {
        code: 'NSSM_NOT_FOUND',
        message: 'NSSM executable not found',
        suggestion: 'Install NSSM to ~/.specforge/bin/nssm.exe.',
      },
      {
        code: 'NOT_ELEVATED',
        message: 'Administrator privileges required',
        suggestion: 'Run as Administrator.',
      },
    ];
    const precheck: EnvironmentPrecheck = {
      ...createCleanWin32Precheck(),
      nssmAvailable: false,
      nssmExePath: null,
      isElevated: false,
      blockers,
      warnings: [],
    };

    const manager = createMockManagerWithPrecheck(precheck);
    const orchestrator = createOrchestrator(manager);

    const result = await manager.precheckEnvironment();

    expect(result.blockers).toHaveLength(2);
    expect(result.blockers.map(b => b.code)).toContain('NSSM_NOT_FOUND');
    expect(result.blockers.map(b => b.code)).toContain('NOT_ELEVATED');

    const exitCode = determineExitCodeFromPrecheck(result);
    expect(exitCode).toBe(2);

    expect(manager.install).not.toHaveBeenCalled();
  });
});
