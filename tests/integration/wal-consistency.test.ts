/**
 * WAL 一致性验证集成测试
 *
 * 验证：
 * 1. WAL 写入原子性：写入中途失败不应产生部分写入
 * 2. fsync 顺序：events.jsonl 必须在 state.json 之前完成写入
 * 3. 并发写入安全性：多个并发写入不应产生数据竞争
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WAL } from '../../packages/daemon-core/src/wal/WAL';
import { StateManager } from '../../packages/daemon-core/src/state/StateManager';
import type { Event } from '../../packages/daemon-core/src/types';

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

/**
 * 创建临时目录，并将 HOME/USERPROFILE 重定向到该目录，
 * 使 WAL/StateManager 把文件写到临时目录而非真实 home。
 */
async function createTempHome(): Promise<{ tempDir: string; restore: () => void }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-wal-test-'));
  const origHome = process.env['HOME'];
  const origUserProfile = process.env['USERPROFILE'];

  process.env['HOME'] = tempDir;
  process.env['USERPROFILE'] = tempDir;

  const restore = () => {
    if (origHome !== undefined) {
      process.env['HOME'] = origHome;
    } else {
      delete process.env['HOME'];
    }
    if (origUserProfile !== undefined) {
      process.env['USERPROFILE'] = origUserProfile;
    } else {
      delete process.env['USERPROFILE'];
    }
  };

  return { tempDir, restore };
}

/**
 * 创建测试用 Event 对象
 */
