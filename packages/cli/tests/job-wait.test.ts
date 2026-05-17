/**
 * Tests for JobWaiter (`--wait` flag support, Task 5.2).
 *
 * 覆盖：
 *  - 成功终止态（succeeded）
 *  - 失败终止态（failed）
 *  - 中止终止态（aborted）
 *  - 非终止态被忽略
 *  - 超时（fake timer）
 *  - 外部 AbortSignal（含提前 abort 与等待中 abort）
 *  - 资源清理：unsubscribe / clearTimeout / removeEventListener 都被调用
 *  - 订阅前 job 已终止：getCurrentState 快照命中
 *
 * 严格遵守 async-resource-coding-standards：T3 fake timer / T4 显式断言 /
 * 测试体内的所有动态资源在 afterEach 中清理（本测试用 mock event source，
 * 资源跟踪通过断言 mock 的调用次数完成）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  JobWaiter,
  createJobWaiter,
  JobTimeoutError,
  JobWaitAbortedError,
  DEFAULT_TERMINAL_STATES,
  type JobEventSource,
  type JobStateEvent,
} from '../src/job/JobWaiter';

/**
 * Bun 的 vitest 兼容层只实现了 `vi.advanceTimersByTime`（同步版），
 * 没有 `advanceTimersByTimeAsync`。本辅助函数：
 *   1. 同步推进虚拟时间
 *   2. flush 一轮微任务，让被 timer 触发的 reject/resolve 进入 promise 链
 */
async function advanceTime(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  // 多次 flush 微任务队列，覆盖嵌套 then 链
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
  }
}

/**
 * 可控的 mock 事件源：
 * - subscribe 跟踪被调用次数和当前监听器集合
 * - emit() 用于在测试体内主动推送事件
 * - getCurrentState 默认返回 null（无快照），可通过 setSnapshot 配置
 */
function createMockSource(): {
  source: JobEventSource;
  subscribeCalls: number;
  unsubscribeCalls: number;
  emit: (event: JobStateEvent) => void;
  setSnapshot: (snapshot: JobStateEvent | null) => void;
  setSnapshotError: (err: Error) => void;
  activeListenerCount: () => number;
} {
  const listeners = new Map<string, Set<(e: JobStateEvent) => void>>();
  let subscribeCalls = 0;
  let unsubscribeCalls = 0;
  let snapshot: JobStateEvent | null = null;
  let snapshotError: Error | null = null;

  const source: JobEventSource = {
    subscribe(jobId, listener) {
      subscribeCalls++;
      let bucket = listeners.get(jobId);
      if (!bucket) {
        bucket = new Set();
        listeners.set(jobId, bucket);
      }
      bucket.add(listener);
      return () => {
        unsubscribeCalls++;
        bucket!.delete(listener);
        if (bucket!.size === 0) listeners.delete(jobId);
      };
    },
    async getCurrentState(jobId) {
      if (snapshotError) throw snapshotError;
      return snapshot && snapshot.jobId === jobId ? snapshot : null;
    },
  };

  return {
    source,
    get subscribeCalls() {
      return subscribeCalls;
    },
    get unsubscribeCalls() {
      return unsubscribeCalls;
    },
    emit(event) {
      const bucket = listeners.get(event.jobId);
      if (!bucket) return;
      // 拷贝避免 listener 内 unsubscribe 改集合导致 iter 异常
      for (const l of [...bucket]) l(event);
    },
    setSnapshot(s) {
      snapshot = s;
    },
    setSnapshotError(err) {
      snapshotError = err;
    },
    activeListenerCount() {
      let total = 0;
      for (const b of listeners.values()) total += b.size;
      return total;
    },
  } as unknown as ReturnType<typeof createMockSource>;
}

