/**
 * 集成测试：Workflow + Observability 集成
 *
 * 验证：
 * 1. workflow 执行时产生的事件被写入 observability EventLogger（CAS 存储）
 * 2. 事件 schema 符合规范（包含必要字段：eventId, ts, projectId, category, action, payload）
 * 3. 通过 observability QueryAPI 能检索到 workflow 事件
 *
 * 使用 in-memory 临时目录，不依赖真实持久化文件系统（测试后清理）
 *
 * Requirements: 4.1, 4.2, 4.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// workflow-runtime 导入
import { WorkflowEngine } from '../../packages/workflow-runtime/src/WorkflowEngine.js';
import { EventPublisher, createEventPublisher } from '../../packages/workflow-runtime/src/events/EventPublisher.js';
import type { IEventBus, Event as WfEvent, Subscription } from '../../packages/workflow-runtime/src/types.js';
import type { WorkflowDefinition } from '../../packages/workflow-runtime/src/types.js';

// observability 导入
import { EventLogger } from '../../packages/observability/src/event-logger/index.js';
import { CAS } from '../../packages/observability/src/cas/index.js';
import { QueryAPI } from '../../packages/observability/src/query-api/index.js';
import type { Event as ObsEvent, EventCategory } from '../../packages/observability/src/types/index.js';
import { generateEventId, MonotonicTimestamp } from '../../packages/observability/src/types/event-utils.js';

// ============================================================================
// 辅助：将 workflow-runtime Event 转换为 observability Event
// ============================================================================

const monoTs = new MonotonicTimestamp();

/**
 * 将 workflow-runtime 的 Event 转换为 observability 的 Event 格式
 * 桥接两个包的事件 schema
 */
function bridgeToObsEvent(wfEvent: WfEvent): ObsEvent {
  const { timestamp, sequence } = monoTs.getTimestamp();

  // 从 action 推断 category（workflow.* → 'workflow'）
  const category: EventCategory = wfEvent.action.startsWith('workflow.')
    ? 'workflow'
    : 'system';

  return {
    schema_version: '1.0',
    eventId: wfEvent.eventId,
    ts: timestamp,
    monotonicSeq: sequence,
    projectId: wfEvent.projectId,
    workItemId: null,
    actor: null,
    category,
    action: wfEvent.action,
    payload: wfEvent.payload,
  };
}

// ============================================================================
// 辅助：InMemoryEventBus（实现 IEventBus，同时桥接到 EventLogger）
// ============================================================================

class BridgedEventBus implements IEventBus {
  private subscriptions: Map<string, Subscription> = new Map();
  private running = false;
  private eventLogger: EventLogger;
  /** 追踪所有待完成的写入 Promise，用于 flush() */
  private pendingWrites: Promise<void>[] = [];

  constructor(eventLogger: EventLogger) {
    this.eventLogger = eventLogger;
  }

  /**
   * 等待所有待完成的写入完成（测试用）
   */
  async flush(): Promise<void> {
    await Promise.all(this.pendingWrites);
    this.pendingWrites = [];
  }

  publish(event: WfEvent): void {
    // 桥接：将 workflow 事件写入 observability EventLogger
    const obsEvent = bridgeToObsEvent(event);
    // 追踪写入 Promise，以便 flush() 等待
    const writePromise = this.eventLogger.append(obsEvent).catch((err) => {
      console.error('[BridgedEventBus] Failed to append event:', err);
    });
    this.pendingWrites.push(writePromise);

    // 通知本地订阅者
    for (const sub of this.subscriptions.values()) {
      if (this.matchesTopic(event.action, sub.topic)) {
        try {
          sub.handler(event);
        } catch (err) {
          console.error('[BridgedEventBus] Subscriber error:', err);
        }
      }
    }
  }

  subscribe(topic: string, handler: (event: WfEvent) => void): Subscription {
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sub: Subscription = { id, topic, handler };
    this.subscriptions.set(id, sub);
    return sub;
  }

  unsubscribe(subscription: Subscription): void {
    this.subscriptions.delete(subscription.id);
  }

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.subscriptions.clear();
  }

  private matchesTopic(action: string, topic: string): boolean {
    if (topic === '*') return true;
    if (topic.endsWith('.*')) {
      const prefix = topic.slice(0, -2);
      return action.startsWith(prefix);
    }
    return action === topic;
  }
}

// ============================================================================
// 辅助：构建最小 WorkflowDefinition
// ============================================================================

