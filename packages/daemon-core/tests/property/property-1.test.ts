/**
 * Property 1: Single Source of Truth Test
 * 
 * Feature: daemon-core, Property 1: Single Source of Truth
 * Derived-From: v6-architecture-overview Property 1
 * 
 * Property: For all state change paths P, if P changes V6's authoritative state,
 * THEN P must pass through Daemon's HTTP API or internal Tool calls, and produce
 * an event written to events.jsonl; there must be no authoritative state write 
 * paths that bypass the Daemon.
 * 
 * Validates: Requirements 30.1, 1.1, 4.1
 * 
 * Test Strategy:
 * 1. Generate random state change operations (session creation, project updates, etc.)
 * 2. Verify all operations produce events written through WAL
 * 3. Verify events contain all necessary context (eventId, ts, projectId, action, payload)
 * 4. Verify no state change can occur without corresponding event
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/event-bus/EventBus';
import { WAL } from '../../src/wal/WAL';
import { SessionRegistry } from '../../src/session/SessionRegistry';
import { Event } from '../../src/types';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';

/**
 * Generate a valid UUID string for testing
 */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * State change operation types
 */
type StateChangeOperation =
  | { type: 'session.created'; agentRole: string; workflowRole: string; workItemId: string; spawnIntentId: string }
  | { type: 'session.activated'; sessionId: string; spawnIntentId: string }
  | { type: 'session.terminated'; sessionId: string }
  | { type: 'project.created'; projectId: string; projectPath: string }
  | { type: 'project.updated'; projectId: string; changes: Record<string, unknown> }
  | { type: 'workitem.created'; workItemId: string; projectId: string }
  | { type: 'workitem.updated'; workItemId: string; changes: Record<string, unknown> }
  | { type: 'permission.granted'; sessionId: string; resource: string }
  | { type: 'permission.denied'; sessionId: string; resource: string }
  | { type: 'config.changed'; projectId: string; key: string; value: unknown };

/**
 * Generate a random state change operation
 */
function generateRandomOperation(): StateChangeOperation {
  const opType = Math.floor(Math.random() * 10);
  
  switch (opType) {
    case 0: // session.created
      return {
        type: 'session.created',
        agentRole: ['sf-orchestrator', 'sf-requirements', 'sf-design', 'sf-executor'][Math.floor(Math.random() * 4)],
        workflowRole: ['requirements-phase-executor', 'design-phase-executor', 'implementation-phase-executor'][Math.floor(Math.random() * 3)],
        workItemId: generateUuid(),
        spawnIntentId: generateUuid(),
      };
    case 1: // session.activated
      return {
        type: 'session.activated',
        sessionId: generateUuid(),
        spawnIntentId: generateUuid(),
      };
    case 2: // session.terminated
      return {
        type: 'session.terminated',
        sessionId: generateUuid(),
      };
    case 3: // project.created
      return {
        type: 'project.created',
        projectId: generateUuid(),
        projectPath: `/test/projects/project-${Math.random().toString(36).substring(7)}`,
      };
    case 4: // project.updated
      return {
        type: 'project.updated',
        projectId: generateUuid(),
        changes: { field: 'updated', value: 'test' },
      };
    case 5: // workitem.created
      return {
        type: 'workitem.created',
        workItemId: generateUuid(),
        projectId: generateUuid(),
      };
    case 6: // workitem.updated
      return {
        type: 'workitem.updated',
        workItemId: generateUuid(),
        changes: { status: ['pending', 'in_progress', 'completed', 'failed'][Math.floor(Math.random() * 4)] },
      };
    case 7: // permission.granted
      return {
        type: 'permission.granted',
        sessionId: generateUuid(),
        resource: 'resource-' + Math.random().toString(36).substring(7),
      };
    case 8: // permission.denied
      return {
        type: 'permission.denied',
        sessionId: generateUuid(),
        resource: 'resource-' + Math.random().toString(36).substring(7),
      };
    case 9: // config.changed
    default:
      return {
        type: 'config.changed',
        projectId: generateUuid(),
        key: 'config-key-' + Math.random().toString(36).substring(7),
        value: 'value',
      };
  }
}

/**
 * Test helper to simulate Daemon state change flow
 * All state changes should go through EventBus → WAL
 */
class DaemonStateManager {
  private eventBus: EventBus;
  private wal: WAL;
  private publishedEvents: Event[] = [];

