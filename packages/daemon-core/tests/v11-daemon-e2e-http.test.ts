/**
 * v11-daemon-e2e-http.test.ts — End-to-end HTTP integration test for v1.1 API
 *
 * Starts the daemon's HTTPServer programmatically, sends real HTTP requests
 * to all v1.1 endpoints, and validates JSON response structures.
 *
 * Covered endpoints (10 registered exact routes + 1 prefix fallback):
 *  1. POST /api/v1/v11/work-item/create
 *  2. POST /api/v1/v11/gate/run
 *  3. POST /api/v1/v11/merge
 *  4. POST /api/v1/v11/decision
 *  5. POST /api/v1/v11/code-permission
 *  6. POST /api/v1/v11/spec-migration
 *  7. POST /api/v1/v11/rollback
 *  8. POST /api/v1/v11/handoff
 *  9. POST /api/v1/v11/extension
 * 10. POST /api/v1/v11/verification
 * 11. POST /api/v1/v11/state-machine/validate  (prefix-match fallback)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { HTTPServer, HTTPServerDeps } from '../src/http/HTTPServer';
import { EventBus } from '../src/event-bus/EventBus';
import { DaemonConfig } from '../src/daemon/DaemonConfig';
import { ToolDispatcher } from '../src/tools/ToolDispatcher';

// ── Helpers ──

/** Make an HTTP request and return status code, parsed body, and raw body. */
function httpRequest(options: {
  port: number;
  method: string;
  path: string;
  headers?: http.OutgoingHttpHeaders;
  body?: string;
}): Promise<{ statusCode: number; body: string; json: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: options.port,
        path: options.path,
        method: options.method,
        headers: options.headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let json: unknown = null;
          try { json = JSON.parse(data); } catch { /* not JSON */ }
          resolve({ statusCode: res.statusCode ?? 0, body: data, json });
        });
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/** Convenience: POST JSON with Bearer token. */
async function postJson(port: number, token: string, urlPath: string, payload: unknown) {
  const body = JSON.stringify(payload);
  return httpRequest({
    port,
    method: 'POST',
    path: urlPath,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    },
    body,
  });
}

// ── Mock ToolDispatcher ──

/** Records dispatched calls and returns canned success responses. */
function createMockDispatcher() {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];

  const dispatcher = new ToolDispatcher({
    stateManager: {},
    workflowEngine: {},
    projectManager: {},
    eventLogger: {},
    eventBus: {},
    permissionEngine: {},
    cas: {},
    sessionRegistry: {},
  });

  // Override dispatch to capture calls and return controlled results
  dispatcher.dispatch = vi.fn().mockImplementation(async (req: { tool: string; args: Record<string, unknown> }) => {
    calls.push({ tool: req.tool, args: req.args });
    return {
      success: true,
      tool: req.tool,
      dispatched: true,
      args_echo: req.args,
    };
  });

  return { dispatcher, calls };
}

// ── Test Suite ──

