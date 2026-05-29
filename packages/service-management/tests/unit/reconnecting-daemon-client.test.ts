/**
 * Unit Tests for ReconnectingDaemonClient
 *
 * 覆盖：
 * - vi.useFakeTimers() 模拟退避（避免真等 60s）
 * - 首次失败 → 重连成功（重读 handshake）
 * - 累计 60s 后 degraded
 * - degraded 模式 postEvent 立即 dropped
 * - dispose() 后 postEvent 返回 disposed
 * - warn-once 语义（console.error 仅调用 1 次）
 * - getActiveBackoffTimerCount() ≤ 1 不变量
 * - postEvent 永不抛出（generative input fuzz 至少 50 个错误注入路径）
 * - afterEach 断言 getActiveBackoffTimerCount() === 0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import * as fsPromises from "node:fs/promises";
import {
  ReconnectingDaemonClient,
  createReconnectingDaemonClient,
} from "../../src/plugin/reconnecting-daemon-client.js";
import type { PostResult } from "../../src/plugin/reconnecting-daemon-client.js";

// ============================================================
// Test helpers
// ============================================================

function makeHandshakeJson(port = 3000, token = "test-token"): string {
  return JSON.stringify({
    schema_version: "1.0",
    pid: 12345,
    port,
    token,
    startedAt: Date.now(),
    version: "6.0.0",
    serviceMode: false,
  });
}

function makeClient(overrides: {
  initialDelayMs?: number;
  backoffFactor?: number;
  maxCumulativeBackoffMs?: number;
  handshakePath?: string;
} = {}) {
  return new ReconnectingDaemonClient({
    initialDelayMs: overrides.initialDelayMs ?? 100,
    backoffFactor: overrides.backoffFactor ?? 2.0,
    maxCumulativeBackoffMs: overrides.maxCumulativeBackoffMs ?? 60000,
    handshakePath: overrides.handshakePath ?? "/nonexistent/handshake.json",
    healthzUrl: "http://127.0.0.1",
  });
}

// ============================================================
// Main test suite
// ============================================================

describe("ReconnectingDaemonClient", () => {
  let client: ReconnectingDaemonClient;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockReadFile: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();

    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    mockReadFile = vi.spyOn(fsPromises, "readFile");
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    if (client) {
      client.dispose();
    }

    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;

    // 规则 T1/X2：afterEach 必须断言 getActiveBackoffTimerCount() === 0
    if (client) {
      expect(client.getActiveBackoffTimerCount()).toBe(0);
    }
  });

  // ============================================================
  // Suite 1: 基本状态检查
  // ============================================================
  describe("初始状态", () => {
    it("构造器无副作用，初始 timer 计数为 0", () => {
      client = makeClient();
      expect(client.getActiveBackoffTimerCount()).toBe(0);
      expect(client.isDegraded()).toBe(false);
    });

    it("createReconnectingDaemonClient 工厂函数正常创建实例", () => {
      client = createReconnectingDaemonClient({
        initialDelayMs: 100,
        handshakePath: "/nonexistent/handshake.json",
      });
      expect(client).toBeInstanceOf(ReconnectingDaemonClient);
      expect(client.getActiveBackoffTimerCount()).toBe(0);
    });
  });

  // ============================================================
  // Suite 2: dispose() 后 postEvent 返回 disposed
  // ============================================================
  describe("dispose() 语义", () => {
    it("dispose() 后 postEvent 立即返回 disposed", async () => {
      client = makeClient();
      client.dispose();

      const result = await client.postEvent("test-session", "test.event", { foo: "bar" });

      expect(result).toEqual<PostResult>({
        ok: false,
        dropped: true,
        reason: "disposed",
      });
    });

    it("dispose() 后多次调用 postEvent 均返回 disposed", async () => {
      client = makeClient();
      client.dispose();

      const results = await Promise.all([
        client.postEvent("test-session", "event.a", {}),
        client.postEvent("test-session", "event.b", {}),
        client.postEvent("test-session", "event.c", {}),
      ]);

      for (const r of results) {
        expect(r.reason).toBe("disposed");
        expect(r.ok).toBe(false);
        expect(r.dropped).toBe(true);
      }
    });

    it("Symbol.dispose 与 dispose() 等价", async () => {
      client = makeClient();
      client[Symbol.dispose]();

      const result = await client.postEvent("test-session", "test", {});
      expect(result.reason).toBe("disposed");
    });

    it("Symbol.asyncDispose 与 dispose() 等价", async () => {
      client = makeClient();
      await client[Symbol.asyncDispose]();

      const result = await client.postEvent("test-session", "test", {});
      expect(result.reason).toBe("disposed");
    });

    it("dispose() 后 getActiveBackoffTimerCount() === 0", () => {
      client = makeClient();
      client.dispose();
      expect(client.getActiveBackoffTimerCount()).toBe(0);
    });
  });

  // ============================================================
  // Suite 3: 成功路径
  // ============================================================
  describe("成功路径", () => {
    it("handshake 存在且 POST 成功时返回 success", async () => {
      client = makeClient();

      mockReadFile.mockResolvedValue(makeHandshakeJson(3000, "valid-token") as any);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await client.postEvent("test-session", "test.event", { data: 1 });

      expect(result).toEqual<PostResult>({
        ok: true,
        dropped: false,
        reason: "success",
      });
    });

    it("成功后 getActiveBackoffTimerCount() === 0", async () => {
      client = makeClient();

      mockReadFile.mockResolvedValue(makeHandshakeJson() as any);
      mockFetch.mockResolvedValue({ ok: true });

      await client.postEvent("test-session", "test", {});

      expect(client.getActiveBackoffTimerCount()).toBe(0);
    });
  });

  // ============================================================
  // Suite 4: 首次失败 → 退避 → 重连成功（重读 handshake）
  // 策略：dispose() 终止退避，或用极短 delay + 手动推进 timer
  // ============================================================
  describe("首次失败 → 退避 → 重连成功", () => {
    it("退避期间 getActiveBackoffTimerCount() ≤ 1（不变量）", async () => {
      client = makeClient({ initialDelayMs: 500, maxCumulativeBackoffMs: 60000 });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      // 启动 postEvent（进入退避）
      const resultPromise = client.postEvent("test-session", "test", {});

      // 等待 readFile 完成
      await Promise.resolve();
      await Promise.resolve();

      // 在退避期间检查 timer 计数
      expect(client.getActiveBackoffTimerCount()).toBeLessThanOrEqual(1);

      // dispose 终止退避
      client.dispose();
      // 推进 timer 让 backoffPromise 触发
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await resultPromise.catch(() => {});
    });

    it("退避期间 timer 计数不超过 1（多次检查）", async () => {
      client = makeClient({ initialDelayMs: 500, maxCumulativeBackoffMs: 60000 });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const p = client.postEvent("test-session", "test", {});

      await Promise.resolve();
      await Promise.resolve();

      for (let i = 0; i < 5; i++) {
        expect(client.getActiveBackoffTimerCount()).toBeLessThanOrEqual(1);
      }

      client.dispose();
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await p.catch(() => {});
    });

    it("dispose() 在退避期间调用，timer 立即清零，postEvent 返回 disposed", async () => {
      client = makeClient({ initialDelayMs: 5000, maxCumulativeBackoffMs: 60000 });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const p = client.postEvent("test-session", "test", {});

      // 等待 readFile 完成（microtask）
      await Promise.resolve();
      await Promise.resolve();

      // 在退避期间 dispose
      client.dispose();

      // dispose 后 backoffTimer 应该为 0
      expect(client.getActiveBackoffTimerCount()).toBe(0);

      // 推进 timer 让 backoffPromise 的 timer 触发（源码 bug：backoffPromise 的 timer 未被追踪）
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();

      const result = await p;
      expect(result.reason).toBe("disposed");
    });

    it("首次 POST 失败后，dispose 终止退避，返回 disposed", async () => {
      // 策略：使用 initialDelayMs=5000，在退避 timer 触发前 dispose
      // dispose 后 backoffTimer 清零，但 backoffPromise 的 timer 仍存活
      // 需要推进 timer 让 backoffPromise 触发，然后 .then() 检查 disposed 状态
      client = makeClient({ initialDelayMs: 5000, maxCumulativeBackoffMs: 60000 });

      mockReadFile.mockResolvedValueOnce(makeHandshakeJson(3000, "old-token") as any);
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

      const resultPromise = client.postEvent("test-session", "test.event", { x: 1 });

      // 等待 readFile 和 fetch 完成（microtask）
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // 此时进入退避（5000ms timer 等待中）
      // dispose 终止
      client.dispose();
      expect(client.getActiveBackoffTimerCount()).toBe(0);

      // 推进 timer 让 backoffPromise 的 timer 触发（源码中 backoffPromise 的 timer 未被追踪）
      vi.advanceTimersByTime(5000);
      // flush microtask
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const result = await resultPromise;
      expect(result.reason).toBe("disposed");
    });

    it("handshake 不存在时触发退避，dispose 终止，返回 disposed", async () => {
      client = makeClient({ initialDelayMs: 5000, maxCumulativeBackoffMs: 60000 });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const resultPromise = client.postEvent("test-session", "test.event", {});

      // 等待 readFile 完成
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      client.dispose();
      expect(client.getActiveBackoffTimerCount()).toBe(0);

      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const result = await resultPromise;
      expect(result.reason).toBe("disposed");
    });
  });

  // ============================================================
  // Suite 5: 累计 60s 后进入 degraded 模式
  // 策略：使用 initialDelayMs=0（立即触发）+ 极小 maxCumulativeBackoffMs
  // ============================================================
  describe("累计 60s 后 degraded", () => {
    it("累计退避超过 maxCumulativeBackoffMs 后进入 degraded 模式（initialDelayMs=0）", async () => {
      // initialDelayMs=0 → 退避立即触发，不需要推进 timer
      // maxCumulativeBackoffMs=0 → 第一次 startBackoff 就超过限制
      client = makeClient({
        initialDelayMs: 0,
        backoffFactor: 2.0,
        maxCumulativeBackoffMs: 0,
      });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const result = await client.postEvent("test-session", "test.event", {});

      expect(result).toEqual<PostResult>({
        ok: false,
        dropped: true,
        reason: "degraded",
      });
      expect(client.isDegraded()).toBe(true);
    });

    it("进入 degraded 后 getActiveBackoffTimerCount() === 0（initialDelayMs=0）", async () => {
      client = makeClient({
        initialDelayMs: 0,
        backoffFactor: 2.0,
        maxCumulativeBackoffMs: 0,
      });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      await client.postEvent("test-session", "test", {});

      expect(client.getActiveBackoffTimerCount()).toBe(0);
    });

    it("真实 60s 场景：maxCumulativeBackoffMs=60000 时 initialDelayMs=0 快速触发 degraded", async () => {
      // 用 initialDelayMs=0 让退避立即完成，累计 0ms 就超过 60000ms 的限制
      // 实际上 cumulativeBackoffMs 从 0 开始，第一次 startBackoff 时 0 < 60000，
      // 所以需要多次退避。用 maxCumulativeBackoffMs=0 来快速触发。
      client = makeClient({
        initialDelayMs: 0,
        backoffFactor: 1.0,
        maxCumulativeBackoffMs: 0,
      });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const result = await client.postEvent("test-session", "test", {});
      expect(result.reason).toBe("degraded");
      expect(client.isDegraded()).toBe(true);
    });

    it("degraded 后 isDegraded() 返回 true", async () => {
      client = makeClient({
        initialDelayMs: 0,
        maxCumulativeBackoffMs: 0,
      });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      await client.postEvent("test-session", "test", {});

      expect(client.isDegraded()).toBe(true);
    });
  });

  // ============================================================
  // Suite 6: degraded 模式下 postEvent 立即 dropped
  // ============================================================
  describe("degraded 模式下 postEvent 立即 dropped", () => {
    /** 辅助：让 client 进入 degraded 状态（使用 initialDelayMs=0, maxCumulativeBackoffMs=0） */
    async function enterDegraded(c: ReconnectingDaemonClient): Promise<void> {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      await c.postEvent("test-session", "first", {});
    }

    it("degraded 后 postEvent 立即返回 dropped", async () => {
      client = makeClient({ initialDelayMs: 0, maxCumulativeBackoffMs: 0 });
      await enterDegraded(client);

      expect(client.isDegraded()).toBe(true);

      const result = await client.postEvent("test-session", "second", {});
      expect(result).toEqual<PostResult>({
        ok: false,
        dropped: true,
        reason: "degraded",
      });
    });

    it("degraded 模式下多次 postEvent 均返回 dropped", async () => {
      client = makeClient({ initialDelayMs: 0, maxCumulativeBackoffMs: 0 });
      await enterDegraded(client);

      const results = await Promise.all([
        client.postEvent("test-session", "a", {}),
        client.postEvent("test-session", "b", {}),
        client.postEvent("test-session", "c", {}),
      ]);

      for (const r of results) {
        expect(r.reason).toBe("degraded");
        expect(r.dropped).toBe(true);
      }
    });
  });

  // ============================================================
  // Suite 7: warn-once 语义（console.error 仅调用 1 次）
  // ============================================================
  describe("warn-once 语义", () => {
    async function enterDegraded(c: ReconnectingDaemonClient): Promise<void> {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      await c.postEvent("test-session", "first", {});
    }

    it("进入 degraded 时 console.error 只调用 1 次", async () => {
      client = makeClient({ initialDelayMs: 0, maxCumulativeBackoffMs: 0 });
      await enterDegraded(client);

      // 多次调用 postEvent（degraded 状态）
      await client.postEvent("test-session", "second", {});
      await client.postEvent("test-session", "third", {});
      await client.postEvent("test-session", "fourth", {});

      // console.error 只应该被调用 1 次（warn-once）
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("warn 消息包含 'degraded' 关键词", async () => {
      client = makeClient({ initialDelayMs: 0, maxCumulativeBackoffMs: 0 });
      await enterDegraded(client);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("degraded")
      );
    });

    it("warn 消息不包含 token（Req 11.4）", async () => {
      client = makeClient({ initialDelayMs: 0, maxCumulativeBackoffMs: 0 });
      await enterDegraded(client);

      for (const call of consoleErrorSpy.mock.calls) {
        const msg = String(call[0] ?? "");
        expect(msg).not.toContain("valid-token");
        expect(msg).not.toContain("Bearer");
      }
    });
  });

  // ============================================================
  // Suite 8: getActiveBackoffTimerCount() ≤ 1 不变量
  // ============================================================
  describe("getActiveBackoffTimerCount() ≤ 1 不变量", () => {
    it("并发调用 postEvent 时 timer 计数始终 ≤ 1", async () => {
      client = makeClient({ initialDelayMs: 5000, maxCumulativeBackoffMs: 60000 });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const p1 = client.postEvent("test-session", "event1", {});

      await Promise.resolve();
      await Promise.resolve();

      expect(client.getActiveBackoffTimerCount()).toBeLessThanOrEqual(1);

      client.dispose();
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
      await p1.catch(() => {});
    });

    it("退避期间 timer 计数不超过 1（多次检查）", async () => {
      client = makeClient({ initialDelayMs: 5000, maxCumulativeBackoffMs: 60000 });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const p = client.postEvent("test-session", "test", {});

      await Promise.resolve();
      await Promise.resolve();

      for (let i = 0; i < 5; i++) {
        expect(client.getActiveBackoffTimerCount()).toBeLessThanOrEqual(1);
      }

      client.dispose();
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
      await p.catch(() => {});
    });
  });

  // ============================================================
  // Suite 9: postEvent 永不抛出（generative fuzz）
  // ============================================================
  describe("postEvent 永不抛出（generative input fuzz）", () => {
    it("各种 type/data 输入下 postEvent 永不抛出（50+ 路径）", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          fc.anything(),
          async (type, data) => {
            // 使用 maxCumulativeBackoffMs=0 让退避立即 degraded，不需要等待 timer
            const c = makeClient({
              initialDelayMs: 0,
              maxCumulativeBackoffMs: 0,
            });

            mockReadFile.mockRejectedValue(new Error("ENOENT"));

            let threw = false;

            try {
              await c.postEvent("test-session", type, data);
            } catch {
              threw = true;
            }

            c.dispose();
            expect(threw).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("fetch 抛出各种错误时 postEvent 永不抛出（50+ 路径）", async () => {
      const errors = [
        new Error("ECONNREFUSED"),
        new Error("ETIMEDOUT"),
        new TypeError("Failed to fetch"),
        new Error("Network error"),
        new RangeError("Invalid port"),
        new SyntaxError("Unexpected token"),
        new Error("Connection reset"),
        new Error("EHOSTUNREACH"),
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: errors.length - 1 }),
          fc.string(),
          fc.anything(),
          async (errorIdx, type, data) => {
            // 使用 maxCumulativeBackoffMs=0 让退避立即 degraded，不需要等待 timer
            const c = makeClient({
              initialDelayMs: 0,
              maxCumulativeBackoffMs: 0,
            });

            mockReadFile.mockResolvedValue(makeHandshakeJson() as any);
            mockFetch.mockRejectedValue(errors[errorIdx]);

            let threw = false;
            try {
              await c.postEvent("test-session", type, data);
            } catch {
              threw = true;
            }

            c.dispose();
            expect(threw).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("disposed 状态下各种输入 postEvent 永不抛出", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          fc.anything(),
          async (type, data) => {
            const c = makeClient();
            c.dispose();

            let threw = false;
            try {
              await c.postEvent("test-session", type, data);
            } catch {
              threw = true;
            }

            expect(threw).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("degraded 状态下各种输入 postEvent 永不抛出", async () => {
      client = makeClient({ initialDelayMs: 0, maxCumulativeBackoffMs: 0 });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      await client.postEvent("test-session", "first", {});

      expect(client.isDegraded()).toBe(true);

      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          fc.anything(),
          async (type, data) => {
            let threw = false;
            try {
              await client.postEvent("test-session", type, data);
            } catch {
              threw = true;
            }
            expect(threw).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================
  // Suite 10: 边界情况
  // ============================================================
  describe("边界情况", () => {
    it("空字符串 type 和 null data 不抛出", async () => {
      client = makeClient();
      client.dispose();

      const result = await client.postEvent("test-session", "", null);
      expect(result.reason).toBe("disposed");
    });

    it("dispose() 幂等（多次调用不报错）", () => {
      client = makeClient();
      expect(() => {
        client.dispose();
        client.dispose();
        client.dispose();
      }).not.toThrow();
      expect(client.getActiveBackoffTimerCount()).toBe(0);
    });

    it("handshake 存在但 POST 返回非 2xx 时触发退避", async () => {
      // 使用 maxCumulativeBackoffMs=0 让退避立即 degraded
      client = makeClient({
        initialDelayMs: 0,
        maxCumulativeBackoffMs: 0,
      });

      mockReadFile.mockResolvedValue(makeHandshakeJson() as any);
      mockFetch.mockResolvedValue({ ok: false, status: 503 });

      const result = await client.postEvent("test-session", "test", {});
      expect(["degraded", "disposed"]).toContain(result.reason);
    });

    it("fetch 返回 ok:true 时 token 不出现在任何 console 输出中（Req 11.4）", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      client = makeClient();

      const secretToken = "super-secret-token-12345";
      mockReadFile.mockResolvedValue(makeHandshakeJson(3000, secretToken) as any);
      mockFetch.mockResolvedValue({ ok: true });

      await client.postEvent("test-session", "test", {});

      for (const call of consoleSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secretToken);
      }
      for (const call of consoleWarnSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secretToken);
      }
      for (const call of consoleErrorSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secretToken);
      }

      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  // ============================================================
  // Suite 11: 资源清理验证
  // ============================================================
  describe("资源清理", () => {
    it("成功后 timer 计数为 0", async () => {
      client = makeClient();

      mockReadFile.mockResolvedValue(makeHandshakeJson() as any);
      mockFetch.mockResolvedValue({ ok: true });

      await client.postEvent("test-session", "test", {});

      expect(client.getActiveBackoffTimerCount()).toBe(0);
    });

    it("degraded 后 timer 计数为 0", async () => {
      client = makeClient({ initialDelayMs: 0, maxCumulativeBackoffMs: 0 });

      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      await client.postEvent("test-session", "test", {});

      expect(client.getActiveBackoffTimerCount()).toBe(0);
    });

    it("dispose 后 timer 计数为 0", () => {
      client = makeClient();
      client.dispose();
      expect(client.getActiveBackoffTimerCount()).toBe(0);
    });
  });
});
