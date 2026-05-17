# Thin Plugin Integration Guide

This guide covers how to integrate with the Daemon Core from Thin Plugins using JavaScript/TypeScript. Thin Plugins are lightweight clients that communicate with the Daemon via HTTP.

## Overview

Thin Plugins interact with the Daemon Core to:
1. Create and manage sessions
2. Subscribe to real-time events via Server-Sent Events (SSE)
3. Handle project contexts and locks
4. Process work items

---

## Session Lifecycle

### Complete Session Lifecycle

```typescript
import * as http from 'http';

/**
 * Thin Plugin integration example
 * Demonstrates complete session lifecycle
 */
class ThinPluginClient {
  private port: number;
  private token: string;
  private sessionId: string | null = null;

  constructor(port: number, token: string) {
    this.port = port;
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: object
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: this.port,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async createSession(
    agentRole: string,
    workflowRole: string,
    workItemId: string,
    spawnIntentId: string,
    parentSessionId?: string
  ): Promise<void> {
    const response = await request<any>('POST', '/session/create', {
      agentRole,
      workflowRole,
      workItemId,
      spawnIntentId,
      parentSessionId,
    });
    
    this.sessionId = response.session.sessionId;
    console.log(`Session created: ${this.sessionId}`);
  }

  async activateSession(spawnIntentId: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No session to activate');
    }

    await this.request('POST', '/session/activate', {
      sessionId: this.sessionId,
      spawnIntentId,
    });
    
    console.log(`Session activated: ${this.sessionId}`);
  }

  async terminateSession(): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No session to terminate');
    }

    await this.request('POST', '/session/terminate', {
      sessionId: this.sessionId,
    });
    
    console.log(`Session terminated: ${this.sessionId}`);
    this.sessionId = null;
  }

  async touchSession(): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No session to touch');
    }

    await this.request('POST', '/session/touch', {
      sessionId: this.sessionId,
    });
  }
}

// Usage
async function main() {
  // Read handshake file
  const handshake = await readHandshakeFile();
  
  const client = new ThinPluginClient(handshake.port, handshake.token);
  
  try {
    // Create session
    await client.createSession(
      'sf-orchestrator',
      'requirements-phase-executor',
      'task-123',
      'intent-abc'
    );
    
    // Activate session
    await client.activateSession('intent-abc');
    
    // Do work...
    
    // Terminate session
    await client.terminateSession();
  } catch (error) {
    console.error('Error:', error);
  }
}
```

---

## Event Handling (SSE)

### Subscribing to Events

```typescript
import * as http from 'http';

/**
 * Event types from the Daemon
 */
interface DaemonEvent {
  eventId: string;
  ts: number;
  projectId: string;
  action: string;
  payload: Record<string, unknown>;
  metadata: {
    schemaVersion: string;
    source: 'daemon' | 'client' | 'adapter';
  };
}

/**
 * SSE client for receiving real-time events
 */
class EventSubscriber {
  private port: number;
  private token: string;
  private eventSource: http.ClientRequest | null = null;

  constructor(port: number, token: string) {
    this.port = port;
    this.token = token;
  }

  subscribe(
    onEvent: (event: DaemonEvent) => void,
    onError: (error: Error) => void
  ): void {
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: this.port,
      path: '/events',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'text/event-stream',
      },
    };

    this.eventSource = http.request(options, (res) => {
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as DaemonEvent;
              onEvent(event);
            } catch (error) {
              console.error('Failed to parse event:', error);
            }
          }
        }
      });

      res.on('end', () => {
        console.log('SSE connection closed');
      });
    });

    this.eventSource.on('error', onError);
    this.eventSource.end();
  }

  close(): void {
    if (this.eventSource) {
      this.eventSource.destroy();
      this.eventSource = null;
    }
  }
}

// Usage
async function main() {
  const handshake = await readHandshakeFile();
  
  const subscriber = new EventSubscriber(handshake.port, handshake.token);
  
  subscriber.subscribe(
    (event) => {
      console.log(`Event: ${event.action}`);
      
      switch (event.action) {
        case 'session.created':
          console.log('  Session created:', event.payload.sessionId);
          break;
        case 'session.activated':
          console.log('  Session activated:', event.payload.sessionId);
          break;
        case 'session.terminated':
          console.log('  Session terminated:', event.payload.sessionId);
          break;
        case 'permission.denied':
          console.log('  Permission denied:', event.payload.reason);
          break;
        case 'recovery.repaired':
          console.log('  State repaired:', event.payload.description);
          break;
        default:
          console.log('  Unknown event:', event);
      }
    },
    (error) => {
      console.error('SSE error:', error);
    }
  );

  // Keep alive - in production, implement reconnection logic
  console.log('Listening for events...');
}
```

---

## Automatic Reconnection

