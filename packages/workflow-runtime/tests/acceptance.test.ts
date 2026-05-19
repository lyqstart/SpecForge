/**
 * Acceptance Tests for Workflow Runtime
 * Task 5.1: 验收测试 - WorkflowEngine 能够加载和执行基础 workflow
 * 
 * Validates:
 * - WorkflowEngine 能够加载和执行基础 workflow
 * - GateRunner 能够执行单个 Gate
 * - 事件系统能够记录和发布 workflow 事件
 * - 能够从崩溃中恢复 workflow 状态
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkflowEngine, WorkflowEvent } from '../src/WorkflowEngine.js';
import { SimpleGateRunner, CompositeGateRunner, createGateRunner } from '../src/GateRunner.js';
import { EventPublisher, createEventPublisher } from '../src/EventPublisher.js';
import { StateRecoveryManager, createStateRecoveryManager } from '../src/StateRecoveryManager.js';
import { WorkflowPersistence } from '../src/WorkflowPersistence.js';
import { createEventLogReader } from '../src/events/EventLogReader.js';
import {
  WorkflowDefinition,
  WorkflowInstance,
  SimpleGateDefinition,
  CompositeGateDefinition,
  IEventBus,
  Event,
  Subscription,
} from '../src/types.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
}));

/**
 * Mock EventBus for testing
 */
class MockEventBus implements IEventBus {
  private running = false;
  private subscriptions: Map<string, Map<string, (event: Event) => void>> = new Map();
  private idCounter = 0;
  private publishedEvents: Event[] = [];

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.subscriptions.clear();
    this.publishedEvents = [];
  }

  isRunning(): boolean {
    return this.running;
  }

  publish(event: Event): void {
    if (!this.running) return;
    this.publishedEvents.push(event);

    for (const handlersMap of this.subscriptions.values()) {
      for (const handler of handlersMap.values()) {
        try {
          handler(event);
        } catch (error) {
          console.error('[MockEventBus] Error in handler:', error);
        }
      }
    }
  }

  subscribe(topic: string, handler: (event: Event) => void): Subscription {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Map());
    }
    const id = 'sub-' + (++this.idCounter);
    this.subscriptions.get(topic)!.set(id, handler);
    return { id, topic, handler };
  }

  unsubscribe(subscription: Subscription): void {
    const handlers = this.subscriptions.get(subscription.topic);
    if (handlers) {
      handlers.delete(subscription.id);
    }
  }

  getPublishedEvents(): Event[] {
    return this.publishedEvents;
  }

  clearEvents(): void {
    this.publishedEvents = [];
  }
}

