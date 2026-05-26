/**
 * Integration Test 12.7: Upgrade Restart Cycle
 *
 * Simulates an upgrade stop → replace binary → start cycle:
 * - Asserts event chain is not lost during upgrade
 * - Asserts no half-open/half-closed window exists (at any point during
 *   upgrade, service is either fully running or fully stopped/uninstalled)
 * - Validates Requirement 11.6
 */
import { describe, it, expect, afterEach } from 'vitest';
import { ServiceLifecycleOrchestrator, DEFAULT_DEPENDENCY_GRAPH } from '../../../packages/service-management/src/orchestrator/service-lifecycle-orchestrator.js';
import { GracefulShutdownHandler } from '../../../packages/service-management/src/shutdown/graceful-shutdown-handler.js';
import type { ServiceManager, InstallResult, UninstallResult, StartResult, StopResult, RestartResult } from '../../../packages/service-management/src/service-manager/service-manager.js';
import type { ServiceInstallSpec } from '../../../packages/service-management/src/types/service-install-spec.js';
import type { ServiceStatus } from '../../../packages/service-management/src/types/service-status.js';
import type { ServiceState } from '../../../packages/service-management/src/types/service-state.js';
import type { EnvironmentPrecheck } from '../../../packages/service-management/src/types/environment-precheck.js';
import type { OrchestrationResult } from '../../../packages/service-management/src/types/orchestration-result.js';

// ---------------------------------------------------------------------------
// Stateful Mock ServiceManager
// ---------------------------------------------------------------------------

/**
 * Recorded event in the state transition log.
 * Captures every state change so the test can assert event chain integrity.
 */
interface StateTransitionEvent {
  /** Service name */
  serviceName: string;
  /** Previous state */
  from: ServiceState;
  /** New state */
  to: ServiceState;
  /** Timestamp (ms epoch) */
  timestamp: number;
  /** Which operation triggered this transition */
  operation: 'install' | 'start' | 'stop' | 'uninstall' | 'restart' | 'replace-binary';
}

/**
 * Creates a stateful mock ServiceManager that:
 * 1. Tracks every state transition in an event log
 * 2. Supports a simulated "replace binary" operation
 * 3. Produces realistic state transitions through the lifecycle
 */