```typescript
import * as http from 'http';

/**
 * Robust SSE client with automatic reconnection
 */
class ResilientEventSubscriber {
  private port: number;
  private token: string;
  private maxRetries = 5;
  private retryDelay = 1000;
  private currentRetry = 0;
  private eventSource: http.ClientRequest | null = null;
  private shouldReconnect = true;

  constructor(port: number, token: string) {
    this.port = port;
    this.token = token;
  }

  subscribe(
    onEvent: (event: any) => void,
    onError: (error: Error) => void
  ): void {
    this.doSubscribe(onEvent, onError);
  }

  private doSubscribe(onEvent: (event: any) => void, onError: (error: Error) => void): void {
    if (!this.shouldReconnect) {
      return;
    }

    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: this.port,
      path: '/events',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'text/event-stream',
      },
    };

    let buffer = '';

    this.eventSource = http.request(options, (res) => {
      // Reset retry count on successful connection
      this.currentRetry = 0;

      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              onEvent(event);
            } catch (error) {
              console.error('Failed to parse event:', error);
            }
          }
        }
      });

      res.on('end', () => {
        // Connection closed, attempt reconnection
        this.attemptReconnect(onEvent, onError);
      });
    });

    this.eventSource.on('error', (error) => {
      this.attemptReconnect(onEvent, onError);
    });

    this.eventSource.end();
  }

  private attemptReconnect(onEvent: (event: any) => void, onError: (error: Error) => void): void {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.currentRetry >= this.maxRetries) {
      onError(new Error('Max retries exceeded'));
      return;
    }

    this.currentRetry++;
    const delay = Math.min(this.retryDelay * Math.pow(2, this.currentRetry - 1), 30000);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.currentRetry})...`);
    
    setTimeout(() => {
      this.doSubscribe(onEvent, onError);
    }, delay);
  }

  close(): void {
    this.shouldReconnect = false;
    if (this.eventSource) {
      this.eventSource.destroy();
      this.eventSource = null;
    }
  }
}
```

---

## Project Locking

### Acquiring and Releasing Locks

```typescript
import * as http from 'http';

/**
 * Project lock management
 */
class ProjectLockManager {
  private port: number;
  private token: string;

  constructor(port: number, token: string) {
    this.port = port;
    this.token = token;
  }

  private async request<T>(path: string, method: string, body?: object): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: this.port,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async acquireLock(projectPath: string): Promise<string> {
    const response = await this.request<any>('/project/lock', 'POST', {
      projectPath,
    });
    
    return response.lock.id;
  }

  async releaseLock(projectPath: string, lockId: string): Promise<void> {
    await this.request(`/project/${encodeURIComponent(projectPath)}/lock`, 'DELETE', {
      lockId,
    });
  }
}

// Usage with automatic lock release
async function withProjectLock<T>(
  lockManager: ProjectLockManager,
  projectPath: string,
  operation: () => Promise<T>
): Promise<T> {
  const lockId = await lockManager.acquireLock(projectPath);
  
  try {
    return await operation();
  } finally {
    await lockManager.releaseLock(projectPath, lockId);
  }
}

// Example
async function main() {
  const handshake = await readHandshakeFile();
  const lockManager = new ProjectLockManager(handshake.port, handshake.token);
  
  const result = await withProjectLock(
    lockManager,
    '/path/to/project',
    async () => {
      console.log('Lock acquired, performing operation...');
      // Do work that requires exclusive access
      return { success: true };
    }
  );
  
  console.log('Lock released, result:', result);
}
```

---

## Work Item Processing

### Processing Work Items with Events

```typescript
import * as http from 'http';

/**
 * Work item processor with event handling
 */
class WorkItemProcessor {
  private port: number;
  private token: string;
  private eventSubscriber: ResilientEventSubscriber | null = null;

  constructor(port: number, token: string) {
    this.port = port;
    this.token = token;
  }

  private async request<T>(path: string, method: string, body?: object): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: this.port,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async processWorkItem(workItemId: string): Promise<void> {
    // Subscribe to work item events
    this.subscribeToWorkItemEvents(workItemId);
    
    // Start work item
    await this.request('/workitem/start', 'POST', {
      workItemId,
      workItemType: 'requirements-analysis',
    });
    
    // Process...
    console.log(`Processing work item: ${workItemId}`);
    
    // Complete work item
    await this.request('/workitem/complete', 'POST', {
      workItemId,
      result: 'success',
    });
    
    console.log(`Work item completed: ${workItemId}`);
  }

  private subscribeToWorkItemEvents(workItemId: string): void {
    this.eventSubscriber = new ResilientEventSubscriber(this.port, this.token);
    
    this.eventSubscriber.subscribe(
      (event) => {
        if (event.action === 'workitem.started' && event.payload.workItemId === workItemId) {
          console.log(`Work item started: ${workItemId}`);
        }
        
        if (event.action === 'workitem.completed' && event.payload.workItemId === workItemId) {
          console.log(`Work item completed: ${workItemId}`);
        }
        
        if (event.action === 'workitem.failed' && event.payload.workItemId === workItemId) {
          console.error(`Work item failed: ${workItemId}`, event.payload.error);
        }
      },
      (error) => {
        console.error('Event subscription error:', error);
      }
    );
  }

  close(): void {
    if (this.eventSubscriber) {
      this.eventSubscriber.close();
      this.eventSubscriber = null;
    }
  }
}
```

---

## Complete Thin Plugin Example

```typescript
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Complete Thin Plugin implementation
 * Demonstrates all integration patterns
 */
