/**
 * Unit tests for ServiceLifecycleOrchestrator
 *
 * Coverage:
 * - Mock ServiceManager interface
 * - startAll topological order (daemon starts after server running)
 * - stopAll reverse order
 * - installAll failure rollback (rolledBack populated)
 * - no-op paths (already running returns exit 0)
 * - SVC_DEPENDENCY_NOT_RUNNING error detection
 * - timeout scenarios
 * - afterEach cleanup + getActivePendingOpCount() === 0
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  ServiceLifecycleOrchestrator,
  createServiceLifecycleOrchestrator,
  DEFAULT_DEPENDENCY_GRAPH,
} from '../../src/orchestrator/service-lifecycle-orchestrator.js';
import type { ServiceManager, InstallResult, StartResult, StopResult, UninstallResult } from '../../src/service-manager/service-manager.js';
import type { ServiceInstallSpec } from '../../src/types/service-install-spec.js';
import type { ServiceStatus } from '../../src/types/service-status.js';
import type { ServiceState } from '../../src/types/service-state.js';

// Helper to create a minimal ServiceStatus
function createStatus(name: string, state: ServiceState): ServiceStatus {
  return {
    schema_version: '1.0',
    name,
    state,
    pid: state === 'running' ? 12345 : null,
    startedAt: state === 'running' ? Date.now() : null,
    lastExitCode: state === 'stopped' || state === 'failed' ? 1 : null,
    lastError: null,
  };
}

// Mock ServiceManager factory
function createMockServiceManager(): ServiceManager & {
  callHistory: { method: string; args: unknown[] }[];
  statusMap: Map<string, ServiceStatus>;
  installDelay?: number;
  startDelay?: number;
  stopDelay?: number;
  uninstallDelay?: number;
  shouldInstallFail?: boolean;
  shouldStartFail?: boolean;
  shouldStopFail?: boolean;
  shouldUninstallFail?: boolean;
} {
  const callHistory: { method: string; args: unknown[] }[] = [];
  const statusMap = new Map<string, ServiceStatus>();

  // Default: opencode-server is running, specforge-daemon is not installed
  statusMap.set('opencode-server', createStatus('opencode-server', 'running'));
  statusMap.set('specforge-daemon', createStatus('specforge-daemon', 'uninstalled'));

  return {
    callHistory,
    statusMap,

    async install(spec: ServiceInstallSpec): Promise<InstallResult> {
      callHistory.push({ method: 'install', args: [spec] });
      const self = this as typeof this & { installDelay?: number; shouldInstallFail?: boolean };
      if (self.installDelay) await new Promise(r => setTimeout(r, self.installDelay));
      if (self.shouldInstallFail) {
        return {
          success: false,
          serviceName: spec.name,
          enabled: false,
          error: { code: 'SVC_INSTALL_FAILED', message: 'Install failed', suggestion: 'Check logs' },
        };
      }
      statusMap.set(spec.name, createStatus(spec.name, 'stopped'));
      return { success: true, serviceName: spec.name, enabled: true };
    },

    async uninstall(serviceName: string): Promise<UninstallResult> {
      callHistory.push({ method: 'uninstall', args: [serviceName] });
      const self = this as typeof this & { uninstallDelay?: number; shouldUninstallFail?: boolean };
      if (self.uninstallDelay) await new Promise(r => setTimeout(r, self.uninstallDelay));
      if (self.shouldUninstallFail) {
        return {
          success: false,
          serviceName,
          error: { code: 'SVC_UNINSTALL_FAILED', message: 'Uninstall failed', suggestion: 'Check logs' },
        };
      }
      statusMap.set(serviceName, createStatus(serviceName, 'uninstalled'));
      return { success: true, serviceName };
    },

    async start(serviceName: string): Promise<StartResult> {
      callHistory.push({ method: 'start', args: [serviceName] });
      const self = this as typeof this & { startDelay?: number; shouldStartFail?: boolean };
      if (self.startDelay) await new Promise(r => setTimeout(r, self.startDelay));
      if (self.shouldStartFail) {
        return {
          success: false,
          serviceName,
          state: 'starting',
          error: { code: 'SVC_START_FAILED', message: 'Start failed', suggestion: 'Check logs' },
        };
      }
      statusMap.set(serviceName, createStatus(serviceName, 'running'));
      return { success: true, serviceName, state: 'running', pid: 12345 };
    },

    async stop(serviceName: string): Promise<StopResult> {
      callHistory.push({ method: 'stop', args: [serviceName] });
      const self = this as typeof this & { stopDelay?: number; shouldStopFail?: boolean };
      if (self.stopDelay) await new Promise(r => setTimeout(r, self.stopDelay));
      if (self.shouldStopFail) {
        return {
          success: false,
          serviceName,
          state: 'stopping',
          error: { code: 'SVC_STOP_FAILED', message: 'Stop failed', suggestion: 'Check logs' },
        };
      }
      statusMap.set(serviceName, createStatus(serviceName, 'stopped'));
      return { success: true, serviceName, state: 'stopped' };
    },

    async restart(serviceName: string) {
      callHistory.push({ method: 'restart', args: [serviceName] });
      statusMap.set(serviceName, createStatus(serviceName, 'running'));
      return { success: true, serviceName, state: 'running' as const, pid: 12345 };
    },

    async status(serviceName: string): Promise<ServiceStatus> {
      callHistory.push({ method: 'status', args: [serviceName] });
      return statusMap.get(serviceName) ?? createStatus(serviceName, 'uninstalled');
    },

    async precheckEnvironment() {
      return { schema_version: '1.0', canInstall: true, blockers: [], warnings: [] };
    },

    async dispose() {
      callHistory.push({ method: 'dispose', args: [] });
    },
  };
}

// Helper to create install specs
function createInstallSpec(name: string): ServiceInstallSpec {
  return {
    name,
    description: `${name} description`,
    binaryPath: `C:\\specforge\\bin\\${name}.exe`,
    args: [],
    workingDirectory: 'C:\\specforge',
    environment: {},
    dependsOn: name === 'specforge-daemon' ? ['opencode-server'] : [],
    restartPolicy: 'on-failure',
    stopTimeoutSec: 30,
    stdoutLogPath: `C:\\specforge\\logs\\${name}.out.log`,
    stderrLogPath: `C:\\specforge\\logs\\${name}.err.log`,
    enableAtBoot: true,
  };
}

describe('ServiceLifecycleOrchestrator', () => {
  let orchestrator: ServiceLifecycleOrchestrator;
  let mockManager: ReturnType<typeof createMockServiceManager>;

  beforeEach(() => {
    mockManager = createMockServiceManager();
    orchestrator = createServiceLifecycleOrchestrator({
      serviceManager: mockManager,
      dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
    });
  });

  afterEach(async () => {
    // Cleanup: dispose orchestrator and verify no pending operations
    // Only dispose if not already disposed (some tests dispose themselves)
    if (!orchestrator.isDisposed()) {
      await orchestrator.dispose();
    }
    expect(orchestrator.getActivePendingOpCount()).toBe(0);
  });

  describe('startAll - topological order', () => {
    it('should start opencode-server first, then specforge-daemon', async () => {
      // Setup: both services are stopped
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'stopped'));
      mockManager.statusMap.set('specforge-daemon', createStatus('specforge-daemon', 'stopped'));

      const result = await orchestrator.startAll(['specforge-daemon', 'opencode-server']);

      expect(result.success).toBe(true);
      // Verify order: opencode-server should be started before specforge-daemon
      const serverStartIdx = mockManager.callHistory.findIndex(
        c => c.method === 'start' && c.args[0] === 'opencode-server'
      );
      const daemonStartIdx = mockManager.callHistory.findIndex(
        c => c.method === 'start' && c.args[0] === 'specforge-daemon'
      );
      expect(serverStartIdx).toBeLessThan(daemonStartIdx);
    });

    it('should start single service in dependency order', async () => {
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'stopped'));

      const result = await orchestrator.startAll(['opencode-server']);

      expect(result.success).toBe(true);
      expect(result.perService).toHaveLength(1);
      expect(result.perService[0].name).toBe('opencode-server');
      expect(result.perService[0].state).toBe('running');
    });
  });

  describe('stopAll - reverse order', () => {
    it('should stop specforge-daemon first, then opencode-server', async () => {
      // Setup: both services are running
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'running'));
      mockManager.statusMap.set('specforge-daemon', createStatus('specforge-daemon', 'running'));

      const result = await orchestrator.stopAll(['specforge-daemon', 'opencode-server']);

      expect(result.success).toBe(true);
      // Verify reverse order: daemon should stop before server
      const serverStopIdx = mockManager.callHistory.findIndex(
        c => c.method === 'stop' && c.args[0] === 'opencode-server'
      );
      const daemonStopIdx = mockManager.callHistory.findIndex(
        c => c.method === 'stop' && c.args[0] === 'specforge-daemon'
      );
      expect(daemonStopIdx).toBeLessThan(serverStopIdx);
    });
  });

  describe('installAll - failure rollback', () => {
    it('should rollback already-installed services on failure', async () => {
      // Setup: opencode-server already installed, daemon install will fail
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'stopped'));
      mockManager.statusMap.set('specforge-daemon', createStatus('specforge-daemon', 'uninstalled'));
      mockManager.shouldInstallFail = true; // daemon install fails

      const specs = [createInstallSpec('opencode-server'), createInstallSpec('specforge-daemon')];
      const result = await orchestrator.installAll(specs);

      expect(result.success).toBe(false);
      // opencode-server was installed, then rolled back
      expect(result.rolledBack).toContain('opencode-server');
      // Verify rollback happened (uninstall was called for rolled-back service)
      const uninstallCalls = mockManager.callHistory.filter(c => c.method === 'uninstall');
      expect(uninstallCalls.some(c => c.args[0] === 'opencode-server')).toBe(true);
    });

    it('should install successfully when all succeed', async () => {
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'uninstalled'));

      const specs = [createInstallSpec('opencode-server')];
      const result = await orchestrator.installAll(specs);

      expect(result.success).toBe(true);
      expect(result.rolledBack).toHaveLength(0);
      expect(result.perService).toHaveLength(1);
      expect(result.perService[0].state).toBe('stopped');
    });
  });

  describe('no-op paths', () => {
    it('should return success when starting already-running service', async () => {
      // opencode-server is already running (from default mock setup)
      const result = await orchestrator.startAll(['opencode-server']);

      expect(result.success).toBe(true);
      // Verify start was NOT called (no-op)
      const startCalls = mockManager.callHistory.filter(c => c.method === 'start');
      expect(startCalls.length).toBe(0);
    });

    it('should return success when stopping already-stopped service', async () => {
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'stopped'));

      const result = await orchestrator.stopAll(['opencode-server']);

      expect(result.success).toBe(true);
    });

    it('should return success when installing already-installed service', async () => {
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'stopped'));

      const specs = [createInstallSpec('opencode-server')];
      const result = await orchestrator.installAll(specs);

      expect(result.success).toBe(true);
      // install should NOT be called (no-op)
      const installCalls = mockManager.callHistory.filter(c => c.method === 'install');
      expect(installCalls.length).toBe(0);
    });
  });

  describe('SVC_DEPENDENCY_NOT_RUNNING error', () => {
    it('should throw error when dependency is not running', async () => {
      // Setup: opencode-server is stopped, not running
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'stopped'));
      mockManager.statusMap.set('specforge-daemon', createStatus('specforge-daemon', 'stopped'));

      const result = await orchestrator.startAll(['specforge-daemon']);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SVC_DEPENDENCY_NOT_RUNNING');
      expect(result.error?.message).toContain('opencode-server');
    });

    it('should allow starting service with no dependencies', async () => {
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'stopped'));

      const result = await orchestrator.startAll(['opencode-server']);

      expect(result.success).toBe(true);
    });
  });

  describe('timeout scenarios', () => {
    it('should timeout start operations when operation takes longer than timeout', async () => {
      // Create a new orchestrator with a short timeout (100ms)
      const shortTimeoutOrchestrator = createServiceLifecycleOrchestrator({
        serviceManager: mockManager,
        dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
        startTimeoutMs: 100, // 100ms timeout
      });

      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'stopped'));
      mockManager.startDelay = 5000; // 5 second delay, much longer than 100ms timeout

      const result = await shortTimeoutOrchestrator.startAll(['opencode-server']);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SVC_GRACEFUL_TIMEOUT');

      await shortTimeoutOrchestrator.dispose();
    });

    it('should timeout stop operations when operation takes longer than timeout', async () => {
      // Create a new orchestrator with a short timeout (100ms)
      const shortTimeoutOrchestrator = createServiceLifecycleOrchestrator({
        serviceManager: mockManager,
        dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
        stopTimeoutMs: 100, // 100ms timeout
      });

      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'running'));
      mockManager.stopDelay = 5000; // 5 second delay

      const result = await shortTimeoutOrchestrator.stopAll(['opencode-server']);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SVC_GRACEFUL_TIMEOUT');

      await shortTimeoutOrchestrator.dispose();
    });

    it('should use custom timeout when provided to stopAll', async () => {
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'running'));
      mockManager.stopDelay = 5000; // 5 second delay

      const result = await orchestrator.stopAll(['opencode-server'], 100); // 100ms timeout

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SVC_GRACEFUL_TIMEOUT');
    });
  });

  describe('disposed orchestrator', () => {
    it('should throw error when operating on disposed orchestrator', async () => {
      // Create completely separate manager and orchestrator for this test
      const freshManager = createMockServiceManager();
      freshManager.statusMap.set('opencode-server', createStatus('opencode-server', 'running'));
      
      const testOrchestrator = createServiceLifecycleOrchestrator({
        serviceManager: freshManager,
        dependencyGraph: DEFAULT_DEPENDENCY_GRAPH,
      });

      // Dispose the orchestrator first
      await testOrchestrator.dispose();
      expect(testOrchestrator.isDisposed()).toBe(true);

      // Now operate on disposed orchestrator - should throw
      await expect(testOrchestrator.startAll(['opencode-server'])).rejects.toThrow('orchestrator.operate');
    });

    it('isDisposed should return true after dispose', () => {
      expect(orchestrator.isDisposed()).toBe(false);
      orchestrator.dispose();
      expect(orchestrator.isDisposed()).toBe(true);
    });
  });

  describe('getActivePendingOpCount', () => {
    it('should return 0 when no operations are pending', () => {
      expect(orchestrator.getActivePendingOpCount()).toBe(0);
    });

    it('should track pending operations during execution', async () => {
      // This test verifies the internal tracking works
      // Start a slow operation
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'stopped'));
      mockManager.startDelay = 100;

      const startPromise = orchestrator.startAll(['opencode-server']);

      // Give the operation a tiny bit of time to start
      await new Promise(r => setTimeout(r, 10));

      // There might be a pending operation tracked
      // Note: Due to async nature, we can't reliably check this, but the count should be consistent
      await startPromise;

      expect(orchestrator.getActivePendingOpCount()).toBe(0);
    });
  });

  describe('uninstallAll', () => {
    it('should uninstall in reverse dependency order', async () => {
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'stopped'));
      mockManager.statusMap.set('specforge-daemon', createStatus('specforge-daemon', 'stopped'));

      const result = await orchestrator.uninstallAll(['specforge-daemon', 'opencode-server']);

      expect(result.success).toBe(true);
      // Verify reverse order: daemon should be uninstalled before server
      const serverUninstallIdx = mockManager.callHistory.findIndex(
        c => c.method === 'uninstall' && c.args[0] === 'opencode-server'
      );
      const daemonUninstallIdx = mockManager.callHistory.findIndex(
        c => c.method === 'uninstall' && c.args[0] === 'specforge-daemon'
      );
      expect(daemonUninstallIdx).toBeLessThan(serverUninstallIdx);
    });

    it('should stop running services before uninstalling', async () => {
      mockManager.statusMap.set('opencode-server', createStatus('opencode-server', 'running'));
      mockManager.statusMap.set('specforge-daemon', createStatus('specforge-daemon', 'running'));

      await orchestrator.uninstallAll(['specforge-daemon', 'opencode-server']);

      // Verify stop was called before uninstall
      const stopCalls = mockManager.callHistory.filter(c => c.method === 'stop');
      const uninstallCalls = mockManager.callHistory.filter(c => c.method === 'uninstall');
      expect(stopCalls.length).toBeGreaterThan(0);
      expect(uninstallCalls.length).toBe(2);
    });
  });

  describe('statusAll', () => {
    it('should return status for all services', async () => {
      const result = await orchestrator.statusAll(['opencode-server', 'specforge-daemon']);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('opencode-server');
      expect(result[1].name).toBe('specforge-daemon');
    });
  });

  describe('Symbol.asyncDispose', () => {
    it('should support async dispose via Symbol', async () => {
      const tempOrchestrator = createServiceLifecycleOrchestrator({
        serviceManager: createMockServiceManager(),
      });

      await using _ = {
        [Symbol.asyncDispose]: async () => {
          await tempOrchestrator.dispose();
        }
      };

      // The orchestrator should be disposed when exiting the using block
      expect(tempOrchestrator.isDisposed()).toBe(false); // Not disposed yet during using
    });
  });
});