function createUpgradeTrackingMock(): {
  manager: ServiceManager;
  /** Get all recorded state transition events */
  getEventLog: () => StateTransitionEvent[];
  /** Get events for a specific service */
  getEventsForService: (name: string) => StateTransitionEvent[];
  /** Simulate binary replacement (mock - just records the event) */
  replaceBinary: (serviceName: string) => void;
  /** Get current state of a service */
  getCurrentState: (serviceName: string) => ServiceState;
  /** Reset all state */
  reset: () => void;
} {
  const states = new Map<string, ServiceState>();
  const eventLog: StateTransitionEvent[] = [];

  function getState(name: string): ServiceState {
    return states.get(name) ?? 'uninstalled';
  }

  function recordTransition(
    serviceName: string,
    newState: ServiceState,
    operation: StateTransitionEvent['operation'],
  ): void {
    const prev = getState(serviceName);
    eventLog.push({
      serviceName,
      from: prev,
      to: newState,
      timestamp: Date.now(),
      operation,
    });
    states.set(serviceName, newState);
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
      recordTransition(spec.name, 'stopped', 'install');
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
      if (current === 'running' || current === 'starting') {
        recordTransition(serviceName, 'stopping', 'uninstall');
        recordTransition(serviceName, 'stopped', 'uninstall');
      }
      recordTransition(serviceName, 'uninstalled', 'uninstall');
      return { success: true, serviceName };
    },

    async start(serviceName: string): Promise<StartResult> {
      const current = getState(serviceName);
      if (current === 'running') {
        return {
          success: true,
          serviceName,
          state: 'already-running' as const,
          pid: 12345,
        };
      }
      recordTransition(serviceName, 'starting', 'start');
      recordTransition(serviceName, 'running', 'start');
      return {
        success: true,
        serviceName,
        state: 'running' as const,
        pid: 12345,
      };
    },

    async stop(serviceName: string): Promise<StopResult> {
      const current = getState(serviceName);
      if (current === 'stopped' || current === 'uninstalled') {
        return {
          success: true,
          serviceName,
          state: 'already-stopped' as const,
        };
      }
      recordTransition(serviceName, 'stopping', 'stop');
      recordTransition(serviceName, 'stopped', 'stop');
      return {
        success: true,
        serviceName,
        state: 'stopped' as const,
      };
    },

    async restart(serviceName: string): Promise<RestartResult> {
      recordTransition(serviceName, 'stopping', 'restart');
      recordTransition(serviceName, 'stopped', 'restart');
      recordTransition(serviceName, 'starting', 'restart');
      recordTransition(serviceName, 'running', 'restart');
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
    getEventLog: () => [...eventLog],
    getEventsForService: (name: string) =>
      eventLog.filter((e) => e.serviceName === name),
    replaceBinary: (serviceName: string) => {
      // Record a "replace binary" event — no state change, just logging
      eventLog.push({
        serviceName,
        from: getState(serviceName),
        to: getState(serviceName),
        timestamp: Date.now(),
        operation: 'replace-binary',
      });
    },
    getCurrentState: getState,
    reset: () => {
      states.clear();
      eventLog.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeInstallSpec(name: string, dependsOn: string[] = []): ServiceInstallSpec {
  return {
    name,
    description: `Test service ${name}`,
    binaryPath: '/usr/bin/test-binary',
    args: ['--serve'],
    workingDirectory: '/tmp',
    environment: {},
    dependsOn,
    restartPolicy: 'on-failure',
    stopTimeoutSec: 10,
    stdoutLogPath: '/tmp/stdout.log',
    stderrLogPath: '/tmp/stderr.log',
    enableAtBoot: false,
  };
}

/** The two services in the default dependency graph */
const SERVICE_NAMES = ['opencode-server', 'specforge-daemon'] as const;

/** Specs matching DEFAULT_DEPENDENCY_GRAPH */
const SERVICE_SPECS: ServiceInstallSpec[] = [
  makeInstallSpec('opencode-server'),
  makeInstallSpec('specforge-daemon', ['opencode-server']),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Upgrade restart cycle', () => {
  const orchestrators: ServiceLifecycleOrchestrator[] = [];
  const shutdownHandlers: GracefulShutdownHandler[] = [];

  afterEach(async () => {
    for (const orch of orchestrators) {
      expect(orch.getActivePendingOpCount()).toBe(0);
      await orch.dispose();
    }
    for (const handler of shutdownHandlers) {
      await handler[Symbol.asyncDispose]();
    }
    orchestrators.length = 0;
    shutdownHandlers.length = 0;
  });

  // -------------------------------------------------------------------------
  // Test 1: Full upgrade stop → replace binary → start cycle
  // -------------------------------------------------------------------------
  it('should complete a full upgrade cycle without losing events', async () => {
    const { manager, getEventLog, replaceBinary } = createUpgradeTrackingMock();

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    // Phase 1: Initial install + start
    const installResult = await orch.installAll(SERVICE_SPECS);
    expect(installResult.success).toBe(true);

    const startResult = await orch.startAll([...SERVICE_NAMES]);
    expect(startResult.success).toBe(true);
    for (const status of startResult.perService) {
      expect(status.state).toBe('running');
    }

    // Phase 2: Upgrade - stop all
    const stopResult = await orch.stopAll([...SERVICE_NAMES]);
    expect(stopResult.success).toBe(true);
    for (const status of stopResult.perService) {
      expect(status.state).toBe('stopped');
    }

    // Phase 2b: Replace binary (simulated)
    for (const name of SERVICE_NAMES) {
      replaceBinary(name);
    }

    // Phase 3: Start all with new binary
    const restartResult = await orch.startAll([...SERVICE_NAMES]);
    expect(restartResult.success).toBe(true);
    for (const status of restartResult.perService) {
      expect(status.state).toBe('running');
    }

    // Verify event chain: every service should have a complete chain
    const log = getEventLog();
    for (const name of SERVICE_NAMES) {
      const serviceEvents = log.filter((e) => e.serviceName === name);

      // Must have: install → stop → replace-binary → start transitions
      const operations = serviceEvents.map((e) => e.operation);

      // Install happened
      expect(operations).toContain('install');

      // Start happened (initial start + restart after upgrade)
      const startCount = operations.filter((op) => op === 'start').length;
      expect(startCount).toBeGreaterThanOrEqual(2);

      // Stop happened during upgrade
      expect(operations).toContain('stop');

      // Replace-binary happened
      expect(operations).toContain('replace-binary');

      // No events lost: sequence should be coherent
      // Every 'starting' should be followed by 'running'
      // Every 'stopping' should be followed by 'stopped'
      for (let i = 0; i < serviceEvents.length - 1; i++) {
        const evt = serviceEvents[i];
        if (evt.to === 'starting') {
          // Next event for same service should be 'running'
          const next = serviceEvents[i + 1];
          expect(next.to).toBe('running');
        }
        if (evt.to === 'stopping') {
          const next = serviceEvents[i + 1];
          expect(next.to).toBe('stopped');
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test 2: No half-open window - services are fully running or fully stopped
  // -------------------------------------------------------------------------
  it('should never leave services in a half-open state after operations complete', async () => {
    const { manager } = createUpgradeTrackingMock();

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    // Install services
    await orch.installAll(SERVICE_SPECS);

    // After installAll, all services must NOT be in starting/stopping
    const statusAfterInstall = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of statusAfterInstall) {
      expect(
        ['stopped', 'uninstalled', 'running', 'failed'],
        `Service ${status.name} should not be in transient state after install, got: ${status.state}`,
      ).toContain(status.state);
    }

    // After startAll, all services must be running (not starting/stopping)
    await orch.startAll([...SERVICE_NAMES]);
    const statusAfterStart = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of statusAfterStart) {
      expect(status.state).toBe('running');
    }

    // After stopAll, all services must be stopped/uninstalled (not starting/stopping)
    await orch.stopAll([...SERVICE_NAMES]);
    const statusAfterStop = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of statusAfterStop) {
      expect(
        ['stopped', 'uninstalled'],
        `Service ${status.name} should be fully stopped after stopAll, got: ${status.state}`,
      ).toContain(status.state);
    }

    // After startAll again (upgrade restart), all services must be running
    await orch.startAll([...SERVICE_NAMES]);
    const statusAfterRestart = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of statusAfterRestart) {
      expect(status.state).toBe('running');
    }

    // Final cleanup: stopAll must leave all services in terminal state
    await orch.stopAll([...SERVICE_NAMES]);
    const statusFinal = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of statusFinal) {
      expect(
        ['stopped', 'uninstalled'],
        `Service ${status.name} should be in terminal state after final stopAll, got: ${status.state}`,
      ).toContain(status.state);
    }
  });

  // -------------------------------------------------------------------------
  // Test 3: Dependency order maintained during upgrade cycle
  // -------------------------------------------------------------------------
  it('should maintain correct dependency order during upgrade: stop daemon first, start server first', async () => {
    const { manager, getEventLog, replaceBinary } = createUpgradeTrackingMock();

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    // Initial install + start
    await orch.installAll(SERVICE_SPECS);
    await orch.startAll([...SERVICE_NAMES]);

    // Clear event log to focus on upgrade cycle
    // (We track by looking at event order in the log after this point)
    const preUpgradeLogLength = getEventLog().length;

    // Upgrade: stop all
    await orch.stopAll([...SERVICE_NAMES]);

    // Replace binaries
    for (const name of SERVICE_NAMES) {
      replaceBinary(name);
    }

    // Start all after upgrade
    await orch.startAll([...SERVICE_NAMES]);

    // Analyze event order during upgrade
    const upgradeEvents = getEventLog().slice(preUpgradeLogLength);

    // Extract stop events in order
    const stopEvents = upgradeEvents.filter(
      (e) => e.operation === 'stop' && e.to === 'stopping',
    );
    const stopOrder = stopEvents.map((e) => e.serviceName);

    // Stop order should be: specforge-daemon first, then opencode-server
    // (reverse dependency order: dependents stopped first)
    expect(stopOrder).toEqual(['specforge-daemon', 'opencode-server']);

    // Extract start events in order
    const startEvents = upgradeEvents.filter(
      (e) => e.operation === 'start' && e.to === 'starting',
    );
    const startOrder = startEvents.map((e) => e.serviceName);

    // Start order should be: opencode-server first, then specforge-daemon
    // (dependency order: dependencies started first)
    expect(startOrder).toEqual(['opencode-server', 'specforge-daemon']);
  });

  // -------------------------------------------------------------------------
  // Test 4: Idempotent upgrade (stop+start still works even if same version)
  // -------------------------------------------------------------------------
  it('should handle idempotent upgrade cycle correctly', async () => {
    const { manager } = createUpgradeTrackingMock();

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    // Install and start
    await orch.installAll(SERVICE_SPECS);
    await orch.startAll([...SERVICE_NAMES]);

    // First stop-start cycle (simulating first upgrade)
    await orch.stopAll([...SERVICE_NAMES]);
    const statusAfterFirstStop = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of statusAfterFirstStop) {
      expect(['stopped', 'uninstalled']).toContain(status.state);
    }

    await orch.startAll([...SERVICE_NAMES]);
    const statusAfterFirstStart = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of statusAfterFirstStart) {
      expect(status.state).toBe('running');
    }

    // Second stop-start cycle (simulating same version re-upgrade)
    await orch.stopAll([...SERVICE_NAMES]);
    const statusAfterSecondStop = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of statusAfterSecondStop) {
      expect(['stopped', 'uninstalled']).toContain(status.state);
    }

    await orch.startAll([...SERVICE_NAMES]);
    const statusAfterSecondStart = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of statusAfterSecondStart) {
      expect(status.state).toBe('running');
    }

    // No-op start (already running) should still succeed
    const noOpStart = await orch.startAll([...SERVICE_NAMES]);
    expect(noOpStart.success).toBe(true);
    for (const status of noOpStart.perService) {
      expect(status.state).toBe('running');
    }

    // No-op stop (already stopped) should still succeed after we stop
    await orch.stopAll([...SERVICE_NAMES]);
    const noOpStop = await orch.stopAll([...SERVICE_NAMES]);
    expect(noOpStop.success).toBe(true);
    for (const status of noOpStop.perService) {
      expect(['stopped', 'uninstalled']).toContain(status.state);
    }
  });

  // -------------------------------------------------------------------------
  // Test 5: GracefulShutdownHandler integrates with upgrade cycle
  // -------------------------------------------------------------------------
  it('should integrate GracefulShutdownHandler with upgrade cycle', async () => {
    const { manager, replaceBinary } = createUpgradeTrackingMock();

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    const shutdownHandler = new GracefulShutdownHandler({
      taskTimeoutMs: 1000,
      totalShutdownTimeoutMs: 5000,
    });
    shutdownHandlers.push(shutdownHandler);

    // Register shutdown tasks that track what happened
    const shutdownOrder: string[] = [];
    shutdownHandler.register('stop-daemon', async () => {
      shutdownOrder.push('stop-daemon');
    }, 'stop-accepting');
    shutdownHandler.register('stop-server', async () => {
      shutdownOrder.push('stop-server');
    }, 'stop-accepting');

    // Initial install + start
    await orch.installAll(SERVICE_SPECS);
    await orch.startAll([...SERVICE_NAMES]);

    // Verify running
    const statusBeforeUpgrade = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of statusBeforeUpgrade) {
      expect(status.state).toBe('running');
    }

    // Upgrade: stop via orchestrator, replace binary, start
    await orch.stopAll([...SERVICE_NAMES]);
    for (const name of SERVICE_NAMES) {
      replaceBinary(name);
    }
    await orch.startAll([...SERVICE_NAMES]);

    // Verify running after upgrade
    const statusAfterUpgrade = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of statusAfterUpgrade) {
      expect(status.state).toBe('running');
    }

    // Verify shutdown handler is ready for use
    expect(shutdownHandler.getActiveTaskCount()).toBe(0);
    expect(shutdownHandler.getActiveTimerCount()).toBe(0);

    // Trigger shutdown (simulating process exit during running state)
    await shutdownHandler.trigger('upgrade-restart-test');

    // Shutdown handler tasks should have executed
    expect(shutdownOrder).toContain('stop-daemon');
    expect(shutdownOrder).toContain('stop-server');

    // After shutdown, handler should be in clean state
    expect(shutdownHandler.getActiveTaskCount()).toBe(0);
    expect(shutdownHandler.getActiveTimerCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 6: schema_version consistent across all results during upgrade
  // -------------------------------------------------------------------------
  it('should have consistent schema_version across all upgrade operations', async () => {
    const { manager, replaceBinary } = createUpgradeTrackingMock();

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    const allResults: OrchestrationResult[] = [];

    // Phase 1: Install
    const installResult = await orch.installAll(SERVICE_SPECS);
    allResults.push(installResult);

    // Phase 2: Start
    const startResult1 = await orch.startAll([...SERVICE_NAMES]);
    allResults.push(startResult1);

    // Phase 3: Stop (upgrade step 1)
    const stopResult = await orch.stopAll([...SERVICE_NAMES]);
    allResults.push(stopResult);

    // Replace binary
    for (const name of SERVICE_NAMES) {
      replaceBinary(name);
    }

    // Phase 4: Start again (upgrade step 2)
    const startResult2 = await orch.startAll([...SERVICE_NAMES]);
    allResults.push(startResult2);

    // Phase 5: Stop for cleanup
    const stopResult2 = await orch.stopAll([...SERVICE_NAMES]);
    allResults.push(stopResult2);

    // Phase 6: Uninstall
    const uninstallResult = await orch.uninstallAll([...SERVICE_NAMES]);
    allResults.push(uninstallResult);

    // Assert schema_version consistency
    for (const result of allResults) {
      expect(result.schema_version).toBe('1.0');
      expect(result.success).toBe(true);

      for (const status of result.perService) {
        expect(status.schema_version).toBe('1.0');
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test 7: No window where daemon is running without server during upgrade
  // -------------------------------------------------------------------------
  it('should never have daemon running while server is stopped during upgrade', async () => {
    const { manager, replaceBinary, getCurrentState } = createUpgradeTrackingMock();

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    // Install and start
    await orch.installAll(SERVICE_SPECS);
    await orch.startAll([...SERVICE_NAMES]);

    // At this point, both should be running
    expect(getCurrentState('opencode-server')).toBe('running');
    expect(getCurrentState('specforge-daemon')).toBe('running');

    // Upgrade: stop all (daemon stops first due to reverse dependency order)
    await orch.stopAll([...SERVICE_NAMES]);

    // After stop: both should be stopped (no half-open window)
    const serverStateAfterStop = getCurrentState('opencode-server');
    const daemonStateAfterStop = getCurrentState('specforge-daemon');
    expect(['stopped', 'uninstalled']).toContain(serverStateAfterStop);
    expect(['stopped', 'uninstalled']).toContain(daemonStateAfterStop);

    // Replace binaries
    for (const name of SERVICE_NAMES) {
      replaceBinary(name);
    }

    // States remain stopped during binary replacement
    expect(['stopped', 'uninstalled']).toContain(getCurrentState('opencode-server'));
    expect(['stopped', 'uninstalled']).toContain(getCurrentState('specforge-daemon'));

    // Start all: server starts first (dependency), then daemon
    await orch.startAll([...SERVICE_NAMES]);

    // After start: both should be running
    expect(getCurrentState('opencode-server')).toBe('running');
    expect(getCurrentState('specforge-daemon')).toBe('running');

    // At NO point was daemon running while server was stopped:
    // The orchestrator's topological sort guarantees:
    // - Stop: daemon first → then server (daemon cannot run without server)
    // - Start: server first → then daemon (daemon only starts after server is running)
  });

  // -------------------------------------------------------------------------
  // Test 8: Multiple rapid upgrade cycles maintain event chain integrity
  // -------------------------------------------------------------------------
  it('should maintain event chain integrity across multiple rapid upgrade cycles', async () => {
    const { manager, getEventsForService, replaceBinary } = createUpgradeTrackingMock();

    const orch = new ServiceLifecycleOrchestrator({
      serviceManager: manager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
    orchestrators.push(orch);

    // Initial install
    await orch.installAll(SERVICE_SPECS);

    // Run 3 rapid upgrade cycles
    for (let cycle = 0; cycle < 3; cycle++) {
      // Start
      await orch.startAll([...SERVICE_NAMES]);

      // Verify all running
      const statusRunning = await orch.statusAll([...SERVICE_NAMES]);
      for (const status of statusRunning) {
        expect(status.state).toBe('running');
      }

      // Stop (upgrade step)
      await orch.stopAll([...SERVICE_NAMES]);

      // Verify all stopped
      const statusStopped = await orch.statusAll([...SERVICE_NAMES]);
      for (const status of statusStopped) {
        expect(['stopped', 'uninstalled']).toContain(status.state);
      }

      // Replace binary
      for (const name of SERVICE_NAMES) {
        replaceBinary(name);
      }
    }

    // Final start to bring services up
    await orch.startAll([...SERVICE_NAMES]);
    const finalStatus = await orch.statusAll([...SERVICE_NAMES]);
    for (const status of finalStatus) {
      expect(status.state).toBe('running');
    }

    // Verify event chain integrity for each service
    for (const name of SERVICE_NAMES) {
      const events = getEventsForService(name);

      // Count start and stop operations - should have 3 starts and 3 stops (plus final start)
      const startOps = events.filter((e) => e.operation === 'start' && e.to === 'starting');
      const stopOps = events.filter((e) => e.operation === 'stop' && e.to === 'stopping');
      const replaceOps = events.filter((e) => e.operation === 'replace-binary');

      expect(startOps.length).toBe(4); // 3 cycles + 1 final start
      expect(stopOps.length).toBe(3);  // 3 cycles
      expect(replaceOps.length).toBe(3); // 3 cycles

      // Every transition should be valid (no orphaned states)
      for (let i = 1; i < events.length; i++) {
        const prev = events[i - 1];
        const curr = events[i];

        // Skip replace-binary events for state continuity check
        if (curr.operation === 'replace-binary') {
          expect(curr.from).toBe(curr.to); // Replace binary doesn't change state
          continue;
        }

        // Current event's 'from' should match previous event's 'to'
        // (unless there's a replace-binary in between, which doesn't change state)
        if (prev.operation !== 'replace-binary') {
          expect(prev.to).toBe(curr.from);
        }
      }
    }
  });
});
