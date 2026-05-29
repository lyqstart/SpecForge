/**
 * E1 Integration Test — Property-Based Testing (PBT)
 *
 * Uses fast-check for property-based testing:
 * - PBT-ST-01: WAL and in-memory state consistency
 * - PBT-ST-02: Idempotency (replay produces same state)
 * - PBT-ST-03: Invalid state rejection
 * - PBT-HTTP-01: Auth always required for protected endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as http from 'http';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StateManager } from '../../src/state/StateManager';
import { WAL } from '../../src/wal/WAL';
import { Daemon } from '../../src/daemon/Daemon';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { IPathResolver } from '../../src/daemon/path-resolver';

const VALID_STATES = [
  'intake', 'requirements', 'design', 'tasks',
  'development', 'review', 'verification', 'completed',
];

function makeTmpDir(): string {
  return fsSync.mkdtempSync(path.join(os.tmpdir(), 'specforge-e1-pbt-'));
}

function uniqueProject(name: string): string {
  return `e1-pbt-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const validStateArb = fc.constantFrom(...VALID_STATES);

/**
 * Test path resolver that isolates all file I/O under a temp directory.
 */
class TestPathResolver implements IPathResolver {
  constructor(private tmpDir: string) {}

  resolveProjectRuntimeDir(projectPath: string): string {
    return path.join(this.tmpDir, projectPath, 'runtime');
  }
  resolveStatePath(projectPath: string): string {
    return path.join(this.tmpDir, projectPath, 'runtime', 'state.json');
  }
  resolveEventsPath(projectPath: string): string {
    return path.join(this.tmpDir, projectPath, 'runtime', 'events.jsonl');
  }
  resolveSessionsDir(projectPath: string): string {
    return path.join(this.tmpDir, projectPath, 'runtime', 'sessions');
  }
  resolveDaemonRuntimeDir(): string {
    return path.join(this.tmpDir, 'daemon');
  }
  resolveHandshakePath(): string {
    return path.join(this.tmpDir, 'daemon', 'handshake.json');
  }
  resolveDaemonJsonPath(): string {
    return path.join(this.tmpDir, 'daemon', 'daemon.json');
  }
  resolveDaemonStatePath(): string {
    return path.join(this.tmpDir, 'daemon', 'state.json');
  }
  resolveDaemonEventsPath(): string {
    return path.join(this.tmpDir, 'daemon', 'events.jsonl');
  }
}

const transitionChainArb = fc.array(
  fc.record({
    workItemId: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
    targetState: validStateArb,
  }),
  { maxLength: 20 },
);

