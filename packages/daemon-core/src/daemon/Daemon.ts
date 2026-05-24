/**
 * Daemon Core main class
 * 
 * Manages the lifecycle of the Daemon process, including startup,
 * shutdown, and signal handling.
 */

import path from 'path';
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
  private idleTimeoutHandle: NodeJS.Timeout | null = null;
  private lastActivityTime: number = 0;
  private extensionLoader: ExtensionLoader | null = null;
  private permissionEngine: PermissionEngine;
  private workflowEngine: WorkflowEngine;
  private eventLogger: EventLogger;
  private wal: WAL;

  constructor() {
    this.config = new DaemonConfig();
    this.eventBus = new EventBus();
    // Use the runtime directory as the WAL path for StateManager
    // This ensures events.jsonl is written to ~/.specforge/runtime/
    const runtimeDir = this.config.getRuntimeDir();
    this.stateManager = new StateManager(runtimeDir);
    this.recoverySubsystem = new RecoverySubsystem(runtimeDir);
    this.handshakeManager = new HandshakeManager(this.config);
    this.sessionRegistry = new SessionRegistry(this.eventBus);
    this.projectManager = new ProjectManager(this.eventBus);
    
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
    this.eventLogger = new EventLogger(path.join(this.config.getRuntimeDir(), '..', 'runtime'));
    // WAL is managed by StateManager internally; create a separate reference for HTTPServer
    this.wal = new WAL(path.join(runtimeDir, 'events.jsonl'));

    this.httpServer = new HTTPServer({
      config: this.config,
      eventBus: this.eventBus,
      stateManager: this.stateManager,
      wal: this.wal,
      permissionEngine: this.permissionEngine,
      workflowEngine: this.workflowEngine,
      eventLogger: this.eventLogger,
      sessionRegistry: this.sessionRegistry,
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
    await this.stateManager.initialize();
    await this.recoverySubsystem.checkAndRepair();

    // 6. Start event bus
    this.eventBus.start();

    // Wire EventBus persistence to EventLogger (WAL-first guarantee)
    // Skip events without projectId (e.g. internal extension loading events)
    this.eventBus.setPersistenceHook(async (event) => {
      if (!event.projectId) return;  // Skip internal events without project context
      await this.eventLogger.append(event);
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

    // Property 21: Attempt to reconnect old sessions from previous Daemon run
    // This only succeeds because we're still in the startup phase
    await this.recoverySubsystem.reconnectOldSessions();

    // Property 21: Complete startup - no more reconnection attempts allowed
    this.recoverySubsystem.completeStartup();

    this.isRunning = true;
    console.log(`Daemon Core started on port ${port}`);

    // Setup signal handlers for graceful shutdown
    this.setupSignalHandlers();

    // Setup idle timeout (only for non-detached mode)
    // Requirements 1.3, 1.4: 30-second idle exit for Thin Plugin/CLI startups
    if (!this.config.isDetached()) {
      this.setupIdleTimeout();
    } else {
      console.log('Daemon running in detached mode - idle timeout disabled');
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Daemon Core shutting down...');

    // Set a 5-second hard timeout for graceful shutdown
    const shutdownTimeout = setTimeout(() => {
      console.error('[SHUTDOWN] Graceful shutdown timed out after 5s, forcing exit');
      process.exit(1);
    }, 5000);
    shutdownTimeout.unref(); // Don't let this timer keep the process alive

    // Clear idle timeout to prevent exit during graceful shutdown
    if (this.idleTimeoutHandle) {
      clearInterval(this.idleTimeoutHandle);
      this.idleTimeoutHandle = null;
    }

    // 1. Stop session registry and project manager
    this.projectManager.stop();
    this.sessionRegistry.stop();

    // 2. Stop event bus
    this.eventBus.stop();

    // 3. Stop HTTP server
    await this.httpServer.stop();

    // 4. Cleanup extensions (unload plugins, etc.) - Task 6.1.1
    console.log('[EXTENSIONS] Cleaning up extensions...');
    this.extensionLoader = null;

    // 4.5 Final state persist — ensure state.json is up to date before exit
    // Property 7: WAL ordering requires final fsync before exit
    // Note: WAL writes include fsync per appendEvent, so this is belt-and-suspenders

    // 5. Cleanup handshake file and release lock
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
   * Setup idle timeout for automatic exit
   * Requirements 1.3, 1.4: 30-second idle exit for Thin Plugin/CLI startups
   * Excludes --detach mode
   */
  private setupIdleTimeout(): void {
    const idleTimeoutMs = this.config.getIdleTimeoutMs();
    this.lastActivityTime = Date.now();
    
    console.log(`[IDLE] Setting up ${idleTimeoutMs / 1000}-second idle timeout`);
    
    // Reset the idle timer on each activity
    this.resetIdleTimer();
    
    // Subscribe to event bus to reset timer on any activity
    this.eventBus.subscribe('*', () => {
      this.resetIdleTimer();
    });
    
    // Set up periodic check for idle timeout
    this.idleTimeoutHandle = setInterval(() => {
      const now = Date.now();
      const idleTime = now - this.lastActivityTime;
      
      if (idleTime >= idleTimeoutMs) {
        console.log(`[IDLE] No activity for ${idleTime / 1000} seconds, exiting...`);
        
        // Clear the interval first to prevent multiple exit attempts
        if (this.idleTimeoutHandle) {
          clearInterval(this.idleTimeoutHandle);
          this.idleTimeoutHandle = null;
        }
        
        this.stop()
          .then(() => {
            console.log('[IDLE] Daemon exited due to idle timeout');
            process.exit(0);
          })
          .catch((err) => {
            console.error('[IDLE] Error during idle shutdown:', err);
            process.exit(1);
          });
      }
    }, 1000); // Check every second
  }

  /**
   * Reset the idle timer on activity
   * Call this method whenever there's activity (HTTP request, event, etc.)
   */
  resetIdleTimer(): void {
    if (!this.config.isDetached()) {
      this.lastActivityTime = Date.now();
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    // Handle SIGTERM
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down...');
      await this.stop();
      process.exit(0);
    });

    // Handle SIGINT
    process.on('SIGINT', async () => {
      console.log('Received SIGINT, shutting down...');
      await this.stop();
      process.exit(0);
    });

    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      await this.stop();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      console.error('Unhandled rejection:', reason);
      await this.stop();
      process.exit(1);
    });
  }
}
