/**
 * Integration test: plugin register → postEvent → route hit
 *
 * End-to-end test validating the complete data flow:
 *   registerPluginSession → HTTPServer.handleOpenCodeEvent → SessionRegistry.handleOpenCodeEvent
 *
 * Verifies the bugfix where events were routed with "No session binding found" WARN:
 *   - TASK-1: HTTPServer merges top-level sessionId into payload as fallback
 *   - TASK-2: SessionRegistry resolves via alias table (lazy-alias mechanism)
 *
 * Acceptance criteria (bugfix.md §2.3):
 *   AC-1: WARN log "No session binding found" no longer appears for valid sessions
 *   AC-2: Events route correctly (touch / terminate operations execute)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionRegistry } from '../../src/session/SessionRegistry';
import { EventBus } from '../../src/event-bus/EventBus';

/**
 * Simulates the HTTPServer.handleOpenCodeEvent merge logic (TASK-1 fix).
 * In production: { ...payload, sessionId: payload.sessionId ?? sessionId }
 */
function simulateHTTPServerMerge(
  sessionId: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...payload,
    sessionId: (payload.sessionId as string | undefined) ?? sessionId,
  };
}

describe('OpenCode event routing — end-to-end integration', () => {
  let registry: SessionRegistry;
  let eventBus: EventBus;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();
    registry = new SessionRegistry(eventBus);
    registry.start();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    registry.stop();
    eventBus.stop();
    warnSpy.mockRestore();
  });

  // ── Test 1: Basic route hit (core acceptance criteria) ──

  describe('Test 1 — basic route hit', () => {
    it('should route session.idle event without WARN and update lastActiveAt', async () => {
      // 1. Register a plugin session
      const identity = await registry.registerPluginSession('project-1', '/path/to/project');
      const daemonSessionId = identity.sessionId;

      // 2. Activate it so touch() can operate
      await registry.activate(daemonSessionId, '');
      const sessionBefore = registry.lookupBySessionId(daemonSessionId);
      expect(sessionBefore).not.toBeNull();
      const lastActiveBefore = sessionBefore!.lastActiveAt;

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // 3. Simulate the complete data flow as HTTPServer would call it:
      //    - OpenCode sends: { subType: "session.idle", sessionID: "oc-test-session-id" }
      //    - HTTPServer merges: { ...payload, sessionId: payload.sessionId ?? sessionId }
      const payload = simulateHTTPServerMerge(daemonSessionId, {
        subType: 'session.idle',
        sessionID: 'oc-test-session-id',
      });

      // 4. Call SessionRegistry.handleOpenCodeEvent with merged payload
      registry.handleOpenCodeEvent(payload.subType as string, payload);

      // AC-1: No "No session binding found" WARN
      const bindingWarnCalls = warnSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('No session binding found')
      );
      expect(bindingWarnCalls.length).toBe(0);

      // AC-2: session.touch was called — lastActiveAt updated
      const sessionAfter = registry.lookupBySessionId(daemonSessionId);
      expect(sessionAfter).not.toBeNull();
      expect(sessionAfter!.lastActiveAt).toBeGreaterThan(lastActiveBefore);
    });

    it('should route session.error event without WARN and terminate the session', async () => {
      // 1. Register and activate
      const identity = await registry.registerPluginSession('project-1', '/path/to/project');
      const daemonSessionId = identity.sessionId;
      await registry.activate(daemonSessionId, '');

      // 2. Simulate HTTPServer flow for session.error
      const payload = simulateHTTPServerMerge(daemonSessionId, {
        subType: 'session.error',
        sessionID: 'oc-test-session-id',
      });

      registry.handleOpenCodeEvent(payload.subType as string, payload);

      // AC-1: No "No session binding found" WARN
      const bindingWarnCalls = warnSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('No session binding found')
      );
      expect(bindingWarnCalls.length).toBe(0);

      // AC-2: session was terminated → moved to history
      const session = registry.lookupBySessionId(daemonSessionId);
      expect(session).not.toBeNull();
      expect(session!.status).toBe('history');
    });
  });

  // ── Test 2: Alias fast path ──

  describe('Test 2 — alias fast path', () => {
    it('should route second event via alias table when only sessionID is provided', async () => {
      // 1. Register and activate
      const identity = await registry.registerPluginSession('project-1', '/path/to/project');
      const daemonSessionId = identity.sessionId;
      await registry.activate(daemonSessionId, '');

      // 2. First event: carries daemon sessionId (from HTTPServer merge)
      //    This establishes the alias: opencodeSessionID → daemonSessionId
      const firstPayload = simulateHTTPServerMerge(daemonSessionId, {
        subType: 'session.idle',
        sessionID: 'oc-test-session-id',
      });
      registry.handleOpenCodeEvent(firstPayload.subType as string, firstPayload);

      const sessionAfterFirst = registry.lookupBySessionId(daemonSessionId);
      const lastActiveAfterFirst = sessionAfterFirst!.lastActiveAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      // 3. Second event: only carries OpenCode sessionID (no daemon sessionId)
      //    HTTPServer merge would produce: { subType, sessionID, sessionId: undefined }
      //    In reality, if the client only sends sessionID, the top-level sessionId
      //    might be empty. Simulate this by NOT passing daemon sessionId.
      const secondPayload = simulateHTTPServerMerge('', {
        subType: 'session.idle',
        sessionID: 'oc-test-session-id',
      });

      registry.handleOpenCodeEvent(secondPayload.subType as string, secondPayload);

      // No "No session binding found" WARN
      const bindingWarnCalls = warnSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('No session binding found')
      );
      expect(bindingWarnCalls.length).toBe(0);

      // Session was touched again via alias resolution
      const sessionAfterSecond = registry.lookupBySessionId(daemonSessionId);
      expect(sessionAfterSecond).not.toBeNull();
      expect(sessionAfterSecond!.lastActiveAt).toBeGreaterThan(lastActiveAfterFirst);
    });

    it('should route session.error via alias table and terminate', async () => {
      // 1. Register, activate, establish alias
      const identity = await registry.registerPluginSession('project-1', '/path/to/project');
      const daemonSessionId = identity.sessionId;
      await registry.activate(daemonSessionId, '');

      // Establish alias via first event with daemon sessionId
      registry.handleOpenCodeEvent('session.idle', {
        sessionId: daemonSessionId,
        sessionID: 'oc-alias-test',
        subType: 'session.idle',
      });

      // 2. Second event: only OpenCode sessionID, no daemon sessionId
      registry.handleOpenCodeEvent('session.error', {
        sessionID: 'oc-alias-test',
        subType: 'session.error',
      });

      // No binding WARN
      const bindingWarnCalls = warnSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('No session binding found')
      );
      expect(bindingWarnCalls.length).toBe(0);

      // Session was terminated
      const session = registry.lookupBySessionId(daemonSessionId);
      expect(session!.status).toBe('history');
    });
  });

  // ── Test 3: Route completeness (CP-3) ──

  describe('Test 3 — route completeness with multiple sessions', () => {
    it('should route all events for multiple sessions without any WARN', async () => {
      // 1. Register 3 sessions for different projects
      const identity1 = await registry.registerPluginSession('proj-alpha', '/projects/alpha');
      const identity2 = await registry.registerPluginSession('proj-beta', '/projects/beta');
      const identity3 = await registry.registerPluginSession('proj-gamma', '/projects/gamma');

      // Activate all
      await registry.activate(identity1.sessionId, '');
      await registry.activate(identity2.sessionId, '');
      await registry.activate(identity3.sessionId, '');

      const lastActive1Before = registry.lookupBySessionId(identity1.sessionId)!.lastActiveAt;
      const lastActive2Before = registry.lookupBySessionId(identity2.sessionId)!.lastActiveAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      // 2. Send different event types to each session
      // Session 1: session.idle → touch
      registry.handleOpenCodeEvent('session.idle', {
        sessionId: identity1.sessionId,
        sessionID: 'oc-alpha-id',
        subType: 'session.idle',
      });

      // Session 2: session.idle → touch
      registry.handleOpenCodeEvent('session.idle', {
        sessionId: identity2.sessionId,
        sessionID: 'oc-beta-id',
        subType: 'session.idle',
      });

      // Session 3: session.error → terminate
      registry.handleOpenCodeEvent('session.error', {
        sessionId: identity3.sessionId,
        sessionID: 'oc-gamma-id',
        subType: 'session.error',
      });

      // 3. Verify: no "No session binding found" WARN
      const bindingWarnCalls = warnSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('No session binding found')
      );
      expect(bindingWarnCalls.length).toBe(0);

      // Session 1: touched
      const session1 = registry.lookupBySessionId(identity1.sessionId);
      expect(session1).not.toBeNull();
      expect(session1!.status).toBe('active');
      expect(session1!.lastActiveAt).toBeGreaterThan(lastActive1Before);

      // Session 2: touched
      const session2 = registry.lookupBySessionId(identity2.sessionId);
      expect(session2).not.toBeNull();
      expect(session2!.status).toBe('active');
      expect(session2!.lastActiveAt).toBeGreaterThan(lastActive2Before);

      // Session 3: terminated
      const session3 = registry.lookupBySessionId(identity3.sessionId);
      expect(session3).not.toBeNull();
      expect(session3!.status).toBe('history');

      // 4. Send follow-up events via alias (only OpenCode sessionID)
      await new Promise(resolve => setTimeout(resolve, 10));
      const lastActive1After = session1!.lastActiveAt;

      registry.handleOpenCodeEvent('session.idle', {
        sessionID: 'oc-alpha-id',
        subType: 'session.idle',
      });

      // Session 1 touched again via alias
      const session1AfterAlias = registry.lookupBySessionId(identity1.sessionId);
      expect(session1AfterAlias!.lastActiveAt).toBeGreaterThan(lastActive1After);

      // Terminate session 2 via alias
      registry.handleOpenCodeEvent('session.error', {
        sessionID: 'oc-beta-id',
        subType: 'session.error',
      });
      const session2After = registry.lookupBySessionId(identity2.sessionId);
      expect(session2After!.status).toBe('history');

      // Still no binding WARN
      const finalWarnCalls = warnSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('No session binding found')
      );
      expect(finalWarnCalls.length).toBe(0);
    });
  });
});
