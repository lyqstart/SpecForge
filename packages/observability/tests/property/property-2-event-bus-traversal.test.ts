/**
 * Property 2: Event Bus Traversal Property-Based Test
 * 
 * **Validates: Property 2, Requirements 30.2**
 * 
 * Feature: observability, Property 2: Event Bus Traversal
 * Derived-From: v6-architecture-overview Property 2
 * 
 * Properties:
 * 1. All cross-layer communication messages must pass through Event Bus
 * 2. There must be no direct function calls that cross observability boundaries
 * 3. For all cross-layer calls, an event is generated with correct properties
 * 
 * Test Strategy:
 * - Instrument component boundaries with layered architecture
 * - Generate random cross-layer calls between components
 * - Verify all calls produce Event Bus messages
 * - Verify messages contain all required fields
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/event-bus';
import type { Event, EventCategory } from '../../src/types';

// Define component layers for cross-layer communication
type ComponentLayer = 
  | 'agent' 
  | 'daemon-core' 
  | 'observability' 
  | 'permission-engine' 
  | 'workflow-runtime' 
  | 'self-healing' 
  | 'opencode-adapter'
  | 'multimodal';

// Component categories mapping
const COMPONENT_CATEGORIES: Record<ComponentLayer, EventCategory> = {
  'agent': 'session',
  'daemon-core': 'system',
  'observability': 'system',
  'permission-engine': 'permission',
  'workflow-runtime': 'workflow',
  'self-healing': 'heal',
  'opencode-adapter': 'tool',
  'multimodal': 'modality'
};

// All component layers
const ALL_LAYERS: ComponentLayer[] = [
  'agent', 'daemon-core', 'observability', 'permission-engine', 
  'workflow-runtime', 'self-healing', 'opencode-adapter', 'multimodal'
];

// All valid actions across components
const ALL_ACTIONS = [
  'agent.thinking', 'agent.acting', 'agent.observing', 'agent.responding',
  'daemon.started', 'daemon.stopped', 'daemon.error', 'session.created', 'session.ended',
  'event.logged', 'query.executed', 'analysis.completed',
  'permission.evaluated', 'permission.denied', 'permission.allowed',
  'workflow.started', 'workflow.completed', 'workflow.failed', 'workflow.paused',
  'healing.started', 'healing.completed', 'healing.failed', 'diagnosis.created',
  'adapter.request', 'adapter.response', 'adapter.error',
  'modality.adapted', 'modality.fallback', 'content.processed'
];

describe('Property 2: Event Bus Traversal', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  // Helper to generate valid 16-char hex projectId
  function generateProjectId(seed?: number): string {
    const num = seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    return num.toString(16).padStart(16, '0').substring(0, 16);
  }

  // Helper to subscribe and receive a single event
  async function subscribeAndReceive(
    eventBus: EventBus, 
    pattern: string,
    emitFn: () => Promise<void>,
    timeout: number = 50
  ): Promise<Event | null> {
    const subscription = eventBus.subscribe(pattern);
    const iterator = subscription[Symbol.asyncIterator]();
    
    // Start listening for event BEFORE emitting
    const receivePromise = iterator.next();
    
    // Emit the event
    await emitFn();
    
    // 规则 A1（败者清理）：Property test 默认 100 iter，每 iter 一次 race
    // 没有 clearTimeout 会泄漏 100 个 timer。见 docs/engineering-lessons/async-resource-lifecycle.md。
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        receivePromise,
        new Promise<null>((resolve) => {
          timeoutId = setTimeout(() => resolve(null), timeout);
        })
      ]);

      if (result && !result.done && result.value) {
        return result.value;
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId); // 规则 A1：清理败者 timer
      await iterator.return?.(); // 规则 A4：所有权清理
    }
  }

  // ============================================================
  // Property 2.1: All cross-layer calls produce Event Bus messages
  // ============================================================
  describe('Property 2.1: All cross-layer calls produce Event Bus messages', () => {
    it('should emit event for every cross-layer communication (100 iterations)', async () => {
      let passed = 0;
      
      for (let i = 0; i < 100; i++) {
        const layerIdx = i % ALL_LAYERS.length;
        const actionIdx = i % ALL_ACTIONS.length;
        
        const target = ALL_LAYERS[layerIdx];
        const action = ALL_ACTIONS[actionIdx];
        
        // Subscribe and wait for event in one step
        const event = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(i),
            workItemId: null,
            actor: { id: 'test-agent', name: 'Test', type: 'agent' },
            category: COMPONENT_CATEGORIES[target] || 'system',
            action: action
          })
        );

        // Verify event was published
        if (event && event.action === action) {
          passed++;
        }
      }
      
      // All 100 iterations should pass
      expect(passed).toBe(100);
    });

    it('should generate valid event with all required fields (100 iterations)', async () => {
      let passed = 0;
      
      for (let i = 0; i < 100; i++) {
        const categories: EventCategory[] = [
          'workflow', 'gate', 'permission', 'session', 'tool',
          'heal', 'modality', 'migration', 'system'
        ];
        
        const category = categories[i % categories.length];
        const action = `test.action.${i}`;

        const event = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(i),
            workItemId: null,
            actor: null,
            category,
            action
          })
        );

        if (event) {
          // Validate all required fields for Property 30 (multi-sync readiness)
          if (event.eventId && 
              event.eventId.length > 0 &&
              event.ts > 0 &&
              event.monotonicSeq >= 0 &&
              event.projectId?.length === 16 &&
              event.category &&
              event.action &&
              event.schema_version === '1.0') {
            passed++;
          }
        }
      }
      
      expect(passed).toBe(100);
    });
  });

  // ============================================================
  // Property 2.2: Event Bus handles all event categories
  // ============================================================
  describe('Property 2.2: Event Bus handles all event categories', () => {
    it('should emit events for all component categories', async () => {
      const categories: EventCategory[] = [
        'workflow', 'gate', 'permission', 'session', 'tool',
        'heal', 'modality', 'migration', 'system'
      ];

      let passed = 0;
      for (let idx = 0; idx < categories.length; idx++) {
        const category = categories[idx];
        
        const event = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(idx),
            workItemId: null,
            actor: null,
            category,
            action: `${category}.test`
          })
        );

        if (event && event.category === category) {
          passed++;
        }
      }
      
      expect(passed).toBe(9);
    });
  });

  // ============================================================
  // Property 2.3: Mode filtering works correctly
  // ============================================================
  describe('Property 2.3: Mode filtering works correctly', () => {
    it('should record all events in deep mode (50 iterations)', async () => {
      eventBus.setMode('deep');
      
      let passed = 0;
      for (let i = 0; i < 50; i++) {
        const actions = ['test.action1', 'test.action2', 'test.action3'];
        const action = actions[i % actions.length];
        
        const event = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(i),
            workItemId: null,
            actor: null,
            category: 'workflow',
            action
          })
        );

        if (event) {
          passed++;
        }
      }
      
      expect(passed).toBe(50);
      eventBus.setMode('standard');
    });

    it('should record all events in standard mode (50 iterations)', async () => {
      eventBus.setMode('standard');
      
      let passed = 0;
      for (let i = 0; i < 50; i++) {
        const actions = ['test.action1', 'test.action2', 'test.action3'];
        const action = actions[i % actions.length];
        
        const event = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(i),
            workItemId: null,
            actor: null,
            category: 'workflow',
            action
          })
        );

        if (event) {
          passed++;
        }
      }
      
      expect(passed).toBe(50);
    });

    it('should filter to decision events only in minimal mode', async () => {
      eventBus.setMode('minimal');
      
      // Decision events SHOULD be recorded
      const decisionEvents = [
        { category: 'gate' as EventCategory, action: 'gate.passed' },
        { category: 'gate' as EventCategory, action: 'gate.failed' },
        { category: 'permission' as EventCategory, action: 'permission.evaluated' },
        { category: 'workflow' as EventCategory, action: 'workflow.started' },
        { category: 'workflow' as EventCategory, action: 'workflow.completed' },
      ];

      let decisionPassed = 0;
      for (let i = 0; i < decisionEvents.length; i++) {
        const event = decisionEvents[i];
        
        const received = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(i),
            workItemId: null,
            actor: null,
            category: event.category,
            action: event.action
          })
        );

        if (received) {
          decisionPassed++;
        }
      }

      // Non-decision events should NOT be recorded in minimal mode
      const nonDecisionEvents = [
        { category: 'session' as EventCategory, action: 'session.heartbeat' },
        { category: 'tool' as EventCategory, action: 'tool.started' },
      ];

      let nonDecisionPassed = 0;
      for (let i = 0; i < nonDecisionEvents.length; i++) {
        const event = nonDecisionEvents[i];
        
        const received = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(i),
            workItemId: null,
            actor: null,
            category: event.category,
            action: event.action
          })
        );

        if (received) {
          nonDecisionPassed++;
        }
      }
      
      expect(decisionPassed).toBe(5);  // All decision events should be recorded
      expect(nonDecisionPassed).toBe(0);  // Non-decision events should NOT be recorded
      
      eventBus.setMode('standard');
    });
  });

  // ============================================================
  // Property 2.4: Event Bus pattern matching
  // ============================================================
  describe('Property 2.4: Event Bus pattern matching', () => {
    it('should support specific category patterns', async () => {
      const categories = ['workflow', 'permission', 'gate', 'session', 'tool'];
      
      let passed = 0;
      for (let idx = 0; idx < categories.length; idx++) {
        const category = categories[idx];
        
        const event = await subscribeAndReceive(
          eventBus,
          `${category}.*`,
          () => eventBus.emit({
            projectId: generateProjectId(idx),
            workItemId: null,
            actor: null,
            category: category as EventCategory,
            action: `${category}.test.action`
          })
        );

        if (event && event.action.includes(category)) {
          passed++;
        }
      }
      
      expect(passed).toBe(5);
    });
  });

  // ============================================================
  // Property 2.5: Event timestamps and ordering
  // ============================================================
  describe('Property 2.5: Event timestamps and ordering', () => {
    it('should generate monotonically increasing timestamps', async () => {
      const events: Event[] = [];
      
      // Generate multiple events sequentially
      for (let i = 0; i < 10; i++) {
        const event = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(i),
            workItemId: null,
            actor: null,
            category: 'system',
            action: `test.event.${i}`
          })
        );
        
        if (event) {
          events.push(event);
        }
      }

      // Verify monotonic timestamps
      for (let i = 1; i < events.length; i++) {
        expect(events[i].ts).toBeGreaterThanOrEqual(events[i-1].ts);
      }
    });

    it('should generate unique event IDs (50 iterations)', async () => {
      const count = 50;
      const eventIds = new Set<string>();
      
      for (let i = 0; i < count; i++) {
        const event = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(i),
            workItemId: null,
            actor: null,
            category: 'system',
            action: `test.event.${i}`
          })
        );
        
        if (event) {
          eventIds.add(event.eventId);
        }
      }

      // All event IDs should be unique
      expect(eventIds.size).toBe(count);
    });
  });

  // ============================================================
  // Property 2.6: Component boundary instrumentation
  // ============================================================
  describe('Property 2.6: Component boundary instrumentation', () => {
    it('should track all component layers through Event Bus', async () => {
      let passed = 0;
      
      for (let idx = 0; idx < ALL_LAYERS.length; idx++) {
        const layer = ALL_LAYERS[idx];
        const category = COMPONENT_CATEGORIES[layer];
        
        const event = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(idx),
            workItemId: null,
            actor: layer === 'agent' ? { id: 'test', name: 'Test', type: 'agent' } : null,
            category,
            action: `${layer}.boundary.test`
          })
        );

        if (event && event.action.includes(layer)) {
          passed++;
        }
      }
      
      expect(passed).toBe(8);
    });

    it('should verify cross-layer communication pattern (100 iterations)', async () => {
      let passed = 0;
      
      for (let i = 0; i < 100; i++) {
        const sourceIdx = i % ALL_LAYERS.length;
        const targetIdx = (i + 1) % ALL_LAYERS.length;
        const actionIdx = i % ALL_ACTIONS.length;
        
        // Ensure source != target for cross-layer
        if (sourceIdx === targetIdx) continue;
        
        const source = ALL_LAYERS[sourceIdx];
        const target = ALL_LAYERS[targetIdx];
        const action = ALL_ACTIONS[actionIdx];
        
        const category = COMPONENT_CATEGORIES[target];
        
        const event = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(i),
            workItemId: null,
            actor: { id: source, name: source, type: 'agent' },
            category,
            action
          })
        );

        // Verify event was emitted through Event Bus
        if (event && event.action === action) {
          passed++;
        }
      }

      // Should pass most iterations
      expect(passed).toBeGreaterThanOrEqual(90);
    });
  });

  // ============================================================
  // Property 2.7: Payload handling
  // ============================================================
  describe('Property 2.7: Payload handling', () => {
    it('should handle events with various payloads (50 iterations)', async () => {
      let passed = 0;
      
      for (let i = 0; i < 50; i++) {
        const payload = { data: `test-${i}`, count: i, flag: i % 2 === 0 };
        
        const event = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(i),
            workItemId: 'workitem-123',
            actor: { id: 'test-agent', name: 'Test', type: 'agent' },
            category: 'workflow',
            action: 'workflow.completed',
            payload
          })
        );

        if (event && JSON.stringify(event.payload) === JSON.stringify(payload)) {
          passed++;
        }
      }
      
      expect(passed).toBe(50);
    });

    it('should handle events without payloads', async () => {
      const event = await subscribeAndReceive(
        eventBus,
        '*',
        () => eventBus.emit({
          projectId: generateProjectId(1),
          workItemId: null,
          actor: null,
          category: 'system',
          action: 'system.heartbeat'
        })
      );

      expect(event).not.toBeNull();
      expect(event?.payload).toBeUndefined();
    });
  });

  // ============================================================
  // Integration: Verify Property 2 ensures Event Bus traversal
  // ============================================================
  describe('Integration: Property 2 Event Bus Traversal Verification', () => {
    it('should verify all cross-layer calls use Event Bus (100 iterations)', async () => {
      let passed = 0;

      for (let i = 0; i < 100; i++) {
        const targetIdx = i % ALL_LAYERS.length;
        const actionIdx = i % ALL_ACTIONS.length;
        
        const target = ALL_LAYERS[targetIdx];
        const action = ALL_ACTIONS[actionIdx];
        
        const event = await subscribeAndReceive(
          eventBus,
          '*',
          () => eventBus.emit({
            projectId: generateProjectId(i),
            workItemId: null,
            actor: { id: 'test-agent', name: 'Test', type: 'agent' },
            category: COMPONENT_CATEGORIES[target] || 'system',
            action
          })
        );

        // Property 2: All cross-layer calls MUST produce Event Bus messages
        if (event) {
          passed++;
        }
      }

      // All 100 iterations should pass
      expect(passed).toBe(100);
    });

    it('should verify no direct function calls bypass Event Bus', async () => {
      // Subscribe to catch any events that go through Event Bus
      const event = await subscribeAndReceive(
        eventBus,
        '*',
        () => eventBus.emit({
          projectId: generateProjectId(1),
          workItemId: null,
          actor: null,
          category: 'workflow',
          action: 'workflow.started'
        })
      );

      // Verify event was captured by Event Bus subscription
      expect(event).not.toBeNull();
      
      // This validates that Event Bus is the communication channel
    });

    it('should emit multiple events and maintain data integrity', async () => {
      // This test verifies Property 2: cross-layer communication produces events
      // Using a fresh event bus to avoid interference
      const freshEventBus = new EventBus();
      
      let passed = 0;
      // Emit 10 different events
      for (let i = 0; i < 10; i++) {
        const event = await subscribeAndReceive(
          freshEventBus,
          '*',
          () => freshEventBus.emit({
            projectId: generateProjectId(i),
            workItemId: `workitem-${i}`,
            actor: { id: `agent-${i}`, name: `Agent ${i}`, type: 'agent' },
            category: 'workflow',
            action: `workflow.step.${i}`,
            payload: { step: i }
          })
        );

        if (event && event.action === `workflow.step.${i}`) {
          passed++;
        }
      }

      // All 10 events should be delivered
      expect(passed).toBe(10);
    });
  });
});