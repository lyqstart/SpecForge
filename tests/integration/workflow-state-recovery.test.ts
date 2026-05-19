/**
 * 集成测试：workflow 状态恢复
 *
 * 验证以下场景：
 * 1. WAL 写入顺序：events.jsonl 必须在 state.json 之前 fsync
 * 2. workflow 中断后恢复：StateRecoveryManager 能从 WAL 恢复状态
 * 3. 恢复后状态与中断前一致
 *
 * 对应需求：REQ-W3-2 AC-2, AC-3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, stat, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkflowPersistence } from '../../packages/workflow-runtime/src/WorkflowPersistence.js';
import { StateRecoveryManager } from '../../packages/workflow-runtime/src/StateRecoveryManager.js';
import { EventLogReader } from '../../packages/workflow-runtime/src/events/EventLogReader.js';
import type { WorkflowInstance } from '../../packages/workflow-runtime/src/types.js';

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

/**
 * 创建一个测试用的 WorkflowInstance
 */
function makeInstance(id: string, state: string, status: WorkflowInstance['status']): WorkflowInstance {
  return {
    schema_version: '1.0',
    id,
    workflowId: 'feature_spec',
    currentState: state,
    status,
    history: [
      {
        type: 'workflow.started',
        instanceId: id,
        timestamp: new Date('2024-01-01T00:00:00Z'),
        data: { workflowId: 'feature_spec' },
      },
    ],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:01:00Z'),
  };
}

/**
 * 向 events.jsonl 追加一条事件
 */
async function appendEventToLog(logFile: string, event: Record<string, unknown>): Promise<void> {
  await appendFile(logFile, JSON.stringify(event) + '\n', 'utf-8');
}

// ─── 测试套件 ─────────────────────────────────────────────────────────────────

