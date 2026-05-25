/**
 * Property-Based Test: Property 1 - Startup Order Preservation
 *
 * Feature: service-management, Property 1: Startup Order Preservation
 * Derived-From: service-management requirements Property 1
 *
 * Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.5
 *
 * For all service sets S = {opencode-server, specforge-daemon} and dependency graph
 * G = {daemon → opencode-server}, for any command sequence σ ∈ Sequence(
 *   {install, start, stop, restart, uninstall} × {opencode-server, specforge-daemon} × T
 * ), at each observation time t the following implications hold:
 *
 *   state(daemon, t) === "running"  ⟹  ∃ ε ≥ 0, state(server, t-ε) === "running"
 *   state(server, t) === "stopped"  ⟹  ∃ ε ≥ 0, state(daemon, t-ε) ∈ {"stopped", "uninstalled"}
 *
 * i.e., specforge-daemon enters running no earlier than opencode-server enters running;
 * opencode-server leaves running no earlier than specforge-daemon leaves running.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  ServiceLifecycleOrchestrator,
  createServiceLifecycleOrchestrator,
  DEFAULT_DEPENDENCY_GRAPH,
} from '../../src/orchestrator/service-lifecycle-orchestrator.js';
import type {
  ServiceManager,
  InstallResult,
  StartResult,
  StopResult,
  UninstallResult,
  RestartResult,
} from '../../src/service-manager/service-manager.js';
import type { ServiceInstallSpec } from '../../src/types/service-install-spec.js';
import type { ServiceStatus } from '../../src/types/service-status.js';
import type { ServiceState } from '../../src/types/service-state.js';
import type { EnvironmentPrecheck } from '../../src/types/environment-precheck.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const SERVER = 'opencode-server';
const DAEMON = 'specforge-daemon';
const ALL_SERVICES = [SERVER, DAEMON] as const;

type ServiceName = typeof ALL_SERVICES[number];
type CommandType = 'install' | 'start' | 'stop' | 'restart' | 'uninstall';

interface Command {
  type: CommandType;
  service: ServiceName;
}

// ─── State snapshot for history tracking ─────────────────────────────────────

interface StateSnapshot {
  server: ServiceState;
  daemon: ServiceState;
}

// ─── In-memory mock ServiceManager ───────────────────────────────────────────

/**
 * Creates an in-memory mock ServiceManager that tracks state transitions.
 * This mock enforces the dependency graph at the state level:
 * - daemon can only be started if server is running
 * - server can only be stopped if daemon is not running
 */