describe('E1 PBT State', () => {
  let tmpDir: string;
  let pathResolver: TestPathResolver;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    pathResolver = new TestPathResolver(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('PBT-ST-01: WAL and in-memory state consistency', () => {
    it('should have matching event count between WAL and applied transitions', async () => {
      await fc.assert(
        fc.asyncProperty(transitionChainArb, async (chain) => {
          const projectPath = uniqueProject('st01');
          const sm = new StateManager(pathResolver, projectPath);
          await sm.initialize();

          let transitionsApplied = 0;
          const workItemStates = new Map<string, string>();

          for (const t of chain) {
            const currentState = workItemStates.get(t.workItemId) ?? '';
            try {
              await sm.transition(t.workItemId, currentState, t.targetState, 'system');
              workItemStates.set(t.workItemId, t.targetState);
              transitionsApplied++;
            } catch {
              // Transition may fail if state doesn't match — that's expected
            }
          }

          const wal = new WAL(pathResolver.resolveEventsPath(projectPath));
          await wal.initialize();
          const { events } = await wal.readAllEvents();
          const stateEvents = events.filter((e) => e.action === 'state.transition');

          expect(stateEvents).toHaveLength(transitionsApplied);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('PBT-ST-02: Idempotency — replay produces same state', () => {
    it('should produce identical state on repeated getCurrentState calls', async () => {
      const projectPath = uniqueProject('st02');
      const sm = new StateManager(pathResolver, projectPath);
      await sm.initialize();

      await sm.transition('WI-IDEM', '', 'intake', 'system');
      await sm.transition('WI-IDEM', 'intake', 'requirements', 'system');
      await sm.transition('WI-IDEM', 'requirements', 'design', 'system');

      const state1 = await sm.getCurrentState();
      const state2 = await sm.getCurrentState();

      expect(state1.workItems).toEqual(state2.workItems);
      expect(state1.lastEventId).toBe(state2.lastEventId);
    });

    it('should produce same final state after fresh StateManager rebuild', async () => {
      const projectPath = uniqueProject('st02r');

      const sm1 = new StateManager(pathResolver, projectPath);
      await sm1.initialize();
      await sm1.transition('WI-R1', '', 'intake', 'system');
      await sm1.transition('WI-R1', 'intake', 'requirements', 'system');

      const state1 = await sm1.getCurrentState();

      const sm2 = new StateManager(pathResolver, projectPath);
      await sm2.initialize();
      const state2 = await sm2.getCurrentState();

      expect(state2.workItems).toHaveLength(state1.workItems.length);
      expect(state2.workItems[0]!.current_state).toBe('requirements');
      expect(state2.workItems[0]!.work_item_id).toBe('WI-R1');
    });

    it('should handle arbitrary transition chains idempotently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 2, maxLength: 10 }),
              from: validStateArb,
              to: validStateArb,
            }),
            { maxLength: 10 },
          ),
          async (transitions) => {
            const projectPath = uniqueProject('st02a');
            const sm = new StateManager(pathResolver, projectPath);
            await sm.initialize();

            const currentState = new Map<string, string>();

            for (const t of transitions) {
              const from = currentState.get(t.id) ?? '';
              if (from === t.from) {
                try {
                  await sm.transition(t.id, from, t.to, 'system');
                  currentState.set(t.id, t.to);
                } catch {
                  // ok
                }
              }
            }

            const state1 = await sm.getCurrentState();
            const sm2 = new StateManager(pathResolver, projectPath);
            await sm2.initialize();
            const state2 = await sm2.getCurrentState();

            expect(state2.workItems).toHaveLength(state1.workItems.length);
            for (const wi of state1.workItems) {
              const rebuilt = state2.workItems.find((w) => w.work_item_id === wi.work_item_id);
              expect(rebuilt).toBeDefined();
              expect(rebuilt!.current_state).toBe(wi.current_state);
            }
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  describe('PBT-ST-03: Invalid state rejection', () => {
    it('should reject any transition to an invalid state name', async () => {
      const invalidStateArb = fc.string({ minLength: 1, maxLength: 30 }).filter(
        (s) => !VALID_STATES.includes(s),
      );

      await fc.assert(
        fc.asyncProperty(invalidStateArb, async (invalidState) => {
          const projectPath = uniqueProject('st03');
          const sm = new StateManager(pathResolver, projectPath);
          await sm.initialize();

          await expect(
            sm.transition('WI-INV', '', invalidState, 'system'),
          ).rejects.toThrow('Invalid target state');
        }),
        { numRuns: 20 },
      );
    });
  });
});

describe('E1 PBT HTTP Auth', () => {
  let daemon: Daemon;
  let config: DaemonConfig;
  let port: number;
  let token: string;

  beforeEach(async () => {
    daemon = new Daemon();
    config = new DaemonConfig();
    await daemon.start();

    const handshakePath = config.getHandshakeFile();
    const content = await fs.readFile(handshakePath, 'utf-8');
    const handshake = JSON.parse(content);
    port = handshake.port as number;
    token = handshake.token as string;
  }, 30000);

  afterEach(async () => {
    if (daemon.isDaemonRunning()) {
      await daemon.stop();
    }
  }, 15000);

  const protectedPaths = [
    { method: 'POST', path: '/api/v1/state/read' },
    { method: 'POST', path: '/api/v1/state/transition' },
    { method: 'POST', path: '/api/v1/event/log' },
    { method: 'POST', path: '/api/v1/event/query' },
    { method: 'POST', path: '/api/v1/cas/store' },
    { method: 'GET', path: '/api/v1/cas/retrieve' },
    { method: 'GET', path: '/api/v1/session/list' },
  ];

  it('PBT-HTTP-01: all protected endpoints require auth', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...protectedPaths),
        fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nilFrequency: 0.5 }),
        async (endpoint, badToken) => {
          const result = await new Promise<{ statusCode: number }>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('HTTP timeout')), 3000);
            const headers: Record<string, string> = {};
            if (badToken) {
              headers['Authorization'] = `Bearer ${badToken}`;
            }
            if (endpoint.method === 'POST') {
              headers['Content-Type'] = 'application/json';
            }

            const options: http.RequestOptions = {
              hostname: '127.0.0.1',
              port,
              method: endpoint.method,
              path: endpoint.path,
              headers,
            };

            const req = http.request(options, (res) => {
              res.resume();
              clearTimeout(timeout);
              resolve({ statusCode: res.statusCode ?? 0 });
            });
            req.on('error', (err) => { clearTimeout(timeout); reject(err); });
            if (endpoint.method === 'POST') {
              req.write('{}');
            }
            req.end();
          });

          expect(result.statusCode).toBe(401);
        },
      ),
      { numRuns: 20 },
    );
  });
});