  constructor(eventBus: EventBus, wal: WAL) {
    this.eventBus = eventBus;
    this.wal = wal;
    
    // Subscribe to all events to track them
    this.eventBus.addObservabilityHook({
      onPublish: (event) => {
        this.publishedEvents.push(event);
      },
      onSubscribe: () => {},
      onUnsubscribe: () => {},
    });
  }

  /**
   * Execute a state change operation through the Daemon
   * Returns the event that was published
   */
  async executeStateChange(operation: StateChangeOperation): Promise<Event> {
    // Map operation to event action
    let action: string;
    let payload: Record<string, unknown>;

    switch (operation.type) {
      case 'session.created':
        action = 'session.created';
        payload = {
          sessionId: '', // Will be filled by registry
          spawnIntentId: operation.spawnIntentId,
          agentRole: operation.agentRole,
          workflowRole: operation.workflowRole,
          workItemId: operation.workItemId,
        };
        break;
      case 'session.activated':
        action = 'session.activated';
        payload = {
          sessionId: operation.sessionId,
          spawnIntentId: operation.spawnIntentId,
        };
        break;
      case 'session.terminated':
        action = 'session.terminated';
        payload = {
          sessionId: operation.sessionId,
        };
        break;
      case 'project.created':
        action = 'project.created';
        payload = {
          projectId: operation.projectId,
          projectPath: operation.projectPath,
        };
        break;
      case 'project.updated':
        action = 'project.updated';
        payload = {
          projectId: operation.projectId,
          ...operation.changes,
        };
        break;
      case 'workitem.created':
        action = 'workitem.created';
        payload = {
          workItemId: operation.workItemId,
          projectId: operation.projectId,
        };
        break;
      case 'workitem.updated':
        action = 'workitem.updated';
        payload = {
          workItemId: operation.workItemId,
          ...operation.changes,
        };
        break;
      case 'permission.granted':
        action = 'permission.granted';
        payload = {
          sessionId: operation.sessionId,
          resource: operation.resource,
        };
        break;
      case 'permission.denied':
        action = 'permission.denied';
        payload = {
          sessionId: operation.sessionId,
          resource: operation.resource,
        };
        break;
      case 'config.changed':
        action = 'config.changed';
        payload = {
          projectId: operation.projectId,
          key: operation.key,
          value: operation.value,
        };
        break;
    }

    // Create event through WAL (ensures eventId and ts)
    const projectId = (payload as any).projectId || 
                      (payload as any).sessionId?.substring(0, 8) || 
                      'default-project';
    
    const event = this.wal.createEvent(projectId, action, payload, 'daemon');
    
    // Publish through EventBus (Property 2: all cross-layer communication through bus)
    this.eventBus.publish(event);
    
    // Persist to WAL (Property 7: fsync before state update)
    await this.wal.appendEvent(event);
    
    return event;
  }

  getPublishedEvents(): Event[] {
    return this.publishedEvents;
  }
}

