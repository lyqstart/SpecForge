/**
 * Integration Test 12.4: Dependency Order Real
 *
 * Tests real service manager dependency ordering using the
 * ServiceLifecycleOrchestrator with DEFAULT_DEPENDENCY_GRAPH.
 *
 * Dependency graph:
 *   specforge-daemon depends on opencode-server
 *   opencode-server has no dependencies
 *
 * Topological sort order: opencode-server FIRST, then specforge-daemon
 * Reverse order for stop: specforge-daemon FIRST, then opencode-server
 *
 * Validates Requirements 2.1, 2.2, 2.5
 */
import { describe, it, expect, afterEach } from 'vitest';
import { ServiceLifecycleOrchestrator, DEFAULT_DEPENDENCY_GRAPH } from '../../../packages/service-management/src/orchestrator/service-lifecycle-orchestrator.js';
import type { ServiceManager, InstallResult, UninstallResult, StartResult, StopResult, RestartResult } from '../../../packages/service-management/src/service-manager/service-manager.js';
import type { ServiceInstallSpec } from '../../../packages/service-management/src/types/service-install-spec.js';
import type { ServiceStatus } from '../../../packages/service-management/src/types/service-status.js';
import type { ServiceState } from '../../../packages/service-management/src/types/service-state.js';
import type { EnvironmentPrecheck } from '../../../packages/service-management/src/types/environment-precheck.js';

// ---------------------------------------------------------------------------
// Tracking Mock ServiceManager
// ---------------------------------------------------------------------------

/**
 * Call record: which method was called, on which service, in what order.
 */
interface CallRecord {
  method: string;
  serviceName: string;
  timestamp: number;
}

/**
 * Creates a mock ServiceManager that:
 * - Tracks state per service (uninstalled → stopped → running → stopped)
 * - Records every start/stop call with timestamps for ordering verification
 * - Supports configurable initial states for dependency testing
 */
