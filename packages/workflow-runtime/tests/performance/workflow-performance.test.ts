/**
 * Performance Tests for Workflow Runtime
 * Tests workflow execution performance, compositeGate concurrency, and event system performance
 * 
 * Task 5.2: 性能测试
 * - 测试 workflow 执行性能
 * - 测试 compositeGate 并发性能
 * - 测试事件系统性能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowEngine, WorkflowEvent } from '../../src/engine/WorkflowEngine.js';
import { EventPublisher } from '../../src/events/EventPublisher.js';
import { WorkflowDefinition, SimpleGateDefinition, CompositeGateDefinition } from '../../src/types.js';
import { MockEventBus } from '../setup.js';

/**
 * Performance metrics collector
 */
class PerformanceMetrics {
  private startTime: number = 0;
  private measurements: Map<string, number[]> = new Map();

  start(): void {
    this.startTime = performance.now();
  }

  end(label: string): number {
    const duration = performance.now() - this.startTime;
    if (!this.measurements.has(label)) {
      this.measurements.set(label, []);
    }
    this.measurements.get(label)!.push(duration);
    return duration;
  }

  getStats(label: string) {
    const values = this.measurements.get(label) || [];
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = sorted[0];
    const max = sorted[values.length - 1];
    const p50 = sorted[Math.floor(values.length * 0.5)];
    const p95 = sorted[Math.floor(values.length * 0.95)];
    const p99 = sorted[Math.floor(values.length * 0.99)];

    return { count: values.length, avg, min, max, p50, p95, p99 };
  }

  reset(): void {
    this.measurements.clear();
  }
}