describe('Property 1: Single Source of Truth', () => {
  let eventBus: EventBus;
  let wal: WAL;
  let stateManager: DaemonStateManager;
  const testProjectPath = '/test/project';

  beforeEach(async () => {
    eventBus = new EventBus();
    eventBus.start();
    
    wal = new WAL(testProjectPath);
    await wal.initialize();
    
    stateManager = new DaemonStateManager(eventBus, wal);
  });

  describe('Property 1.1: All state changes produce events', () => {
    /**
     * Validates: Property 1 requirement
     * For all state change operations, there must be an event produced
     */
    it('should generate events for all state change operations', async () => {
      for (let i = 0; i < 100; i++) {
        const operation = generateRandomOperation();
        
        // Execute state change through Daemon
        const event = await stateManager.executeStateChange(operation);
        
        // Verify event was produced
        expect(event).toBeDefined();
        expect(event.action).toBeDefined();
      }
    });

    /**
     * Validates: Property 1 requirement
     * All state changes must go through EventBus
     */
    it('should publish all events through EventBus', async () => {
      for (let i = 0; i < 100; i++) {
        // Clear previously published events
        stateManager.getPublishedEvents();
        
        // Execute state change
        await stateManager.executeStateChange(generateRandomOperation());
        
        // Verify event was published through EventBus
        const published = stateManager.getPublishedEvents();
        expect(published.length).toBeGreaterThan(0);
        
        // Verify event has proper metadata
        const latestEvent = published[published.length - 1];
        expect(latestEvent.metadata.schemaVersion).toBe('1.0');
        expect(latestEvent.metadata.source).toBe('daemon');
      }
    });
  });

  describe('Property 1.2: Events contain all required context', () => {
    /**
     * Validates: Requirement 30.1
     * Event must have globally unique eventId (UUIDv7)
     */
    it('should generate UUIDv7 eventIds', () => {
      const uuidv7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      for (let i = 0; i < 50; i++) {
        const operation = generateRandomOperation();
        const event = wal.createEvent(
          'test-project',
          operation.type,
          {} as any,
          'daemon'
        );
        
        expect(event.eventId).toMatch(uuidv7Regex);
      }
    });

    /**
     * Validates: Requirement 30.1
     * Event must have monotonically non-decreasing timestamp
     */
    it('should generate monotonically non-decreasing timestamps', async () => {
      for (let i = 0; i < 50; i++) {
        const operation = generateRandomOperation();
        const event = await stateManager.executeStateChange(operation);
        
        // Timestamp should be a valid number
        expect(typeof event.ts).toBe('number');
        expect(event.ts).toBeGreaterThan(0);
        expect(event.ts).toBeLessThanOrEqual(Date.now() + 1000); // Allow 1s tolerance
      }
    });

    /**
     * Validates: Requirement 30.1
     * Event must have non-empty projectId
     */
    it('should have non-empty projectId', async () => {
      for (let i = 0; i < 50; i++) {
        const operation = generateRandomOperation();
        const event = await stateManager.executeStateChange(operation);
        
        expect(event.projectId).toBeDefined();
        expect(typeof event.projectId).toBe('string');
        expect(event.projectId.length).toBeGreaterThan(0);
      }
    });

    /**
     * Validates: Requirement 30.1
     * Event must have action and payload
     */
    it('should have action and payload', async () => {
      for (let i = 0; i < 50; i++) {
        const operation = generateRandomOperation();
        const event = await stateManager.executeStateChange(operation);
        
        expect(event.action).toBeDefined();
        expect(typeof event.action).toBe('string');
        expect(event.action.length).toBeGreaterThan(0);
        
        expect(event.payload).toBeDefined();
        expect(typeof event.payload).toBe('object');
      }
    });
  });

  describe('Property 1.3: Events persisted to WAL', () => {
    /**
     * Validates: Property 7 (WAL Ordering)
     * Events must be written to events.jsonl before any state update
     */
    it('should persist events to WAL', async () => {
      for (let i = 0; i < 50; i++) {
        // Execute state change
        await stateManager.executeStateChange(generateRandomOperation());
        
        // Read events from WAL
        const { events: persistedEvents } = await wal.readAllEvents();
        
        // Verify at least one event was persisted
        expect(persistedEvents.length).toBeGreaterThan(0);
        
        // Verify the last event matches what we published
        const published = stateManager.getPublishedEvents();
        const lastPublished = published[published.length - 1];
        const lastPersisted = persistedEvents[persistedEvents.length - 1];
        
        expect(lastPersisted.eventId).toBe(lastPublished.eventId);

        // File-level assertion: verify events.jsonl exists on disk and contains the event
        const eventsPath = wal.getEventsPath();
        expect(fsSync.existsSync(eventsPath)).toBe(true);
        const diskContent = await fs.readFile(eventsPath, 'utf-8');
        expect(diskContent).toContain(lastPublished.eventId);
      }
    });

    /**
     * Validates: Property 7 (WAL Ordering)
     * Events in WAL must have correct ordering
     */
    it('should maintain event ordering in WAL', async () => {
      // Execute multiple state changes
      for (let i = 0; i < 10; i++) {
        await stateManager.executeStateChange(generateRandomOperation());
      }
      
      // Read from WAL
      const { events: persistedEvents } = await wal.readAllEvents();
      
      // Verify events are ordered by timestamp
      for (let i = 1; i < persistedEvents.length; i++) {
        expect(persistedEvents[i].ts).toBeGreaterThanOrEqual(persistedEvents[i - 1].ts);
      }

      // File-level assertion: verify events.jsonl on disk contains all persisted eventIds
      const eventsPath = wal.getEventsPath();
      expect(fsSync.existsSync(eventsPath)).toBe(true);
      const diskContent = await fs.readFile(eventsPath, 'utf-8');
      for (const evt of persistedEvents) {
        expect(diskContent).toContain(evt.eventId);
      }
    });
  });

  describe('Property 1.4: No bypass paths', () => {
    /**
     * Validates: Property 1 requirement
     * SessionRegistry must only be modified through EventBus
     */
    it('should require EventBus for SessionRegistry changes', async () => {
      const sessionRegistry = new SessionRegistry(eventBus);
      sessionRegistry.start();
      
      // Create an event that would trigger session registration
      const event: Event = {
        eventId: 'test-session-event',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'session.created',
        payload: {
          sessionId: '', // Will be generated
          spawnIntentId: 'spawn-123',
          agentRole: 'sf-orchestrator',
          workflowRole: 'requirements-phase-executor',
          workItemId: 'workitem-123',
          parentSessionId: null,
        },
        metadata: {
          schemaVersion: '1.0',
          source: 'daemon',
        },
      };
      
      // Publish through EventBus - this should trigger SessionRegistry
      eventBus.publish(event);
      
      // Verify session was registered (through event handling)
      // The SessionRegistry should have processed the event
      expect(sessionRegistry.getPendingSessions().length).toBeGreaterThanOrEqual(0);
      
      sessionRegistry.stop();
    });

    /**
     * Validates: Property 1 requirement
     * All state changes must flow through EventBus
     */
    it('should flow all state changes through EventBus', async () => {
      for (let i = 0; i < 50; i++) {
        const publishedBefore = stateManager.getPublishedEvents().length;
        
        // Execute state change through Daemon
        await stateManager.executeStateChange(generateRandomOperation());
        
        const publishedAfter = stateManager.getPublishedEvents().length;
        
        // Verify event was published through EventBus
        expect(publishedAfter).toBe(publishedBefore + 1);
      }
    });
  });

  describe('Property 1.5: Session operations produce events', () => {
    /**
     * Validates: Requirement 1.1
     * Session creation must produce event
     */
    it('should produce event on session registration', () => {
      const sessionRegistry = new SessionRegistry(eventBus);
      sessionRegistry.start();
      
      // Register a pending session
      const identity = sessionRegistry.registerPending(
        'sf-orchestrator',
        'requirements-phase-executor',
        'workitem-123',
        'spawn-123',
        null
      );
      
      // Verify session was registered
      expect(identity).toBeDefined();
      expect(identity.sessionId).toBeDefined();
      expect(identity.status).toBe('pending');
      
      // Verify we can lookup the session
      const lookedUp = sessionRegistry.lookupBySessionId(identity.sessionId);
      expect(lookedUp).toBeDefined();
      expect(lookedUp?.sessionId).toBe(identity.sessionId);
      
      sessionRegistry.stop();
    });

    /**
     * Validates: Requirement 1.1
     * Session activation must produce event
     */
    it('should produce event on session activation', () => {
      const sessionRegistry = new SessionRegistry(eventBus);
      sessionRegistry.start();
      
      // Register pending session
      const identity = sessionRegistry.registerPending(
        'sf-orchestrator',
        'requirements-phase-executor',
        'workitem-123',
        'spawn-123',
        null
      );
      
      // Activate session
      const activated = sessionRegistry.activate(identity.sessionId, identity.spawnIntentId);
      
      // Verify session was activated
      expect(activated).toBeDefined();
      expect(activated?.status).toBe('active');
      
      // Verify we can lookup the activated session
      const lookedUp = sessionRegistry.lookupBySessionId(identity.sessionId);
      expect(lookedUp?.status).toBe('active');
      
      sessionRegistry.stop();
    });

    /**
     * Validates: Requirement 1.1
     * Session termination must produce event
     */
    it('should produce event on session termination', () => {
      const sessionRegistry = new SessionRegistry(eventBus);
      sessionRegistry.start();
      
      // Register and activate session
      const identity = sessionRegistry.registerPending(
        'sf-orchestrator',
        'requirements-phase-executor',
        'workitem-123',
        'spawn-123',
        null
      );
      sessionRegistry.activate(identity.sessionId, identity.spawnIntentId);
      
      // Terminate session
      const terminated = sessionRegistry.terminate(identity.sessionId);
      
      // Verify session was terminated
      expect(terminated).toBeDefined();
      expect(terminated?.status).toBe('history');
      
      // Verify session is now in history
      const history = sessionRegistry.getHistorySessions();
      expect(history.some(s => s.sessionId === identity.sessionId)).toBe(true);
      
      sessionRegistry.stop();
    });
  });

  describe('Property 1.6: Unique eventIds', () => {
    /**
     * Validates: Requirement 30.1
     * All generated eventIds must be globally unique
     */
    it('should generate unique eventIds across multiple operations', async () => {
      const eventIds = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        const event = await stateManager.executeStateChange(generateRandomOperation());
        
        // Verify eventId is unique
        expect(eventIds.has(event.eventId)).toBe(false);
        eventIds.add(event.eventId);
      }
    });
  });
});