function createTrackingMockManager(
  initialStates?: Map<string, ServiceState>,
): {
  manager: ServiceManager;
  callLog: CallRecord[];
  getCallLog: () => CallRecord[];
  setServiceState: (name: string, state: ServiceState) => void;
} {
  const callLog: CallRecord[] = [];
  const states = new Map<string, ServiceState>(initialStates ?? []);

  function getState(name: string): ServiceState {
    return states.get(name) ?? 'uninstalled';
  }

  function recordCall(method: string, serviceName: string): void {
    callLog.push({
      method,
      serviceName,
      timestamp: Date.now(),
    });
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
    async install(spec: ServiceInstallSpec): Promise<InstallResult> {
      const current = getState(spec.name);
      if (current !== 'uninstalled') {
        return {
          success: true,
          serviceName: spec.name,
          enabled: spec.enableAtBoot,
        };
      }
      states.set(spec.name, 'stopped');
      return {
        success: true,
        serviceName: spec.name,
        enabled: spec.enableAtBoot,
      };
    },

    async uninstall(serviceName: string): Promise<UninstallResult> {
      const current = getState(serviceName);
      if (current === 'uninstalled') {
        return { success: true, serviceName };
      }
      states.set(serviceName, 'uninstalled');
      return { success: true, serviceName };
    },

    async start(serviceName: string): Promise<StartResult> {
      recordCall('start', serviceName);
      const current = getState(serviceName);
      if (current === 'running') {
        return {
          success: true,
          serviceName,
          state: 'already-running' as const,
          pid: 12345,
        };
      }
      states.set(serviceName, 'running');
      return {
        success: true,
        serviceName,
        state: 'running' as const,
        pid: 12345,
      };
    },

    async stop(serviceName: string): Promise<StopResult> {
      recordCall('stop', serviceName);
      const current = getState(serviceName);
      if (current === 'stopped' || current === 'uninstalled') {
        return {
          success: true,
          serviceName,
          state: 'already-stopped' as const,
        };
      }
      states.set(serviceName, 'stopped');
      return {
        success: true,
        serviceName,
        state: 'stopped' as const,
      };
    },

    async restart(serviceName: string): Promise<RestartResult> {
      recordCall('restart', serviceName);
      states.set(serviceName, 'running');
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
      return {
        schema_version: '1.0',
        platform: 'linux',
        systemdAvailable: true,
        systemdVersion: '255',
        lingerEnabled: true,
        systemdUserUnitDir: '/home/user/.config/systemd/user',
        isElevated: null,
        nssmAvailable: null,
        nssmExePath: null,
        nssmVersion: null,
        currentUserName: null,
        blockers: [],
        warnings: [],
      };
    },

    async dispose(): Promise<void> {
      // No-op for mock
    },
  };

  return {
    manager,
    callLog,
    getCallLog: () => callLog,
    setServiceState: (name: string, state: ServiceState) => {
      states.set(name, state);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dependency order real', () => {
  const orchestrators: ServiceLifecycleOrchestrator[] = [];

  afterEach(async () => {
    for (const orch of orchestrators) {
      expect(orch.getActivePendingOpCount()).toBe(0);
      await orch.dispose();
    }
    orchestrators.length = 0;
  });

  // -----------------------------------------------------------------------
  // Test 1: startAll respects dependency graph
  // opencode-server is started BEFORE specforge-daemon
  // Validates Requirement 2.1
  // -----------------------------------------------------------------------
  it('should start opencode-server before specforge-daemon (dependency order)', async () => {
    const { manager, callLog } = createTrackingMockManager();
    // Initialize both services as "stopped" (installed but not running)
    const mock = createTrackingMockManager(
      new Map([
        ['opencode-server', 'stopped'],
        ['specforge-daemon', 'stopped'],
      ]),
    );

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: mock.manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    const result = await orch.startAll(['opencode-server', 'specforge-daemon']);

    // Operation succeeds
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();

    // Verify start call order: opencode-server first, then specforge-daemon
    const startCalls = mock.callLog
      .filter((r) => r.method === 'start')
      .map((r) => r.serviceName);
    expect(startCalls).toEqual(['opencode-server', 'specforge-daemon']);
  });

  // -----------------------------------------------------------------------
  // Test 2: stopAll reverses dependency order
  // specforge-daemon is stopped BEFORE opencode-server
  // Validates Requirement 2.2
  // -----------------------------------------------------------------------
  it('should stop specforge-daemon before opencode-server (reverse dependency order)', async () => {
    const mock = createTrackingMockManager(
      new Map([
        ['opencode-server', 'running'],
        ['specforge-daemon', 'running'],
      ]),
    );

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: mock.manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    const result = await orch.stopAll(['opencode-server', 'specforge-daemon']);

    // Operation succeeds
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();

    // Verify stop call order: specforge-daemon first, then opencode-server
    const stopCalls = mock.callLog
      .filter((r) => r.method === 'stop')
      .map((r) => r.serviceName);
    expect(stopCalls).toEqual(['specforge-daemon', 'opencode-server']);
  });

  // -----------------------------------------------------------------------
  // Test 3: Starting specforge-daemon alone without opencode-server running
  // returns SVC_DEPENDENCY_NOT_RUNNING error
  // Validates Requirement 2.5
  // -----------------------------------------------------------------------
  it('should return SVC_DEPENDENCY_NOT_RUNNING when starting specforge-daemon alone without opencode-server', async () => {
    const mock = createTrackingMockManager(
      new Map([
        ['opencode-server', 'stopped'], // dependency NOT running
        ['specforge-daemon', 'stopped'],
      ]),
    );

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: mock.manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    // Only request specforge-daemon — opencode-server is not in the list
    const result = await orch.startAll(['specforge-daemon']);

    // Operation must fail
    expect(result.success).toBe(false);
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('SVC_DEPENDENCY_NOT_RUNNING');

    // No start calls should have been made (dependency check fails first)
    const startCalls = mock.callLog.filter((r) => r.method === 'start');
    expect(startCalls).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Test 4: startAll is a no-op when all services are already running
  // -----------------------------------------------------------------------
  it('should be no-op when all services are already running', async () => {
    const mock = createTrackingMockManager(
      new Map([
        ['opencode-server', 'running'],
        ['specforge-daemon', 'running'],
      ]),
    );

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: mock.manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    const result = await orch.startAll(['opencode-server', 'specforge-daemon']);

    // Operation succeeds (no-op is still a success)
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();

    // No start calls should have been made (all already running)
    const startCalls = mock.callLog.filter((r) => r.method === 'start');
    expect(startCalls).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Test 5: DEFAULT_DEPENDENCY_GRAPH has correct structure
  // -----------------------------------------------------------------------
  it('should have correct DEFAULT_DEPENDENCY_GRAPH structure', () => {
    // specforge-daemon depends on opencode-server
    expect(DEFAULT_DEPENDENCY_GRAPH['specforge-daemon']).toEqual(['opencode-server']);
    // opencode-server has no dependencies
    expect(DEFAULT_DEPENDENCY_GRAPH['opencode-server']).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Test 6: stopAll is a no-op when all services are already stopped
  // -----------------------------------------------------------------------
  it('should be no-op when all services are already stopped', async () => {
    const mock = createTrackingMockManager(
      new Map([
        ['opencode-server', 'stopped'],
        ['specforge-daemon', 'stopped'],
      ]),
    );

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: mock.manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    const result = await orch.stopAll(['opencode-server', 'specforge-daemon']);

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();

    // No stop calls — already stopped
    const stopCalls = mock.callLog.filter((r) => r.method === 'stop');
    expect(stopCalls).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Test 7: startAll order is consistent regardless of input order
  // Even if specforge-daemon is listed first, opencode-server starts first
  // -----------------------------------------------------------------------
  it('should start in dependency order regardless of input array order', async () => {
    const mock = createTrackingMockManager(
      new Map([
        ['opencode-server', 'stopped'],
        ['specforge-daemon', 'stopped'],
      ]),
    );

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: mock.manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    // Pass specforge-daemon FIRST in array — should still start opencode-server first
    const result = await orch.startAll(['specforge-daemon', 'opencode-server']);

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();

    const startCalls = mock.callLog
      .filter((r) => r.method === 'start')
      .map((r) => r.serviceName);
    // Dependency order, not input order
    expect(startCalls).toEqual(['opencode-server', 'specforge-daemon']);
  });
});
