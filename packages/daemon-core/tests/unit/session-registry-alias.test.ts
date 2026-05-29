/**
 * Session Registry alias table tests
 *
 * Validates the lazy-alias mechanism that maps OpenCode native sessionID -> daemon sessionId.
 * Covers:
 *  - Scenario A: First event carries both daemon sessionId and OpenCode sessionID -> alias established
 *  - Scenario B: Subsequent event carries only OpenCode sessionID -> resolved via alias
 *  - Scenario C: Repeated calls with same (opencodeSessionId, daemonSessionId) -> alias value unchanged (idempotent)
 *  - Scenario D: Different OpenCode sessionIDs map to different daemon sessionIds independently
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionRegistry } from '../../src/session/SessionRegistry';
import { EventBus } from '../../src/event-bus/EventBus';

describe('SessionRegistry alias table', () => {
  let registry: SessionRegistry;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();
    registry = new SessionRegistry(eventBus);
    registry.start();
  });

  afterEach(() => {
    registry.stop();
    eventBus.stop();
  });

  /**
   * Scenario A: First event with daemon sessionId + OpenCode sessionID
   * Step 1 should hit (daemon sessionId in projectBindings), AND lazy-alias
   * should establish mapping from opencodeSessionId -> daemonSessionId.
   */
  it('Scenario A: should establish alias when event carries both daemon sessionId and opencode sessionID', async () => {
    // 1. Register a plugin session (this creates a daemon sessionId in projectBindings)
    const identity = await registry.registerPluginSession('proj-1', '/path/to/project');
    const daemonSessionId = identity.sessionId;

    // 2. Activate it so touch/terminate can work on it
    const activated = await registry.activate(daemonSessionId, '');
    expect(activated).toBeDefined();

    // 3. Send a session.idle event carrying BOTH daemon sessionId and OpenCode sessionID
    await registry.handleOpenCodeEvent('session.idle', {
      sessionId: daemonSessionId,       // daemon's key -> Step 1 direct hit
      sessionID: 'opencode-native-id',  // OpenCode native -> should be aliased
      projectPath: '/path/to/project',
    });

    // 4. Verify the session was touched (lastActiveAt updated)
    const session = registry.lookupBySessionId(daemonSessionId);
    expect(session).toBeDefined();
    expect(session!.status).toBe('active');

    // 5. Now send an event with ONLY the OpenCode sessionID (no daemon sessionId)
    //    If alias was established, this should resolve to the daemon session
    const beforeTime = session!.lastActiveAt;

    // Use a tiny delay to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    await registry.handleOpenCodeEvent('session.idle', {
      sessionID: 'opencode-native-id',  // Only OpenCode ID, no daemon sessionId
    });

    const afterSession = registry.lookupBySessionId(daemonSessionId);
    expect(afterSession).toBeDefined();
    expect(afterSession!.lastActiveAt).toBeGreaterThan(beforeTime);
  });

  /**
   * Scenario B: Subsequent event carries only OpenCode sessionID -> Step 2 resolves via alias
   * This is the core bug-fix scenario: without alias table, Step 2 would miss because
   * projectBindings.has(opencodeSessionId) is false.
   */
  it('Scenario B: should resolve via alias when event only carries opencode sessionID', async () => {
    // 1. Register and activate a daemon session
    const identity = await registry.registerPluginSession('proj-1', '/path/to/project');
    const daemonSessionId = identity.sessionId;
    await registry.activate(daemonSessionId, '');

    // 2. First event: establish the alias via daemon sessionId direct hit
    await registry.handleOpenCodeEvent('session.idle', {
      sessionId: daemonSessionId,
      sessionID: 'oc-abc-123',
    });

    // 3. Now terminate via OpenCode sessionID only
    await registry.handleOpenCodeEvent('session.error', {
      sessionID: 'oc-abc-123',
    });

    // 4. Verify the daemon session was terminated (moved to history)
    const session = registry.lookupBySessionId(daemonSessionId);
    expect(session).toBeDefined();
    expect(session!.status).toBe('history');
  });

  /**
   * Scenario C: Multiple calls with same (opencodeSessionId, daemonSessionId) pair
   * The alias value should remain the first-established value (CP-2 idempotency).
   */
  it('Scenario C: alias value should be idempotent across repeated calls', async () => {
    // 1. Register and activate a daemon session
    const identity = await registry.registerPluginSession('proj-1', '/path/to/project');
    const daemonSessionId = identity.sessionId;
    await registry.activate(daemonSessionId, '');

    // 2. First call establishes alias
    await registry.handleOpenCodeEvent('session.idle', {
      sessionId: daemonSessionId,
      sessionID: 'oc-idempotent',
    });

    // 3. Second call with same pair -- should not change alias
    await registry.handleOpenCodeEvent('session.idle', {
      sessionId: daemonSessionId,
      sessionID: 'oc-idempotent',
    });

    // 4. Third call with same pair
    await registry.handleOpenCodeEvent('session.idle', {
      sessionId: daemonSessionId,
      sessionID: 'oc-idempotent',
    });

    // 5. Verify: still resolves to the original daemon session
    await registry.handleOpenCodeEvent('session.error', {
      sessionID: 'oc-idempotent',
    });

    const session = registry.lookupBySessionId(daemonSessionId);
    expect(session).toBeDefined();
    expect(session!.status).toBe('history');

    // Only 1 session should exist (no duplicates created)
    const allSessions = registry.listSessions();
    expect(allSessions.length).toBe(1);
  });

  /**
   * Scenario D: Different OpenCode sessionIDs map to different daemon sessionIds independently
   */
  it('Scenario D: different opencode sessionIDs map to different daemon sessionIds independently', async () => {
    // 1. Register two daemon sessions
    const identity1 = await registry.registerPluginSession('proj-1', '/path/to/project1');
    const identity2 = await registry.registerPluginSession('proj-2', '/path/to/project2');
    const daemonId1 = identity1.sessionId;
    const daemonId2 = identity2.sessionId;

    await registry.activate(daemonId1, '');
    await registry.activate(daemonId2, '');

    // 2. Establish aliases for both
    await registry.handleOpenCodeEvent('session.idle', {
      sessionId: daemonId1,
      sessionID: 'oc-alpha',
    });

    await registry.handleOpenCodeEvent('session.idle', {
      sessionId: daemonId2,
      sessionID: 'oc-beta',
    });

    // 3. Terminate only oc-alpha via alias
    await registry.handleOpenCodeEvent('session.error', {
      sessionID: 'oc-alpha',
    });

    // 4. Verify: daemonId1 terminated, daemonId2 still active
    const session1 = registry.lookupBySessionId(daemonId1);
    const session2 = registry.lookupBySessionId(daemonId2);

    expect(session1!.status).toBe('history');
    expect(session2!.status).toBe('active');
  });
});