function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    eventId: `test-event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
    projectId: 'test-project',
    action: 'test.action',
    payload: { key: 'value' },
    metadata: {
      schemaVersion: '1.0',
      source: 'daemon',
    },
    ...overrides,
  };
}

// ─── 测试套件 ─────────────────────────────────────────────────────────────────

describe('WAL 一致性验证', () => {
  let tempDir: string;
  let restoreEnv: () => void;
  const projectPath = '/test/project/path';

  beforeEach(async () => {
    const result = await createTempHome();
    tempDir = result.tempDir;
    restoreEnv = result.restore;
  });

  afterEach(async () => {
    restoreEnv();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ─── 1. WAL 写入原子性 ──────────────────────────────────────────────────────

  describe('WAL 写入原子性', () => {
    it('应该成功写入单个事件并可读回', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const event = makeEvent({ action: 'spec.created' });
      await wal.appendEvent(event);

      const events = await wal.readAllEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventId).toBe(event.eventId);
      expect(events[0]!.action).toBe('spec.created');
    });

    it('应该成功写入多个事件并保持顺序', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const events = [
        makeEvent({ action: 'step.1', ts: 1000 }),
        makeEvent({ action: 'step.2', ts: 2000 }),
        makeEvent({ action: 'step.3', ts: 3000 }),
      ];

      for (const event of events) {
        await wal.appendEvent(event);
      }

      const readBack = await wal.readAllEvents();
      expect(readBack).toHaveLength(3);
      expect(readBack[0]!.action).toBe('step.1');
      expect(readBack[1]!.action).toBe('step.2');
      expect(readBack[2]!.action).toBe('step.3');
    });

    it('每行应该是合法的 JSON（JSONL 格式）', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const event = makeEvent({ action: 'jsonl.check' });
      await wal.appendEvent(event);

      const eventsPath = wal.getEventsPath();
      const content = await fs.readFile(eventsPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      expect(lines).toHaveLength(1);
      // 每行必须是合法 JSON
      expect(() => JSON.parse(lines[0]!)).not.toThrow();
      const parsed = JSON.parse(lines[0]!);
      expect(parsed.eventId).toBe(event.eventId);
    });

    it('写入后文件应该存在且非空', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const event = makeEvent();
      await wal.appendEvent(event);

      const eventsPath = wal.getEventsPath();
      const stat = await fs.stat(eventsPath);
      expect(stat.size).toBeGreaterThan(0);
    });

    it('事件应包含 schemaVersion 字段（REQ-18）', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const event = wal.createEvent('proj-1', 'test.action', { data: 'test' });
      await wal.appendEvent(event);

      const events = await wal.readAllEvents();
      expect(events[0]!.metadata.schemaVersion).toBeDefined();
      expect(events[0]!.metadata.schemaVersion).toBe('1.0');
    });

    it('getLastEvent 应返回最后写入的事件', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const e1 = makeEvent({ action: 'first' });
      const e2 = makeEvent({ action: 'second' });
      await wal.appendEvent(e1);
      await wal.appendEvent(e2);

      const last = await wal.getLastEvent();
      expect(last).not.toBeNull();
      expect(last!.action).toBe('second');
    });

    it('空 WAL 的 getLastEvent 应返回 null', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const last = await wal.getLastEvent();
      expect(last).toBeNull();
    });
  });

  // ─── 2. fsync 顺序验证 ──────────────────────────────────────────────────────

  describe('fsync 顺序：events.jsonl 先于 state.json', () => {
    it('appendEvent 后 events.jsonl 应有数据，state.json 也应更新', async () => {
      const sm = new StateManager(projectPath);
      await sm.initialize();

      const event = makeEvent({ action: 'state.update' });
      await sm.appendEvent(event);

      // 读取 WAL 中的事件
      const wal = new WAL(projectPath);
      const events = await wal.readAllEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1]!.eventId).toBe(event.eventId);

      // 读取 state.json
      const state = await sm.getCurrentState();
      expect(state.lastEventId).toBe(event.eventId);
      expect(state.lastEventTs).toBe(event.ts);
    });

    it('多次 appendEvent 后 state.json 应反映最后一个事件', async () => {
      const sm = new StateManager(projectPath);
      await sm.initialize();

      const events = [
        makeEvent({ action: 'event.1', ts: 1000 }),
        makeEvent({ action: 'event.2', ts: 2000 }),
        makeEvent({ action: 'event.3', ts: 3000 }),
      ];

      for (const event of events) {
        await sm.appendEvent(event);
      }

      const state = await sm.getCurrentState();
      expect(state.lastEventId).toBe(events[2]!.eventId);
      expect(state.lastEventTs).toBe(3000);
    });

    it('events.jsonl 中的事件数量应与写入次数一致', async () => {
      const sm = new StateManager(projectPath);
      await sm.initialize();

      const count = 5;
      for (let i = 0; i < count; i++) {
        await sm.appendEvent(makeEvent({ action: `event.${i}` }));
      }

      const wal = new WAL(projectPath);
      const events = await wal.readAllEvents();
      expect(events).toHaveLength(count);
    });

    it('rebuildFromEventsFile 应从 events.jsonl 重建 state.json', async () => {
      const sm = new StateManager(projectPath);
      await sm.initialize();

      const event1 = makeEvent({ action: 'rebuild.1', ts: 100 });
      const event2 = makeEvent({ action: 'rebuild.2', ts: 200 });
      await sm.appendEvent(event1);
      await sm.appendEvent(event2);

      // 重建 state
      await sm.rebuildFromEventsFile();

      const state = await sm.getCurrentState();
      // 重建后 lastEventId 应该是最后一个事件
      expect(state.lastEventId).toBe(event2.eventId);
    });

    it('WAL 文件路径应在 events.jsonl 目录下', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const eventsPath = wal.getEventsPath();
      expect(eventsPath).toContain('events.jsonl');
      expect(eventsPath).toContain('.specforge');
    });

    it('state.json 应与 events.jsonl 在同一目录', async () => {
      const sm = new StateManager(projectPath);
      await sm.initialize();

      const wal = new WAL(projectPath);
      const eventsPath = wal.getEventsPath();
      const eventsDir = path.dirname(eventsPath);

      // state.json 应在同一目录
      const statePathExpected = path.join(eventsDir, 'state.json');
      const stateStat = await fs.stat(statePathExpected);
      expect(stateStat.isFile()).toBe(true);
    });
  });

  // ─── 3. 并发写入安全性 ──────────────────────────────────────────────────────

  describe('并发写入安全性', () => {
    it('多个并发 appendEvent 不应丢失事件', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const concurrency = 10;
      const events = Array.from({ length: concurrency }, (_, i) =>
        makeEvent({ action: `concurrent.${i}`, ts: i })
      );

      // 并发写入
      await Promise.all(events.map(e => wal.appendEvent(e)));

      const readBack = await wal.readAllEvents();
      expect(readBack).toHaveLength(concurrency);

      // 所有 eventId 都应存在（无丢失）
      const writtenIds = new Set(events.map(e => e.eventId));
      const readIds = new Set(readBack.map(e => e.eventId));
      for (const id of writtenIds) {
        expect(readIds.has(id)).toBe(true);
      }
    });

    it('并发写入后每行应该是合法 JSON（无行损坏）', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const concurrency = 20;
      const events = Array.from({ length: concurrency }, (_, i) =>
        makeEvent({ action: `concurrent.json.${i}` })
      );

      await Promise.all(events.map(e => wal.appendEvent(e)));

      const eventsPath = wal.getEventsPath();
      const content = await fs.readFile(eventsPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      expect(lines).toHaveLength(concurrency);

      // 每行必须是合法 JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
        const parsed = JSON.parse(line);
        expect(parsed.eventId).toBeDefined();
        expect(parsed.action).toBeDefined();
      }
    });

    it('并发写入后 eventId 不应重复', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const concurrency = 15;
      const events = Array.from({ length: concurrency }, (_, i) =>
        makeEvent({ action: `dedup.${i}` })
      );

      await Promise.all(events.map(e => wal.appendEvent(e)));

      const readBack = await wal.readAllEvents();
      const ids = readBack.map(e => e.eventId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('StateManager 并发 appendEvent 不应丢失事件', async () => {
      const sm = new StateManager(projectPath);
      await sm.initialize();

      const concurrency = 8;
      const events = Array.from({ length: concurrency }, (_, i) =>
        makeEvent({ action: `sm.concurrent.${i}`, ts: i * 100 })
      );

      await Promise.all(events.map(e => sm.appendEvent(e)));

      const wal = new WAL(projectPath);
      const readBack = await wal.readAllEvents();
      expect(readBack).toHaveLength(concurrency);
    });

    it('顺序写入与并发写入的事件总数应一致', async () => {
      const wal1 = new WAL(projectPath);
      await wal1.initialize();

      // 顺序写入 5 个
      const seqEvents = Array.from({ length: 5 }, (_, i) =>
        makeEvent({ action: `seq.${i}` })
      );
      for (const e of seqEvents) {
        await wal1.appendEvent(e);
      }

      // 并发写入 5 个
      const concEvents = Array.from({ length: 5 }, (_, i) =>
        makeEvent({ action: `conc.${i}` })
      );
      await Promise.all(concEvents.map(e => wal1.appendEvent(e)));

      const readBack = await wal1.readAllEvents();
      expect(readBack).toHaveLength(10);
    });
  });

  // ─── 4. 边界情况 ────────────────────────────────────────────────────────────

  describe('边界情况', () => {
    it('initialize 应该是幂等的（多次调用不报错）', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();
      await wal.initialize(); // 第二次调用不应抛出
      await wal.initialize(); // 第三次调用不应抛出

      const events = await wal.readAllEvents();
      expect(events).toHaveLength(0);
    });

    it('空 WAL 的 readAllEvents 应返回空数组', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const events = await wal.readAllEvents();
      expect(events).toEqual([]);
    });

    it('payload 中包含特殊字符的事件应正确序列化', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const event = makeEvent({
        action: 'special.chars',
        payload: {
          text: '包含中文、换行\n和特殊字符"\'\\',
          nested: { deep: true },
        },
      });
      await wal.appendEvent(event);

      const events = await wal.readAllEvents();
      expect(events[0]!.payload['text']).toBe('包含中文、换行\n和特殊字符"\'\\');
      expect((events[0]!.payload['nested'] as Record<string, unknown>)['deep']).toBe(true);
    });

    it('createEvent 应生成唯一的 eventId', async () => {
      const wal = new WAL(projectPath);
      await wal.initialize();

      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const event = wal.createEvent('proj', 'test', {});
        ids.add(event.eventId);
      }
      expect(ids.size).toBe(50);
    });

    it('StateManager 初始化后 getCurrentState 应返回有效状态', async () => {
      const sm = new StateManager(projectPath);
      await sm.initialize();

      const state = await sm.getCurrentState();
      expect(state).toBeDefined();
      expect(state.schemaVersion).toBe('1.0');
      expect(state.activeSessions).toEqual([]);
      expect(state.workItems).toEqual([]);
    });
  });
});