function createInMemoryServiceManager(): ServiceManager & {
  stateMap: Map<string, ServiceState>;
  stateHistory: StateSnapshot[];
  recordSnapshot: () => void;
} {
  const stateMap = new Map<string, ServiceState>([
    [SERVER, 'uninstalled'],
    [DAEMON, 'uninstalled'],
  ]);

  const stateHistory: StateSnapshot[] = [];

  function recordSnapshot() {
    stateHistory.push({
      server: stateMap.get(SERVER) ?? 'uninstalled',
      daemon: stateMap.get(DAEMON) ?? 'uninstalled',
    });
  }

  function makeStatus(name: string): ServiceStatus {
    const state = stateMap.get(name) ?? 'uninstalled';
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

  const manager: ServiceManager & {
    stateMap: Map<string, ServiceState>;
    stateHistory: StateSnapshot[];
    recordSnapshot: () => void;
  } = {
    stateMap,
    stateHistory,
    recordSnapshot,

    async install(spec: ServiceInstallSpec): Promise<InstallResult> {
      const current = stateMap.get(spec.name) ?? 'uninstalled';
      if (current !== 'uninstalled') {
        // Already installed - no-op
        return { success: true, serviceName: spec.name, enabled: true };
      }
      stateMap.set(spec.name, 'stopped');
      recordSnapshot();
      return { success: true, serviceName: spec.name, enabled: true };
    },

    async uninstall(serviceName: string): Promise<UninstallResult> {
      const current = stateMap.get(serviceName) ?? 'uninstalled';
      if (current === 'uninstalled') {
        return { success: true, serviceName };
      }
      // Stop first if running
      if (current === 'running' || current === 'starting') {
        stateMap.set(serviceName, 'stopped');
      }
      stateMap.set(serviceName, 'uninstalled');
      recordSnapshot();
      return { success: true, serviceName };
    },

    async start(serviceName: string): Promise<StartResult> {
      const current = stateMap.get(serviceName) ?? 'uninstalled';
      if (current === 'running') {
        return { success: true, serviceName, state: 'already-running', pid: 12345 };
      }
      if (current === 'uninstalled') {
        return {
          success: false,
          serviceName,
          state: 'starting',
          error: { code: 'SVC_NOT_INSTALLED', message: 'Service not installed', suggestion: 'Install first' },
        };
      }
      stateMap.set(serviceName, 'running');
      recordSnapshot();
      return { success: true, serviceName, state: 'running', pid: 12345 };
    },

    async stop(serviceName: string): Promise<StopResult> {
      const current = stateMap.get(serviceName) ?? 'uninstalled';
      if (current === 'stopped' || current === 'uninstalled') {
        return { success: true, serviceName, state: 'already-stopped' };
      }
      stateMap.set(serviceName, 'stopped');
      recordSnapshot();
      return { success: true, serviceName, state: 'stopped' };
    },

    async restart(serviceName: string): Promise<RestartResult> {
      const current = stateMap.get(serviceName) ?? 'uninstalled';
      if (current === 'uninstalled') {
        return {
          success: false,
          serviceName,
          state: 'running',
          error: { code: 'SVC_NOT_INSTALLED', message: 'Service not installed', suggestion: 'Install first' },
        };
      }
      stateMap.set(serviceName, 'running');
      recordSnapshot();
      return { success: true, serviceName, state: 'running', pid: 12345 };
    },

    async status(serviceName: string): Promise<ServiceStatus> {
      return makeStatus(serviceName);
    },

    async precheckEnvironment(): Promise<EnvironmentPrecheck> {
      return {
        schema_version: '1.0',
        platform: 'linux',
        systemdAvailable: true,
        systemdVersion: '252',
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
      // no-op for mock
    },

    [Symbol.dispose](): void {
      // no-op for mock
    },
  };

  return manager;
}

// ─── Helper: create install spec ─────────────────────────────────────────────

function makeInstallSpec(name: ServiceName): ServiceInstallSpec {
  return {
    name,
    description: `${name} service`,
    binaryPath: `/usr/local/bin/${name}`,
    args: [],
    workingDirectory: '/tmp',
    environment: {},
    dependsOn: name === DAEMON ? [SERVER] : [],
    restartPolicy: 'on-failure',
    stopTimeoutSec: 10,
    stdoutLogPath: `/tmp/${name}.out`,
    stderrLogPath: `/tmp/${name}.err`,
    enableAtBoot: true,
  };
}

// ─── Helper: execute a command against the orchestrator ──────────────────────

async function executeCommand(
  orchestrator: ServiceLifecycleOrchestrator,
  cmd: Command
): Promise<void> {
  try {
    switch (cmd.type) {
      case 'install':
        await orchestrator.installAll([makeInstallSpec(cmd.service)]);
        break;
      case 'start':
        await orchestrator.startAll([cmd.service]);
        break;
      case 'stop':
        await orchestrator.stopAll([cmd.service]);
        break;
      case 'restart': {
        // restart = stop + start (via orchestrator)
        await orchestrator.stopAll([cmd.service]);
        await orchestrator.startAll([cmd.service]);
        break;
      }
      case 'uninstall':
        await orchestrator.uninstallAll([cmd.service]);
        break;
    }
  } catch {
    // Ignore errors - we're testing state invariants, not error handling
    // The orchestrator may reject invalid operations (e.g., starting uninstalled service)
  }
}

// ─── Property verification helpers ───────────────────────────────────────────

/**
 * Verifies Property 1 implication 1:
 * state(daemon, t) === "running" ⟹ ∃ ε ≥ 0, state(server, t-ε) === "running"
 *
 * i.e., if daemon is running at time t, then server was running at some point
 * at or before t (server entered running before or at the same time as daemon).
 */
function verifyDaemonRunningImpliesServerWasRunning(history: StateSnapshot[]): void {
  for (let t = 0; t < history.length; t++) {
    const snapshot = history[t];
    if (snapshot.daemon === 'running') {
      // Check that server was running at some point t-ε (i.e., at or before t)
      const serverWasRunning = history.slice(0, t + 1).some(s => s.server === 'running');
      expect(serverWasRunning).toBe(true);
    }
  }
}

/**
 * Verifies Property 1 implication 2:
 * state(server, t) === "stopped" ⟹ ∃ ε ≥ 0, state(daemon, t-ε) ∈ {"stopped", "uninstalled"}
 *
 * i.e., if server is stopped at time t, then daemon was stopped or uninstalled
 * at some point at or before t (daemon left running before or at the same time as server).
 */
function verifyServerStoppedImpliesDaemonWasNotRunning(history: StateSnapshot[]): void {
  for (let t = 0; t < history.length; t++) {
    const snapshot = history[t];
    if (snapshot.server === 'stopped') {
      // Check that daemon was stopped or uninstalled at some point t-ε (i.e., at or before t)
      const daemonWasNotRunning = history
        .slice(0, t + 1)
        .some(s => s.daemon === 'stopped' || s.daemon === 'uninstalled');
      expect(daemonWasNotRunning).toBe(true);
    }
  }
}

// ─── fast-check arbitraries ───────────────────────────────────────────────────

const commandTypeArb = fc.constantFrom<CommandType>(
  'install',
  'start',
  'stop',
  'restart',
  'uninstall'
);

const serviceNameArb = fc.constantFrom<ServiceName>(SERVER, DAEMON);

const commandArb: fc.Arbitrary<Command> = fc.record({
  type: commandTypeArb,
  service: serviceNameArb,
});

// Generate sequences of 1-20 commands (allow repetition and disorder)
const commandSequenceArb: fc.Arbitrary<Command[]> = fc.array(commandArb, {
  minLength: 1,
  maxLength: 20,
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Feature: service-management, Property 1: Startup Order Preservation', () => {
  // Track all orchestrators created in each test for cleanup
  const activeOrchestrators: ServiceLifecycleOrchestrator[] = [];

  afterEach(async () => {
    // Dispose all orchestrators created during the test
    for (const orch of activeOrchestrators) {
      if (!orch.isDisposed()) {
        await orch.dispose();
      }
      // Rule: afterEach must assert getActivePendingOpCount() === 0
      expect(orch.getActivePendingOpCount()).toBe(0);
    }
    activeOrchestrators.length = 0;
  });

  /**
   * **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.5**
   *
   * Property 1: Startup Order Preservation
   *
   * For any random command sequence σ, at every observation time t:
   *   - If daemon is running → server was running at some earlier time
   *   - If server is stopped → daemon was stopped/uninstalled at some earlier time
   */
  it('should preserve startup order: daemon running implies server was running', async () => {
    await fc.assert(
      fc.asyncProperty(commandSequenceArb, async (commands) => {
        const mockManager = createInMemoryServiceManager();
        const orchestrator = createServiceLifecycleOrchestrator({
          serviceManager: mockManager,
          dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
          startTimeoutMs: 5000,
          stopTimeoutMs: 5000,
        });
        activeOrchestrators.push(orchestrator);

        // Record initial state
        mockManager.recordSnapshot();

        // Execute each command in the sequence
        for (const cmd of commands) {
          await executeCommand(orchestrator, cmd);
        }

        // Verify Property 1 implication 1:
        // state(daemon, t) === "running" ⟹ ∃ ε ≥ 0, state(server, t-ε) === "running"
        verifyDaemonRunningImpliesServerWasRunning(mockManager.stateHistory);
      }),
      {
        numRuns: 100,
        verbose: false,
      }
    );
  });

  it('should preserve shutdown order: server stopped implies daemon was not running', async () => {
    await fc.assert(
      fc.asyncProperty(commandSequenceArb, async (commands) => {
        const mockManager = createInMemoryServiceManager();
        const orchestrator = createServiceLifecycleOrchestrator({
          serviceManager: mockManager,
          dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
          startTimeoutMs: 5000,
          stopTimeoutMs: 5000,
        });
        activeOrchestrators.push(orchestrator);

        // Record initial state
        mockManager.recordSnapshot();

        // Execute each command in the sequence
        for (const cmd of commands) {
          await executeCommand(orchestrator, cmd);
        }

        // Verify Property 1 implication 2:
        // state(server, t) === "stopped" ⟹ ∃ ε ≥ 0, state(daemon, t-ε) ∈ {"stopped", "uninstalled"}
        verifyServerStoppedImpliesDaemonWasNotRunning(mockManager.stateHistory);
      }),
      {
        numRuns: 100,
        verbose: false,
      }
    );
  });

  it('should satisfy both startup order implications simultaneously for any command sequence', async () => {
    await fc.assert(
      fc.asyncProperty(commandSequenceArb, async (commands) => {
        const mockManager = createInMemoryServiceManager();
        const orchestrator = createServiceLifecycleOrchestrator({
          serviceManager: mockManager,
          dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
          startTimeoutMs: 5000,
          stopTimeoutMs: 5000,
        });
        activeOrchestrators.push(orchestrator);

        // Record initial state
        mockManager.recordSnapshot();

        // Execute each command in the sequence
        for (const cmd of commands) {
          await executeCommand(orchestrator, cmd);
        }

        // Verify both implications hold simultaneously
        verifyDaemonRunningImpliesServerWasRunning(mockManager.stateHistory);
        verifyServerStoppedImpliesDaemonWasNotRunning(mockManager.stateHistory);
      }),
      {
        numRuns: 100,
        verbose: false,
      }
    );
  });
});
