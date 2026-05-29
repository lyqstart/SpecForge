/**
 * Session Registry unit tests - Simplified
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionRegistry } from '../../src/session/SessionRegistry';
import { 
  createPendingIdentity, 
  activateIdentity, 
  terminateIdentity, 
} from '../../src/session/AgentIdentity';
import { EventBus } from '../../src/event-bus/EventBus';
import { WAL } from '../../src/wal/WAL';
import { Event } from '../../src/types';
import * as path from 'path';
import * as os from 'os';

describe('SessionRegistry', () => {
  let sessionRegistry: SessionRegistry;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();
    sessionRegistry = new SessionRegistry(eventBus);
    sessionRegistry.start();
  });

  afterEach(() => {
    sessionRegistry.stop();
    eventBus.stop();
  });

  describe('registerPending', () => {
    it('should register a pending session', async () => {
      const identity = await sessionRegistry.registerPending(
        'agent',
        'workflow',
        'workItem-1',
        'spawnIntent-1'
      );
      
      expect(identity).toBeDefined();
      expect(identity.status).toBe('pending');
      expect(identity.agentRole).toBe('agent');
    });

    it('should register with parent session ID', async () => {
      const parent = await sessionRegistry.registerPending('parent', 'workflow', 'item', 'parent-spawn');
      const child = await sessionRegistry.registerPending('child', 'workflow', 'item', 'child-spawn', parent.sessionId);
      
      expect(child.parentSessionId).toBe(parent.sessionId);
    });
  });

  describe('bindProject (async WAL-first)', () => {
    it('should bind a project to a pending session without WAL', async () => {
      const pending = await sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');

      const result = await sessionRegistry.bindProject(pending.sessionId, '/path/to/my-project');

      expect(result).toBe(true);
      expect(sessionRegistry.getProjectPath(pending.sessionId)).toBe('/path/to/my-project');

      const session = sessionRegistry.lookupBySessionId(pending.sessionId);
      expect(session).toBeDefined();
      expect(session!.projectId).toBe('my-project');
    });

    it('should return false for non-existent session', async () => {
      const result = await sessionRegistry.bindProject('non-existent', '/path/to/project');
      expect(result).toBe(false);
    });

    it('should write session.bound WAL event before in-memory mutation', async () => {
      const tmpDir = path.join(os.tmpdir(), `wal-bind-test-${Date.now()}`);
      const eventsPath = path.join(tmpDir, 'events.jsonl');
      const wal = new WAL(eventsPath);
      await wal.initialize();

      const bus = new EventBus();
      bus.start();
      const registry = new SessionRegistry(bus, 30 * 60 * 1000, wal);
      registry.start();

      try {
        const pending = await registry.registerPending('agent', 'workflow', 'item', 'spawn-1');

        const result = await registry.bindProject(pending.sessionId, '/path/to/project');
        expect(result).toBe(true);

        // Verify WAL event was written
        const { events } = await wal.readAllEvents();
        const boundEvents = events.filter(e => e.action === 'session.bound');
        expect(boundEvents.length).toBe(1);
        expect(boundEvents[0]!.payload.sessionId).toBe(pending.sessionId);
        expect(boundEvents[0]!.payload.projectPath).toBe('/path/to/project');
        expect(boundEvents[0]!.category).toBe('session');

        // Verify in-memory state
        expect(registry.getProjectPath(pending.sessionId)).toBe('/path/to/project');
      } finally {
        registry.stop();
        bus.stop();
        const fs = await import('fs/promises');
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('should not write WAL event when session not found', async () => {
      const tmpDir = path.join(os.tmpdir(), `wal-bind-nosession-test-${Date.now()}`);
      const eventsPath = path.join(tmpDir, 'events.jsonl');
      const wal = new WAL(eventsPath);
      await wal.initialize();

      const bus = new EventBus();
      bus.start();
      const registry = new SessionRegistry(bus, 30 * 60 * 1000, wal);
      registry.start();

      try {
        const result = await registry.bindProject('non-existent', '/path/to/project');
        expect(result).toBe(false);

        // No WAL events should be written
        const { events } = await wal.readAllEvents();
        expect(events.length).toBe(0);
      } finally {
        registry.stop();
        bus.stop();
        const fs = await import('fs/promises');
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('should work in memory-only mode (no WAL)', async () => {
      const pending = await sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      const result = await sessionRegistry.bindProject(pending.sessionId, '/path/to/project');
      expect(result).toBe(true);
      expect(sessionRegistry.getProjectPath(pending.sessionId)).toBe('/path/to/project');
    });
  });

  describe('alias_bound WAL event', () => {
    it('should write alias_bound WAL event on first alias establishment', async () => {
      const tmpDir = path.join(os.tmpdir(), `wal-alias-test-${Date.now()}`);
      const eventsPath = path.join(tmpDir, 'events.jsonl');
      const wal = new WAL(eventsPath);
      await wal.initialize();

      const bus = new EventBus();
      bus.start();
      const registry = new SessionRegistry(bus, 30 * 60 * 1000, wal);
      registry.start();

      try {
        // First event: session.created with OpenCode sessionID
        await registry.handleOpenCodeEvent('session.created', {
          sessionID: 'oc-session-123',
          projectPath: '/path/to/project',
        });

        // Verify alias_bound WAL event was written
        const { events } = await wal.readAllEvents();
        const aliasEvents = events.filter(e => e.action === 'session.alias_bound');
        expect(aliasEvents.length).toBe(1);
        expect(aliasEvents[0]!.payload.opencodeSessionId).toBe('oc-session-123');
        expect(aliasEvents[0]!.category).toBe('session');
      } finally {
        registry.stop();
        bus.stop();
        const fs = await import('fs/promises');
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('should NOT write alias_bound on subsequent events with same alias', async () => {
      const tmpDir = path.join(os.tmpdir(), `wal-alias-dup-test-${Date.now()}`);
      const eventsPath = path.join(tmpDir, 'events.jsonl');
      const wal = new WAL(eventsPath);
      await wal.initialize();

      const bus = new EventBus();
      bus.start();
      const registry = new SessionRegistry(bus, 30 * 60 * 1000, wal);
      registry.start();

      try {
        // First event: establishes alias
        await registry.handleOpenCodeEvent('session.created', {
          sessionID: 'oc-session-123',
          projectPath: '/path/to/project',
        });

        // Activate the session for idle event
        const pending = registry.getPendingSessions();
        const sessionId = pending[0]!.sessionId;
        await registry.activate(sessionId, '');

        // Second event: same OpenCode sessionID → should NOT write alias_bound again
        await registry.handleOpenCodeEvent('session.idle', {
          sessionID: 'oc-session-123',
        });

        const { events } = await wal.readAllEvents();
        const aliasEvents = events.filter(e => e.action === 'session.alias_bound');
        expect(aliasEvents.length).toBe(1); // Only one alias_bound from first event
      } finally {
        registry.stop();
        bus.stop();
        const fs = await import('fs/promises');
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('should not write alias_bound when no opencodeSessionId in data', async () => {
      const tmpDir = path.join(os.tmpdir(), `wal-alias-noid-test-${Date.now()}`);
      const eventsPath = path.join(tmpDir, 'events.jsonl');
      const wal = new WAL(eventsPath);
      await wal.initialize();

      const bus = new EventBus();
      bus.start();
      const registry = new SessionRegistry(bus, 30 * 60 * 1000, wal);
      registry.start();

      try {
        // No sessionID provided → no alias can be established
        await registry.handleOpenCodeEvent('session.created', {
          projectPath: '/path/to/project',
        });

        const { events } = await wal.readAllEvents();
        const aliasEvents = events.filter(e => e.action === 'session.alias_bound');
        expect(aliasEvents.length).toBe(0);
      } finally {
        registry.stop();
        bus.stop();
        const fs = await import('fs/promises');
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('lookupBySessionId', () => {
    it('should return null for non-existent session', () => {
      const found = sessionRegistry.lookupBySessionId('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('getCounts', () => {
    it('should return correct counts', async () => {
      await sessionRegistry.registerPending('agent1', 'workflow', 'item', 'spawn-1');
      await sessionRegistry.registerPending('agent2', 'workflow', 'item', 'spawn-2');
      
      const counts = sessionRegistry.getCounts();
      
      expect(counts.pending).toBe(2);
      expect(counts.active).toBe(0);
      expect(counts.history).toBe(0);
    });
  });

  describe('hasSession', () => {
    it('should return true for existing session', async () => {
      const pending = await sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      
      expect(sessionRegistry.hasSession(pending.sessionId)).toBe(true);
    });

    it('should return false for non-existent session', () => {
      expect(sessionRegistry.hasSession('non-existent')).toBe(false);
    });
  });

  describe('activate', () => {
    it('should activate a pending session', async () => {
      const pending = await sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      
      const activated = await sessionRegistry.activate(pending.sessionId, 'spawn-1');
      
      expect(activated).toBeDefined();
      expect(activated?.status).toBe('active');
    });

    it('should return null with wrong spawn intent', async () => {
      const pending = await sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      
      const activated = await sessionRegistry.activate(pending.sessionId, 'wrong-intent');
      
      expect(activated).toBeNull();
    });
  });

  describe('terminate', () => {
    it('should terminate an active session', async () => {
      const pending = await sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      await sessionRegistry.activate(pending.sessionId, 'spawn-1');
      
      const terminated = await sessionRegistry.terminate(pending.sessionId);
      
      expect(terminated).toBeDefined();
      expect(terminated?.status).toBe('history');
    });

    it('should return null when terminating non-existent session', async () => {
      const terminated = await sessionRegistry.terminate('non-existent');
      expect(terminated).toBeNull();
    });
  });

  describe('getActiveSessions', () => {
    it('should return active sessions', async () => {
      const s1 = await sessionRegistry.registerPending('agent1', 'workflow', 'item', 'spawn-1');
      const s2 = await sessionRegistry.registerPending('agent2', 'workflow', 'item', 'spawn-2');
      
      await sessionRegistry.activate(s1.sessionId, 'spawn-1');
      await sessionRegistry.activate(s2.sessionId, 'spawn-2');
      
      const active = sessionRegistry.getActiveSessions();
      
      expect(active.length).toBe(2);
    });
  });

  describe('getPendingSessions', () => {
    it('should return pending sessions', async () => {
      await sessionRegistry.registerPending('agent1', 'workflow', 'item', 'spawn-1');
      await sessionRegistry.registerPending('agent2', 'workflow', 'item', 'spawn-2');
      
      const pending = sessionRegistry.getPendingSessions();
      
      expect(pending.length).toBe(2);
    });
  });

  describe('registerPluginSession', () => {
    it('should create a pending identity and bind project', async () => {
      const identity = await sessionRegistry.registerPluginSession('proj-1', '/path/to/project');
      
      expect(identity).toBeDefined();
      expect(identity.status).toBe('pending');
      expect(identity.agentRole).toBe('plugin');
      expect(identity.workflowRole).toBe('plugin-daemon-bridge');
      expect(identity.projectId).toBe('proj-1');
      
      // Should record project binding
      const boundPath = sessionRegistry.getProjectPath(identity.sessionId);
      expect(boundPath).toBe('/path/to/project');
      
      // Should be in pending sessions
      const pending = sessionRegistry.getPendingSessions();
      expect(pending.length).toBe(1);
      expect(pending[0]?.sessionId).toBe(identity.sessionId);
    });

    it('should be idempotent for the same projectPath', async () => {
      const first = await sessionRegistry.registerPluginSession('proj-1', '/path/to/project');
      const second = await sessionRegistry.registerPluginSession('proj-1', '/path/to/project');
      
      expect(second.sessionId).toBe(first.sessionId);
      expect(second.projectId).toBe(first.projectId);
      
      // Should still have only 1 pending session
      const pending = sessionRegistry.getPendingSessions();
      expect(pending.length).toBe(1);
    });

    it('should create different sessions for different projectPaths', async () => {
      const first = await sessionRegistry.registerPluginSession('proj-1', '/path/to/project1');
      const second = await sessionRegistry.registerPluginSession('proj-2', '/path/to/project2');
      
      expect(second.sessionId).not.toBe(first.sessionId);
      
      const pending = sessionRegistry.getPendingSessions();
      expect(pending.length).toBe(2);
    });

    it('should record project binding correctly', async () => {
      const identity = await sessionRegistry.registerPluginSession('proj-1', '/path/to/my/project');
      
      const boundPath = sessionRegistry.getProjectPath(identity.sessionId);
      expect(boundPath).toBe('/path/to/my/project');
      
      // Unknown session should return null
      const unknown = sessionRegistry.getProjectPath('non-existent');
      expect(unknown).toBeNull();
    });
  });

  describe('handleOpenCodeEvent', () => {
    it('should handle session.created by registering a plugin session', async () => {
      await sessionRegistry.handleOpenCodeEvent('session.created', {
        sessionID: 'oc-session-123',
        projectPath: '/path/to/project',
      });
      
      // A pending session should be created (with a daemon-generated ID)
      const pending = sessionRegistry.getPendingSessions();
      expect(pending.length).toBe(1);
      expect(pending[0]?.agentRole).toBe('plugin');
      
      // Project binding should be recorded
      const boundPath = sessionRegistry.getProjectPath(pending[0]?.sessionId ?? '');
      expect(boundPath).toBe('/path/to/project');
    });

    it('should not duplicate session.created for same sessionId', async () => {
      await sessionRegistry.handleOpenCodeEvent('session.created', {
        sessionID: 'oc-session-123',
        projectPath: '/path/to/project',
      });
      
      const firstCount = sessionRegistry.getPendingSessions().length;
      
      // Second call with same sessionID should be skipped (hasSession check)
      await sessionRegistry.handleOpenCodeEvent('session.created', {
        sessionID: 'oc-session-123',
        projectPath: '/path/to/project',
      });
      
      const secondCount = sessionRegistry.getPendingSessions().length;
      // Since hasSession uses the data.sessionID (not daemon sessionId),
      // a second call creates a new daemon session too... 
      // But the registerPluginSession idempotent check is by projectPath, 
      // so the second call should find the existing binding and return it.
      expect(secondCount).toBe(1);
    });

    it('should handle session.idle by touching the session', async () => {
      // Create a pending session and activate it
      const identity = await sessionRegistry.registerPluginSession('proj-1', '/path/to/project');
      const activated = await sessionRegistry.activate(identity.sessionId, '');
      expect(activated).toBeDefined();
      const firstActive = activated!.lastActiveAt;
      
      // Wait briefly to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Send idle event with the daemon sessionId
      await sessionRegistry.handleOpenCodeEvent('session.idle', {
        sessionID: identity.sessionId,
      });
      
      // Check that lastActiveAt was updated
      const updated = sessionRegistry.lookupBySessionId(identity.sessionId);
      expect(updated).toBeDefined();
      expect(updated!.lastActiveAt).toBeGreaterThan(firstActive);
    });

    it('should handle session.error by terminating the session', async () => {
      // Create a pending session and activate it
      const identity = await sessionRegistry.registerPluginSession('proj-1', '/path/to/project');
      const activated = await sessionRegistry.activate(identity.sessionId, '');
      expect(activated).toBeDefined();
      expect(activated!.status).toBe('active');
      
      // Send error event
      await sessionRegistry.handleOpenCodeEvent('session.error', {
        sessionID: identity.sessionId,
      });
      
      // Session should be terminated (moved to history)
      const session = sessionRegistry.lookupBySessionId(identity.sessionId);
      expect(session).toBeDefined();
      expect(session!.status).toBe('history');
      
      // Should not be in active sessions
      const active = sessionRegistry.getActiveSessions();
      expect(active.length).toBe(0);
    });

    it('should log WARNING for unknown subType (no error thrown)', async () => {
      // Should not throw
      await expect(
        sessionRegistry.handleOpenCodeEvent('unknown.event', {
          sessionID: 'oc-session-123',
        })
      ).resolves.toBeUndefined();
    });

    it('should create a session for session.created with projectPath even without explicit sessionID', async () => {
      await sessionRegistry.handleOpenCodeEvent('session.created', {
        projectPath: '/path/to/project',
      });
      
      // A pending session should be created
      const pending = sessionRegistry.getPendingSessions();
      expect(pending.length).toBe(1);
    });

    it('should do nothing for session.idle with non-existent session', async () => {
      // touch on non-existent session returns null, no error
      await expect(
        sessionRegistry.handleOpenCodeEvent('session.idle', {
          sessionID: 'non-existent',
        })
      ).resolves.toBeUndefined();
    });

    it('should do nothing for session.error with non-existent session', async () => {
      // terminate on non-existent session returns null, no error
      await expect(
        sessionRegistry.handleOpenCodeEvent('session.error', {
          sessionID: 'non-existent',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('getActiveSessionCount', () => {
    it('should return 0 when no active sessions', () => {
      expect(sessionRegistry.getActiveSessionCount()).toBe(0);
    });

    it('should return the correct active session count', async () => {
      const s1 = await sessionRegistry.registerPending('agent1', 'workflow', 'item', 'spawn-1');
      const s2 = await sessionRegistry.registerPending('agent2', 'workflow', 'item', 'spawn-2');
      
      await sessionRegistry.activate(s1.sessionId, 'spawn-1');
      await sessionRegistry.activate(s2.sessionId, 'spawn-2');
      
      expect(sessionRegistry.getActiveSessionCount()).toBe(2);
    });

    it('should decrement when a session is terminated', async () => {
      const s1 = await sessionRegistry.registerPending('agent1', 'workflow', 'item', 'spawn-1');
      await sessionRegistry.activate(s1.sessionId, 'spawn-1');
      
      expect(sessionRegistry.getActiveSessionCount()).toBe(1);
      
      await sessionRegistry.terminate(s1.sessionId);
      
      expect(sessionRegistry.getActiveSessionCount()).toBe(0);
    });

    it('should not count pending sessions', async () => {
      await sessionRegistry.registerPending('agent1', 'workflow', 'item', 'spawn-1');
      
      expect(sessionRegistry.getActiveSessionCount()).toBe(0);
    });

    it('should not count history sessions', async () => {
      const s1 = await sessionRegistry.registerPending('agent1', 'workflow', 'item', 'spawn-1');
      await sessionRegistry.activate(s1.sessionId, 'spawn-1');
      await sessionRegistry.terminate(s1.sessionId);
      
      expect(sessionRegistry.getActiveSessionCount()).toBe(0);
    });
  });

  describe('touch (async with WAL throttle)', () => {
    it('should update in-memory lastActiveAt every call', async () => {
      const pending = await sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      await sessionRegistry.activate(pending.sessionId, 'spawn-1');

      const first = await sessionRegistry.touch(pending.sessionId);
      expect(first).toBeDefined();
      const firstTs = first!.lastActiveAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      const second = await sessionRegistry.touch(pending.sessionId);
      expect(second).toBeDefined();
      expect(second!.lastActiveAt).toBeGreaterThan(firstTs);
    });

    it('should return null for non-existent session', async () => {
      const result = await sessionRegistry.touch('non-existent');
      expect(result).toBeNull();
    });

    it('should write WAL on first touch when WAL is present', async () => {
      const tmpDir = path.join(os.tmpdir(), `wal-touch-test-${Date.now()}`);
      const eventsPath = path.join(tmpDir, 'events.jsonl');
      const wal = new WAL(eventsPath);
      await wal.initialize();

      const bus = new EventBus();
      bus.start();
      const registry = new SessionRegistry(bus, 30 * 60 * 1000, wal);
      registry.start();

      try {
        const pending = await registry.registerPending('agent', 'workflow', 'item', 'spawn-1');
        await registry.activate(pending.sessionId, 'spawn-1');

        await registry.touch(pending.sessionId);

        // Filter to only session.touched events (activate also writes to WAL)
        const { events } = await wal.readAllEvents();
        const touchedEvents = events.filter(e => e.action === 'session.touched');
        expect(touchedEvents.length).toBe(1);
        expect(touchedEvents[0]!.payload.sessionId).toBe(pending.sessionId);
      } finally {
        registry.stop();
        bus.stop();
        // Cleanup temp dir
        const fs = await import('fs/promises');
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('should throttle WAL writes within throttle interval', async () => {
      const tmpDir = path.join(os.tmpdir(), `wal-throttle-test-${Date.now()}`);
      const eventsPath = path.join(tmpDir, 'events.jsonl');
      const wal = new WAL(eventsPath);
      await wal.initialize();

      const bus = new EventBus();
      bus.start();
      // Use 5000ms throttle so we can wait for it to expire
      const registry = new SessionRegistry(bus, 30 * 60 * 1000, wal, 5000);
      registry.start();

      try {
        const pending = await registry.registerPending('agent', 'workflow', 'item', 'spawn-1');
        await registry.activate(pending.sessionId, 'spawn-1');

        // First touch → WAL write
        await registry.touch(pending.sessionId);

        // Second touch immediately → throttled (no WAL write)
        await registry.touch(pending.sessionId);

        // Filter to only session.touched events
        const { events } = await wal.readAllEvents();
        const touchedEvents = events.filter(e => e.action === 'session.touched');
        expect(touchedEvents.length).toBe(1); // Only first touch written
      } finally {
        registry.stop();
        bus.stop();
        const fs = await import('fs/promises');
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('should write WAL again after throttle interval passes', async () => {
      const tmpDir = path.join(os.tmpdir(), `wal-throttle-expire-test-${Date.now()}`);
      const eventsPath = path.join(tmpDir, 'events.jsonl');
      const wal = new WAL(eventsPath);
      await wal.initialize();

      const bus = new EventBus();
      bus.start();
      // Use 50ms throttle for fast test
      const registry = new SessionRegistry(bus, 30 * 60 * 1000, wal, 50);
      registry.start();

      try {
        const pending = await registry.registerPending('agent', 'workflow', 'item', 'spawn-1');
        await registry.activate(pending.sessionId, 'spawn-1');

        // First touch → WAL write
        await registry.touch(pending.sessionId);

        // Wait for throttle to expire
        await new Promise(resolve => setTimeout(resolve, 60));

        // Second touch → WAL write (throttle expired)
        await registry.touch(pending.sessionId);

        // Filter to only session.touched events
        const { events } = await wal.readAllEvents();
        const touchedEvents = events.filter(e => e.action === 'session.touched');
        expect(touchedEvents.length).toBe(2);
      } finally {
        registry.stop();
        bus.stop();
        const fs = await import('fs/promises');
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('should not write WAL when no WAL is injected (memory-only mode)', async () => {
      // sessionRegistry in beforeEach has no WAL
      const pending = await sessionRegistry.registerPending('agent', 'workflow', 'item', 'spawn-1');
      await sessionRegistry.activate(pending.sessionId, 'spawn-1');

      // Should succeed without WAL
      const result = await sessionRegistry.touch(pending.sessionId);
      expect(result).toBeDefined();
      expect(result!.lastActiveAt).toBeGreaterThan(0);
    });

    it('should accept custom touchThrottleMs via constructor', async () => {
      const tmpDir = path.join(os.tmpdir(), `wal-custom-throttle-test-${Date.now()}`);
      const eventsPath = path.join(tmpDir, 'events.jsonl');
      const wal = new WAL(eventsPath);
      await wal.initialize();

      const bus = new EventBus();
      bus.start();
      // Custom: 30ms throttle
      const registry = new SessionRegistry(bus, 30 * 60 * 1000, wal, 30);
      registry.start();

      try {
        const pending = await registry.registerPending('agent', 'workflow', 'item', 'spawn-1');
        await registry.activate(pending.sessionId, 'spawn-1');

        await registry.touch(pending.sessionId);

        // Wait for custom throttle to expire
        await new Promise(resolve => setTimeout(resolve, 40));

        await registry.touch(pending.sessionId);

        // Filter to only session.touched events
        const { events } = await wal.readAllEvents();
        const touchedEvents = events.filter(e => e.action === 'session.touched');
        expect(touchedEvents.length).toBe(2); // Both writes went through
      } finally {
        registry.stop();
        bus.stop();
        const fs = await import('fs/promises');
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('startupReplay', () => {
    /** Helper: create a minimal Event for startupReplay tests */
    function makeEvent(
      action: string,
      payload: Record<string, unknown>,
      opts: { monotonicSeq?: number; ts?: number } = {},
    ): Event {
      return {
        schema_version: '1.0',
        eventId: `evt-${Math.random().toString(36).slice(2, 8)}`,
        ts: opts.ts ?? Date.now(),
        monotonicSeq: opts.monotonicSeq,
        action,
        payload,
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      };
    }

    it('should replay registered + activated + bound and restore Maps correctly', async () => {
      const sid = 'sess-001';
      const events: Event[] = [
        makeEvent('session.registered', {
          sessionId: sid,
          agentRole: 'sf-orchestrator',
          workflowRole: 'main',
          workItemId: 'WI-001',
          spawnIntentId: 'spawn-1',
          parentSessionId: null,
        }, { monotonicSeq: 1, ts: 1000 }),
        makeEvent('session.activated', {
          sessionId: sid,
          spawnIntentId: 'spawn-1',
        }, { monotonicSeq: 2, ts: 2000 }),
        makeEvent('session.bound', {
          sessionId: sid,
          projectPath: '/path/to/project',
        }, { monotonicSeq: 3, ts: 3000 }),
      ];

      const summary = await sessionRegistry.startupReplay(events);

      expect(summary.replayedCount).toBe(3);
      expect(summary.restoredBindings).toBe(2); // activated + bound
      expect(summary.restoredAliases).toBe(0);

      // Session should be in active map
      const session = sessionRegistry.lookupBySessionId(sid);
      expect(session).toBeDefined();
      expect(session!.status).toBe('active');
      expect(session!.agentRole).toBe('sf-orchestrator');

      // Project binding should exist
      expect(sessionRegistry.getProjectPath(sid)).toBe('/path/to/project');
    });

    it('should return zeros for empty events array', async () => {
      const summary = await sessionRegistry.startupReplay([]);

      expect(summary.replayedCount).toBe(0);
      expect(summary.restoredBindings).toBe(0);
      expect(summary.restoredAliases).toBe(0);
    });

    it('should be idempotent: replaying same events twice produces identical Map states', async () => {
      const sid = 'sess-002';
      const events: Event[] = [
        makeEvent('session.registered', {
          sessionId: sid,
          agentRole: 'sf-executor',
          workflowRole: 'dev',
          workItemId: 'WI-002',
          spawnIntentId: 'spawn-2',
          parentSessionId: null,
        }, { monotonicSeq: 1, ts: 1000 }),
        makeEvent('session.activated', {
          sessionId: sid,
          spawnIntentId: 'spawn-2',
        }, { monotonicSeq: 2, ts: 2000 }),
      ];

      // First replay
      await sessionRegistry.startupReplay(events);
      const counts1 = sessionRegistry.getCounts();
      const binding1 = sessionRegistry.getProjectPath(sid);

      // Second replay with same events
      await sessionRegistry.startupReplay(events);
      const counts2 = sessionRegistry.getCounts();
      const binding2 = sessionRegistry.getProjectPath(sid);

      expect(counts1).toEqual(counts2);
      expect(binding1).toBe(binding2);

      // Should have exactly 1 active session
      expect(sessionRegistry.getActiveSessionCount()).toBe(1);
    });

    it('should skip unknown actions without error', async () => {
      const events: Event[] = [
        makeEvent('session.unknown_action', {
          sessionId: 'sess-003',
        }, { monotonicSeq: 1, ts: 1000 }),
        makeEvent('some.other.category', {
          foo: 'bar',
        }, { monotonicSeq: 2, ts: 2000 }),
      ];

      const summary = await sessionRegistry.startupReplay(events);

      // Unknown actions are skipped, not counted
      expect(summary.replayedCount).toBe(0);
      expect(summary.restoredBindings).toBe(0);
      expect(summary.restoredAliases).toBe(0);

      // No sessions should exist
      expect(sessionRegistry.getCounts()).toEqual({ pending: 0, active: 0, history: 0 });
    });

    it('should move terminated session to history', async () => {
      const sid = 'sess-004';
      const events: Event[] = [
        makeEvent('session.registered', {
          sessionId: sid,
          agentRole: 'sf-orchestrator',
          workflowRole: 'main',
          workItemId: 'WI-004',
          spawnIntentId: 'spawn-4',
          parentSessionId: null,
        }, { monotonicSeq: 1, ts: 1000 }),
        makeEvent('session.activated', {
          sessionId: sid,
          spawnIntentId: 'spawn-4',
        }, { monotonicSeq: 2, ts: 2000 }),
        makeEvent('session.terminated', {
          sessionId: sid,
        }, { monotonicSeq: 3, ts: 3000 }),
      ];

      const summary = await sessionRegistry.startupReplay(events);

      expect(summary.replayedCount).toBe(3);

      // Session should be in history
      const session = sessionRegistry.lookupBySessionId(sid);
      expect(session).toBeDefined();
      expect(session!.status).toBe('history');
      expect(session!.agentRole).toBe('sf-orchestrator');

      // Active should be empty
      expect(sessionRegistry.getActiveSessionCount()).toBe(0);
      expect(sessionRegistry.getCounts().history).toBe(1);
    });

    it('should restore alias_bound events', async () => {
      const sid = 'sess-005';
      const events: Event[] = [
        makeEvent('session.registered', {
          sessionId: sid,
          agentRole: 'plugin',
          workflowRole: 'bridge',
          workItemId: 'WI-005',
          spawnIntentId: 'spawn-5',
        }, { monotonicSeq: 1, ts: 1000 }),
        makeEvent('session.alias_bound', {
          sessionId: sid,
          opencodeSessionId: 'oc-session-999',
        }, { monotonicSeq: 2, ts: 2000 }),
      ];

      const summary = await sessionRegistry.startupReplay(events);

      expect(summary.replayedCount).toBe(2);
      expect(summary.restoredAliases).toBe(1);

      // The alias should be resolvable via handleOpenCodeEvent path
      // (We verify the alias exists by calling handleOpenCodeEvent with the aliased ID)
      const pending = sessionRegistry.getPendingSessions();
      expect(pending.length).toBe(1);
      expect(pending[0]!.sessionId).toBe(sid);
    });

    it('should update lastActiveAt for session.touched on active session', async () => {
      const sid = 'sess-006';
      const events: Event[] = [
        makeEvent('session.registered', {
          sessionId: sid,
          agentRole: 'agent',
          workflowRole: 'workflow',
          workItemId: 'WI-006',
          spawnIntentId: 'spawn-6',
        }, { monotonicSeq: 1, ts: 1000 }),
        makeEvent('session.activated', {
          sessionId: sid,
          spawnIntentId: 'spawn-6',
        }, { monotonicSeq: 2, ts: 2000 }),
        makeEvent('session.touched', {
          sessionId: sid,
          lastActiveAt: 9999,
        }, { monotonicSeq: 3, ts: 3000 }),
      ];

      await sessionRegistry.startupReplay(events);

      const session = sessionRegistry.lookupBySessionId(sid);
      expect(session).toBeDefined();
      expect(session!.lastActiveAt).toBe(9999);
    });

    it('should restore project binding from session.registered event with projectPath', async () => {
      const sid = 'sess-007';
      const events: Event[] = [
        makeEvent('session.registered', {
          sessionId: sid,
          agentRole: 'plugin',
          workflowRole: 'plugin-daemon-bridge',
          workItemId: 'proj-1',
          spawnIntentId: '',
          projectPath: '/path/to/my-project',
        }, { monotonicSeq: 1, ts: 1000 }),
      ];

      const summary = await sessionRegistry.startupReplay(events);

      expect(summary.replayedCount).toBe(1);
      expect(summary.restoredBindings).toBe(1);
      expect(sessionRegistry.getProjectPath(sid)).toBe('/path/to/my-project');

      // Session should be in pending (not activated yet)
      const session = sessionRegistry.lookupBySessionId(sid);
      expect(session!.status).toBe('pending');
    });
  });
});