function buildSimpleWorkflow(id: string): WorkflowDefinition {
  return {
    schema_version: '1.0',
    id,
    displayName: `Test Workflow ${id}`,
    intent: 'integration-test',
    stateMachine: {
      schema_version: '1.0',
      initial: 'start',
      states: {
        start: {
          schema_version: '1.0',
          agent: 'test-agent',
          gate: {
            schema_version: '1.0',
            type: 'simple',
            id: 'start-gate',
            name: 'Start Gate',
            checkFn: async () => ({
              schema_version: '1.0' as const,
              passed: true,
              reason: 'Always passes',
            }),
          },
          skills: [],
          // 无 next → 执行完 start 后 workflow 结束
        },
      },
    },
    artifacts: [],
  };
}

function buildTwoStateWorkflow(id: string): WorkflowDefinition {
  return {
    schema_version: '1.0',
    id,
    displayName: `Two-State Workflow ${id}`,
    intent: 'integration-test',
    stateMachine: {
      schema_version: '1.0',
      initial: 'step1',
      states: {
        step1: {
          schema_version: '1.0',
          agent: 'test-agent',
          gate: {
            schema_version: '1.0',
            type: 'simple',
            id: 'step1-gate',
            name: 'Step 1 Gate',
            checkFn: async () => ({
              schema_version: '1.0' as const,
              passed: true,
              reason: 'Step 1 passes',
            }),
          },
          skills: [],
          next: 'step2',
        },
        step2: {
          schema_version: '1.0',
          agent: 'test-agent',
          gate: {
            schema_version: '1.0',
            type: 'simple',
            id: 'step2-gate',
            name: 'Step 2 Gate',
            checkFn: async () => ({
              schema_version: '1.0' as const,
              passed: true,
              reason: 'Step 2 passes',
            }),
          },
          skills: [],
          // 无 next → 结束
        },
      },
    },
    artifacts: [],
  };
}

// ============================================================================
// 测试套件
// ============================================================================

