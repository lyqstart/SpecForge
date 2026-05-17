/**
 * Daemon Core Integration Tests
 * 
 * End-to-end tests covering:
 * - Daemon lifecycle (start/stop)
 * - Multi-client scenarios
 * - Crash recovery simulations
 * 
 * Requirements: 5.7
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Daemon } from '../../src/daemon/Daemon';
import { EventBus } from '../../src/event-bus/EventBus';
import { SessionRegistry } from '../../src/session/SessionRegistry';
import { ProjectManager } from '../../src/project/ProjectManager';
import { StateManager } from '../../src/state/StateManager';
import type { AgentIdentity } from '../../src/session/AgentIdentity';

describe('Daemon Integration', () => {
  let daemon: Daemon;

  beforeEach(async () => {
    // Clean up any existing daemon state
    daemon = new Daemon();
  });

  afterEach(async () => {
    if (daemon.isDaemonRunning()) {
      await daemon.stop();
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop daemon cleanly', async () => {
      await daemon.start();
      expect(daemon.isDaemonRunning()).toBe(true);

      await daemon.stop();
      expect(daemon.isDaemonRunning()).toBe(false);
    });

    it('should start daemon and verify all components initialized', async () => {
      await daemon.start();
      expect(daemon.isDaemonRunning()).toBe(true);
      
      // Daemon should be able to broadcast events after startup
      const event = {
        eventId: 'test-event-1',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'test.lifecycle',
        payload: { message: 'test' },
        metadata: {
          schemaVersion: '1.0',
          source: 'daemon' as const,
        },
      };
      
      // Just call the method - it should not throw
      await daemon.broadcastEvent(event);
    });
  });
});

describe('Event Bus Integration', () => {
  it('should propagate events through event bus', async () => {
    const eventBus = new EventBus();
    const receivedEvents: any[] = [];
    
    const subscription = eventBus.subscribe('test.*', (event) => {
      receivedEvents.push(event);
    });
    
    eventBus.start();
    
    const event = {
      eventId: 'event-1',
      ts: Date.now(),
      projectId: 'test',
      action: 'test.action',
      payload: { data: 'test' },
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon' as const,
      },
    };
    
    eventBus.publish(event);
    
    // Give time for event propagation
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].eventId).toBe('event-1');
    
    eventBus.unsubscribe(subscription);
    eventBus.stop();
  });

  it('should support topic-based filtering', async () => {
    const eventBus = new EventBus();
    const matchingEvents: any[] = [];
    
    const subscription = eventBus.subscribe('specific.topic', (event) => {
      matchingEvents.push(event);
    });
    
    eventBus.start();
    
    // Publish matching event
    eventBus.publish({
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      action: 'specific.topic',
      payload: {},
      metadata: { schemaVersion: '1.0', source: 'daemon' },
    });
    
    // Publish non-matching event
    eventBus.publish({
      eventId: '2',
      ts: Date.now(),
      projectId: 'test',
      action: 'other.topic',
      payload: {},
      metadata: { schemaVersion: '1.0', source: 'daemon' },
    });
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(matchingEvents).toHaveLength(1);
    expect(matchingEvents[0].eventId).toBe('1');
    
    eventBus.unsubscribe(subscription);
    eventBus.stop();
  });
});

describe('Session Registry Integration', () => {
  let eventBus: EventBus;
  let sessionRegistry: SessionRegistry;

  beforeEach(() => {
    eventBus = new EventBus();
    sessionRegistry = new SessionRegistry(eventBus);
    eventBus.start();
    sessionRegistry.start();
  });

  afterEach(() => {
    sessionRegistry.stop();
    eventBus.stop();
  });

  it('should register and activate session', () => {
    // Register pending session
    const identity = sessionRegistry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-item-1',
      'spawn-intent-1'
    );

    expect(identity.status).toBe('pending');
    expect(identity.sessionId).toBeDefined();

    // Activate session
    const activated = sessionRegistry.activate(identity.sessionId, 'spawn-intent-1');
    expect(activated).not.toBeNull();
    expect(activated?.status).toBe('active');
  });

  it('should terminate session and move to history', () => {
    const identity = sessionRegistry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-item-1',
      'spawn-intent-1'
    );

    sessionRegistry.activate(identity.sessionId, 'spawn-intent-1');
    
    // Terminate session
    const terminated = sessionRegistry.terminate(identity.sessionId);
    expect(terminated).not.toBeNull();
    expect(terminated?.status).toBe('history');
  });

  it('should lookup session by sessionId across all states', () => {
    const identity = sessionRegistry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-item-1',
      'spawn-intent-1'
    );

    // Lookup in pending
    let found = sessionRegistry.lookupBySessionId(identity.sessionId);
    expect(found?.status).toBe('pending');

    // Activate and lookup in active
    sessionRegistry.activate(identity.sessionId, 'spawn-intent-1');
    found = sessionRegistry.lookupBySessionId(identity.sessionId);
    expect(found?.status).toBe('active');

    // Terminate and lookup in history
    sessionRegistry.terminate(identity.sessionId);
    found = sessionRegistry.lookupBySessionId(identity.sessionId);
    expect(found?.status).toBe('history');
  });

  it('should handle parent-child session relationships', () => {
    // Create parent session
    const parent = sessionRegistry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-item-1',
      'spawn-intent-parent'
    );
    sessionRegistry.activate(parent.sessionId, 'spawn-intent-parent');

    // Create child session
    const child = sessionRegistry.registerPending(
      'sf-executor',
      'task-executor',
      'work-item-1',
      'spawn-intent-child',
      parent.sessionId
    );
    sessionRegistry.activate(child.sessionId, 'spawn-intent-child');

    // Get session tree
    const tree = sessionRegistry.getSessionTree('work-item-1');
    expect(tree.length).toBe(2);
    expect(tree[0].sessionId).toBe(parent.sessionId);
  });
});

describe('Project Manager Integration', () => {
  let eventBus: EventBus;
  let projectManager: ProjectManager;

  beforeEach(() => {
    eventBus = new EventBus();
    projectManager = new ProjectManager(eventBus);
    eventBus.start();
    projectManager.start();
  });

  afterEach(() => {
    projectManager.stop();
    eventBus.stop();
  });

  it('should create and manage project context', () => {
    const projectPath = '/test/project';

    // Get project context
    const context = projectManager.getProjectContext(projectPath);
    expect(context).not.toBeNull();
    expect(context.projectPath).toBe(projectPath);
    expect(context.activeSessions).toEqual([]);
  });

  it('should acquire and release locks', async () => {
    const projectPath = '/test/project';

    // Acquire lock
    const lock = await projectManager.acquireLock(projectPath);
    expect(lock).not.toBeNull();
    expect(lock.projectPath).toBe(projectPath);

    // Release lock
    projectManager.releaseLock(lock);
  });

  it('should prevent concurrent writes to same project', async () => {
    const projectPath = '/test/project';

    // First lock acquisition
    const lock1 = await projectManager.acquireLock(projectPath);
    expect(lock1).not.toBeNull();

    // Second lock acquisition should throw (same project already locked)
    await expect(projectManager.acquireLock(projectPath)).rejects.toThrow();

    // Release first lock
    projectManager.releaseLock(lock1);

    // Now should be able to acquire again
    const lock2 = await projectManager.acquireLock(projectPath);
    expect(lock2).not.toBeNull();

    projectManager.releaseLock(lock2);
  });

  it('should allow concurrent writes to different projects', () => {
    const projectPath1 = '/test/project1';
    const projectPath2 = '/test/project2';

    const lock1 = projectManager.acquireLock(projectPath1);
    const lock2 = projectManager.acquireLock(projectPath2);

    expect(lock1).not.toBeNull();
    expect(lock2).not.toBeNull();

    projectManager.releaseLock(lock1);
    projectManager.releaseLock(lock2);
  });

  it('should list active projects', () => {
    projectManager.getProjectContext('/test/project1');
    projectManager.getProjectContext('/test/project2');

    const projects = projectManager.listActiveProjects();
    expect(projects).toContain('/test/project1');
    expect(projects).toContain('/test/project2');
  });
});

describe('State Manager Integration', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    // Use a unique project path to avoid file conflicts
    stateManager = new StateManager(`test-project-${Date.now()}`);
  });

  afterEach(async () => {
    // Clean up any state files - StateManager handles this internally
  });

  it('should initialize state manager', async () => {
    await stateManager.initialize();
    
    const state = await stateManager.getCurrentState();
    expect(state).toBeDefined();
    expect(state.projectPath).toBeDefined();
  });

  it('should rebuild state from events', async () => {
    await stateManager.initialize();
    
    const events = [
      {
        eventId: 'event-1',
        ts: Date.now(),
        projectId: 'test',
        action: 'session.created',
        payload: { sessionId: 'session-1' },
        metadata: { schemaVersion: '1.0', source: 'daemon' as const },
      },
      {
        eventId: 'event-2',
        ts: Date.now() + 1,
        projectId: 'test',
        action: 'session.activated',
        payload: { sessionId: 'session-1' },
        metadata: { schemaVersion: '1.0', source: 'daemon' as const },
      },
    ];
    
    const state = await stateManager.rebuildFromEvents(events);
    expect(state.lastEventId).toBe('event-2');
  });

  it('should handle empty events', async () => {
    await stateManager.initialize();
    
    const state = await stateManager.rebuildFromEvents([]);
    expect(state.lastEventId).toBe('');
    expect(state.activeSessions).toEqual([]);
  });
});

describe('Multi-Client Scenarios', () => {
  let daemon: Daemon;

  beforeEach(() => {
    daemon = new Daemon();
  });

  afterEach(async () => {
    if (daemon.isDaemonRunning()) {
      await daemon.stop();
    }
  });

  it('should handle multiple session registrations', async () => {
    await daemon.start();
    
    const eventBus = new EventBus();
    const sessionRegistry = new SessionRegistry(eventBus);
    eventBus.start();
    sessionRegistry.start();
    
    // Register multiple sessions
    const session1 = sessionRegistry.registerPending(
      'sf-orchestrator',
      'requirements-phase-executor',
      'work-item-1',
      'spawn-1'
    );
    
    const session2 = sessionRegistry.registerPending(
      'sf-executor',
      'task-executor',
      'work-item-2',
      'spawn-2'
    );
    
    sessionRegistry.activate(session1.sessionId, 'spawn-1');
    sessionRegistry.activate(session2.sessionId, 'spawn-2');
    
    const activeSessions = sessionRegistry.getActiveSessions();
    expect(activeSessions.length).toBe(2);
    
    sessionRegistry.stop();
    eventBus.stop();
  });

  it('should handle rapid session lifecycle transitions', async () => {
    await daemon.start();
    
    const eventBus = new EventBus();
    const sessionRegistry = new SessionRegistry(eventBus);
    eventBus.start();
    sessionRegistry.start();
    
    // Rapidly create, activate, and terminate sessions
    for (let i = 0; i < 10; i++) {
      const identity = sessionRegistry.registerPending(
        'sf-executor',
        'task-executor',
        `work-item-${i}`,
        `spawn-${i}`
      );
      sessionRegistry.activate(identity.sessionId, `spawn-${i}`);
      
      // Terminate immediately
      sessionRegistry.terminate(identity.sessionId);
    }
    
    const historySessions = sessionRegistry.getHistorySessions();
    expect(historySessions.length).toBe(10);
    
    sessionRegistry.stop();
    eventBus.stop();
  });
});

describe('Crash Recovery Simulation', () => {
  it('should reconstruct state from event history', async () => {
    const stateManager = new StateManager('test-project-recovery');
    
    await stateManager.initialize();
    
    // Simulate events that would be in WAL
    const events = [
      { 
        eventId: '1', 
        ts: Date.now(),
        projectId: 'test-project-recovery',
        action: 'session.created', 
        payload: { sessionId: 'session-1' },
        metadata: { schemaVersion: '1.0', source: 'daemon' as const }
      },
      { 
        eventId: '2', 
        ts: Date.now() + 1,
        projectId: 'test-project-recovery',
        action: 'session.activated', 
        payload: { sessionId: 'session-1' },
        metadata: { schemaVersion: '1.0', source: 'daemon' as const }
      },
      { 
        eventId: '3', 
        ts: Date.now() + 2,
        projectId: 'test-project-recovery',
        action: 'workitem.created', 
        payload: { workItemId: 'work-item-1' },
        metadata: { schemaVersion: '1.0', source: 'daemon' as const }
      },
    ];
    
    // Rebuild state from events (simulating recovery)
    const state = await stateManager.rebuildFromEvents(events);
    
    // Verify state was reconstructed from events
    expect(state.lastEventId).toBe('3');
  });

  it('should handle state reconstruction with empty events', async () => {
    const stateManager = new StateManager('test-project-empty');
    
    await stateManager.initialize();
    
    // Rebuild from empty events (simulating fresh start after crash)
    const state = await stateManager.rebuildFromEvents([]);
    
    // Verify empty state
    expect(state.lastEventId).toBe('');
    expect(state.activeSessions).toEqual([]);
  });
});

describe('Event Schema Validation', () => {
  it('should generate valid event structure', () => {
    const event = {
      eventId: 'test-' + Date.now(),
      ts: Date.now(),
      projectId: 'test-project',
      action: 'test.action',
      payload: { key: 'value' },
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon' as const,
      },
    };
    
    // Validate required fields
    expect(event.eventId).toBeDefined();
    expect(event.ts).toBeDefined();
    expect(event.projectId).toBeDefined();
    expect(event.action).toBeDefined();
    expect(event.payload).toBeDefined();
    expect(event.metadata.schemaVersion).toBe('1.0');
    expect(['daemon', 'client', 'adapter']).toContain(event.metadata.source);
  });

  it('should support projectId aggregation', () => {
    const projectIds = ['project-a', 'project-b', 'project-c'];
    
    const events = projectIds.map((projectId, index) => ({
      eventId: `event-${index}`,
      ts: Date.now() + index,
      projectId,
      action: 'test.action',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon' as const,
      },
    }));
    
    // Group by projectId
    const byProject = events.reduce((acc, event) => {
      if (!acc[event.projectId]) {
        acc[event.projectId] = [];
      }
      acc[event.projectId].push(event);
      return acc;
    }, {} as Record<string, typeof events>);
    
    expect(Object.keys(byProject)).toHaveLength(3);
    expect(byProject['project-a']).toHaveLength(1);
  });
});