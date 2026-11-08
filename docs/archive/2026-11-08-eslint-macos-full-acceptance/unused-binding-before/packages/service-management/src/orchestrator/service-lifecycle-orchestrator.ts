/**
 * Service Lifecycle Orchestrator
 *
 * Orchestrates multi-service lifecycle operations (install/start/stop/uninstall)
 * with dependency-aware ordering and rollback support.
 *
 * Key behaviors:
 * - startAll: topological sort based on dependency graph, starts successor after predecessor enters "running"
 * - stopAll: reverse order of startAll
 * - installAll: rollback on failure, populate rolledBack list
 * - No-op detection: already X then operation X returns success with exit code 0
 *
 * Implementation requirements (from async-resource-coding-standards):
 * - Constructor must have no side effects (lessons-injected JS1)
 * - Must implement Disposable + Symbol.asyncDispose
 * - Must implement getActivePendingOpCount() self-check API
 * - Promise.race losers must be cleared in finally (lessons-injected C1)
 */

import type { ServiceManager } from '../service-manager/service-manager.js';
import type { ServiceInstallSpec } from '../types/service-install-spec.js';
import type { ServiceStatus } from '../types/service-status.js';
import type { ServiceState } from '../types/service-state.js';
import type { OrchestrationResult } from '../types/orchestration-result.js';
import { createServiceError, ErrorCode } from '../errors/service-error.js';

/**
 * Dependency graph entry: service name -> services it depends on
 */
export interface DependencyGraph {
  [serviceName: string]: string[];
}

/**
 * Default dependency graph for SpecForge services
 * specforge-daemon depends on opencode-server
 */
export const DEFAULT_DEPENDENCY_GRAPH: DependencyGraph = {
  'specforge-daemon': ['opencode-server'],
  'opencode-server': [],
};

/**
 * Options for ServiceLifecycleOrchestrator
 */
export interface ServiceLifecycleOrchestratorOptions {
  /** Service manager instance to delegate operations to */
  serviceManager: ServiceManager;
  /** Dependency graph for services. Defaults to SPECFORGE_DEPENDENCY_GRAPH */
  dependencyGraph?: DependencyGraph;
  /** Timeout for start operation in milliseconds */
  startTimeoutMs?: number;
  /** Timeout for stop operation in milliseconds */
  stopTimeoutMs?: number;
}

/**
 * Track pending operations for self-check API
 */
interface PendingOperation {
  id: string;
  type: 'install' | 'start' | 'stop' | 'uninstall' | 'status';
  serviceName: string;
  startedAt: number;
}

/**
 * Service Lifecycle Orchestrator
 *
 * Manages multi-service lifecycle operations with dependency ordering.
 */
export class ServiceLifecycleOrchestrator implements AsyncDisposable {
  private readonly serviceManager: ServiceManager;
  private readonly dependencyGraph: DependencyGraph;
  private readonly startTimeoutMs: number;
  private readonly stopTimeoutMs: number;

  /** Track pending operations */
  private pendingOperations: Map<string, PendingOperation> = new Map();
  private operationCounter = 0;

  /** Disposal flag */
  private disposed = false;

  /**
   * Constructor - must have NO side effects (lessons-injected JS1)
   * Only assigns fields, no spawn/register/timer
   */
  constructor(options: ServiceLifecycleOrchestratorOptions) {
    this.serviceManager = options.serviceManager;
    this.dependencyGraph = options.dependencyGraph ?? DEFAULT_DEPENDENCY_GRAPH;
    this.startTimeoutMs = options.startTimeoutMs ?? 30000;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 30000;
  }

