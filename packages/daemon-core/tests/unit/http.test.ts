/**
 * HTTP Server authentication and register endpoint tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HTTPServer, HTTPServerDeps } from '../../src/http/HTTPServer';
import { EventBus } from '../../src/event-bus/EventBus';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { HandshakeManager } from '../../src/daemon/HandshakeManager';
import { WALWriteError } from '../../src/session/SessionRegistry';
import * as http from 'http';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

describe('HTTPServer Authentication', () => {
  let server: HTTPServer;
  let eventBus: EventBus;
  let config: DaemonConfig;
  let handshakeManager: HandshakeManager;
  let token: string;

  beforeEach(async () => {
    config = new DaemonConfig();
    eventBus = new EventBus();
    handshakeManager = new HandshakeManager(config);
    
    // Write handshake with a generated token
    token = handshakeManager.generateToken();
    await handshakeManager.writeHandshake(process.pid, 0, token);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    await handshakeManager.cleanup();
  });

  it('should return 401 for missing authorization header', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    
    await server.start();
    
    const result = await makeRequest(server, {
      method: 'GET',
      path: '/',
      headers: {},
    });
    
    expect(result.statusCode).toBe(401);
    expect(result.body).toContain('Unauthorized');
  });

  it('should return 401 for invalid authorization header', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    
    await server.start();
    
    const result = await makeRequest(server, {
      method: 'GET',
      path: '/',
      headers: {
        authorization: 'Bearer invalid-token',
      },
    });
    
    expect(result.statusCode).toBe(401);
    expect(result.body).toContain('Unauthorized');
  });

  it('should return 401 for missing Bearer prefix', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    
    await server.start();
    
    const result = await makeRequest(server, {
      method: 'GET',
      path: '/',
      headers: {
        authorization: token,
      },
    });
    
    expect(result.statusCode).toBe(401);
  });

  it('should return 200 for valid Bearer token', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    
    await server.start();
    
    const result = await makeRequest(server, {
      method: 'GET',
      path: '/',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('ok');
  });

  it('should record permission denied events', async () => {
    // Create a new event bus for this test
    const testEventBus = new EventBus();
    testEventBus.start(); // Start the event bus
    
    server = new HTTPServer(config, testEventBus);
    server.setToken(token);
    
    await server.start();
    
    // Subscribe after server starts (but before making request)
    const events: any[] = [];
    testEventBus.subscribe('permission.denied', (event) => {
      events.push(event);
    });
    
    // Make a request without authorization
    await makeRequest(server, {
      method: 'GET',
      path: '/',
      headers: {},
    });
    
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].action).toBe('permission.denied');
    expect(events[0].payload.reason).toBe('Missing or invalid Authorization header');
  });

  it('should return 413 for payload exceeding 64 KiB', async () => {
    // Create a new handshake manager for this test
    const testHandshakeManager = new HandshakeManager(config);
    const testToken = testHandshakeManager.generateToken();
    await testHandshakeManager.writeHandshake(process.pid, 0, testToken);
    
    server = new HTTPServer(config, eventBus);
    server.setToken(testToken);
    
    await server.start();
    
    // Create payload larger than 64 KiB
    const largePayload = 'x'.repeat(65 * 1024);
    
    const result = await makeRequest(server, {
      method: 'POST',
      path: '/',
      headers: {
        authorization: `Bearer ${testToken}`,
        'Content-Type': 'text/plain',
        'Content-Length': largePayload.length.toString(),
      },
      body: largePayload,
    });
    
    expect(result.statusCode).toBe(413);
    expect(result.body).toContain('Payload Too Large');
    
    // Parse response to verify CAS reference is included
    const response = JSON.parse(result.body);
    expect(response.casReference).toBeDefined();
    expect(response.casReference.type).toBe('cas-blob');
    expect(typeof response.casReference.hash).toBe('string');
    expect(response.casReference.hash.length).toBeGreaterThan(0);
    expect(response.casReference.reference).toContain('blob://');
    
    // Cleanup
    await testHandshakeManager.cleanup();
  });
});

describe('HTTPServer Register Endpoint', () => {
  let server: HTTPServer;
  let eventBus: EventBus;
  let config: DaemonConfig;
  let handshakeManager: HandshakeManager;
  let token: string;
  let mockProjectManager: any;
  let mockSessionRegistry: any;
  let registeredProjects: Map<string, any>;
  let registeredSessions: Map<string, any>;

  beforeEach(async () => {
    config = new DaemonConfig();
    eventBus = new EventBus();
    handshakeManager = new HandshakeManager(config);
    
    token = handshakeManager.generateToken();
    await handshakeManager.writeHandshake(process.pid, 0, token);

    // Reset mock state
    registeredProjects = new Map();
    registeredSessions = new Map();

    // Mock ProjectManager
    mockProjectManager = {
      registerProject: async (projectPath: string) => {
        const existing = registeredProjects.get(projectPath);
        if (existing) return existing;
        
        const ctx = {
          projectId: `proj-${registeredProjects.size + 1}`,
          projectPath,
          dataDir: projectPath,
          schemaVersion: '1.0',
          activeSessions: [],
          workItems: [],
          lastEventId: '',
          lastEventTs: 0,
        };
        registeredProjects.set(projectPath, ctx);
        return ctx;
      },
    };

    // Mock SessionRegistry with idempotent registerPluginSession
    mockSessionRegistry = {
      registerPluginSession: (projectId: string, projectPath: string) => {
        // Idempotency: check existing
        const existingSessionId = registeredSessions.get(projectPath);
        if (existingSessionId) {
          return {
            sessionId: existingSessionId,
            agentRole: 'plugin',
            workflowRole: 'plugin-daemon-bridge',
          };
        }

        const sessionId = `session-${registeredSessions.size + 1}-${Date.now()}`;
        registeredSessions.set(projectPath, sessionId);
        return {
          sessionId,
          agentRole: 'plugin',
          workflowRole: 'plugin-daemon-bridge',
          projectId,
        };
      },
    };

    // Build deps for the server
    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: undefined as any,
      wal: undefined as any,
      projectManager: mockProjectManager,
      sessionRegistry: mockSessionRegistry,
    };

    server = new HTTPServer(deps);
    server.setToken(token);
    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    await handshakeManager.cleanup();
  });

  it('should return 400 for invalid JSON body', async () => {
    const result = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/ingest/register',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: 'not-json',
    });

    expect(result.statusCode).toBe(400);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(false);
    expect(response.error.code).toBe('INVALID_JSON');
  });

  it('should return 400 for missing projectPath', async () => {
    const result = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/ingest/register',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(result.statusCode).toBe(400);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(false);
    expect(response.error.code).toBe('MISSING_PROJECT_PATH');
  });

  it('should return 200 with sessionId and projectId on successful register', async () => {
    const projectPath = path.join(os.tmpdir(), 'test-project-register');
    await fs.mkdir(projectPath, { recursive: true });

    try {
      const result = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/ingest/register',
        headers: {
          authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectPath }),
      });

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.success).toBe(true);
      expect(response.data.sessionId).toBeTruthy();
      expect(response.data.projectId).toBeTruthy();
      expect(response.data.mode).toBe('personal');
      expect(typeof response.data.sessionId).toBe('string');
    } finally {
      await fs.rm(projectPath, { recursive: true, force: true });
    }
  });

  it('should be idempotent - same projectPath returns same sessionId', async () => {
    const projectPath = path.join(os.tmpdir(), 'test-project-idempotent');
    await fs.mkdir(projectPath, { recursive: true });

    try {
      // First registration
      const result1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/ingest/register',
        headers: {
          authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectPath }),
      });
      expect(result1.statusCode).toBe(200);
      const response1 = JSON.parse(result1.body);
      const sessionId1 = response1.data.sessionId;

      // Second registration with same projectPath
      const result2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/ingest/register',
        headers: {
          authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectPath }),
      });
      expect(result2.statusCode).toBe(200);
      const response2 = JSON.parse(result2.body);
      const sessionId2 = response2.data.sessionId;

      // Should return the same sessionId
      expect(sessionId2).toBe(sessionId1);
    } finally {
      await fs.rm(projectPath, { recursive: true, force: true });
    }
  });

  it('should require authentication', async () => {
    const result = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/ingest/register',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectPath: '/tmp/test' }),
    });

    expect(result.statusCode).toBe(401);
  });
});

describe('HTTPServer Ingest Event Endpoint', () => {
  let server: HTTPServer;
  let eventBus: EventBus;
  let config: DaemonConfig;
  let handshakeManager: HandshakeManager;
  let token: string;
  let mockProjectManager: any;
  let mockSessionRegistry: any;
  let mockEventLogger: any;
  let mockPermissionEngine: any;
  let mockRecoverySubsystem: any;
  let loggedEvents: any[];
  let permissionEvaluations: any[];
  let openCodeEvents: any[];
  let checkpoints: Map<string, unknown>;
  let projectPathMap: Map<string, string>;
  let touchedSessions: string[];

  beforeEach(async () => {
    config = new DaemonConfig();
    eventBus = new EventBus();
    handshakeManager = new HandshakeManager(config);

    token = handshakeManager.generateToken();
    await handshakeManager.writeHandshake(process.pid, 0, token);

    // Reset tracking state
    loggedEvents = [];
    permissionEvaluations = [];
    openCodeEvents = [];
    checkpoints = new Map();
    projectPathMap = new Map();
    touchedSessions = [];

    // Mock EventLogger
    mockEventLogger = {
      append: async (event: any) => {
        loggedEvents.push(event);
      },
    };

    // Mock PermissionEngine (phase 1: only log, don't intercept)
    mockPermissionEngine = {
      evaluate: async (params: any) => {
        permissionEvaluations.push(params);
        return { decision: 'allow' };
      },
      checkPermission: async (sessionId: string, action: string, tool: string, context: any) => {
        permissionEvaluations.push({ sessionId, action, tool, ...context });
        return { decision: 'allow' };
      },
    };

    // Mock RecoverySubsystem
    mockRecoverySubsystem = {
      saveCheckpoint: async (sessionId: string, data: unknown) => {
        checkpoints.set(sessionId, data);
      },
    };

    // Mock SessionRegistry with full interface
    mockSessionRegistry = {
      registerPluginSession: (projectId: string, projectPath: string) => {
        const existingSessionId = projectPathMap.get(projectPath);
        if (existingSessionId) {
          return { sessionId: existingSessionId, agentRole: 'plugin', workflowRole: 'plugin-daemon-bridge' };
        }
        const sessionId = `session-${projectPathMap.size + 1}-${Date.now()}`;
        projectPathMap.set(projectPath, sessionId);
        return { sessionId, agentRole: 'plugin', workflowRole: 'plugin-daemon-bridge', projectId };
      },
      touch: (sessionId: string) => {
        touchedSessions.push(sessionId);
        return null;
      },
      getProjectPath: (sessionId: string) => {
        // Find the projectPath for this sessionId
        for (const [path, sid] of projectPathMap) {
          if (sid === sessionId) return path;
        }
        return null;
      },
      handleOpenCodeEvent: (subType: string, data: Record<string, unknown>) => {
        openCodeEvents.push({ subType, data });
      },
    };

    // Mock ProjectManager
    mockProjectManager = {
      registerProject: async (projectPath: string) => {
        return {
          projectId: `proj-mock-1`,
          projectPath,
          dataDir: projectPath,
          schemaVersion: '1.0',
          activeSessions: [],
          workItems: [],
          lastEventId: '',
          lastEventTs: 0,
        };
      },
    };

    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: undefined as any,
      wal: undefined as any,
      projectManager: mockProjectManager,
      sessionRegistry: mockSessionRegistry,
      permissionEngine: mockPermissionEngine,
      eventLogger: mockEventLogger,
      recoverySubsystem: mockRecoverySubsystem,
    };

    server = new HTTPServer(deps);
    server.setToken(token);
    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    await handshakeManager.cleanup();
  });

  // Helper to send an ingest event
  async function sendEvent(sessionId: string, eventType: string, data: unknown = {}) {
    return makeRequest(server, {
      method: 'POST',
      path: '/api/v1/ingest/event',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        type: eventType,
        data,
        ts: Date.now(),
      }),
    });
  }

  it('should return 400 for invalid JSON', async () => {
    const result = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/ingest/event',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: 'not-json',
    });

    expect(result.statusCode).toBe(400);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(false);
    expect(response.error.code).toBe('INVALID_JSON');
  });

  it('should handle tool.invoking event', async () => {
    const result = await sendEvent('test-session-1', 'tool.invoking', {
      tool: 'bash',
      callID: 'call-123',
      args: { command: 'ls' },
    });

    expect(result.statusCode).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(true);
    expect(response.data.received).toBe(true);
    expect(response.data.type).toBe('tool.invoking');

    // Verify PermissionEngine was called
    expect(permissionEvaluations.length).toBe(1);
    expect(permissionEvaluations[0].tool).toBe('bash');

    // Verify SessionRegistry.touch was called
    expect(touchedSessions).toContain('test-session-1');

    // Verify event was logged (phase 1)
    const permissionEvents = loggedEvents.filter(e => e.action === 'permission.evaluated');
    expect(permissionEvents.length).toBe(1);
  });

  it('should handle tool.invoked event', async () => {
    const result = await sendEvent('test-session-2', 'tool.invoked', {
      tool: 'bash',
      callID: 'call-456',
      output: 'success',
    });

    expect(result.statusCode).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(true);
    expect(response.data.received).toBe(true);

    // Verify EventLogger was called
    const invokedEvents = loggedEvents.filter(e => e.action === 'tool.invoked');
    expect(invokedEvents.length).toBe(1);
    expect(invokedEvents[0].payload.tool).toBe('bash');
  });

  it('should handle opencode.event', async () => {
    const result = await sendEvent('test-session-3', 'opencode.event', {
      subType: 'session.idle',
      sessionID: 'test-session-3',
    });

    expect(result.statusCode).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(true);

    // Verify SessionRegistry.handleOpenCodeEvent was called
    expect(openCodeEvents.length).toBe(1);
    expect(openCodeEvents[0].subType).toBe('session.idle');
  });

  it('should handle session.compacting event', async () => {
    const result = await sendEvent('test-session-4', 'session.compacting', {
      checkpoint: 'snapshot-data',
    });

    expect(result.statusCode).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(true);

    // Verify RecoverySubsystem.saveCheckpoint was called
    expect(checkpoints.has('test-session-4')).toBe(true);
    expect(checkpoints.get('test-session-4')).toEqual({ checkpoint: 'snapshot-data' });
  });

  it('should handle chat.params event', async () => {
    const result = await sendEvent('test-session-5', 'chat.params', {
      model: 'gpt-4',
      temperature: 0.7,
    });

    expect(result.statusCode).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(true);

    // Verify EventLogger was called
    const chatParamsEvents = loggedEvents.filter(e => e.action === 'chat.params');
    expect(chatParamsEvents.length).toBe(1);
    expect(chatParamsEvents[0].payload.params.model).toBe('gpt-4');
  });

  it('should handle chat.headers event', async () => {
    const result = await sendEvent('test-session-6', 'chat.headers', {
      'User-Agent': 'SpecForge/1.0',
    });

    expect(result.statusCode).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(true);

    // Verify EventLogger was called
    const chatHeadersEvents = loggedEvents.filter(e => e.action === 'chat.headers');
    expect(chatHeadersEvents.length).toBe(1);
    expect(chatHeadersEvents[0].payload.headers['User-Agent']).toBe('SpecForge/1.0');
  });

  it('should handle shell.env event and return env vars', async () => {
    const result = await sendEvent('test-session-7', 'shell.env', {});

    expect(result.statusCode).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(true);
    expect(response.data.received).toBe(true);
    expect(response.data.type).toBe('shell.env');

    // Verify env vars are returned
    expect(response.data.env).toBeDefined();
    expect(response.data.env.SPECFORGE_DAEMON_PORT).toBeDefined();
    expect(response.data.env.SPECFORGE_SESSION_ID).toBe('test-session-7');
    expect(response.data.env.SPECFORGE_MODE).toBe('personal');
  });

  it('should handle events without sessionId (backward compatibility)', async () => {
    const result = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/ingest/event',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'tool.invoked',
        data: { tool: 'read_file' },
        ts: Date.now(),
      }),
    });

    expect(result.statusCode).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(true);
    expect(response.data.received).toBe(true);
  });

  it('should handle unknown event type with grace', async () => {
    const result = await sendEvent('test-session-8', 'unknown.event.type', {});

    expect(result.statusCode).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(true);
    expect(response.data.received).toBe(true);
  });

  it('should return 200 even when subsystem fails', async () => {
    // Replace permissionEngine with one that throws
    const failingPE = {
      evaluate: async () => { throw new Error('Permission engine crashed'); },
    };
    // Create new server with failing deps
    const failingDeps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: undefined as any,
      wal: undefined as any,
      projectManager: mockProjectManager,
      sessionRegistry: mockSessionRegistry,
      permissionEngine: failingPE,
      eventLogger: mockEventLogger,
      recoverySubsystem: mockRecoverySubsystem,
    };
    const failingServer = new HTTPServer(failingDeps);
    failingServer.setToken(token);
    await failingServer.start();

    try {
      const result = await makeRequest(failingServer, {
        method: 'POST',
        path: '/api/v1/ingest/event',
        headers: {
          authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: 'test-session',
          type: 'tool.invoking',
          data: { tool: 'bash', callID: 'c1', args: {} },
          ts: Date.now(),
        }),
      });

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.success).toBe(true);
      expect(response.data.received).toBe(true);
    } finally {
      await failingServer.stop();
    }
  });

  it('should require authentication', async () => {
    const result = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/ingest/event',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'test',
        type: 'tool.invoked',
        data: {},
        ts: Date.now(),
      }),
    });

    expect(result.statusCode).toBe(401);
  });
});

describe('HTTPServer WALWriteError fail-fast', () => {
  let server: HTTPServer;
  let config: DaemonConfig;
  let eventBus: EventBus;
  let handshakeManager: HandshakeManager;
  let token: string;

  beforeEach(async () => {
    config = new DaemonConfig();
    eventBus = new EventBus();
    handshakeManager = new HandshakeManager(config);
    token = handshakeManager.generateToken();
    await handshakeManager.writeHandshake(process.pid, 0, token);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    await handshakeManager.cleanup();
  });

  it('handleIngestEvent should return 503 with Retry-After on WALWriteError from opencode.event', async () => {
    const mockSessionRegistry = {
      handleOpenCodeEvent: async () => {
        throw new WALWriteError('disk full', new Error('enospc'));
      },
      getProjectPath: () => '',
    };
    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: undefined as any,
      wal: undefined as any,
      sessionRegistry: mockSessionRegistry,
    };
    server = new HTTPServer(deps);
    server.setToken(token);
    await server.start();

    const result = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/ingest/event',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'test-session-wal',
        type: 'opencode.event',
        data: { subType: 'session.idle' },
        ts: Date.now(),
      }),
    });

    expect(result.statusCode).toBe(503);
    const response = JSON.parse(result.body);
    expect(response.error).toBe('WAL_WRITE_FAILED');
    expect(response.message).toContain('WAL write failed');
    expect(result.headers['retry-after']).toBe('5');
  });

  it('handleIngestEvent should return 200 on non-WALWriteError (existing behavior)', async () => {
    const mockSessionRegistry = {
      handleOpenCodeEvent: async () => {
        throw new Error('some other error');
      },
      getProjectPath: () => '',
    };
    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: undefined as any,
      wal: undefined as any,
      sessionRegistry: mockSessionRegistry,
    };
    server = new HTTPServer(deps);
    server.setToken(token);
    await server.start();

    const result = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/ingest/event',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'test-session-other',
        type: 'opencode.event',
        data: { subType: 'session.idle' },
        ts: Date.now(),
      }),
    });

    // Non-WALWriteError from handleOpenCodeEvent is caught & warned internally,
    // so the ingest endpoint still returns 200 success (no warning in response).
    expect(result.statusCode).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(true);
    expect(response.data.received).toBe(true);
  });

  it('handleIngestRegister should return 503 with Retry-After on WALWriteError', async () => {
    const mockSessionRegistry = {
      registerPluginSession: () => {
        throw new WALWriteError('wal error', new Error('cause'));
      },
    };
    const mockProjectManager = {
      registerProject: async () => ({
        projectId: 'proj-1',
        projectPath: '/tmp/test',
        dataDir: '/tmp/test',
        schemaVersion: '1.0',
        activeSessions: [],
        workItems: [],
        lastEventId: '',
        lastEventTs: 0,
      }),
    };
    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: undefined as any,
      wal: undefined as any,
      projectManager: mockProjectManager,
      sessionRegistry: mockSessionRegistry,
    };
    server = new HTTPServer(deps);
    server.setToken(token);
    await server.start();

    const projectPath = path.join(os.tmpdir(), 'test-project-wal-register');
    await fs.mkdir(projectPath, { recursive: true });

    try {
      const result = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/ingest/register',
        headers: {
          authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectPath }),
      });

      expect(result.statusCode).toBe(503);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('WAL_WRITE_FAILED');
      expect(response.message).toContain('WAL write failed');
      expect(result.headers['retry-after']).toBe('5');
    } finally {
      await fs.rm(projectPath, { recursive: true, force: true });
    }
  });

  it('handleIngestRegister should return 500 on non-WALWriteError (existing behavior)', async () => {
    const mockSessionRegistry = {
      registerPluginSession: () => {
        throw new Error('other error');
      },
    };
    const mockProjectManager = {
      registerProject: async () => ({
        projectId: 'proj-1',
        projectPath: '/tmp/test',
        dataDir: '/tmp/test',
        schemaVersion: '1.0',
        activeSessions: [],
        workItems: [],
        lastEventId: '',
        lastEventTs: 0,
      }),
    };
    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: undefined as any,
      wal: undefined as any,
      projectManager: mockProjectManager,
      sessionRegistry: mockSessionRegistry,
    };
    server = new HTTPServer(deps);
    server.setToken(token);
    await server.start();

    const projectPath = path.join(os.tmpdir(), 'test-project-other-register');
    await fs.mkdir(projectPath, { recursive: true });

    try {
      const result = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/ingest/register',
        headers: {
          authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectPath }),
      });

      expect(result.statusCode).toBe(500);
    } finally {
      await fs.rm(projectPath, { recursive: true, force: true });
    }
  });

  it('handleToolInvoking touch WALWriteError should be non-critical (200 response)', async () => {
    const touchedSessions: string[] = [];
    const mockSessionRegistry = {
      touch: async () => {
        throw new WALWriteError('touch wal fail', new Error('cause'));
      },
      getProjectPath: () => '',
    };
    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: undefined as any,
      wal: undefined as any,
      sessionRegistry: mockSessionRegistry,
    };
    server = new HTTPServer(deps);
    server.setToken(token);
    await server.start();

    const result = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/ingest/event',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'test-session-touch-wal',
        type: 'tool.invoking',
        data: { tool: 'read_file', callID: 'c1', args: {} },
        ts: Date.now(),
      }),
    });

    // Touch failure is non-critical → should still return 200
    expect(result.statusCode).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.success).toBe(true);
    expect(response.data.received).toBe(true);
  });
});

/**
 * Helper function to make HTTP requests to the test server
 */
function makeRequest(
  server: HTTPServer,
  options: {
    method: string;
    path: string;
    headers?: http.OutgoingHttpHeaders;
    body?: string;
  }
): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const port = (server as any).port;
    
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method,
        headers: options.headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body,
            headers: res.headers,
          });
        });
      }
    );
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}