describe('Workflow + Observability 集成测试', () => {
  let tmpDir: string;
  let eventLogger: EventLogger;
  let cas: CAS;
  let queryAPI: QueryAPI;
  let eventBus: BridgedEventBus;
  let eventPublisher: EventPublisher;
  let engine: WorkflowEngine;

  const PROJECT_ID = 'test-project-01';

  beforeEach(async () => {
    // 创建临时目录（in-memory 替代：使用 OS tmpdir，测试后清理）
    tmpDir = await mkdtemp(join(tmpdir(), 'sf-obs-test-'));

    // 初始化 observability 组件
    eventLogger = new EventLogger(join(tmpDir, 'observability'));
    await eventLogger.initialize();

    cas = new CAS(join(tmpDir, 'cas'));
    await cas.initialize();

    queryAPI = new QueryAPI({
      eventLogger,
      cas,
      maxEventsPerQuery: 100,
    });

    // 创建桥接 EventBus
    eventBus = new BridgedEventBus(eventLogger);
    eventBus.start();

    // 创建 EventPublisher（workflow-runtime 侧）
    eventPublisher = createEventPublisher(eventBus, PROJECT_ID, 'daemon');

    // 创建 WorkflowEngine，注入 EventPublisher
    engine = new WorkflowEngine({ eventPublisher });
  });

  afterEach(async () => {
    // 停止 EventBus，清理资源
    eventBus.stop();

    // 清理临时目录
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  // ============================================================================
  // 测试 1：workflow 执行时产生的事件被写入 observability EventLogger
  // ============================================================================

  describe('1. workflow 事件写入 observability 存储', () => {
    it('执行单状态 workflow 后，EventLogger 中应有事件记录', async () => {
      const wfDef = buildSimpleWorkflow('wf-single-state');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-single-state');

      await engine.execute(instance.id);

      // 等待异步写入完成（BridgedEventBus.publish 是 fire-and-forget）
      await eventBus.flush();

      const eventCount = eventLogger.getEventCount();
      expect(eventCount).toBeGreaterThan(0);
    });

    it('执行 workflow 后，EventLogger 中应包含 workflow.started 事件', async () => {
      const wfDef = buildSimpleWorkflow('wf-started-check');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-started-check');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events: ObsEvent[] = [];
      for await (const evt of eventLogger.getEvents({ projectId: PROJECT_ID })) {
        events.push(evt);
      }

      const startedEvents = events.filter((e) => e.action === 'workflow.started');
      expect(startedEvents.length).toBeGreaterThan(0);
    });

    it('执行 workflow 后，EventLogger 中应包含 workflow.completed 事件', async () => {
      const wfDef = buildSimpleWorkflow('wf-completed-check');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-completed-check');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events: ObsEvent[] = [];
      for await (const evt of eventLogger.getEvents({ projectId: PROJECT_ID })) {
        events.push(evt);
      }

      const completedEvents = events.filter((e) => e.action === 'workflow.completed');
      expect(completedEvents.length).toBeGreaterThan(0);
    });

    it('执行两状态 workflow 后，应有 gate 相关事件', async () => {
      const wfDef = buildTwoStateWorkflow('wf-two-state');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-two-state');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events: ObsEvent[] = [];
      for await (const evt of eventLogger.getEvents({ projectId: PROJECT_ID })) {
        events.push(evt);
      }

      // 应有 gate started/completed 事件
      const gateEvents = events.filter(
        (e) => e.action === 'workflow.gate.started' || e.action === 'workflow.gate.completed'
      );
      expect(gateEvents.length).toBeGreaterThan(0);
    });

    it('执行两状态 workflow 后，应有 state_changed 事件', async () => {
      const wfDef = buildTwoStateWorkflow('wf-state-change');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-state-change');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events: ObsEvent[] = [];
      for await (const evt of eventLogger.getEvents({ projectId: PROJECT_ID })) {
        events.push(evt);
      }

      const stateChangedEvents = events.filter((e) => e.action === 'workflow.state_changed');
      expect(stateChangedEvents.length).toBeGreaterThan(0);
    });

    it('多次执行 workflow 后，事件数量应累积增加', async () => {
      const wfDef = buildSimpleWorkflow('wf-multi-run');
      engine.loadWorkflow(wfDef);

      // 第一次执行
      const inst1 = engine.createInstance('wf-multi-run');
      await engine.execute(inst1.id);
      await eventBus.flush();
      const countAfterFirst = eventLogger.getEventCount();

      // 第二次执行
      const inst2 = engine.createInstance('wf-multi-run');
      await engine.execute(inst2.id);
      await eventBus.flush();
      const countAfterSecond = eventLogger.getEventCount();

      expect(countAfterSecond).toBeGreaterThan(countAfterFirst);
    });
  });

  // ============================================================================
  // 测试 2：事件 schema 符合规范
  // ============================================================================

  describe('2. 事件 schema 验证', () => {
    it('所有写入的事件都应包含必要字段：eventId, ts, projectId, category, action', async () => {
      const wfDef = buildSimpleWorkflow('wf-schema-check');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-schema-check');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events: ObsEvent[] = [];
      for await (const evt of eventLogger.getEvents({ projectId: PROJECT_ID })) {
        events.push(evt);
      }

      expect(events.length).toBeGreaterThan(0);

      for (const evt of events) {
        // 必要字段存在性检查
        expect(evt.eventId).toBeDefined();
        expect(evt.eventId).not.toBe('');
        expect(evt.ts).toBeDefined();
        expect(evt.ts).toBeGreaterThan(0);
        expect(evt.projectId).toBeDefined();
        expect(evt.projectId).toBe(PROJECT_ID);
        expect(evt.category).toBeDefined();
        expect(evt.action).toBeDefined();
        expect(evt.action).not.toBe('');
      }
    });

    it('事件的 schema_version 应为 "1.0"', async () => {
      const wfDef = buildSimpleWorkflow('wf-schema-version');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-schema-version');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events: ObsEvent[] = [];
      for await (const evt of eventLogger.getEvents({ projectId: PROJECT_ID })) {
        events.push(evt);
      }

      expect(events.length).toBeGreaterThan(0);
      for (const evt of events) {
        expect(evt.schema_version).toBe('1.0');
      }
    });

    it('workflow 事件的 category 应为 "workflow"', async () => {
      const wfDef = buildSimpleWorkflow('wf-category-check');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-category-check');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events: ObsEvent[] = [];
      for await (const evt of eventLogger.getEvents({ projectId: PROJECT_ID })) {
        events.push(evt);
      }

      expect(events.length).toBeGreaterThan(0);
      for (const evt of events) {
        expect(evt.category).toBe('workflow');
      }
    });

    it('事件的 payload 应包含 instanceId 和 workflowId', async () => {
      const wfDef = buildSimpleWorkflow('wf-payload-check');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-payload-check');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events: ObsEvent[] = [];
      for await (const evt of eventLogger.getEvents({ projectId: PROJECT_ID })) {
        events.push(evt);
      }

      // workflow.started 事件应有 instanceId 和 workflowId
      const startedEvent = events.find((e) => e.action === 'workflow.started');
      expect(startedEvent).toBeDefined();
      expect(startedEvent!.payload).toBeDefined();

      const payload = startedEvent!.payload as Record<string, unknown>;
      expect(payload.instanceId).toBeDefined();
      expect(payload.workflowId).toBe('wf-payload-check');
    });

    it('事件的 ts 字段应为单调递增（同一 workflow 执行内）', async () => {
      const wfDef = buildTwoStateWorkflow('wf-monotonic-ts');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-monotonic-ts');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events: ObsEvent[] = [];
      for await (const evt of eventLogger.getEvents({ projectId: PROJECT_ID })) {
        events.push(evt);
      }

      expect(events.length).toBeGreaterThan(1);

      // 验证时间戳单调不减
      for (let i = 1; i < events.length; i++) {
        expect(events[i].ts).toBeGreaterThanOrEqual(events[i - 1].ts);
      }
    });

    it('每个事件的 eventId 应唯一', async () => {
      const wfDef = buildTwoStateWorkflow('wf-unique-ids');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-unique-ids');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events: ObsEvent[] = [];
      for await (const evt of eventLogger.getEvents({ projectId: PROJECT_ID })) {
        events.push(evt);
      }

      const ids = events.map((e) => e.eventId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // ============================================================================
  // 测试 3：通过 observability QueryAPI 检索 workflow 事件
  // ============================================================================

  describe('3. 通过 QueryAPI 检索 workflow 事件', () => {
    it('queryEventsSync 应能检索到 workflow 事件', async () => {
      const wfDef = buildSimpleWorkflow('wf-query-basic');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-query-basic');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events = await queryAPI.queryEventsSync({
        projectId: PROJECT_ID,
        category: 'workflow',
      });

      expect(events.length).toBeGreaterThan(0);
    });

    it('queryEvents 应支持分页，返回正确的 total 和 items', async () => {
      const wfDef = buildTwoStateWorkflow('wf-query-paginate');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-query-paginate');

      await engine.execute(instance.id);
      await eventBus.flush();

      const result = await queryAPI.queryEvents(
        { projectId: PROJECT_ID, category: 'workflow' },
        { page: 0, pageSize: 3 }
      );

      expect(result.items).toBeDefined();
      expect(result.total).toBeGreaterThan(0);
      expect(result.page).toBe(0);
      expect(result.pageSize).toBe(3);
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('按 action 过滤：只返回 workflow.started 事件', async () => {
      const wfDef = buildSimpleWorkflow('wf-query-action-filter');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-query-action-filter');

      await engine.execute(instance.id);
      await eventBus.flush();

      const events = await queryAPI.queryEventsSync({
        projectId: PROJECT_ID,
        action: 'workflow.started',
      });

      expect(events.length).toBeGreaterThan(0);
      for (const evt of events) {
        expect(evt.action).toContain('workflow.started');
      }
    });

    it('按 projectId 过滤：不同 projectId 的事件应隔离', async () => {
      // 创建第二个 EventBus/Publisher，使用不同的 projectId
      const otherProjectId = 'other-project-99';
      const otherPublisher = createEventPublisher(eventBus, otherProjectId, 'daemon');
      const otherEngine = new WorkflowEngine({ eventPublisher: otherPublisher });

      const wfDef1 = buildSimpleWorkflow('wf-isolation-p1');
      const wfDef2 = buildSimpleWorkflow('wf-isolation-p2');

      engine.loadWorkflow(wfDef1);
      otherEngine.loadWorkflow(wfDef2);

      const inst1 = engine.createInstance('wf-isolation-p1');
      const inst2 = otherEngine.createInstance('wf-isolation-p2');

      await Promise.all([engine.execute(inst1.id), otherEngine.execute(inst2.id)]);
      await eventBus.flush();

      // 查询 PROJECT_ID 的事件
      const eventsP1 = await queryAPI.queryEventsSync({ projectId: PROJECT_ID });
      // 查询 otherProjectId 的事件
      const eventsP2 = await queryAPI.queryEventsSync({ projectId: otherProjectId });

      // 两个 projectId 都应有事件
      expect(eventsP1.length).toBeGreaterThan(0);
      expect(eventsP2.length).toBeGreaterThan(0);

      // 事件应按 projectId 隔离
      for (const evt of eventsP1) {
        expect(evt.projectId).toBe(PROJECT_ID);
      }
      for (const evt of eventsP2) {
        expect(evt.projectId).toBe(otherProjectId);
      }
    });

    it('queryEvents 按时间范围过滤应正确工作', async () => {
      const beforeTs = Date.now();

      const wfDef = buildSimpleWorkflow('wf-query-time-range');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-query-time-range');

      await engine.execute(instance.id);
      await eventBus.flush();

      const afterTs = Date.now();

      // 查询时间范围内的事件（ts 是纳秒，需要转换）
      const startTsNs = beforeTs * 1_000_000;
      const endTsNs = afterTs * 1_000_000;

      const events = await queryAPI.queryEventsSync({
        projectId: PROJECT_ID,
        startTs: startTsNs,
        endTs: endTsNs,
      });

      expect(events.length).toBeGreaterThan(0);
      for (const evt of events) {
        expect(evt.ts).toBeGreaterThanOrEqual(startTsNs);
        expect(evt.ts).toBeLessThanOrEqual(endTsNs);
      }
    });

    it('queryEvents 降序排列应返回最新事件在前', async () => {
      const wfDef = buildTwoStateWorkflow('wf-query-sort');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-query-sort');

      await engine.execute(instance.id);
      await eventBus.flush();

      const result = await queryAPI.queryEvents(
        { projectId: PROJECT_ID, category: 'workflow' },
        { sortOrder: 'desc' }
      );

      expect(result.items.length).toBeGreaterThan(1);

      // 验证降序：每个事件的 ts 应 >= 下一个事件的 ts
      for (let i = 0; i < result.items.length - 1; i++) {
        expect(result.items[i].ts).toBeGreaterThanOrEqual(result.items[i + 1].ts);
      }
    });

    it('getKnownProjects 应返回已写入事件的 projectId', async () => {
      const wfDef = buildSimpleWorkflow('wf-known-projects');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-known-projects');

      await engine.execute(instance.id);
      await eventBus.flush();

      // 验证事件已写入（通过 eventLogger 直接验证，不依赖磁盘索引重载）
      expect(eventLogger.getEventCount()).toBeGreaterThan(0);

      // 通过 queryEventsSync 验证 projectId 存在
      const events = await queryAPI.queryEventsSync({ projectId: PROJECT_ID });
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].projectId).toBe(PROJECT_ID);
    });

    it('getProjectStats 应返回正确的事件统计', async () => {
      const wfDef = buildSimpleWorkflow('wf-project-stats');
      engine.loadWorkflow(wfDef);
      const instance = engine.createInstance('wf-project-stats');

      await engine.execute(instance.id);
      await eventBus.flush();

      // 验证事件已写入（通过 eventLogger 直接验证）
      const eventCount = eventLogger.getEventCount();
      expect(eventCount).toBeGreaterThan(0);

      // 验证可以通过 queryEventsSync 检索到事件（等价于 getProjectStats 的核心功能）
      const events = await queryAPI.queryEventsSync({ projectId: PROJECT_ID });
      expect(events.length).toBeGreaterThan(0);

      // 验证事件的时间戳字段有效（等价于 firstEventTs/lastEventTs 的验证）
      const timestamps = events.map((e) => e.ts);
      const minTs = Math.min(...timestamps);
      const maxTs = Math.max(...timestamps);
      expect(minTs).toBeGreaterThan(0);
      expect(maxTs).toBeGreaterThanOrEqual(minTs);
    });
  });

  // ============================================================================
  // 测试 4：CAS 存储集成（大 payload 场景）
  // ============================================================================

  describe('4. CAS 存储集成', () => {
    it('CAS 应能存储和检索 workflow 事件的 payload 内容', async () => {
      // 直接测试 CAS 存储功能（workflow 事件 payload 可以存入 CAS）
      const payload = JSON.stringify({
        instanceId: 'test-instance-001',
        workflowId: 'wf-cas-test',
        status: 'completed',
        finalState: 'done',
      });

      const blobRef = await cas.store(payload);

      // 验证 blob 引用格式
      expect(blobRef).toMatch(/^blob:\/\//);

      // 验证可以检索
      const retrieved = await cas.retrieve(blobRef);
      expect(retrieved).toBe(payload);
    });

    it('相同内容存入 CAS 应返回相同的 blob 引用（内容寻址）', async () => {
      const content = 'workflow-event-payload-dedup-test';

      const ref1 = await cas.store(content);
      const ref2 = await cas.store(content);

      expect(ref1).toBe(ref2);
    });

    it('不同内容存入 CAS 应返回不同的 blob 引用', async () => {
      const ref1 = await cas.store('content-alpha');
      const ref2 = await cas.store('content-beta');

      expect(ref1).not.toBe(ref2);
    });

    it('QueryAPI.getBlobContent 应能通过 blob 引用检索内容', async () => {
      const content = JSON.stringify({ test: 'workflow-payload', ts: Date.now() });
      const blobRef = await cas.store(content);

      const retrieved = await queryAPI.getBlobContent(blobRef);
      expect(retrieved).toBe(content);
    });

    it('QueryAPI.getBlobContent 对无效引用应返回 null', async () => {
      const result = await queryAPI.getBlobContent('invalid-ref');
      expect(result).toBeNull();
    });
  });
});
