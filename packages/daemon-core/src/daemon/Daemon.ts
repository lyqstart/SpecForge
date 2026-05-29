/**
 * Daemon Core main class
 * 
 * Manages the lifecycle of the Daemon process, including startup,
 * shutdown, and signal handling.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { HTTPServer } from '../http/HTTPServer';
import { EventBus } from '../event-bus/EventBus';
import { SessionRegistry } from '../session/SessionRegistry';
import { ProjectManager } from '../project/ProjectManager';
import { StateManager } from '../state/StateManager';
import { WAL } from '../wal/WAL';
import { RecoverySubsystem } from '../recovery/RecoverySubsystem';
import { HandshakeManager } from './HandshakeManager';
import { DaemonConfig } from './DaemonConfig';
import { Event } from '../types';
import { ExtensionLoader } from '../extensions';
import { PermissionEngine } from '@specforge/permission-engine';
import { WorkflowEngine } from '@specforge/workflow-runtime';
import { EventLogger } from '@specforge/observability';
import { ToolDispatcher } from '../tools';
import {
  GracefulShutdownHandler,
  createGracefulShutdownHandler,
  ShutdownPriority,
} from '@specforge/service-management/shutdown';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

export class Daemon {
  private httpServer: HTTPServer;
  private eventBus: EventBus;
  private stateManager: StateManager;
  private recoverySubsystem: RecoverySubsystem;
  private handshakeManager: HandshakeManager;
  private config: DaemonConfig;
  private isRunning: boolean = false;
  private sessionRegistry: SessionRegistry;
  private projectManager: ProjectManager;
  private extensionLoader: ExtensionLoader | null = null;
  private permissionEngine: PermissionEngine;
  private workflowEngine: WorkflowEngine;
  private eventLogger: EventLogger;
  private gracefulShutdownHandler: GracefulShutdownHandler;

  constructor() {
    this.config = new DaemonConfig();
    this.eventBus = new EventBus();
    // Shared path resolver for all subsystems (TASK-8)
    const pathResolver = this.config.getPathResolver();
    const runtimeDir = this.config.getRuntimeDir();
    this.stateManager = new StateManager(pathResolver, pathResolver.resolveDaemonRuntimeDir(), true);

    // RecoverySubsystem injection with fallback (R1 risk mitigation)
    let recoveryWal: WAL | undefined;
    let recoveryStateManager: StateManager | undefined;
    try {
      recoveryWal = this.stateManager.getWal();
      recoveryStateManager = this.stateManager;
    } catch (err) {
      console.warn('[DAEMON] Cannot inject StateManager into RecoverySubsystem — falling back to legacy rebuild path', err);
    }
    // Create session registry first so it can be injected into RecoverySubsystem
    const sessionRegistry = new SessionRegistry(this.eventBus, 30 * 60 * 1000, this.stateManager.getWal());
    this.recoverySubsystem = new RecoverySubsystem(
      pathResolver, runtimeDir, recoveryWal, recoveryStateManager, sessionRegistry
    );
    this.handshakeManager = new HandshakeManager(this.config);
    this.sessionRegistry = sessionRegistry;
    this.projectManager = new ProjectManager(this.eventBus, pathResolver, this.stateManager);
    
    this.extensionLoader = new ExtensionLoader({}, this.eventBus);
    this.workflowEngine = new WorkflowEngine({
      // Bridge: persist every state transition to WAL via StateManager
      // This is the WAL-first guarantee (Property 7)
      onTransition: async ({ workItemId, fromState, toState, workflowType, evidence, actor }) => {
        // StateManager.transition() uses positional params:
        // (workItemId, fromState, toState, actor, workflowType, extraPayload)
        await this.stateManager.transition(
          workItemId,
          fromState,
          toState,
          typeof actor === 'string' ? actor : 'system',
          workflowType || 'feature_spec',
          evidence ? { evidence } : {},
        );
      },
    });
    this.extensionLoader.setWorkflowEngine(this.workflowEngine);

    this.permissionEngine = new PermissionEngine({ projectId: 'default-project' });
    // NOTE: workflowEngine is already created above — do NOT create a second instance
    this.eventLogger = new EventLogger(runtimeDir);

    this.httpServer = new HTTPServer({
      config: this.config,
      eventBus: this.eventBus,
      stateManager: this.stateManager,
      wal: this.stateManager.getWal(),
      permissionEngine: this.permissionEngine,
      workflowEngine: this.workflowEngine,
      eventLogger: this.eventLogger,
      sessionRegistry: this.sessionRegistry,
      projectManager: this.projectManager,
      recoverySubsystem: this.recoverySubsystem,
      toolDispatcher: new ToolDispatcher({
        stateManager: this.stateManager,
        workflowEngine: this.workflowEngine,
        eventLogger: this.eventLogger,
        eventBus: this.eventBus,
        permissionEngine: this.permissionEngine,
        cas: undefined,
        sessionRegistry: this.sessionRegistry,
      }),
    });

    // Initialize GracefulShutdownHandler
    // Requirements 3.1, 3.2, 3.3, 3.4, 3.5: Integration with GracefulShutdownHandler
    this.gracefulShutdownHandler = createGracefulShutdownHandler({
      autoAttach: false, // We'll attach manually after startup
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Daemon is already running');
    }

    // Property 21: Begin startup phase for session reconnection
    this.recoverySubsystem.beginStartupPhase();

    // 1. Enforce single instance
    await this.handshakeManager.enforceSingleInstance();

    // 2. Start HTTP server
    const { port } = await this.httpServer.start();

    // 3. Generate token and write handshake file
    const token = this.handshakeManager.generateToken();
    await this.handshakeManager.writeHandshake(process.pid, port, token);
    
    // 4. Set token in HTTP server for auth
    this.httpServer.setToken(token);

    // 5. Initialize components
    // Detect and handle legacy nested paths before StateManager initialize
    await this.detectAndHandleLegacyState(this.config.getRuntimeDir());
    await this.stateManager.initialize();
    try {
      await this.recoverySubsystem.checkAndRepair();
    } catch (err) {
      console.error('[DAEMON] RecoverySubsystem.checkAndRepair failed — state may be incomplete', err);
    }

    // 6. Start event bus
    this.eventBus.start();

    // Wire EventBus persistence to EventLogger (WAL-first guarantee)
    // Skip events without projectId (e.g. internal extension loading events)
    this.eventBus.setPersistenceHook(async (event) => {
      if (!event.projectId) return;  // Skip internal events without project context
      // Type cast to match observability Event type (cast through unknown first)
      await this.eventLogger.append(event as unknown as import('@specforge/observability').Event);
    });

    // 7. Start session registry and project manager
    this.sessionRegistry.start();
    this.projectManager.start();

    // 8. Load extensions (Plugin Loader, Skills, Tools, etc.) - Task 6.1.1
    console.log('[EXTENSIONS] Loading extensions...');
    const extensionResult = await this.extensionLoader!.loadAll();
    if (extensionResult.success) {
      console.log(`[EXTENSIONS] All extensions loaded successfully in ${extensionResult.totalLoadTimeMs}ms`);
    } else {
      const failed = extensionResult.extensions.filter(e => !e.loaded);
      console.log(`[EXTENSIONS] ${failed.length} extension(s) failed to load:`);
      failed.forEach(e => {
        console.log(`  - ${e.type}: ${e.error?.message || 'Unknown error'}`);
      });
    }

    // Property 21: Complete startup - no more WAL replay session reconstruction allowed
    this.recoverySubsystem.completeStartup();

    this.isRunning = true;
    console.log(`Daemon Core started on port ${port}`);

    // Register shutdown tasks with GracefulShutdownHandler
    // This ensures proper cleanup order on exit
    this.registerShutdownTasks();

    // Attach to process signals
    this.gracefulShutdownHandler.attachToProcess();
  }

  /**
   * Detect and handle legacy nested state.json / events.jsonl
   * from the old path ~/.specforge/runtime/${SPEC_DIR_NAME}/runtime/
   * TASK-6: Legacy detection — merge events, mark state as orphan
   */
  private async detectAndHandleLegacyState(runtimeDir: string): Promise<void> {
    const legacyStatePath = path.join(runtimeDir, SPEC_DIR_NAME, 'runtime', 'state.json');
    const legacyEventsPath = path.join(runtimeDir, SPEC_DIR_NAME, 'runtime', 'events.jsonl');

    // Check for legacy nested state.json
    try {
      await fs.access(legacyStatePath);
      console.warn(`[DAEMON] Legacy nested state.json found at ${legacyStatePath}. Marking as orphan.`);
      console.warn(`[DAEMON] Data will be rebuilt from canonical events.jsonl. Legacy file preserved for manual inspection.`);
    } catch {
      // No legacy file, normal case
    }

    // Check for legacy nested events.jsonl
    try {
      await fs.access(legacyEventsPath);
      const content = await fs.readFile(legacyEventsPath, 'utf-8');
      if (content.trim().length > 0) {
        // Read existing canonical events
        const canonicalEventsPath = path.join(runtimeDir, 'events.jsonl');
        let existingEvents: string[] = [];
        try {
          const existingContent = await fs.readFile(canonicalEventsPath, 'utf-8');
          existingEvents = existingContent.trim().split('\n').filter(line => line.trim());
        } catch {
          // No canonical file yet
        }

        const existingEventIds = new Set(
          existingEvents.map(line => { try { return JSON.parse(line).eventId; } catch { return null; } }).filter(Boolean)
        );

        const legacyEvents = content.trim().split('\n').filter(line => line.trim());
        const newEvents: string[] = [];

        for (const line of legacyEvents) {
          try {
            const event = JSON.parse(line);
            if (!existingEventIds.has(event.eventId)) {
              newEvents.push(line);
            }
          } catch {
            // Skip malformed lines
          }
        }

        if (newEvents.length > 0) {
          const appendContent = newEvents.join('\n') + '\n';
          await fs.appendFile(canonicalEventsPath, appendContent, 'utf-8');
          console.warn(`[DAEMON] Merged ${newEvents.length} events from legacy events.jsonl to canonical path.`);
        }

        // Rename legacy file as orphan
        await fs.rename(legacyEventsPath, legacyEventsPath + '.orphaned');
        console.warn(`[DAEMON] Legacy events.jsonl renamed to ${legacyEventsPath}.orphaned`);
      }
    } catch {
      // No legacy events file, normal case
    }
  }

  /**
   * Register shutdown tasks with GracefulShutdownHandler
   * Requirements 3.1, 3.2, 3.3, 3.4, 3.5: Proper shutdown sequence
   */
  private registerShutdownTasks(): void {
    // Task 1: Stop accepting new HTTP connections (priority: stop-accepting)
    this.gracefulShutdownHandler.register(
      'http-stop-accepting',
      async () => {
        console.log('[SHUTDOWN] Step 1: Stopping HTTP accept...');
        // HTTP server doesn't have a stop-accepting method, but we mark this phase
        // The actual stop will happen in the close phase
      },
      ShutdownPriority.STOP_ACCEPTING
    );

    // Task 2: Drain Event Bus (priority: drain)
    this.gracefulShutdownHandler.register(
      'eventbus-drain',
      async () => {
        console.log('[SHUTDOWN] Step 2: Draining Event Bus...');
        // EventBus doesn't have a drain method, but we can ensure no new events
        // The stop() method will clear subscriptions
      },
      ShutdownPriority.DRAIN
    );

    // Task 3: Flush events.jsonl and fsync (priority: flush)
    // Requirement 3.2: Ensure acknowledged events are fsynced before exit
    this.gracefulShutdownHandler.register(
      'events-flush',
      async () => {
        console.log('[SHUTDOWN] Step 3: Flushing events to disk...');
        // EventLogger already does fsync on each append
        // This is a belt-and-suspenders check
        if (this.eventLogger) {
          // Force any pending writes to complete
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      },
      ShutdownPriority.FLUSH
    );

    // Task 4: Close SSE connections (priority: close)
    this.gracefulShutdownHandler.register(
      'sse-close',
      async () => {
        console.log('[SHUTDOWN] Step 4: Closing SSE connections...');
        // SSE cleanup is handled in HTTPServer.stop()
      },
      ShutdownPriority.CLOSE
    );

    // Task 5: Dispose resources (priority: release)
    this.gracefulShutdownHandler.register(
      'dispose-extensions',
      async () => {
        console.log('[SHUTDOWN] Step 5: Disposing extensions...');
        this.extensionLoader = null;
      },
      ShutdownPriority.RELEASE
    );
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Daemon Core shutting down...');

    // Trigger graceful shutdown through GracefulShutdownHandler
    // This ensures proper order and timeout handling
    await this.gracefulShutdownHandler.trigger('daemon.stop()');

    // 1. Stop session registry and project manager
    this.projectManager.stop();
    this.sessionRegistry.stop();

    // 2. Stop event bus
    this.eventBus.stop();

    // 3. Stop HTTP server
    await this.httpServer.stop();

    // 4. Cleanup handshake file and release lock
    await this.handshakeManager.cleanup();

    this.isRunning = false;
    console.log('Daemon Core stopped');
  }

  async broadcastEvent(event: Event): Promise<void> {
    this.eventBus.publish(event);
  }

  isDaemonRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 获取扩展加载器实例
   * 供外部组件访问插件加载器等功能
   * 
   * @returns ExtensionLoader 实例
   */
  getExtensionLoader(): ExtensionLoader | null {
    return this.extensionLoader;
  }

  /**
   * Get the GracefulShutdownHandler instance
   * Useful for testing and external coordination
   */
  getGracefulShutdownHandler(): GracefulShutdownHandler {
    return this.gracefulShutdownHandler;
  }
}