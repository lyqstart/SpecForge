/**
 * Integration Test 12.3: Cross-Platform Equivalence
 *
 * Verifies that the same (install, start, stop, uninstall) command sequence
 * produces equivalent ServiceState sequences regardless of platform.
 *
 * State sequence: uninstalled → stopped → starting → running → stopping → stopped → uninstalled
 *
 * Validates Requirements 12.1, 12.2, 12.3, 12.4
 */
import { describe, it, expect, afterEach } from 'vitest';
import { ServiceLifecycleOrchestrator } from '../../../packages/service-management/src/orchestrator/service-lifecycle-orchestrator.js';
import type { ServiceManager } from '../../../packages/service-management/src/service-manager/service-manager.js';
import type { ServiceInstallSpec } from '../../../packages/service-management/src/types/service-install-spec.js';
import type { ServiceStatus } from '../../../packages/service-management/src/types/service-status.js';
import type { ServiceState } from '../../../packages/service-management/src/types/service-state.js';
import type { EnvironmentPrecheck } from '../../../packages/service-management/src/types/environment-precheck.js';
import type { OrchestrationResult } from '../../../packages/service-management/src/types/orchestration-result.js';

// ---------------------------------------------------------------------------
// Mock ServiceManager
// ---------------------------------------------------------------------------

interface MockServiceManagerOptions {
  /** Simulated platform for precheck */
  platform: 'linux' | 'win32';
}

/**
 * Creates a mock ServiceManager that tracks state transitions.
 * Each service starts as "uninstalled" and transitions through lifecycle states.
 */