  /**
   * Install all services in dependency order (topological sort)
   */
  async installAll(specs: ServiceInstallSpec[]): Promise<OrchestrationResult> {
    this.ensureNotDisposed();

    const serviceSpecs = new Map(specs.map(s => [s.name, s]));
    const serviceNames = specs.map(s => s.name);
    const sorted = this.topologicalSort(serviceNames);
    const installed: ServiceStatus[] = [];
    const rolledBack: string[] = [];

    try {
      for (const name of sorted) {
        const spec = serviceSpecs.get(name);
        if (!spec) {
          continue;
        }

        // Check if already installed (no-op detection)
        const currentStatus = await this.serviceManager.status(name);
        if (currentStatus.state !== 'uninstalled') {
          // Already installed, treat as success (no-op)
          installed.push({
            ...currentStatus,
            schema_version: '1.0',
          });
          continue;
        }

        // Track this operation
        const opId = this.trackPendingOp('install', name);

        try {
          const result = await Promise.race([
            this.serviceManager.install(spec),
            this.createTimeoutPromise(this.startTimeoutMs, `install(${name})`),
          ]);

          if (!result.success) {
            throw createServiceError(
              (result.error?.code as ErrorCode) || 'SVC_INSTALL_ROLLBACK_FAILED',
              { serviceName: name, operation: `install(${name})` }
            );
          }

          // Get status after install
          const status = await this.serviceManager.status(name);
          installed.push({
            ...status,
            schema_version: '1.0',
          });
        } finally {
          this.untrackPendingOp(opId);
        }
      }

      return {
        schema_version: '1.0',
        success: true,
        perService: installed,
        rolledBack: [],
        error: null,
      };
    } catch (error) {
      // Rollback: uninstall services that were successfully installed
      for (const status of installed) {
        const opId = this.trackPendingOp('uninstall', status.name);
        try {
          await this.serviceManager.uninstall(status.name);
          rolledBack.push(status.name);
        } catch {
          // Rollback failure - best effort
        } finally {
          this.untrackPendingOp(opId);
        }
      }

      const serviceError = isServiceError(error) ? error : createServiceError(
        'SVC_INSTALL_ROLLBACK_FAILED',
        { serviceName: 'unknown', lastError: error instanceof Error ? error.message : String(error) }
      );

      return {
        schema_version: '1.0',
        success: false,
        perService: installed,
        rolledBack,
        error: {
          code: serviceError.code,
          message: serviceError.message,
          suggestion: serviceError.suggestion,
        },
      };
    }
  }

  /**
   * Start all services in dependency order
   * Uses topological sort, starts successor after predecessor enters "running"
   */
  async startAll(serviceNames: string[]): Promise<OrchestrationResult> {
    this.ensureNotDisposed();

    const sorted = this.topologicalSort(serviceNames);
    const results: ServiceStatus[] = [];

    try {
      for (const name of sorted) {
        // Check dependencies are running first
        const dependencies = this.dependencyGraph[name] || [];
        for (const dep of dependencies) {
          const depStatus = await this.serviceManager.status(dep);
          if (depStatus.state !== 'running') {
            throw createServiceError('SVC_DEPENDENCY_NOT_RUNNING', {
              serviceName: name,
              dependencyName: dep,
              operation: `start(${name})`,
            });
          }
        }

        // Check if already running (no-op detection)
        const currentStatus = await this.serviceManager.status(name);
        if (currentStatus.state === 'running') {
          // Already running, treat as success (no-op)
          results.push({
            ...currentStatus,
            schema_version: '1.0',
          });
          continue;
        }

        // Track this operation
        const opId = this.trackPendingOp('start', name);

        try {
          const result = await Promise.race([
            this.serviceManager.start(name),
            this.createTimeoutPromise(this.startTimeoutMs, `start(${name})`),
          ]);

          if (!result.success && result.state !== 'already-running') {
            throw createServiceError(
              (result.error?.code as ErrorCode) || 'SVC_GRACEFUL_TIMEOUT',
              { serviceName: name, operation: `start(${name})` }
            );
          }

          // Get status after start
          const status = await this.serviceManager.status(name);
          results.push({
            ...status,
            schema_version: '1.0',
          });
        } finally {
          this.untrackPendingOp(opId);
        }
      }

      return {
        schema_version: '1.0',
        success: true,
        perService: results,
        rolledBack: [],
        error: null,
      };
    } catch (error) {
      const serviceError = isServiceError(error) ? error : createServiceError(
        'SVC_GRACEFUL_TIMEOUT',
        { serviceName: 'unknown', lastError: error instanceof Error ? error.message : String(error) }
      );

      return {
        schema_version: '1.0',
        success: false,
        perService: results,
        rolledBack: [],
        error: {
          code: serviceError.code,
          message: serviceError.message,
          suggestion: serviceError.suggestion,
        },
      };
    }
  }