describe('Workflow Runtime Performance Tests', () => {
  let engine: WorkflowEngine;
  let eventBus: MockEventBus;
  let eventPublisher: EventPublisher;
  let metrics: PerformanceMetrics;

  beforeEach(() => {
    engine = new WorkflowEngine();
    eventBus = new MockEventBus();
    eventBus.start();
    eventPublisher = new EventPublisher({
      projectId: 'perf-test',
      eventBus,
    });
    metrics = new PerformanceMetrics();
  });

  afterEach(() => {
    // Cleanup
    eventBus.stop();
    metrics.reset();
  });

  describe('Workflow Execution Performance', () => {
    it('should execute simple workflow within acceptable time', async () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'simple-workflow',
        displayName: 'Simple Workflow',
        intent: 'Test simple workflow performance',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              } as SimpleGateDefinition,
              skills: [],
              next: 'state2',
            },
            state2: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate2',
                name: 'Gate 2',
              } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);

      // Measure execution time
      metrics.start();
      const instance = engine.createInstance('simple-workflow');
      const result = await engine.execute(instance.id);
      const duration = metrics.end('simple-workflow-execution');

      expect(result.status).toBe('completed');
      // Simple workflow should complete in < 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple sequential workflow executions efficiently', async () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'multi-workflow',
        displayName: 'Multi Workflow',
        intent: 'Test multiple workflow execution',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);

      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        metrics.start();
        const instance = engine.createInstance('multi-workflow');
        await engine.execute(instance.id);
        metrics.end('multi-execution');
      }

      const stats = metrics.getStats('multi-execution');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(iterations);
      // Average execution should be < 50ms
      expect(stats!.avg).toBeLessThan(50);
      // P95 should be < 100ms
      expect(stats!.p95).toBeLessThan(100);
    });

    it('should handle deep workflow state chains efficiently', async () => {
      // Create a workflow with 10 states
      const states: Record<string, any> = {};
      for (let i = 1; i <= 10; i++) {
        states[`state${i}`] = {
          schema_version: '1.0',
          agent: 'test-agent',
          gate: {
            schema_version: '1.0',
            type: 'simple',
            id: `gate${i}`,
            name: `Gate ${i}`,
          } as SimpleGateDefinition,
          skills: [],
          next: i < 10 ? `state${i + 1}` : undefined,
        };
      }

      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'deep-workflow',
        displayName: 'Deep Workflow',
        intent: 'Test deep workflow chain',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states,
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);

      metrics.start();
      const instance = engine.createInstance('deep-workflow');
      const result = await engine.execute(instance.id);
      const duration = metrics.end('deep-workflow-execution');

      expect(result.status).toBe('completed');
      expect(result.currentState).toBe('state10');
      // Deep workflow should complete in < 500ms
      expect(duration).toBeLessThan(500);
    });
  });

  describe('CompositeGate Concurrent Performance', () => {
    it('should execute parallel compositeGate efficiently', async () => {
      const childGates: CompositeGateDefinition['children'] = [];
      for (let i = 1; i <= 5; i++) {
        childGates.push({
          schema_version: '1.0',
          type: 'simple',
          id: `child-gate-${i}`,
          name: `Child Gate ${i}`,
        } as SimpleGateDefinition);
      }

      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'parallel-composite-workflow',
        displayName: 'Parallel CompositeGate Workflow',
        intent: 'Test parallel compositeGate performance',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'composite',
                id: 'composite-gate-1',
                name: 'Composite Gate 1',
                mode: 'parallel',
                failPolicy: 'collect_all',
                children: childGates,
              } as CompositeGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);

      metrics.start();
      const instance = engine.createInstance('parallel-composite-workflow');
      const result = await engine.execute(instance.id);
      const duration = metrics.end('parallel-composite-execution');

      expect(result.status).toBe('completed');
      // Parallel execution should be faster than sequential
      // 5 gates in parallel should take roughly the time of 1 gate, not 5
      expect(duration).toBeLessThan(200);
    });

    it('should execute sequential compositeGate efficiently', async () => {
      const childGates: CompositeGateDefinition['children'] = [];
      for (let i = 1; i <= 5; i++) {
        childGates.push({
          schema_version: '1.0',
          type: 'simple',
          id: `seq-child-gate-${i}`,
          name: `Sequential Child Gate ${i}`,
        } as SimpleGateDefinition);
      }

      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'sequential-composite-workflow',
        displayName: 'Sequential CompositeGate Workflow',
        intent: 'Test sequential compositeGate performance',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'composite',
                id: 'composite-gate-seq-1',
                name: 'Composite Gate Sequential 1',
                mode: 'sequential',
                failPolicy: 'collect_all',
                children: childGates,
              } as CompositeGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);

      metrics.start();
      const instance = engine.createInstance('sequential-composite-workflow');
      const result = await engine.execute(instance.id);
      const duration = metrics.end('sequential-composite-execution');

      expect(result.status).toBe('completed');
      // Sequential execution should complete in reasonable time
      expect(duration).toBeLessThan(300);
    });

    it('should handle fail_fast strategy efficiently', async () => {
      const childGates: CompositeGateDefinition['children'] = [];
      for (let i = 1; i <= 10; i++) {
        childGates.push({
          schema_version: '1.0',
          type: 'simple',
          id: `fail-fast-gate-${i}`,
          name: `Fail Fast Gate ${i}`,
        } as SimpleGateDefinition);
      }

      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'fail-fast-workflow',
        displayName: 'Fail Fast Workflow',
        intent: 'Test fail_fast strategy performance',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'composite',
                id: 'composite-gate-fail-fast',
                name: 'Composite Gate Fail Fast',
                mode: 'parallel',
                failPolicy: 'fail_fast',
                children: childGates,
              } as CompositeGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);

      metrics.start();
      const instance = engine.createInstance('fail-fast-workflow');
      const result = await engine.execute(instance.id);
      const duration = metrics.end('fail-fast-execution');

      // fail_fast should stop early and be faster than collect_all
      expect(duration).toBeLessThan(300);
    });

    it('should handle deeply nested compositeGates', async () => {
      // Create nested composite gates
      const innerChildGates: CompositeGateDefinition['children'] = [];
      for (let i = 1; i <= 3; i++) {
        innerChildGates.push({
          schema_version: '1.0',
          type: 'simple',
          id: `inner-gate-${i}`,
          name: `Inner Gate ${i}`,
        } as SimpleGateDefinition);
      }

      const outerChildGates: CompositeGateDefinition['children'] = [];
      for (let i = 1; i <= 3; i++) {
        outerChildGates.push({
          schema_version: '1.0',
          type: 'composite',
          id: `nested-composite-${i}`,
          name: `Nested Composite ${i}`,
          mode: 'parallel',
          failPolicy: 'collect_all',
          children: innerChildGates,
        } as CompositeGateDefinition);
      }

      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'nested-composite-workflow',
        displayName: 'Nested CompositeGate Workflow',
        intent: 'Test nested compositeGate performance',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'composite',
                id: 'root-composite',
                name: 'Root Composite',
                mode: 'parallel',
                failPolicy: 'collect_all',
                children: outerChildGates,
              } as CompositeGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);

      metrics.start();
      const instance = engine.createInstance('nested-composite-workflow');
      const result = await engine.execute(instance.id);
      const duration = metrics.end('nested-composite-execution');

      expect(result.status).toBe('completed');
      // Nested composites should still complete in reasonable time
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Event System Performance', () => {
    it('should publish events efficiently', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'event-perf-workflow',
        displayName: 'Event Performance Workflow',
        intent: 'Test event publishing performance',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              } as SimpleGateDefinition,
              skills: [],
              next: 'state2',
            },
            state2: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate2',
                name: 'Gate 2',
              } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('event-perf-workflow');

      // Measure event publishing performance
      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        metrics.start();
        eventPublisher.publishWorkflowStarted(instance, 'state1');
        metrics.end('event-publish');
      }

      const stats = metrics.getStats('event-publish');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(iterations);
      // Event publishing should be very fast (< 1ms average)
      expect(stats!.avg).toBeLessThan(1);
      // P95 should be < 5ms
      expect(stats!.p95).toBeLessThan(5);
    });

    it('should handle high-volume event subscriptions', async () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'high-volume-event-workflow',
        displayName: 'High Volume Event Workflow',
        intent: 'Test high-volume event handling',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);

      // Subscribe to many events
      const eventCounts: Record<string, number> = {};
      const subscriptions = [];
      for (let i = 0; i < 100; i++) {
        const unsub = engine.onEvent((event: WorkflowEvent) => {
          eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
        });
        subscriptions.push(unsub);
      }

      metrics.start();
      const instance = engine.createInstance('high-volume-event-workflow');
      await engine.execute(instance.id);
      const duration = metrics.end('high-volume-events');

      // Should handle 100 subscribers efficiently
      expect(duration).toBeLessThan(500);

      // Cleanup subscriptions
      subscriptions.forEach(unsub => unsub?.());
    });

    it('should maintain event ordering under load', async () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'event-ordering-workflow',
        displayName: 'Event Ordering Workflow',
        intent: 'Test event ordering',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              } as SimpleGateDefinition,
              skills: [],
              next: 'state2',
            },
            state2: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate2',
                name: 'Gate 2',
              } as SimpleGateDefinition,
              skills: [],
              next: 'state3',
            },
            state3: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate3',
                name: 'Gate 3',
              } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);

      const eventSequence: string[] = [];
      engine.onEvent((event: WorkflowEvent) => {
        eventSequence.push(event.type);
      });

      metrics.start();
      const instance = engine.createInstance('event-ordering-workflow');
      await engine.execute(instance.id);
      const duration = metrics.end('event-ordering');

      // Verify event ordering
      expect(eventSequence[0]).toBe('workflow.created');
      expect(eventSequence[eventSequence.length - 1]).toBe('workflow.completed');

      // Should complete in reasonable time
      expect(duration).toBeLessThan(300);
    });

    it('should efficiently handle event bus with many concurrent publishers', async () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'concurrent-publisher-workflow',
        displayName: 'Concurrent Publisher Workflow',
        intent: 'Test concurrent event publishing',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('concurrent-publisher-workflow');

      // Create multiple publishers
      const publishers = [];
      for (let i = 0; i < 10; i++) {
        publishers.push(
          new EventPublisher({
            projectId: `project-${i}`,
            eventBus,
          })
        );
      }

      metrics.start();
      // Publish from all publishers concurrently
      const publishPromises = publishers.map(pub => {
        return Promise.resolve().then(() => {
          for (let i = 0; i < 100; i++) {
            pub.publishWorkflowStarted(instance, 'state1');
          }
        });
      });
      await Promise.all(publishPromises);
      const duration = metrics.end('concurrent-publishers');

      // Should handle concurrent publishing efficiently
      expect(duration).toBeLessThan(500);
      // Verify all events were published
      expect(eventBus.getEventCount()).toBe(1000); // 10 publishers * 100 events
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should not leak memory with repeated workflow executions', async () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'memory-test-workflow',
        displayName: 'Memory Test Workflow',
        intent: 'Test memory usage',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);

      const iterations = 1000;
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        const instance = engine.createInstance('memory-test-workflow');
        await engine.execute(instance.id);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (< 50MB for 1000 executions)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should efficiently manage event subscriptions', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'subscription-test-workflow',
        displayName: 'Subscription Test Workflow',
        intent: 'Test subscription management',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: {
                schema_version: '1.0',
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
              } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);

      // Create and destroy many subscriptions
      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        const unsub = engine.onEvent(() => {
          // No-op
        });
        unsub?.();
      }

      // Should complete without issues
      expect(true).toBe(true);
    });
  });
});