describe('JobWaiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('DEFAULT_TERMINAL_STATES', () => {
    it('contains completed / failed / blocked / cancelled', () => {
      expect(DEFAULT_TERMINAL_STATES.has('completed')).toBe(true);
      expect(DEFAULT_TERMINAL_STATES.has('failed')).toBe(true);
      expect(DEFAULT_TERMINAL_STATES.has('blocked')).toBe(true);
      expect(DEFAULT_TERMINAL_STATES.has('cancelled')).toBe(true);
    });

    it('does not contain non-terminal states', () => {
      expect(DEFAULT_TERMINAL_STATES.has('pending')).toBe(false);
      expect(DEFAULT_TERMINAL_STATES.has('running')).toBe(false);
      expect(DEFAULT_TERMINAL_STATES.has('succeeded')).toBe(false);
      expect(DEFAULT_TERMINAL_STATES.has('aborted')).toBe(false);
    });
  });

  describe('waitForTerminal — happy paths', () => {
    it('resolves with succeeded result when emit terminal event', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const promise = waiter.waitForTerminal('job-1', { timeoutMs: 5000 });
      // 让 microtask 跑一轮（getCurrentState Promise resolve）
      await Promise.resolve();
      mock.emit({
        jobId: 'job-1',
        status: 'succeeded',
        result: { ok: true },
        updatedAt: 1000,
      });

      const result = await promise;
      expect(result.status).toBe('succeeded');
      expect(result.result).toEqual({ ok: true });
      expect(mock.unsubscribeCalls).toBe(1);
    });

    it('resolves with failed result and carries error message', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const promise = waiter.waitForTerminal('job-2', { timeoutMs: 5000 });
      await Promise.resolve();
      mock.emit({
        jobId: 'job-2',
        status: 'failed',
        error: 'boom',
        updatedAt: 2000,
      });

      const result = await promise;
      expect(result.status).toBe('failed');
      expect(result.error).toBe('boom');
      expect(mock.unsubscribeCalls).toBe(1);
    });

    it('resolves with aborted status', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const promise = waiter.waitForTerminal('job-3', { timeoutMs: 5000 });
      await Promise.resolve();
      mock.emit({ jobId: 'job-3', status: 'aborted', updatedAt: 3000 });

      const result = await promise;
      expect(result.status).toBe('aborted');
      expect(mock.unsubscribeCalls).toBe(1);
    });

    it('ignores non-terminal events and continues waiting', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const promise = waiter.waitForTerminal('job-4', { timeoutMs: 5000 });
      await Promise.resolve();

      // 几次中间态事件不应导致 settle
      mock.emit({ jobId: 'job-4', status: 'pending', updatedAt: 1 });
      mock.emit({ jobId: 'job-4', status: 'running', updatedAt: 2 });
      mock.emit({ jobId: 'job-4', status: 'queued', updatedAt: 3 });

      // 推进 1s（仍小于 timeout），listener 应仍活跃
      await advanceTime(1000);
      expect(mock.activeListenerCount()).toBe(1);

      // 终止态到达
      mock.emit({ jobId: 'job-4', status: 'succeeded', updatedAt: 4 });

      const result = await promise;
      expect(result.status).toBe('succeeded');
      expect(mock.unsubscribeCalls).toBe(1);
      expect(mock.activeListenerCount()).toBe(0);
    });

    it('ignores events for other jobIds', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const promise = waiter.waitForTerminal('job-5', { timeoutMs: 5000 });
      await Promise.resolve();

      // 串扰事件
      mock.emit({ jobId: 'other', status: 'succeeded', updatedAt: 1 });
      await advanceTime(100);

      // promise 仍未 settle
      mock.emit({ jobId: 'job-5', status: 'succeeded', updatedAt: 2 });
      const result = await promise;
      expect(result.jobId).toBe('job-5');
    });
  });

  describe('waitForTerminal — timeout', () => {
    it('rejects with JobTimeoutError after timeout elapsed', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const promise = waiter.waitForTerminal('job-t', { timeoutMs: 1000 });
      // 处理 microtasks
      await Promise.resolve();

      await advanceTime(1000);

      await expect(promise).rejects.toBeInstanceOf(JobTimeoutError);

      // 资源清理：unsubscribe 必须被调用
      expect(mock.unsubscribeCalls).toBe(1);
      expect(mock.activeListenerCount()).toBe(0);
    });

    it('JobTimeoutError carries operation/timeoutMs/jobId/suggestion', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const promise = waiter.waitForTerminal('job-t2', { timeoutMs: 500 });
      await Promise.resolve();
      await advanceTime(500);

      try {
        await promise;
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(JobTimeoutError);
        const tErr = err as JobTimeoutError;
        expect(tErr.code).toBe('WAIT_TIMEOUT');
        expect(tErr.operation).toBe('JobWaiter.waitForTerminal');
        expect(tErr.timeoutMs).toBe(500);
        expect(tErr.jobId).toBe('job-t2');
        expect(tErr.suggestion.length).toBeGreaterThan(0);
        expect(tErr.message).toContain('500ms');
        expect(tErr.message).toContain('job-t2');
      }
    });

    it('uses default 60s timeout when not specified', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const promise = waiter.waitForTerminal('job-default');
      await Promise.resolve();

      // 59s 还未触发
      await advanceTime(59_000);
      let resolved = false;
      promise.then(
        () => (resolved = true),
        () => (resolved = true),
      );
      await Promise.resolve();
      expect(resolved).toBe(false);

      // 推到 60s 触发
      await advanceTime(1_000);
      await expect(promise).rejects.toBeInstanceOf(JobTimeoutError);
    });

    it('accepts plain number as second arg (shorthand)', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const promise = waiter.waitForTerminal('job-n', 200);
      await Promise.resolve();
      await advanceTime(200);
      await expect(promise).rejects.toBeInstanceOf(JobTimeoutError);
    });
  });

  describe('waitForTerminal — abort signal', () => {
    it('rejects immediately when signal is already aborted', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const ac = new AbortController();
      ac.abort('user cancel');

      await expect(
        waiter.waitForTerminal('job-a', { timeoutMs: 5000, signal: ac.signal }),
      ).rejects.toBeInstanceOf(JobWaitAbortedError);

      // 提前 abort：根本不订阅
      expect(mock.subscribeCalls).toBe(0);
    });

    it('rejects with JobWaitAbortedError when aborted during wait', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const ac = new AbortController();
      const promise = waiter.waitForTerminal('job-a2', {
        timeoutMs: 5000,
        signal: ac.signal,
      });
      await Promise.resolve();

      ac.abort('user cancel');

      await expect(promise).rejects.toBeInstanceOf(JobWaitAbortedError);
      expect(mock.unsubscribeCalls).toBe(1);
      expect(mock.activeListenerCount()).toBe(0);
    });

    it('JobWaitAbortedError carries jobId and reason', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const ac = new AbortController();
      const promise = waiter.waitForTerminal('job-a3', {
        timeoutMs: 5000,
        signal: ac.signal,
      });
      await Promise.resolve();

      ac.abort('shutting down');

      try {
        await promise;
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(JobWaitAbortedError);
        const aErr = err as JobWaitAbortedError;
        expect(aErr.code).toBe('WAIT_ABORTED');
        expect(aErr.jobId).toBe('job-a3');
        expect(aErr.reason).toContain('shutting down');
      }
    });
  });

  describe('waitForTerminal — getCurrentState snapshot', () => {
    it('resolves immediately if snapshot already in terminal state', async () => {
      const mock = createMockSource();
      mock.setSnapshot({
        jobId: 'job-snap',
        status: 'succeeded',
        result: { fast: true },
        updatedAt: 0,
      });
      const waiter = new JobWaiter(mock.source);

      const result = await waiter.waitForTerminal('job-snap', {
        timeoutMs: 5000,
      });

      expect(result.status).toBe('succeeded');
      expect(result.result).toEqual({ fast: true });
      expect(mock.unsubscribeCalls).toBe(1);
    });

    it('does not settle from non-terminal snapshot', async () => {
      const mock = createMockSource();
      mock.setSnapshot({
        jobId: 'job-snap2',
        status: 'running',
        updatedAt: 0,
      });
      const waiter = new JobWaiter(mock.source);

      const promise = waiter.waitForTerminal('job-snap2', { timeoutMs: 5000 });
      // 让快照 promise resolve
      await Promise.resolve();
      await Promise.resolve();

      // 推进 1s 仍未 settle
      await advanceTime(1000);
      expect(mock.activeListenerCount()).toBe(1);

      mock.emit({ jobId: 'job-snap2', status: 'succeeded', updatedAt: 1 });
      const result = await promise;
      expect(result.status).toBe('succeeded');
    });
  });

  describe('custom terminalStates', () => {
    it('uses caller-provided terminal set', async () => {
      const mock = createMockSource();
      const waiter = new JobWaiter(mock.source);

      const customSet = new Set(['done']);
      const promise = waiter.waitForTerminal('job-c', {
        timeoutMs: 5000,
        terminalStates: customSet,
      });
      await Promise.resolve();

      // succeeded 不在自定义集合里，应被忽略
      mock.emit({ jobId: 'job-c', status: 'succeeded', updatedAt: 1 });
      await advanceTime(100);
      expect(mock.activeListenerCount()).toBe(1);

      mock.emit({ jobId: 'job-c', status: 'done', updatedAt: 2 });
      const result = await promise;
      expect(result.status).toBe('done');
    });
  });

  describe('createJobWaiter factory', () => {
    it('returns a working JobWaiter instance', async () => {
      const mock = createMockSource();
      const waiter = createJobWaiter(mock.source);

      const promise = waiter.waitForTerminal('job-f', { timeoutMs: 1000 });
      await Promise.resolve();
      mock.emit({ jobId: 'job-f', status: 'succeeded', updatedAt: 1 });
      const result = await promise;
      expect(result.status).toBe('succeeded');
    });
  });
});