function createMockServiceManager(options: MockServiceManagerOptions): {
  manager: ServiceManager;
  getStateTransitions: (serviceName: string) => ServiceState[];
  resetStateTransitions: (serviceName: string) => void;
} {
  // Current state per service
  const states = new Map<string, ServiceState>();
  // Recorded state transitions per service
  const transitions = new Map<string, ServiceState[]>();

  function getState(name: string): ServiceState {
    return states.get(name) ?? 'uninstalled';
  }

  function recordTransition(name: string, newState: ServiceState): void {
    const list = transitions.get(name) ?? [];
    list.push(newState);
    transitions.set(name, list);
    states.set(name, newState);
  }

  function makeStatus(name: string): ServiceStatus {
    const state = getState(name);
    return {
      schema_version: '1.0',
      name,
      state,
      pid: state === 'running' ? 12345 : null,
      startedAt: state === 'running' ? Date.now() : null,
      lastExitCode: state === 'stopped' || state === 'failed' ? 0 : null,
      lastError: null,
    };
  }

  const manager: ServiceManager = {
    async install(spec: ServiceInstallSpec) {
      const current = getState(spec.name);
      if (current !== 'uninstalled') {
        // Already installed — no-op
        return {
          success: true,
          serviceName: spec.name,
          enabled: spec.enableAtBoot,
        };
      }
      recordTransition(spec.name, 'stopped');
      return {
        success: true,
        serviceName: spec.name,
        enabled: spec.enableAtBoot,
      };
    },

    async uninstall(serviceName: string) {
      const current = getState(serviceName);
      if (current === 'uninstalled') {
        return { success: true, serviceName };
      }
      // If running or starting, go through stopping first
      if (current === 'running' || current === 'starting') {
        recordTransition(serviceName, 'stopping');
        recordTransition(serviceName, 'stopped');
      }
      recordTransition(serviceName, 'uninstalled');
      return { success: true, serviceName };
    },

    async start(serviceName: string) {
      const current = getState(serviceName);
      if (current === 'running') {
        return {
          success: true,
          serviceName,
          state: 'already-running' as const,
          pid: 12345,
        };
      }
      recordTransition(serviceName, 'starting');
      recordTransition(serviceName, 'running');
      return {
        success: true,
        serviceName,
        state: 'running' as const,
        pid: 12345,
      };
    },

    async stop(serviceName: string) {
      const current = getState(serviceName);
      if (current === 'stopped' || current === 'uninstalled') {
        return {
          success: true,
          serviceName,
          state: 'already-stopped' as const,
        };
      }
      recordTransition(serviceName, 'stopping');
      recordTransition(serviceName, 'stopped');
      return {
        success: true,
        serviceName,
        state: 'stopped' as const,
      };
    },

    async restart(serviceName: string) {
      recordTransition(serviceName, 'stopping');
      recordTransition(serviceName, 'stopped');
      recordTransition(serviceName, 'starting');
      recordTransition(serviceName, 'running');
      return {
        success: true,
        serviceName,
        state: 'running' as const,
        pid: 12345,
      };
    },

    async status(serviceName: string): Promise<ServiceStatus> {
      return makeStatus(serviceName);
    },

    async precheckEnvironment(): Promise<EnvironmentPrecheck> {
      const isLinux = options.platform === 'linux';
      return {
        schema_version: '1.0',
        platform: options.platform,
        systemdAvailable: isLinux ? true : null,
        systemdVersion: isLinux ? '255' : null,
        lingerEnabled: isLinux ? true : null,
        systemdUserUnitDir: isLinux ? '/home/user/.config/systemd/user' : null,
        isElevated: !isLinux ? true : null,
        nssmAvailable: !isLinux ? true : null,
        nssmExePath: !isLinux ? 'C:\\tools\\nssm.exe' : null,
        nssmVersion: !isLinux ? '2.24' : null,
        currentUserName: !isLinux ? 'TestUser' : null,
        blockers: [],
        warnings: [],
      };
    },

    async dispose() {
      // No-op for mock
    },
  };

  return {
    manager,
    getStateTransitions: (serviceName: string) => transitions.get(serviceName) ?? [],
    resetStateTransitions: (serviceName: string) => {
      transitions.delete(serviceName);
      states.delete(serviceName);
    },
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeInstallSpec(name: string): ServiceInstallSpec {
  return {
    name,
    description: `Test service ${name}`,
    binaryPath: '/usr/bin/test-binary',
    args: ['--serve'],
    workingDirectory: '/tmp',
    environment: {},
    dependsOn: [],
    restartPolicy: 'on-failure',
    stopTimeoutSec: 10,
    stdoutLogPath: '/tmp/stdout.log',
    stderrLogPath: '/tmp/stderr.log',
    enableAtBoot: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cross-platform equivalence', () => {
  const orchestrators: ServiceLifecycleOrchestrator[] = [];

  afterEach(async () => {
    for (const orch of orchestrators) {
      expect(orch.getActivePendingOpCount()).toBe(0);
      await orch.dispose();
    }
    orchestrators.length = 0;
  });

  /**
   * Helper: run the full lifecycle on a single platform mock and return results.
   */
  async function runLifecycle(
    platform: 'linux' | 'win32',
    serviceNames: string[],
  ): Promise<{
    transitions: Map<string, ServiceState[]>;
    installResult: OrchestrationResult;
    startResult: OrchestrationResult;
    stopResult: OrchestrationResult;
    uninstallResult: OrchestrationResult;
  }> {
    const { manager, getStateTransitions, resetStateTransitions } =
      createMockServiceManager({ platform });

    // Reset transitions before orchestrator probes
    for (const name of serviceNames) {
      resetStateTransitions(name);
    }

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: manager,
      dependencyGraph: Object.fromEntries(
        serviceNames.map((name) => [name, []]),
      ),
    });
    orchestrators.push(orch);

    // Install
    const installResult = await orch.installAll(
      serviceNames.map(makeInstallSpec),
    );

    // Start
    const startResult = await orch.startAll(serviceNames);

    // Stop
    const stopResult = await orch.stopAll(serviceNames);

    // Uninstall
    const uninstallResult = await orch.uninstallAll(serviceNames);

    // Collect final transitions
    const transitions = new Map<string, ServiceState[]>();
    for (const name of serviceNames) {
      transitions.set(name, getStateTransitions(name));
    }

    return { transitions, installResult, startResult, stopResult, uninstallResult };
  }

  // -----------------------------------------------------------------------
  // Test 1: Full lifecycle produces expected state sequence
  // -----------------------------------------------------------------------
  it('should produce the expected state sequence: uninstalled → stopped → starting → running → stopping → stopped → uninstalled', async () => {
    const linuxResult = await runLifecycle('linux', ['test-svc']);

    const sequence = linuxResult.transitions.get('test-svc')!;

    // Expected: uninstalled → stopped (install) → starting → running (start)
    //           → stopping → stopped (stop) → uninstalled (uninstall)
    expect(sequence).toEqual([
      'stopped',     // install
      'starting',    // start
      'running',     // start
      'stopping',    // stop
      'stopped',     // stop
      'uninstalled', // uninstall
    ]);
  });

  // -----------------------------------------------------------------------
  // Test 2: State sequence is identical on Linux and Windows mocks
  // -----------------------------------------------------------------------
  it('should produce identical state transitions on Linux and Windows', async () => {
    const serviceNames = ['opencode-server', 'specforge-daemon'];

    const linuxResult = await runLifecycle('linux', serviceNames);
    const windowsResult = await runLifecycle('win32', serviceNames);

    for (const name of serviceNames) {
      const linuxSeq = linuxResult.transitions.get(name)!;
      const windowsSeq = windowsResult.transitions.get(name)!;

      // Both platforms must produce identical state transition sequences
      expect(linuxSeq).toEqual(windowsSeq);

      // Each must follow the expected lifecycle
      expect(linuxSeq).toContain('stopped');
      expect(linuxSeq).toContain('starting');
      expect(linuxSeq).toContain('running');
      expect(linuxSeq).toContain('stopping');
      expect(linuxSeq).toContain('uninstalled');
    }
  });

  // -----------------------------------------------------------------------
  // Test 3: OrchestrationResult has consistent structure
  // -----------------------------------------------------------------------
  it('should produce OrchestrationResult with consistent structure across platforms', async () => {
    const serviceNames = ['svc-a'];

    const linuxResult = await runLifecycle('linux', serviceNames);
    const windowsResult = await runLifecycle('win32', serviceNames);

    const allResults: OrchestrationResult[] = [
      linuxResult.installResult,
      linuxResult.startResult,
      linuxResult.stopResult,
      linuxResult.uninstallResult,
      windowsResult.installResult,
      windowsResult.startResult,
      windowsResult.stopResult,
      windowsResult.uninstallResult,
    ];

    for (const result of allResults) {
      // schema_version is always "1.0"
      expect(result.schema_version).toBe('1.0');

      // success is true for happy path
      expect(result.success).toBe(true);

      // rolledBack is empty for successful operations
      expect(result.rolledBack).toEqual([]);

      // error is null for successful operations
      expect(result.error).toBeNull();

      // perService is a non-empty array
      expect(Array.isArray(result.perService)).toBe(true);
      expect(result.perService.length).toBeGreaterThan(0);

      // Each ServiceStatus has required fields
      for (const status of result.perService) {
        expect(status.schema_version).toBe('1.0');
        expect(typeof status.name).toBe('string');
        expect(typeof status.state).toBe('string');
      }
    }
  });

  // -----------------------------------------------------------------------
  // Test 4: schema_version is always "1.0" on every result
  // -----------------------------------------------------------------------
  it('should always set schema_version to "1.0" on all orchestration results', async () => {
    const linuxResult = await runLifecycle('linux', ['svc-x']);
    const windowsResult = await runLifecycle('win32', ['svc-x']);

    const results = [
      linuxResult.installResult,
      linuxResult.startResult,
      linuxResult.stopResult,
      linuxResult.uninstallResult,
      windowsResult.installResult,
      windowsResult.startResult,
      windowsResult.stopResult,
      windowsResult.uninstallResult,
    ];

    for (const result of results) {
      expect(result.schema_version).toBe('1.0');
      expect(result.perService.every((s) => s.schema_version === '1.0')).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Test 5: Orchestrator delegates to ServiceManager regardless of platform
  // -----------------------------------------------------------------------
  it('should delegate to ServiceManager correctly for both platforms', async () => {
    for (const platform of ['linux', 'win32'] as const) {
      const { manager, getStateTransitions } = createMockServiceManager({ platform });

      const orch = new ServiceLifecycleOrchestrator({
        serviceManager: manager,
        dependencyGraph: { 'test-delegate': [] },
      });
      orchestrators.push(orch);

      // Install + start
      await orch.installAll([makeInstallSpec('test-delegate')]);
      await orch.startAll(['test-delegate']);

      const statusAfterStart = await orch.statusAll(['test-delegate']);
      expect(statusAfterStart[0].state).toBe('running');

      // Stop + uninstall
      await orch.stopAll(['test-delegate']);
      await orch.uninstallAll(['test-delegate']);

      const statusAfterUninstall = await orch.statusAll(['test-delegate']);
      expect(statusAfterUninstall[0].state).toBe('uninstalled');

      // Transitions recorded correctly
      const transitions = getStateTransitions('test-delegate');
      expect(transitions).toEqual([
        'stopped',
        'starting',
        'running',
        'stopping',
        'stopped',
        'uninstalled',
      ]);
    }
  });
});