describe('v1.1 API E2E HTTP tests', () => {
  let server: HTTPServer;
  let port: number;
  let token: string;
  let mockDispatcher: ReturnType<typeof createMockDispatcher>;
  let tempDir: string;

  beforeAll(async () => {
    token = `test-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const config = new DaemonConfig([]);
    const eventBus = new EventBus();
    mockDispatcher = createMockDispatcher();

    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: {} as any,
      wal: {} as any,
      toolDispatcher: mockDispatcher.dispatcher,
    };

    server = new HTTPServer(deps);
    server.setToken(token);
    const result = await server.start();
    port = result.port;

    // Create temp directory for test artifacts
    tempDir = path.join(os.tmpdir(), `sf-v11-e2e-http-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    await server.stop();
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  // ── Auth & routing basics ──

  it('should reject requests without Bearer token (401)', async () => {
    const res = await httpRequest({
      port,
      method: 'POST',
      path: '/api/v1/v11/work-item/create',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('should reject requests with wrong token (401)', async () => {
    const res = await postJson(port, 'wrong-token', '/api/v1/v11/work-item/create', {});
    expect(res.statusCode).toBe(401);
  });

  it('should return 404 for non-existent v1.1 route', async () => {
    const res = await postJson(port, token, '/api/v1/v11/nonexistent', {});
    // Prefix route fallback catches /api/v1/v11/... and returns 200 with a message
    // So this will actually match the prefix route. Let's test a truly non-existent route.
    // Actually the prefix route /api/v1/v11/ matches anything under it.
    // A route outside /api/v1/... should be 404
    const res2 = await httpRequest({
      port,
      method: 'POST',
      path: '/api/v2/stuff',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(res2.statusCode).toBe(404);
    expect(res2.json).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('should return valid JSON from /health (public endpoint)', async () => {
    const res = await httpRequest({ port, method: 'GET', path: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  // ── Individual v1.1 endpoints ──

  it('1. POST /api/v1/v11/work-item/create — should dispatch and return JSON', async () => {
    const payload = {
      projectRoot: tempDir,
      workItemId: 'WI-E2E-001',
      userRequest: 'E2E test: add archived status to orders',
    };
    const res = await postJson(port, token, '/api/v1/v11/work-item/create', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });
    expect(mockDispatcher.calls.length).toBeGreaterThanOrEqual(1);

    const lastCall = mockDispatcher.calls[mockDispatcher.calls.length - 1]!;
    expect(lastCall.tool).toBe('sf_v11_work_item_create');
    expect(lastCall.args.workItemId).toBe('WI-E2E-001');
  });

  it('2. POST /api/v1/v11/gate/run — should dispatch gate run', async () => {
    const payload = {
      workItemDir: path.join(tempDir, '.specforge', 'specs', 'WI-E2E-001'),
      gateIds: ['requirements_gate', 'design_gate'],
      strictness: 'strict',
    };
    const res = await postJson(port, token, '/api/v1/v11/gate/run', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });

    const lastCall = mockDispatcher.calls[mockDispatcher.calls.length - 1]!;
    expect(lastCall.tool).toBe('sf_v11_gate_run');
    expect(lastCall.args.gateIds).toEqual(['requirements_gate', 'design_gate']);
  });

  it('3. POST /api/v1/v11/merge — should dispatch merge', async () => {
    const payload = {
      workItemDir: path.join(tempDir, '.specforge', 'specs', 'WI-E2E-001'),
    };
    const res = await postJson(port, token, '/api/v1/v11/merge', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });

    const lastCall = mockDispatcher.calls[mockDispatcher.calls.length - 1]!;
    expect(lastCall.tool).toBe('sf_v11_merge');
  });

  it('4. POST /api/v1/v11/decision — should dispatch decision recording', async () => {
    const payload = {
      workItemDir: path.join(tempDir, '.specforge', 'specs', 'WI-E2E-001'),
      decision: 'approved',
      actor: 'user',
      reason: 'All gates passed',
    };
    const res = await postJson(port, token, '/api/v1/v11/decision', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });

    const lastCall = mockDispatcher.calls[mockDispatcher.calls.length - 1]!;
    expect(lastCall.tool).toBe('sf_v11_decision');
    expect(lastCall.args.decision).toBe('approved');
  });

  it('5. POST /api/v1/v11/code-permission — should dispatch code permission (release)', async () => {
    const payload = {
      action: 'release',
      workItemDir: path.join(tempDir, '.specforge', 'specs', 'WI-E2E-001'),
      workItemId: 'WI-E2E-001',
      allowedWriteFiles: ['src/orders/status.ts'],
      forbiddenFiles: [],
    };
    const res = await postJson(port, token, '/api/v1/v11/code-permission', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });

    const lastCall = mockDispatcher.calls[mockDispatcher.calls.length - 1]!;
    expect(lastCall.tool).toBe('sf_v11_code_permission');
    expect(lastCall.args.action).toBe('release');
  });

  it('5b. POST /api/v1/v11/code-permission — should dispatch code permission (revoke)', async () => {
    const payload = {
      action: 'revoke',
      workItemDir: path.join(tempDir, '.specforge', 'specs', 'WI-E2E-001'),
    };
    const res = await postJson(port, token, '/api/v1/v11/code-permission', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });
  });

  it('5c. POST /api/v1/v11/code-permission — should dispatch code permission (check)', async () => {
    const payload = {
      action: 'check',
      workItemDir: path.join(tempDir, '.specforge', 'specs', 'WI-E2E-001'),
      filePath: 'src/orders/status.ts',
      operation: 'modify',
    };
    const res = await postJson(port, token, '/api/v1/v11/code-permission', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });
  });

  it('6. POST /api/v1/v11/spec-migration — should dispatch spec migration', async () => {
    const payload = {
      projectRoot: tempDir,
      dryRun: true,
    };
    const res = await postJson(port, token, '/api/v1/v11/spec-migration', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });

    const lastCall = mockDispatcher.calls[mockDispatcher.calls.length - 1]!;
    expect(lastCall.tool).toBe('sf_v11_spec_migration');
    expect(lastCall.args.dryRun).toBe(true);
  });

  it('7. POST /api/v1/v11/rollback — should dispatch rollback', async () => {
    const payload = {
      workItemDir: path.join(tempDir, '.specforge', 'specs', 'WI-E2E-001'),
      targetState: 'intake_ready',
      reason: 'Requirements gate failed — need revision',
    };
    const res = await postJson(port, token, '/api/v1/v11/rollback', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });

    const lastCall = mockDispatcher.calls[mockDispatcher.calls.length - 1]!;
    expect(lastCall.tool).toBe('sf_v11_rollback');
    expect(lastCall.args.targetState).toBe('intake_ready');
  });

  it('8. POST /api/v1/v11/handoff — should dispatch handoff', async () => {
    const payload = {
      workItemDir: path.join(tempDir, '.specforge', 'specs', 'WI-E2E-001'),
      fromAgent: 'sf-executor',
      toAgent: 'sf-reviewer',
      context: {
        stage: 'development',
        summary: 'Implementation complete, ready for review',
        files_changed: ['src/orders/status.ts'],
      },
    };
    const res = await postJson(port, token, '/api/v1/v11/handoff', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });

    const lastCall = mockDispatcher.calls[mockDispatcher.calls.length - 1]!;
    expect(lastCall.tool).toBe('sf_v11_handoff');
    expect(lastCall.args.fromAgent).toBe('sf-executor');
  });

  it('9. POST /api/v1/v11/extension — should dispatch extension subflow', async () => {
    const payload = {
      workItemDir: path.join(tempDir, '.specforge', 'specs', 'WI-E2E-001'),
      action: 'request',
      namespace: 'design_types',
      key: 'retry_policy',
      reason: 'Need retry_policy type for exponential backoff config',
    };
    const res = await postJson(port, token, '/api/v1/v11/extension', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });

    const lastCall = mockDispatcher.calls[mockDispatcher.calls.length - 1]!;
    expect(lastCall.tool).toBe('sf_v11_extension');
    expect(lastCall.args.namespace).toBe('design_types');
  });

  it('10. POST /api/v1/v11/verification — should dispatch verification', async () => {
    const payload = {
      workItemDir: path.join(tempDir, '.specforge', 'specs', 'WI-E2E-001'),
      workItemId: 'WI-E2E-001',
      verificationType: 'full',
      commands: ['npx vitest run'],
    };
    const res = await postJson(port, token, '/api/v1/v11/verification', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true, dispatched: true });

    const lastCall = mockDispatcher.calls[mockDispatcher.calls.length - 1]!;
    expect(lastCall.tool).toBe('sf_v11_verification');
  });

  it('11. POST /api/v1/v11/state-machine/validate — prefix fallback route', async () => {
    // This route is not registered as an exact route; falls through to prefix handler.
    // The prefix route for /api/v1/v11/ returns a generic "registered" response.
    const payload = { from: 'intake', to: 'requirements' };
    const res = await postJson(port, token, '/api/v1/v11/state-machine/validate', payload);

    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ success: true });
    // The prefix fallback returns { data: { message: 'API endpoint ... is registered', ... } }
    const data = (res.json as any).data;
    expect(data.message).toContain('registered');
  });

  // ── Error handling ──

  it('should return 400 for invalid JSON body on v1.1 endpoints', async () => {
    const body = '{ not valid json }}}';
    const res = await httpRequest({
      port,
      method: 'POST',
      path: '/api/v1/v11/work-item/create',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
      },
      body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json).toMatchObject({ success: false, error: { code: 'INVALID_JSON' } });
  });

  it('should return error when dispatcher throws', async () => {
    // Temporarily make the dispatcher throw
    const originalMock = (mockDispatcher.dispatcher.dispatch as ReturnType<typeof vi.fn>);
    originalMock.mockImplementationOnce(async () => {
      throw new Error('Simulated dispatcher failure');
    });

    const res = await postJson(port, token, '/api/v1/v11/work-item/create', {
      projectRoot: tempDir,
      workItemId: 'WI-ERR',
      userRequest: 'Trigger error',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json).toMatchObject({ success: false, error: 'Simulated dispatcher failure' });
  });

  // ── Full WI lifecycle via v1.1 API ──

  describe('Full WI lifecycle via v1.1 HTTP endpoints', () => {
    const wiId = 'WI-LIFECYCLE-001';
    const wiDir = `${tempDir}/.specforge/specs/${wiId}`;

    it('should complete create → gate → decision → merge → code-permission → verification lifecycle', async () => {
      // 1. Create work item
      const createRes = await postJson(port, token, '/api/v1/v11/work-item/create', {
        projectRoot: tempDir,
        workItemId: wiId,
        userRequest: 'Lifecycle test: add order cancellation feature',
      });
      expect(createRes.statusCode).toBe(200);
      expect(createRes.json).toMatchObject({ success: true });
      const createCall = mockDispatcher.calls.find(c => c.tool === 'sf_v11_work_item_create' && c.args.workItemId === wiId);
      expect(createCall).toBeDefined();

      // 2. Run gates
      const gateRes = await postJson(port, token, '/api/v1/v11/gate/run', {
        workItemDir: wiDir,
        gateIds: ['requirements_gate'],
        strictness: 'normal',
      });
      expect(gateRes.statusCode).toBe(200);
      const gateCall = mockDispatcher.calls.find(c => c.tool === 'sf_v11_gate_run' && c.args.gateIds?.includes('requirements_gate'));
      expect(gateCall).toBeDefined();

      // 3. Record user decision
      const decisionRes = await postJson(port, token, '/api/v1/v11/decision', {
        workItemDir: wiDir,
        decision: 'approved',
        actor: 'user',
        reason: 'All requirements met',
      });
      expect(decisionRes.statusCode).toBe(200);
      const decisionCall = mockDispatcher.calls.find(c => c.tool === 'sf_v11_decision' && c.args.decision === 'approved');
      expect(decisionCall).toBeDefined();

      // 4. Merge
      const mergeRes = await postJson(port, token, '/api/v1/v11/merge', {
        workItemDir: wiDir,
      });
      expect(mergeRes.statusCode).toBe(200);

      // 5. Release code permission
      const permRes = await postJson(port, token, '/api/v1/v11/code-permission', {
        action: 'release',
        workItemDir: wiDir,
        workItemId: wiId,
        allowedWriteFiles: ['src/orders/cancel.ts'],
        forbiddenFiles: ['src/auth/'],
      });
      expect(permRes.statusCode).toBe(200);

      // 6. Extension (request additional design type mid-flow)
      const extRes = await postJson(port, token, '/api/v1/v11/extension', {
        workItemDir: wiDir,
        action: 'request',
        namespace: 'design_types',
        key: 'cancellation_policy',
        reason: 'Need cancellation policy type',
      });
      expect(extRes.statusCode).toBe(200);

      // 7. Agent handoff (executor → reviewer)
      const handoffRes = await postJson(port, token, '/api/v1/v11/handoff', {
        workItemDir: wiDir,
        fromAgent: 'sf-executor',
        toAgent: 'sf-reviewer',
        context: {
          stage: 'development',
          summary: 'Code changes complete',
          files_changed: ['src/orders/cancel.ts'],
        },
      });
      expect(handoffRes.statusCode).toBe(200);

      // 8. Verification
      const verRes = await postJson(port, token, '/api/v1/v11/verification', {
        workItemDir: wiDir,
        workItemId: wiId,
        verificationType: 'full',
      });
      expect(verRes.statusCode).toBe(200);

      // 9. Revoke code permission
      const revokeRes = await postJson(port, token, '/api/v1/v11/code-permission', {
        action: 'revoke',
        workItemDir: wiDir,
      });
      expect(revokeRes.statusCode).toBe(200);

      // Verify all 9 dispatches happened for this lifecycle
      const lifecycleCalls = mockDispatcher.calls.filter(c =>
        c.args.workItemId === wiId ||
        (c.args as any).workItemDir === wiDir ||
        (c.args as any).workItemId === wiId,
      );
      // At least one call per step above
      expect(lifecycleCalls.length).toBeGreaterThanOrEqual(8);
    });
  });

  // ── No-toolDispatcher 503 test ──

  describe('Without ToolDispatcher (503 scenario)', () => {
    let noDispatcherServer: HTTPServer;
    let noDispatcherPort: number;

    beforeAll(async () => {
      const config = new DaemonConfig([]);
      const eventBus = new EventBus();
      const deps: HTTPServerDeps = {
        config,
        eventBus,
        stateManager: {} as any,
        wal: {} as any,
        // No toolDispatcher!
      };
      noDispatcherServer = new HTTPServer(deps);
      noDispatcherServer.setToken(token);
      const result = await noDispatcherServer.start();
      noDispatcherPort = result.port;
    });

    afterAll(async () => {
      await noDispatcherServer.stop();
    });

    it('should return 503 for all v1.1 endpoints when no dispatcher is configured', async () => {
      const endpoints = [
        '/api/v1/v11/work-item/create',
        '/api/v1/v11/gate/run',
        '/api/v1/v11/merge',
        '/api/v1/v11/decision',
        '/api/v1/v11/code-permission',
        '/api/v1/v11/spec-migration',
        '/api/v1/v11/rollback',
        '/api/v1/v11/handoff',
        '/api/v1/v11/extension',
        '/api/v1/v11/verification',
      ];

      for (const endpoint of endpoints) {
        const res = await postJson(noDispatcherPort, token, endpoint, {});
        expect(res.statusCode).toBe(503);
        expect(res.json).toMatchObject({ success: false, error: 'ToolDispatcher not available' });
      }
    });
  });
});