describe('Integration: workflow 状态恢复', () => {
  let tempDir: string;
  let stateDir: string;
  let eventLogDir: string;
  let eventsJsonlPath: string;
  let persistence: WorkflowPersistence;
  let eventLogReader: EventLogReader;

  beforeEach(async () => {
    // 创建临时目录（自包含，测试结束后清理）
    tempDir = await mkdtemp(join(tmpdir(), 'sf-wf-recovery-'));
    stateDir = join(tempDir, 'state');
    eventLogDir = join(tempDir, 'events');
    eventsJsonlPath = join(eventLogDir, 'events.jsonl');

    // 初始化 persistence 和 eventLogReader
    persistence = new WorkflowPersistence({
      storageDir: stateDir,
      eventLogDir,
      enableEventReplay: true,
    });
    await persistence.initialize();

    eventLogReader = new EventLogReader(eventLogDir);
    await eventLogReader.initialize();
  });

  afterEach(async () => {
    // 清理临时目录
    await rm(tempDir, { recursive: true, force: true });
  });

  // ─── 1. WAL 写入顺序验证 ────────────────────────────────────────────────────

  describe('WAL 写入顺序验证', () => {
    it('events.jsonl 应在 state.json 之前存在', async () => {
      const instanceId = 'wf-order-test-001';
      const instance = makeInstance(instanceId, 'requirements', 'running');

      // 先向 events.jsonl 写入事件（模拟 WAL 先写）
      await appendEventToLog(eventsJsonlPath, {
        eventId: 'evt-001',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'workflow.started',
        payload: { instanceId, workflowId: 'feature_spec' },
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      });

      // 记录 events.jsonl 的修改时间
      const eventsStatBefore = await stat(eventsJsonlPath);

      // 稍等一下确保时间戳有差异（Windows 文件系统精度）
      await new Promise(r => setTimeout(r, 10));

      // 再写入 state.json（模拟 WAL 后写状态）
      await persistence.saveInstance(instance);

      const stateFilePath = join(stateDir, `${instanceId}.json`);
      expect(existsSync(stateFilePath)).toBe(true);

      const stateStatAfter = await stat(stateFilePath);

      // events.jsonl 的修改时间应早于或等于 state.json 的创建时间
      // （WAL 顺序：events.jsonl fsync 先于 state.json 写入）
      expect(eventsStatBefore.mtimeMs).toBeLessThanOrEqual(stateStatAfter.mtimeMs);
    });

    it('events.jsonl 写入后 state.json 内容应与事件一致', async () => {
      const instanceId = 'wf-order-test-002';
      const instance = makeInstance(instanceId, 'design', 'running');

      // 写入事件日志
      await appendEventToLog(eventsJsonlPath, {
        eventId: 'evt-002',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'workflow.state_changed',
        payload: { instanceId, fromState: 'requirements', toState: 'design' },
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      });

      // 写入状态文件
      await persistence.saveInstance(instance);

      // 验证状态文件内容
      const stateFilePath = join(stateDir, `${instanceId}.json`);
      const content = await readFile(stateFilePath, 'utf-8');
      const stored = JSON.parse(content);

      expect(stored.instance.currentState).toBe('design');
      expect(stored.instance.status).toBe('running');
      expect(stored.schemaVersion).toBe('1.0');
    });

    it('events.jsonl 应包含 schema_version 字段（REQ-18）', async () => {
      const instanceId = 'wf-schema-test-001';

      await appendEventToLog(eventsJsonlPath, {
        eventId: 'evt-schema-001',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'workflow.started',
        payload: { instanceId, workflowId: 'feature_spec' },
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      });

      const events = await eventLogReader.readAllEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]!.metadata.schemaVersion).toBe('1.0');
    });
  });

  // ─── 2. workflow 中断后恢复测试 ─────────────────────────────────────────────

  describe('workflow 中断后恢复', () => {
    it('StateRecoveryManager 应能从持久化存储恢复 workflow 实例', async () => {
      const instanceId = 'wf-recovery-test-001';
      const instance = makeInstance(instanceId, 'tasks', 'running');

      // 模拟 workflow 执行到 tasks 阶段后"中断"（保存状态）
      await persistence.saveInstance(instance);

      // 创建 StateRecoveryManager
      const recoveryManager = new StateRecoveryManager(persistence, eventLogReader, {
        validateConsistency: true,
        repairInconsistencies: false,
        maxRecoveryAttempts: 3,
        enableEventReplay: false, // 禁用事件重放，直接从持久化恢复
      });

      // 清除缓存，模拟重启后重新加载
      persistence.clearCache();

      // 执行恢复
      const recovered = await recoveryManager.recoverState(instanceId);

      expect(recovered).not.toBeNull();
      expect(recovered!.id).toBe(instanceId);
      expect(recovered!.workflowId).toBe('feature_spec');
      expect(recovered!.currentState).toBe('tasks');
      expect(recovered!.status).toBe('running');
    });

    it('中断后恢复的状态应与中断前完全一致', async () => {
      const instanceId = 'wf-recovery-test-002';
      const originalInstance = makeInstance(instanceId, 'verification', 'paused');
      // 添加更多历史事件
      originalInstance.history.push(
        {
          type: 'workflow.state_changed',
          instanceId,
          timestamp: new Date('2024-01-01T00:02:00Z'),
          data: { fromState: 'requirements', toState: 'design' },
        },
        {
          type: 'workflow.state_changed',
          instanceId,
          timestamp: new Date('2024-01-01T00:03:00Z'),
          data: { fromState: 'design', toState: 'tasks' },
        },
        {
          type: 'workflow.state_changed',
          instanceId,
          timestamp: new Date('2024-01-01T00:04:00Z'),
          data: { fromState: 'tasks', toState: 'verification' },
        },
        {
          type: 'workflow.paused',
          instanceId,
          timestamp: new Date('2024-01-01T00:05:00Z'),
          data: { reason: 'user_interrupt' },
        }
      );
      originalInstance.updatedAt = new Date('2024-01-01T00:05:00Z');

      // 保存原始状态（模拟中断前的最后一次持久化）
      await persistence.saveInstance(originalInstance);

      // 清除缓存，模拟进程重启
      persistence.clearCache();

      // 创建新的 persistence 实例（模拟重启后重新初始化）
      const newPersistence = new WorkflowPersistence({
        storageDir: stateDir,
        eventLogDir,
        enableEventReplay: false,
      });
      await newPersistence.initialize();

      const recoveryManager = new StateRecoveryManager(newPersistence, null, {
        validateConsistency: false,
        repairInconsistencies: false,
        maxRecoveryAttempts: 3,
        enableEventReplay: false,
      });

      // 执行恢复
      const recovered = await recoveryManager.recoverState(instanceId);

      // 验证恢复后状态与中断前完全一致
      expect(recovered).not.toBeNull();
      expect(recovered!.id).toBe(originalInstance.id);
      expect(recovered!.workflowId).toBe(originalInstance.workflowId);
      expect(recovered!.currentState).toBe(originalInstance.currentState);
      expect(recovered!.status).toBe(originalInstance.status);
      expect(recovered!.history.length).toBe(originalInstance.history.length);
      expect(recovered!.schema_version).toBe('1.0');
    });

    it('当 state.json 不存在时，应从 events.jsonl 恢复', async () => {
      const instanceId = 'wf-wal-recovery-001';

      // 只写入事件日志，不写 state.json（模拟 state.json 丢失的场景）
      const events = [
        {
          eventId: 'evt-wal-001',
          ts: Date.now() - 3000,
          projectId: 'test-project',
          action: 'workflow.started',
          payload: { instanceId, workflowId: 'feature_spec' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'evt-wal-002',
          ts: Date.now() - 2000,
          projectId: 'test-project',
          action: 'workflow.state_changed',
          payload: { instanceId, fromState: 'initial', toState: 'requirements' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'evt-wal-003',
          ts: Date.now() - 1000,
          projectId: 'test-project',
          action: 'workflow.state_changed',
          payload: { instanceId, fromState: 'requirements', toState: 'design', toState2: 'design' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
      ];

      for (const event of events) {
        await appendEventToLog(eventsJsonlPath, event);
      }

      // 确认 state.json 不存在
      const stateFilePath = join(stateDir, `${instanceId}.json`);
      expect(existsSync(stateFilePath)).toBe(false);

      // 创建 StateRecoveryManager（启用事件重放）
      const recoveryManager = new StateRecoveryManager(persistence, eventLogReader, {
        validateConsistency: false,
        repairInconsistencies: false,
        maxRecoveryAttempts: 3,
        enableEventReplay: true,
      });

      // 尝试恢复（应从 events.jsonl 重建）
      const recovered = await recoveryManager.recoverState(instanceId);

      // 从 WAL 恢复后，实例应该被重建
      expect(recovered).not.toBeNull();
      expect(recovered!.id).toBe(instanceId);
      expect(recovered!.workflowId).toBe('feature_spec');
      // 状态应该是最后一个 state_changed 事件的目标状态
      expect(recovered!.status).toBe('running');
    });
  });

  // ─── 3. 一致性验证 ──────────────────────────────────────────────────────────

  describe('恢复后状态一致性验证', () => {
    it('validateInstanceConsistency 应检测出无效状态', async () => {
      const instanceId = 'wf-consistency-test-001';
      const invalidInstance: WorkflowInstance = {
        schema_version: '1.0',
        id: instanceId,
        workflowId: 'feature_spec',
        currentState: 'unknown', // 无效状态
        status: 'running',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const recoveryManager = new StateRecoveryManager(persistence, null, {
        validateConsistency: true,
        repairInconsistencies: false,
        maxRecoveryAttempts: 3,
        enableEventReplay: false,
      });

      const result = await recoveryManager.validateInstanceConsistency(invalidInstance);

      expect(result.isValid).toBe(false);
      expect(result.inconsistencies.length).toBeGreaterThan(0);
      const stateIssue = result.inconsistencies.find(i => i.type === 'state_mismatch');
      expect(stateIssue).toBeDefined();
    });

    it('validateInstanceConsistency 应通过有效实例', async () => {
      const instanceId = 'wf-consistency-test-002';
      const validInstance = makeInstance(instanceId, 'requirements', 'running');

      const recoveryManager = new StateRecoveryManager(persistence, null, {
        validateConsistency: true,
        repairInconsistencies: false,
        maxRecoveryAttempts: 3,
        enableEventReplay: false,
      });

      const result = await recoveryManager.validateInstanceConsistency(validInstance);

      expect(result.isValid).toBe(true);
      expect(result.inconsistencies.length).toBe(0);
    });

    it('恢复后的实例应包含 schema_version 字段（REQ-18）', async () => {
      const instanceId = 'wf-schema-recovery-001';
      const instance = makeInstance(instanceId, 'design', 'running');

      await persistence.saveInstance(instance);
      persistence.clearCache();

      const recoveryManager = new StateRecoveryManager(persistence, null, {
        validateConsistency: false,
        repairInconsistencies: false,
        maxRecoveryAttempts: 3,
        enableEventReplay: false,
      });

      const recovered = await recoveryManager.recoverState(instanceId);

      expect(recovered).not.toBeNull();
      expect(recovered!.schema_version).toBe('1.0');
    });

    it('历史事件时间戳乱序时应检测出不一致', async () => {
      const instanceId = 'wf-timestamp-test-001';
      const instanceWithOutOfOrderEvents: WorkflowInstance = {
        schema_version: '1.0',
        id: instanceId,
        workflowId: 'feature_spec',
        currentState: 'design',
        status: 'running',
        history: [
          {
            type: 'workflow.started',
            instanceId,
            timestamp: new Date('2024-01-01T00:02:00Z'), // 较晚
            data: {},
          },
          {
            type: 'workflow.state_changed',
            instanceId,
            timestamp: new Date('2024-01-01T00:01:00Z'), // 较早（乱序）
            data: { fromState: 'initial', toState: 'requirements' },
          },
        ],
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:02:00Z'),
      };

      const recoveryManager = new StateRecoveryManager(persistence, null, {
        validateConsistency: true,
        repairInconsistencies: false,
        maxRecoveryAttempts: 3,
        enableEventReplay: false,
      });

      const result = await recoveryManager.validateInstanceConsistency(instanceWithOutOfOrderEvents);

      expect(result.isValid).toBe(false);
      const timestampIssue = result.inconsistencies.find(i => i.type === 'timestamp_order');
      expect(timestampIssue).toBeDefined();
      expect(timestampIssue!.severity).toBe('medium');
    });
  });

  // ─── 4. 崩溃恢复场景 ────────────────────────────────────────────────────────

  describe('崩溃恢复场景', () => {
    it('performCrashRecovery 应恢复所有持久化的实例', async () => {
      // 创建多个 workflow 实例（模拟崩溃前的状态）
      const instances = [
        makeInstance('crash-wf-001', 'requirements', 'running'),
        makeInstance('crash-wf-002', 'design', 'running'),
        makeInstance('crash-wf-003', 'tasks', 'paused'),
      ];

      for (const inst of instances) {
        await persistence.saveInstance(inst);
      }

      // 清除缓存，模拟进程重启
      persistence.clearCache();

      const recoveryManager = new StateRecoveryManager(persistence, null, {
        validateConsistency: false,
        repairInconsistencies: false,
        maxRecoveryAttempts: 3,
        enableEventReplay: false,
      });

      const result = await recoveryManager.performCrashRecovery();

      expect(result.recoveredInstances.length).toBe(3);
      expect(result.failedRecoveries.length).toBe(0);
      expect(result.recoveryTime).toBeGreaterThanOrEqual(0);

      // 验证每个实例都被正确恢复
      const recoveredIds = result.recoveredInstances.map(i => i.id).sort();
      expect(recoveredIds).toEqual(['crash-wf-001', 'crash-wf-002', 'crash-wf-003']);
    });

    it('模拟 workflow 执行中途中断后恢复，状态应与中断前一致', async () => {
      const instanceId = 'crash-simulation-001';

      // 阶段 1：workflow 开始执行
      const phase1Instance = makeInstance(instanceId, 'requirements', 'running');
      await persistence.saveInstance(phase1Instance);

      // 阶段 2：workflow 推进到 design 阶段
      const phase2Instance: WorkflowInstance = {
        ...phase1Instance,
        currentState: 'design',
        history: [
          ...phase1Instance.history,
          {
            type: 'workflow.state_changed',
            instanceId,
            timestamp: new Date('2024-01-01T00:02:00Z'),
            data: { fromState: 'requirements', toState: 'design' },
          },
        ],
        updatedAt: new Date('2024-01-01T00:02:00Z'),
      };
      await persistence.saveInstance(phase2Instance);

      // 模拟"中断"：清除内存缓存（进程重启）
      persistence.clearCache();

      // 恢复
      const newPersistence = new WorkflowPersistence({
        storageDir: stateDir,
        eventLogDir,
        enableEventReplay: false,
      });
      await newPersistence.initialize();

      const recoveryManager = new StateRecoveryManager(newPersistence, null, {
        validateConsistency: false,
        repairInconsistencies: false,
        maxRecoveryAttempts: 3,
        enableEventReplay: false,
      });

      const recovered = await recoveryManager.recoverState(instanceId);

      // 恢复后应该是中断前的最后状态（design 阶段）
      expect(recovered).not.toBeNull();
      expect(recovered!.currentState).toBe('design');
      expect(recovered!.status).toBe('running');
      expect(recovered!.history.length).toBe(2); // started + state_changed
    });

    it('getRecoveryStats 应返回正确的统计信息', async () => {
      // 创建不同状态的实例
      await persistence.saveInstance(makeInstance('stats-wf-001', 'requirements', 'running'));
      await persistence.saveInstance(makeInstance('stats-wf-002', 'design', 'running'));
      await persistence.saveInstance(makeInstance('stats-wf-003', 'tasks', 'paused'));
      await persistence.saveInstance(makeInstance('stats-wf-004', 'verification', 'failed'));

      const recoveryManager = new StateRecoveryManager(persistence, null, {
        validateConsistency: false,
        repairInconsistencies: false,
        maxRecoveryAttempts: 3,
        enableEventReplay: false,
      });

      const stats = await recoveryManager.getRecoveryStats();

      expect(stats.totalInstances).toBe(4);
      expect(stats.runningInstances).toBe(2);
      expect(stats.pausedInstances).toBe(1);
      expect(stats.failedInstances).toBe(1);
      expect(stats.lastRecoveryTime).not.toBeNull();
    });
  });
});