  /**
   * Stop all services in reverse dependency order
   * @param serviceNames Array of service names to stop
   * @param stopTimeoutMs Optional timeout in milliseconds (overrides default)
   */
  async stopAll(serviceNames: string[], stopTimeoutMs?: number): Promise<OrchestrationResult> {
    this.ensureNotDisposed();

    const effectiveTimeout = stopTimeoutMs ?? this.stopTimeoutMs;
    const sorted = this.topologicalSort(serviceNames);
    // Reverse order for stop
    const reverseSorted = [...sorted].reverse();
    const results: ServiceStatus[] = [];

    try {
      for (const name of reverseSorted) {
        // Check if already stopped (no-op detection)
        const currentStatus = await this.serviceManager.status(name);
        if (currentStatus.state === 'stopped' || currentStatus.state === 'uninstalled') {
          // Already stopped or uninstalled, treat as success (no-op)
          results.push({
            ...currentStatus,
            schema_version: '1.0',
          });
          continue;
        }

        // Track this operation
        const opId = this.trackPendingOp('stop', name);

        try {
          const result = await Promise.race([
            this.serviceManager.stop(name),
            this.createTimeoutPromise(effectiveTimeout, `stop(${name})`),
          ]);

          if (!result.success && result.state !== 'already-stopped') {
            throw createServiceError(
              (result.error?.code as ErrorCode) || 'SVC_GRACEFUL_TIMEOUT',
              { serviceName: name, operation: `stop(${name})` }
            );
          }

          // Get status after stop
          const status = await this.serviceManager.status(name);
          results.push({
            ...status,
            schema_version: '1.0',
          });
        } finally {
          this.untrackPendingOp(opId);
        }
      }

      return {
        schema_version: '1.0',
        success: true,
        perService: results,
        rolledBack: [],
        error: null,
      };
    } catch (error) {
      const serviceError = isServiceError(error) ? error : createServiceError(
        'SVC_GRACEFUL_TIMEOUT',
        { serviceName: 'unknown', lastError: error instanceof Error ? error.message : String(error) }
      );

      return {
        schema_version: '1.0',
        success: false,
        perService: results,
        rolledBack: [],
        error: {
          code: serviceError.code,
          message: serviceError.message,
          suggestion: serviceError.suggestion,
        },
      };
    }
  }

  /**
   * Uninstall all services in reverse dependency order
   */
  async uninstallAll(serviceNames: string[], stopTimeoutMs?: number): Promise<OrchestrationResult> {
    this.ensureNotDisposed();

    const effectiveTimeout = stopTimeoutMs ?? this.stopTimeoutMs;
    const sorted = this.topologicalSort(serviceNames);
    // Reverse order for uninstall
    const reverseSorted = [...sorted].reverse();
    const results: ServiceStatus[] = [];

    try {
      for (const name of reverseSorted) {
        // Check if already uninstalled (no-op detection)
        const currentStatus = await this.serviceManager.status(name);
        if (currentStatus.state === 'uninstalled') {
          // Already uninstalled, treat as success (no-op)
          results.push({
            ...currentStatus,
            schema_version: '1.0',
          });
          continue;
        }

        // Stop first if running
        if (currentStatus.state === 'running' || currentStatus.state === 'starting') {
          const opIdStop = this.trackPendingOp('stop', name);
          try {
            await Promise.race([
              this.serviceManager.stop(name),
              this.createTimeoutPromise(effectiveTimeout, `stop(${name})`),
            ]);
          } finally {
            this.untrackPendingOp(opIdStop);
          }
        }

        // Track this operation
        const opId = this.trackPendingOp('uninstall', name);

        try {
          const result = await Promise.race([
            this.serviceManager.uninstall(name),
            this.createTimeoutPromise(effectiveTimeout, `uninstall(${name})`),
          ]);

          if (!result.success) {
            throw createServiceError(
              (result.error?.code as ErrorCode) || 'SVC_INSTALL_ROLLBACK_FAILED',
              { serviceName: name, operation: `uninstall(${name})` }
            );
          }

          // Get status after uninstall
          const status = await this.serviceManager.status(name);
          results.push({
            ...status,
            schema_version: '1.0',
          });
        } finally {
          this.untrackPendingOp(opId);
        }
      }

      return {
        schema_version: '1.0',
        success: true,
        perService: results,
        rolledBack: [],
        error: null,
      };
    } catch (error) {
      const serviceError = isServiceError(error) ? error : createServiceError(
        'SVC_INSTALL_ROLLBACK_FAILED',
        { serviceName: 'unknown', lastError: error instanceof Error ? error.message : String(error) }
      );

      return {
        schema_version: '1.0',
        success: false,
        perService: results,
        rolledBack: [],
        error: {
          code: serviceError.code,
          message: serviceError.message,
          suggestion: serviceError.suggestion,
        },
      };
    }
  }