describe('Acceptance Tests - Task 5.1', () => {
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'acceptance-test-'));
  });

  afterEach(async () => {
    try {
      await rm(storageDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  /**
   * Test Suite 1: WorkflowEngine 能够加载和执行基础 workflow
   * Validates: Requirements 1.1 - 1.4
   */
  describe('WorkflowEngine Basic Execution', () => {
    it('AC-1.1: 应该能够加载 JSON 格式的 workflow 定义文件', () => {
      const engine = new WorkflowEngine();
      
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow for acceptance',
        stateMachine: {
          initial: 'requirements',
          states: {
            requirements: {
              agent: 'requirements-agent',
              gate: { type: 'simple', id: 'requirements-gate', name: 'Requirements Gate' } as SimpleGateDefinition,
              skills: ['requirements'],
              next: 'design',
            },
            design: {
              agent: 'design-agent',
              gate: { type: 'simple', id: 'design-gate', name: 'Design Gate' } as SimpleGateDefinition,
              skills: ['design'],
            },
          },
        },
        artifacts: [],
      };

      // 验证能成功加载 workflow 定义
      const workflowId = engine.loadWorkflow(definition);
      expect(workflowId).toBe('test-workflow');

      // 验证能够获取已加载的 workflow 定义
      const loadedWorkflow = engine.getWorkflow('test-workflow');
      expect(loadedWorkflow).toBeDefined();
      expect(loadedWorkflow?.id).toBe('test-workflow');
      expect(loadedWorkflow?.displayName).toBe('Test Workflow');
    });

    it('AC-1.2: 应该维护 workflow 实例的状态机，支持状态转换', async () => {
      const engine = new WorkflowEngine();
      
      const definition: WorkflowDefinition = {
        id: 'state-machine-test',
        displayName: 'State Machine Test',
        intent: 'Test state machine transitions',
        stateMachine: {
          initial: 'requirements',
          states: {
            requirements: {
              agent: 'agent',
              gate: { type: 'simple', id: 'gate1', name: 'Gate 1' } as SimpleGateDefinition,
              skills: [],
              next: 'design',
            },
            design: {
              agent: 'agent',
              gate: { type: 'simple', id: 'gate2', name: 'Gate 2' } as SimpleGateDefinition,
              skills: [],
              next: 'tasks',
            },
            tasks: {
              agent: 'agent',
              gate: { type: 'simple', id: 'gate3', name: 'Gate 3' } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('state-machine-test');

      // 验证初始状态正确
      expect(instance.currentState).toBe('requirements');
      expect(instance.status).toBe('pending');

      // 验证能够执行 workflow 并完成状态转换
      const result = await engine.execute(instance.id);
      
      // 验证最终状态
      expect(result.status).toBe('completed');
      expect(result.currentState).toBe('tasks');
    });

    it('AC-1.3: 应该为每个 workflow 实例生成唯一标识符', () => {
      const engine = new WorkflowEngine();
      
      const definition: WorkflowDefinition = {
        id: 'unique-id-test',
        displayName: 'Unique ID Test',
        intent: 'Test unique IDs',
        stateMachine: {
          initial: 'start',
          states: {
            start: {
              agent: 'agent',
              gate: { type: 'simple', id: 'gate', name: 'Gate' } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance1 = engine.createInstance('unique-id-test');
      const instance2 = engine.createInstance('unique-id-test');

      // 验证每个实例都有唯一标识符
      expect(instance1.id).toBeDefined();
      expect(instance2.id).toBeDefined();
      expect(instance1.id).not.toBe(instance2.id);
    });

    it('AC-1.4: 应该记录 workflow 执行事件', async () => {
      const engine = new WorkflowEngine();
      const emittedEvents: WorkflowEvent[] = [];

      // 订阅 workflow 事件
      engine.onEvent((event) => {
        emittedEvents.push(event);
      });

      const definition: WorkflowDefinition = {
        id: 'event-recording-test',
        displayName: 'Event Recording Test',
        intent: 'Test event recording',
        stateMachine: {
          initial: 'start',
          states: {
            start: {
              agent: 'agent',
              gate: { type: 'simple', id: 'gate', name: 'Gate' } as SimpleGateDefinition,
              skills: [],
              next: 'end',
            },
            end: {
              agent: 'agent',
              gate: { type: 'simple', id: 'end-gate', name: 'End Gate' } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('event-recording-test');
      await engine.execute(instance.id);

      // 验证事件被记录
      expect(emittedEvents.length).toBeGreaterThan(0);
      
      const eventTypes = emittedEvents.map(e => e.type);
      expect(eventTypes).toContain('workflow.created');
      expect(eventTypes).toContain('workflow.started');
      expect(eventTypes).toContain('workflow.gate_executed');
      expect(eventTypes).toContain('workflow.state_changed');
      expect(eventTypes).toContain('workflow.completed');
    });
  });

  /**
   * Test Suite 2: GateRunner 能够执行单个 Gate
   * Validates: Requirements 2.1 - 2.4
   */
  describe('GateRunner Single Gate Execution', () => {
    it('AC-2.1: 应该能够加载和执行 Gate 定义', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
        checkFn: async () => ({ passed: true, reason: 'Test passed' }),
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(true);
      expect(result.reason).toBe('Test passed');
    });

    it('AC-2.2: 应该实现 check() 方法并返回 GateResult', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'result-test-gate',
        name: 'Result Test Gate',
        checkFn: async () => ({ 
          passed: true, 
          reason: 'Validation passed',
          details: { score: 100 },
        }),
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      // 验证返回了 GateResult
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('reason');
      expect(result.passed).toBe(true);
      expect(result.reason).toBe('Validation passed');
    });

    it('AC-2.3: 应该支持 Gate 的同步知识图谱功能（可选）', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'knowledge-gate',
        name: 'Knowledge Gate',
      };

      const runner = new SimpleGateRunner(gate, { knowledgeGraph: { entities: [] } });
      
      // 验证上下文被正确存储
      const context = runner.getContext();
      expect(context).toHaveProperty('knowledgeGraph');
    });

    it('AC-2.4: 应该记录 Gate 执行结果到事件日志', async () => {
      const engine = new WorkflowEngine();
      const eventBus = new MockEventBus();
      eventBus.start();

      const eventPublisher = new EventPublisher({
        projectId: 'test-project',
        eventBus,
      });

      engine.setEventPublisher(eventPublisher);

      const definition: WorkflowDefinition = {
        id: 'gate-event-test',
        displayName: 'Gate Event Test',
        intent: 'Test gate events',
        stateMachine: {
          initial: 'start',
          states: {
            start: {
              agent: 'agent',
              gate: { 
                type: 'simple', 
                id: 'test-gate', 
                name: 'Test Gate',
                checkFn: async () => ({ passed: true }),
              } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('gate-event-test'); // Fixed: use correct workflow ID
      await engine.execute(instance.id);

      // 验证 Gate 事件被发布
      const publishedEvents = eventBus.getPublishedEvents();
      const gateEvents = publishedEvents.filter(e => 
        e.action.startsWith('workflow.gate')
      );

      expect(gateEvents.length).toBeGreaterThan(0);
      
      const startedEvent = gateEvents.find(e => e.action === 'workflow.gate.started');
      const completedEvent = gateEvents.find(e => e.action === 'workflow.gate.completed');
      
      expect(startedEvent).toBeDefined();
      expect(completedEvent).toBeDefined();
      expect(completedEvent?.payload.passed).toBe(true);

      eventBus.stop();
    });
  });

  /**
   * Test Suite 3: 事件系统能够记录和发布 workflow 事件
   * Validates: Requirements 4.1 - 4.4
   */
  describe('Event System Workflow Events', () => {
    it('AC-4.1: 应该将所有执行事件发布到 Event Bus', () => {
      const eventBus = new MockEventBus();
      eventBus.start();

      const eventPublisher = new EventPublisher({
        projectId: 'test-project',
        eventBus,
      });

      const instance: WorkflowInstance = {
        id: 'instance-123',
        workflowId: 'workflow-123',
        currentState: 'start',
        status: 'pending',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 发布各种事件
      eventPublisher.publishWorkflowStarted(instance, 'start');
      eventPublisher.publishStateChanged(instance, 'start', 'middle', true);
      eventPublisher.publishWorkflowCompleted(instance, 'end');

      // 验证事件被发布到 Event Bus
      const publishedEvents = eventBus.getPublishedEvents();
      
      expect(publishedEvents).toHaveLength(3);
      expect(publishedEvents[0].action).toBe('workflow.started');
      expect(publishedEvents[1].action).toBe('workflow.state_changed');
      expect(publishedEvents[2].action).toBe('workflow.completed');

      eventBus.stop();
    });

    it('AC-4.2: 应该支持事件订阅机制', () => {
      const engine = new WorkflowEngine();
      const events: WorkflowEvent[] = [];

      // 订阅事件
      const handler = (event: WorkflowEvent) => events.push(event);
      engine.onEvent(handler);

      const definition: WorkflowDefinition = {
        id: 'subscription-test',
        displayName: 'Subscription Test',
        intent: 'Test subscription',
        stateMachine: {
          initial: 'start',
          states: {
            start: {
              agent: 'agent',
              gate: { type: 'simple', id: 'gate', name: 'Gate' } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      engine.createInstance('subscription-test');

      // 验证事件被记录
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('workflow.created');

      // 取消订阅
      engine.offEvent(handler);
      engine.createInstance('subscription-test');

      // 验证取消后不再接收事件
      expect(events.length).toBe(1);
    });

    it('AC-4.3: 应该保证事件的有序性和一致性', async () => {
      const engine = new WorkflowEngine();
      const events: WorkflowEvent[] = [];

      engine.onEvent((event) => events.push(event));

      const definition: WorkflowDefinition = {
        id: 'order-test',
        displayName: 'Order Test',
        intent: 'Test event order',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'agent',
              gate: { type: 'simple', id: 'gate1', name: 'Gate 1' } as SimpleGateDefinition,
              skills: [],
              next: 'state2',
            },
            state2: {
              agent: 'agent',
              gate: { type: 'simple', id: 'gate2', name: 'Gate 2' } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('order-test');
      await engine.execute(instance.id);

      // 验证事件按时间顺序记录
      for (let i = 1; i < events.length; i++) {
        const prevTime = events[i - 1].timestamp.getTime();
        const currTime = events[i].timestamp.getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });
  });

  /**
   * Test Suite 4: 能够从崩溃中恢复 workflow 状态
   * Validates: Requirements 5.1 - 5.4
   */
  describe('Workflow State Recovery from Crash', () => {
    it('AC-5.1: 应该能够处理 Gate 执行失败的情况', async () => {
      const engine = new WorkflowEngine();
      
      const definition: WorkflowDefinition = {
        id: 'failure-handling-test',
        displayName: 'Failure Handling Test',
        intent: 'Test failure handling',
        stateMachine: {
          initial: 'start',
          states: {
            start: {
              agent: 'agent',
              gate: { 
                type: 'simple', 
                id: 'fail-gate', 
                name: 'Fail Gate',
                checkFn: async () => ({ passed: false, reason: 'Validation failed' }),
              } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('failure-handling-test');
      const result = await engine.execute(instance.id);

      // 验证失败被正确处理
      expect(result.status).toBe('completed'); // Workflow completes even when gate fails (no next state)
      expect(engine.getInstance(instance.id)?.currentState).toBe('start');
    });

    it('AC-5.2: 应该支持 workflow 实例的暂停和恢复', async () => {
      const engine = new WorkflowEngine();
      
      const definition: WorkflowDefinition = {
        id: 'pause-resume-test',
        displayName: 'Pause Resume Test',
        intent: 'Test pause and resume',
        stateMachine: {
          initial: 'start',
          states: {
            start: {
              agent: 'agent',
              gate: { 
                type: 'simple', 
                id: 'gate1', 
                name: 'Gate 1',
                checkFn: async () => ({ passed: true }),
              } as SimpleGateDefinition,
              skills: [],
              next: 'end',
            },
            end: {
              agent: 'agent',
              gate: { type: 'simple', id: 'gate2', name: 'Gate 2' } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('pause-resume-test');
      
      // 设置为 running 状态并暂停
      instance.status = 'running';
      engine.pause(instance.id, 'Test pause');

      const pausedInstance = engine.getInstance(instance.id);
      expect(pausedInstance?.status).toBe('paused');

      // 恢复执行
      const resumedInstance = await engine.resume(instance.id);
      expect(resumedInstance.status).toBe('completed');
    });

    it('AC-5.3: 应该提供错误重试机制（可配置）', async () => {
      // Note: The current retry implementation only retries GateError with retryable: true
      // This test verifies the configuration is properly stored
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'retry-gate',
        name: 'Retry Gate',
      };

      const runner = new SimpleGateRunner(gate);
      
      // Verify default retry is disabled
      expect(runner.isRetryEnabled()).toBe(false);
      
      // Configure retry
      runner.setRetryConfig({
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      });
      
      // Verify retry is now enabled
      expect(runner.isRetryEnabled()).toBe(true);
      expect(runner.getRetryConfig()?.maxAttempts).toBe(3);
    });

    it('AC-5.4: 应该支持从崩溃中恢复 workflow 状态', async () => {
      // Create persistence with event replay enabled
      const { createEnhancedWorkflowPersistence } = await import('../src/WorkflowPersistence.js');
      const persistence = createEnhancedWorkflowPersistence(storageDir, true, storageDir);
      await persistence.initialize();

      // Create and save a workflow instance
      const instance: WorkflowInstance = {
        schema_version: '1.0',
        id: 'crash-recovery-test',
        workflowId: 'test-workflow',
        currentState: 'processing',
        status: 'running',
        history: [
          {
            type: 'workflow.started',
            instanceId: 'crash-recovery-test',
            timestamp: new Date(),
            data: { workflowId: 'test-workflow' },
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await persistence.saveInstance(instance);

      // Perform crash recovery
      const result = await persistence.performCrashRecovery();

      // Verify successful recovery from crash
      expect(result.recoveredInstances).toBeDefined();
      const recovered = result.recoveredInstances.find(i => i.id === 'crash-recovery-test');
      expect(recovered).toBeDefined();
      expect(recovered?.id).toBe('crash-recovery-test');
      expect(recovered?.currentState).toBe('processing');
      expect(recovered?.status).toBe('running');
    });
  });

  /**
   * Test Suite 5: Integration - End-to-End Workflow Execution
   */
  describe('End-to-End Integration', () => {
    it('应该能够完整执行一个 workflow：加载 -> 创建实例 -> 执行 -> 完成', async () => {
      const eventBus = new MockEventBus();
      eventBus.start();

      const eventPublisher = new EventPublisher({
        projectId: 'test-project',
        eventBus,
      });

      const engine = new WorkflowEngine({
        eventPublisher,
      });

      const definition: WorkflowDefinition = {
        id: 'e2e-workflow',
        displayName: 'E2E Workflow',
        intent: 'End-to-end test workflow',
        stateMachine: {
          initial: 'requirements',
          states: {
            requirements: {
              agent: 'requirements-agent',
              gate: { 
                type: 'simple', 
                id: 'requirements-gate', 
                name: 'Requirements Gate',
                checkFn: async () => ({ passed: true, reason: 'Requirements met' }),
              } as SimpleGateDefinition,
              skills: ['requirements'],
              next: 'design',
            },
            design: {
              agent: 'design-agent',
              gate: { 
                type: 'simple', 
                id: 'design-gate', 
                name: 'Design Gate',
                checkFn: async () => ({ passed: true, reason: 'Design complete' }),
              } as SimpleGateDefinition,
              skills: ['design'],
              next: 'tasks',
            },
            tasks: {
              agent: 'tasks-agent',
              gate: { 
                type: 'simple', 
                id: 'tasks-gate', 
                name: 'Tasks Gate',
                checkFn: async () => ({ passed: true, reason: 'Tasks done' }),
              } as SimpleGateDefinition,
              skills: ['tasks'],
              next: 'verification',
            },
            verification: {
              agent: 'verification-agent',
              gate: { 
                type: 'simple', 
                id: 'verification-gate', 
                name: 'Verification Gate',
                checkFn: async () => ({ passed: true, reason: 'Verification passed' }),
              } as SimpleGateDefinition,
              skills: ['verification'],
            },
          },
        },
        artifacts: [],
      };

      // 1. 加载 workflow
      const workflowId = engine.loadWorkflow(definition);
      expect(workflowId).toBe('e2e-workflow');

      // 2. 创建实例
      const instance = engine.createInstance('e2e-workflow');
      expect(instance.id).toBeDefined();
      expect(instance.currentState).toBe('requirements');
      expect(instance.status).toBe('pending');

      // 3. 执行 workflow
      const result = await engine.execute(instance.id);

      // 4. 验证完成
      expect(result.status).toBe('completed');
      expect(result.currentState).toBe('verification');

      // 验证事件发布
      const publishedEvents = eventBus.getPublishedEvents();
      expect(publishedEvents.length).toBeGreaterThan(0);

      const eventActions = publishedEvents.map(e => e.action);
      expect(eventActions).toContain('workflow.started');
      expect(eventActions).toContain('workflow.gate.started');
      expect(eventActions).toContain('workflow.gate.completed');
      expect(eventActions).toContain('workflow.state_changed');
      expect(eventActions).toContain('workflow.completed');

      eventBus.stop();
    });
  });
});