class ThinPlugin {
  private port: number;
  private token: string;
  private sessionId: string | null = null;
  private eventSubscriber: ResilientEventSubscriber | null = null;

  constructor() {
    this.port = 0;
    this.token = '';
  }

  /**
   * Initialize: Read handshake and connect to daemon
   */
  async initialize(): Promise<void> {
    const handshake = await this.readHandshakeFile();
    this.port = handshake.port;
    this.token = handshake.token;
    
    console.log(`Connected to daemon on port ${this.port}`);
  }

  /**
   * Read daemon handshake file
   */
  private async readHandshakeFile(): Promise<{ port: number; token: string }> {
    const handshakePath = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.specforge/runtime/daemon.sock.json'
    );
    
    const content = await fs.promises.readFile(handshakePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * HTTP request helper
   */
  private async request<T>(method: string, path: string, body?: object): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: this.port,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Start plugin: Create and activate session
   */
  async start(agentRole: string, workflowRole: string, workItemId: string): Promise<void> {
    // Create session
    const createResponse = await this.request<any>('POST', '/session/create', {
      agentRole,
      workflowRole,
      workItemId,
      spawnIntentId: `intent-${Date.now()}`,
    });
    
    this.sessionId = createResponse.session.sessionId;
    console.log(`Session created: ${this.sessionId}`);
    
    // Activate session
    await this.request('POST', '/session/activate', {
      sessionId: this.sessionId,
      spawnIntentId: createResponse.session.spawnIntentId,
    });
    
    console.log(`Session activated: ${this.sessionId}`);
    
    // Subscribe to events
    this.subscribeToEvents();
  }

  /**
   * Subscribe to daemon events
   */
  private subscribeToEvents(): void {
    this.eventSubscriber = new ResilientEventSubscriber(this.port, this.token);
    
    this.eventSubscriber.subscribe(
      (event) => {
        console.log(`[Event] ${event.action}:`, event.payload);
      },
      (error) => {
        console.error('[Event Error]', error.message);
      }
    );
    
    console.log('Subscribed to daemon events');
  }

  /**
   * Stop plugin: Terminate session and cleanup
   */
  async stop(): Promise<void> {
    if (this.eventSubscriber) {
      this.eventSubscriber.close();
      this.eventSubscriber = null;
    }

    if (this.sessionId) {
      await this.request('POST', '/session/terminate', {
        sessionId: this.sessionId,
      });
      
      console.log(`Session terminated: ${this.sessionId}`);
      this.sessionId = null;
    }
  }

  /**
   * Touch session to prevent idle timeout
   */
  async touch(): Promise<void> {
    if (this.sessionId) {
      await this.request('POST', '/session/touch', {
        sessionId: this.sessionId,
      });
    }
  }
}

// Main execution
async function main() {
  const plugin = new ThinPlugin();
  
  try {
    await plugin.initialize();
    
    await plugin.start(
      'sf-orchestrator',
      'requirements-phase-executor',
      'task-123'
    );
    
    // Plugin is running - do actual work here
    
    // Touch periodically to prevent idle timeout
    setInterval(() => {
      plugin.touch().catch(console.error);
    }, 25000); // Every 25 seconds (before 30s timeout)
    
  } catch (error) {
    console.error('Plugin error:', error);
    process.exit(1);
  }
}

// Export for module usage
export { ThinPlugin };
```

---

## TypeScript Types

### Recommended Type Definitions

```typescript
// types/daemon.ts

export interface Handshake {
  port: number;
  token: string;
  pid: number;
  schemaVersion: string;
}

export interface Session {
  sessionId: string;
  agentRole: string;
  workflowRole: string;
  status: 'pending' | 'active' | 'history';
  createdAt: number;
  lastActiveAt?: number;
  workItemId?: string;
  spawnIntentId?: string;
  parentSessionId?: string;
}

export interface DaemonEvent {
  eventId: string;
  ts: number;
  projectId: string;
  action: string;
  payload: Record<string, unknown>;
  metadata: {
    schemaVersion: string;
    source: 'daemon' | 'client' | 'adapter';
  };
}

export interface Lock {
  id: string;
  projectPath: string;
  acquiredAt: number;
  expiresAt: number;
}

export interface DaemonStatus {
  status: 'running' | 'stopped';
  pid: number;
  startedAt: number;
  uptime: number;
  activeProjects: number;
  activeSessions: number;
}
```

---

## Error Handling Best Practices

```typescript
/**
 * Robust error handling for Thin Plugin
 */
class RobustThinPlugin {
  private maxRetries = 3;
  private retryDelay = 1000;

  async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on auth errors
        if (this.isAuthError(error)) {
          throw error;
        }
        
        // Don't retry on not found errors
        if (this.isNotFoundError(error)) {
          throw error;
        }
        
        console.warn(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * attempt);
        }
      }
    }
    
    throw lastError;
  }

  private isAuthError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('401');
  }

  private isNotFoundError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('404');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```