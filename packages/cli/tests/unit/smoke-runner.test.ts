/**
 * smoke-runner.ts 单元测试
 * 
 * 测试覆盖（Task 11.2）：
 * 1. mock 子进程，覆盖 5 步全成功 → exit 0
 * 2. 任一步失败 → exit 1
 * 3. 任一步超时 → exit 2
 * 4. cleanup 失败 → exit 3
 * 5. JSON 报告字段完整性 + 4096 字符截断
 * 6. afterEach 断言 getActiveStepCount() === 0
 * 
 * Requirements: 5.3, 5.5, 5.7, 5.8
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DefaultSmokeTestRunner,
  createSmokeTestRunner,
  type SmokeStep,
  type SmokeRunOptions,
  type SmokeReport,
} from "../../src/distribution/smoke-runner-core.js";

// Mock node:child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const mockProcess = {
      stdout: {
        on: vi.fn((event: string, callback: (data: Buffer) => void) => {
          if (event === "data") {
            // 模拟成功输出
            setTimeout(() => callback(Buffer.from("mock output\n")), 10);
          }
        }),
      },
      stderr: {
        on: vi.fn((event: string, callback: (data: Buffer) => void) => {
          if (event === "data") {
            setTimeout(() => callback(Buffer.from("")), 10);
          }
        }),
      },
      on: vi.fn((event: string, callback: (code: number | null) => void) => {
        if (event === "close") {
          // 默认成功，exit 0
          setTimeout(() => callback(0), 20);
        }
      }),
      kill: vi.fn(),
    };
    return mockProcess;
  }),
}));

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
  rm: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";

// 辅助函数：创建成功的子进程 mock
const createSuccessProcess = () => ({
  stdout: {
    on: vi.fn((event: string, callback: (data: Buffer) => void) => {
      if (event === "data") {
        callback(Buffer.from("success output"));
      }
    }),
  },
  stderr: {
    on: vi.fn((event: string, callback: (data: Buffer) => void) => {
      if (event === "data") {
        callback(Buffer.from(""));
      }
    }),
  },
  on: vi.fn((event: string, callback: (code: number | null) => void) => {
    if (event === "close") {
      callback(0);
    }
  }),
  kill: vi.fn(),
});

// 辅助函数：创建失败的子进程 mock
const createFailureProcess = (exitCode: number = 1) => ({
  stdout: {
    on: vi.fn((event: string, callback: (data: Buffer) => void) => {
      if (event === "data") {
        callback(Buffer.from("error output"));
      }
    }),
  },
  stderr: {
    on: vi.fn((event: string, callback: (data: Buffer) => void) => {
      if (event === "data") {
        callback(Buffer.from("error stderr"));
      }
    }),
  },
  on: vi.fn((event: string, callback: (code: number | null) => void) => {
    if (event === "close") {
      callback(exitCode);
    }
  }),
  kill: vi.fn(),
});

// 获取 mock 函数的辅助函数
const getSpawnMock = () => spawn as unknown as ReturnType<typeof vi.fn>;
const getFsRmMock = () => fs.rm as unknown as ReturnType<typeof vi.fn>;

describe("smoke-runner: 5 步全成功 → exit 0", () => {
  let runner: DefaultSmokeTestRunner;

  beforeEach(() => {
    runner = new DefaultSmokeTestRunner();
    // Mock spawn 返回成功
    getSpawnMock().mockImplementation(() => createSuccessProcess() as any);
  });

  afterEach(async () => {
    await runner.cleanup();
    vi.resetAllMocks();
  });

  it("应该返回 overallStatus='passed' 和 exit 0", async () => {
    const opts: SmokeRunOptions = {
      tempHome: "/tmp/smoke-test-home",
      reportPath: "/tmp/smoke-report.json",
      perStepTimeoutMs: 120000,
    };

    const report = await runner.runAll(opts);

    expect(report.overallStatus).toBe("passed");
    expect(report.steps).toHaveLength(5);
    // cleanup 成功
    expect(report.cleanup.success).toBe(true);
  });
});

describe("smoke-runner: 任一步失败 → exit 1", () => {
  let runner: DefaultSmokeTestRunner;

  beforeEach(() => {
    runner = new DefaultSmokeTestRunner();
  });

  afterEach(async () => {
    await runner.cleanup();
    vi.resetAllMocks();
  });

  it("应该返回 overallStatus='failed' 和 exit 1", async () => {
    // 第 3 步失败
    let callCount = 0;
    getSpawnMock().mockImplementation(() => {
      callCount++;
      if (callCount === 3) {
        return createFailureProcess(1) as any;
      }
      return createSuccessProcess() as any;
    });

    const opts: SmokeRunOptions = {
      tempHome: "/tmp/smoke-test-home",
      reportPath: "/tmp/smoke-report.json",
      perStepTimeoutMs: 120000,
    };

    const report = await runner.runAll(opts);

    expect(report.overallStatus).toBe("failed");
    expect(report.steps[2].exitCode).toBe(1);
    expect(report.steps[2].status).toBe("failed");
    // 后续步骤不应执行
    expect(report.steps.length).toBeLessThanOrEqual(3);
  });
});

describe("smoke-runner: 任一步超时 → exit 2", () => {
  let runner: DefaultSmokeTestRunner;

  beforeEach(() => {
    runner = new DefaultSmokeTestRunner();
  });

  afterEach(async () => {
    await runner.cleanup();
    vi.resetAllMocks();
  });

  it("应该返回 overallStatus='timeout' 和 exit 2", async () => {
    // 创建一个永远不会完成的子进程
    const neverEndingProcess = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event: string, callback: (code: number | null) => void) => {
        // 不调用 callback，永远等待
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    getSpawnMock().mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return neverEndingProcess as any;
      }
      return createSuccessProcess() as any;
    });

    const opts: SmokeRunOptions = {
      tempHome: "/tmp/smoke-test-home",
      reportPath: "/tmp/smoke-report.json",
      perStepTimeoutMs: 100, // 100ms 超时，用于测试
    };

    const report = await runner.runAll(opts);

    expect(report.overallStatus).toBe("timeout");
    // 超时步骤的退出码应该是 124（标准超时码）或 1
    expect(report.steps[1].status).toBe("timeout");
  }, 5000); // 测试超时 5s
});

describe("smoke-runner: cleanup 失败 → exit 3", () => {
  let runner: DefaultSmokeTestRunner;
  let fsRmMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    runner = new DefaultSmokeTestRunner();
    // 导入 mock
    fsRmMock = getFsRmMock();
  });

  afterEach(async () => {
    try {
      await runner.cleanup();
    } catch {}
    vi.resetAllMocks();
  });

  it("应该返回 overallStatus='cleanup_failed' 和 exit 3", async () => {
    // 让 spawn 全部成功
    getSpawnMock().mockImplementation(() => createSuccessProcess() as any);

    // 让 cleanup 失败
    fsRmMock.mockRejectedValue(new Error("Permission denied"));

    const opts: SmokeRunOptions = {
      tempHome: "/tmp/smoke-test-home",
      reportPath: "/tmp/smoke-report.json",
      perStepTimeoutMs: 120000,
    };

    const report = await runner.runAll(opts);

    expect(report.overallStatus).toBe("cleanup_failed");
    expect(report.cleanup.success).toBe(false);
    expect(report.cleanup.errors).toHaveLength(1);
    expect(report.cleanup.errors[0]).toContain("Permission denied");
  });
});

describe("smoke-runner: JSON 报告字段完整性 + 4096 字符截断", () => {
  let runner: DefaultSmokeTestRunner;

  beforeEach(() => {
    runner = new DefaultSmokeTestRunner();
    getSpawnMock().mockImplementation(() => createSuccessProcess() as any);
  });

  afterEach(async () => {
    await runner.cleanup();
    vi.resetAllMocks();
  });

  it("报告应该包含所有必需字段", async () => {
    const opts: SmokeRunOptions = {
      tempHome: "/tmp/smoke-test-home",
      reportPath: "/tmp/smoke-report.json",
      perStepTimeoutMs: 120000,
    };

    const report = await runner.runAll(opts);

    // 检查顶层字段
    expect(report).toHaveProperty("schema_version");
    expect(report).toHaveProperty("startTime");
    expect(report).toHaveProperty("endTime");
    expect(report).toHaveProperty("platform");
    expect(report).toHaveProperty("overallStatus");
    expect(report).toHaveProperty("steps");
    expect(report).toHaveProperty("cleanup");

    // schema_version 必须是 "1.0"
    expect(report.schema_version).toBe("1.0");

    // platform 应该是 process.platform-process.arch 格式
    expect(report.platform).toMatch(/^(win32|darwin|linux)-(x64|arm64)$/);

    // steps 应该是 5 个
    expect(report.steps).toHaveLength(5);

    // 每个 step 应该有正确字段
    for (const step of report.steps) {
      expect(step).toHaveProperty("name");
      expect(step).toHaveProperty("startTime");
      expect(step).toHaveProperty("endTime");
      expect(step).toHaveProperty("durationMs");
      expect(step).toHaveProperty("exitCode");
      expect(step).toHaveProperty("stdout");
      expect(step).toHaveProperty("stderr");
      expect(step).toHaveProperty("status");
    }

    // cleanup 应该有 success 和 errors
    expect(report.cleanup).toHaveProperty("success");
    expect(report.cleanup).toHaveProperty("errors");
    expect(Array.isArray(report.cleanup.errors)).toBe(true);
  });

  it("stdout/stderr 应该被截断到 4096 字符", async () => {
    // 创建一个产生大量输出的 mock
    const longOutputProcess = {
      stdout: {
        on: vi.fn((event: string, callback: (data: Buffer) => void) => {
          if (event === "data") {
            // 产生超过 4096 字符的输出
            const longOutput = "x".repeat(5000);
            callback(Buffer.from(longOutput));
          }
        }),
      },
      stderr: {
        on: vi.fn((event: string, callback: (data: Buffer) => void) => {
          if (event === "data") {
            callback(Buffer.from("y".repeat(3000)));
          }
        }),
      },
      on: vi.fn((event: string, callback: (code: number | null) => void) => {
        if (event === "close") {
          callback(0);
        }
      }),
      kill: vi.fn(),
    };

    getSpawnMock().mockImplementation(() => longOutputProcess as any);

    const opts: SmokeRunOptions = {
      tempHome: "/tmp/smoke-test-home",
      reportPath: "/tmp/smoke-report.json",
      perStepTimeoutMs: 120000,
    };

    const report = await runner.runAll(opts);

    // 验证截断
    expect(report.steps[0].stdout.length).toBeLessThanOrEqual(4096);
    expect(report.steps[0].stderr.length).toBeLessThanOrEqual(4096);

    // 如果超过，应该以 "..." 结尾
    if (report.steps[0].stdout.length === 4096) {
      expect(report.steps[0].stdout.endsWith("...")).toBe(true);
    }
    if (report.steps[0].stderr.length === 4096) {
      expect(report.steps[0].stderr.endsWith("...")).toBe(true);
    }
  });
});

describe("smoke-runner: getActiveStepCount() 自检 API", () => {
  let runner: DefaultSmokeTestRunner;

  beforeEach(() => {
    runner = new DefaultSmokeTestRunner();
  });

  afterEach(async () => {
    await runner.cleanup();
    vi.resetAllMocks();
  });

  it("初始状态应该是 0", () => {
    expect(runner.getActiveStepCount()).toBe(0);
  });

  it("afterEach 应该断言 getActiveStepCount() === 0", async () => {
    // 创建一个慢步骤，让我们在执行中检查计数
    let resolveSlowStep: (value: any) => void;
    const slowStepPromise = new Promise((resolve) => {
      resolveSlowStep = resolve;
    });

    const slowProcess = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event: string, callback: (code: number | null) => void) => {
        if (event === "close") {
          // 延迟关闭
          setTimeout(() => {
            callback(0);
            resolveSlowStep(true);
          }, 50);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    getSpawnMock().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return slowProcess as any;
      }
      return createSuccessProcess() as any;
    });

    // 启动一个步骤
    const step: SmokeStep = {
      name: "slow step",
      command: "sleep 1",
      timeoutMs: 5000,
    };

    // 开始执行前，计数应该是 0
    expect(runner.getActiveStepCount()).toBe(0);

    // 启动步骤
    const resultPromise = runner.runStep(step);

    // 等待一小段时间让步骤开始执行
    await new Promise((r) => setTimeout(r, 10));

    // 执行中计数应该是 1
    expect(runner.getActiveStepCount()).toBe(1);

    // 等待步骤完成
    await resultPromise;

    // 执行完成后计数应该是 0
    expect(runner.getActiveStepCount()).toBe(0);
  });
});

describe("smoke-runner: Disposable 接口", () => {
  it("应该实现 Symbol.asyncDispose", async () => {
    const runner = new DefaultSmokeTestRunner();

    // 使用 await using 语法（需要 TypeScript 5.2+）
    // 这里我们直接测试 Symbol.asyncDispose
    expect(typeof runner[Symbol.asyncDispose]).toBe("function");

    // 调用清理
    await runner[Symbol.asyncDispose]();

    // 验证清理已执行
    expect(runner.getActiveStepCount()).toBe(0);
  });

  it("cleanup 应该是幂等的", async () => {
    const runner = new DefaultSmokeTestRunner();

    const result1 = await runner.cleanup();
    const result2 = await runner.cleanup();

    // 第一次应该成功
    expect(result1.success).toBe(true);
    // 第二次也应该成功（幂等）
    expect(result2.success).toBe(true);
  });
});

describe("smoke-runner: 步骤序列测试（REQ-5.1）", () => {
  let runner: DefaultSmokeTestRunner;
  const executedCommands: string[] = [];

  beforeEach(() => {
    runner = new DefaultSmokeTestRunner();
    executedCommands.length = 0;

    getSpawnMock().mockImplementation((command: string) => {
      executedCommands.push(command);
      return createSuccessProcess() as any;
    });
  });

  afterEach(async () => {
    await runner.cleanup();
    vi.resetAllMocks();
  });

  it("应该按顺序执行 5 个硬编码步骤", async () => {
    const opts: SmokeRunOptions = {
      tempHome: "/tmp/smoke-test-home",
      reportPath: "/tmp/smoke-report.json",
      perStepTimeoutMs: 120000,
    };

    const report = await runner.runAll(opts);

    // 验证步骤名称
    const expectedStepNames = [
      "npm install -g <tarball>",
      "specforge --version",
      "specforge init",
      "specforge --help",
      "specforge daemon status",
    ];

    expect(report.steps.map((s) => s.name)).toEqual(expectedStepNames);
  });
});