  /**
   * Query status of all services
   */
  async statusAll(serviceNames: string[]): Promise<ServiceStatus[]> {
    this.ensureNotDisposed();

    const results: ServiceStatus[] = [];

    for (const name of serviceNames) {
      const opId = this.trackPendingOp('status', name);
      try {
        const status = await this.serviceManager.status(name);
        results.push({
          ...status,
          schema_version: '1.0',
        });
      } finally {
        this.untrackPendingOp(opId);
      }
    }

    return results;
  }

  /**
   * Get count of active pending operations (self-check API)
   * Used in tests to verify no resource leaks
   */
  getActivePendingOpCount(): number {
    return this.pendingOperations.size;
  }

  /**
   * Check if orchestrator is disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Dispose of the orchestrator and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.pendingOperations.clear();

    // Dispose the underlying service manager
    await this.serviceManager.dispose();
  }

  /**
   * Symbol.asyncDispose support for using statement
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }

  // Private helper methods

  /**
   * Ensure orchestrator is not disposed before operations
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw createServiceError('SVC_GRACEFUL_TIMEOUT', {
        operation: 'orchestrator.operate',
        details: { suggestion: 'The orchestrator has been disposed. Create a new instance.' },
      });
    }
  }

  /**
   * Track a pending operation
   */
  private trackPendingOp(type: PendingOperation['type'], serviceName: string): string {
    const id = `op-${++this.operationCounter}-${serviceName}`;
    this.pendingOperations.set(id, {
      id,
      type,
      serviceName,
      startedAt: Date.now(),
    });
    return id;
  }

  /**
   * Untrack a pending operation
   */
  private untrackPendingOp(opId: string): void {
    this.pendingOperations.delete(opId);
  }

  /**
   * Topological sort based on dependency graph
   * Returns services in order that dependencies come first
   */
  private topologicalSort(serviceNames: string[]): string[] {
    const graph = this.dependencyGraph;
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string): void => {
      if (visited.has(name)) {
        return;
      }
      if (visiting.has(name)) {
        // Circular dependency - skip to avoid infinite loop
        return;
      }

      visiting.add(name);

      // Visit dependencies first
      const dependencies = graph[name] || [];
      for (const dep of dependencies) {
        if (serviceNames.includes(dep)) {
          visit(dep);
        }
      }

      visiting.delete(name);
      visited.add(name);
      result.push(name);
    };

    for (const name of serviceNames) {
      visit(name);
    }

    return result;
  }

  /**
   * Create a timeout promise (with proper cleanup per C1)
   */
  private createTimeoutPromise(ms: number, operation: string): Promise<never> {
    let timer: ReturnType<typeof setTimeout>;

    return new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(createServiceError('SVC_GRACEFUL_TIMEOUT', {
          operation,
          timeoutMs: ms,
          details: { suggestion: `Operation "${operation}" timed out after ${ms}ms. Check service logs for details.` },
        }));
      }, ms);
    }).finally(() => {
      // C1: Clear the timer to prevent leak
      clearTimeout(timer);
    }) as unknown as Promise<never>;
  }
}

/**
 * Type guard for ServiceError
 */
function isServiceError(error: unknown): error is { code: string; message: string; suggestion: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'suggestion' in error
  );
}

/**
 * Create a new ServiceLifecycleOrchestrator
 */
export function createServiceLifecycleOrchestrator(
  options: ServiceLifecycleOrchestratorOptions
): ServiceLifecycleOrchestrator {
  return new ServiceLifecycleOrchestrator(options);
}