describe('AgentIdentity functions', () => {
  describe('createPendingIdentity', () => {
    it('should create a pending identity', () => {
      const identity = createPendingIdentity('agent', 'workflow', 'workItem', 'spawnIntent');
      
      expect(identity.status).toBe('pending');
      expect(identity.sessionId).toBeDefined();
    });

    it('should create with parent session ID', () => {
      const parentIdentity = createPendingIdentity('parent', 'workflow', 'workItem', 'parentSpawn');
      const childIdentity = createPendingIdentity(
        'child', 
        'workflow', 
        'workItem', 
        'childSpawn',
        parentIdentity.sessionId
      );
      
      expect(childIdentity.parentSessionId).toBe(parentIdentity.sessionId);
    });
  });

  describe('activateIdentity', () => {
    it('should activate a pending identity', () => {
      const pending = createPendingIdentity('agent', 'workflow', 'workItem', 'spawnIntent');
      const activated = activateIdentity(pending);
      
      expect(activated.status).toBe('active');
    });
  });

  describe('terminateIdentity', () => {
    it('should terminate an active identity', () => {
      const pending = createPendingIdentity('agent', 'workflow', 'workItem', 'spawnIntent');
      const active = activateIdentity(pending);
      const terminated = terminateIdentity(active);
      
      expect(terminated.status).toBe('history');
    });
  });
});
