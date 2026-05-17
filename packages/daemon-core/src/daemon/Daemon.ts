/**
 * Daemon Core main class
 * 
 * Manages the lifecycle of the Daemon process, including startup,
 * shutdown, and signal handling.
 */

import { HTTPServer } from '../http/HTTPServer';
import { EventBus } from '../event-bus/EventBus';
import { SessionRegistry } from '../session/SessionRegistry';
import { ProjectManager } from '../project/ProjectManager';
import { StateManager } from '../state/StateManager';
import { RecoverySubsystem } from '../recovery/RecoverySubsystem';
import { HandshakeManager } from './HandshakeManager';
import { DaemonConfig } from './DaemonConfig';
import { Event } from '../types';

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

  constructor() {
    this.config = new DaemonConfig();
    this.eventBus = new EventBus();
    this.httpServer = new HTTPServer(this.config, this.eventBus);
    this.stateManager = new StateManager('default-project');
    this.recoverySubsystem = new RecoverySubsystem('default-project');
    this.handshakeManager = new HandshakeManager(this.config);
    this.sessionRegistry = new SessionRegistry(this.eventBus);
    this.projectManager = new ProjectManager(this.eventBus);
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

    // 3. Write handshake file
    await this.handshakeManager.writeHandshakeFile(port);
    
    // 4. Get token from handshake manager and set it in HTTP server
    const token = await this.handshakeManager.getToken();
    this.httpServer.setToken(token);

    // 5. Initialize components
    await this.stateManager.initialize();
    await this.recoverySubsystem.checkAndRepair();

    // 6. Start event bus
    this.eventBus.start();

    // 7. Start session registry and project manager
    this.sessionRegistry.start();
    this.projectManager.start();

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
