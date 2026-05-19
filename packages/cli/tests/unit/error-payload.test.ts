/**
 * error-payload.ts 单元测试
 * 
 * 测试覆盖：
 * 1. ERROR_CODE_TO_EXIT_CODE 映射表完整性（11 条 ErrorCode 全覆盖）
 * 2. createErrorPayload 工厂函数
 * 3. emitError 函数的 stderr/stdout 输出和退出码
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ERROR_CODE_TO_EXIT_CODE,
  createErrorPayload,
  emitError,
  type ErrorContext,
} from "../../src/distribution/error-payload.js";
import type { ErrorCode } from "../../src/distribution/types.js";

describe("ERROR_CODE_TO_EXIT_CODE 映射表", () => {
  it("应该包含所有 12 条 ErrorCode", () => {
    const allErrorCodes: ErrorCode[] = [
      "INIT_RESOURCE_WARNING",
      "INIT_UNKNOWN_FLAG",
      "INIT_HOME_NOT_SET",
      "INIT_LOCKED",
      "INIT_PERMISSION_DENIED",
      "PUBLISH_VALIDATION",
      "PUBLISH_BUILD_FAILED",
      "PUBLISH_DIST_MISSING",
      "PUBLISH_BASELINE_DOWNGRADE",
      "DAEMON_INSTALLATION_BROKEN",
      "DAEMON_BASELINE_MISMATCH",
      "DAEMON_DOWNGRADE_REJECTED",
    ];

    // 验证映射表包含所有 ErrorCode
    for (const code of allErrorCodes) {
      expect(ERROR_CODE_TO_EXIT_CODE).toHaveProperty(code);
      expect(typeof ERROR_CODE_TO_EXIT_CODE[code]).toBe("number");
    }

    // 验证映射表恰好 12 条（不多不少）
    expect(Object.keys(ERROR_CODE_TO_EXIT_CODE)).toHaveLength(12);
  });

  it("应该为 INIT_RESOURCE_WARNING 返回退出码 0", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.INIT_RESOURCE_WARNING).toBe(0);
  });

  it("应该为 INIT_UNKNOWN_FLAG 返回退出码 2", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.INIT_UNKNOWN_FLAG).toBe(2);
  });

  it("应该为 INIT_LOCKED 返回退出码 2", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.INIT_LOCKED).toBe(2);
  });

  it("应该为 INIT_HOME_NOT_SET 返回退出码 1", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.INIT_HOME_NOT_SET).toBe(1);
  });

  it("应该为 INIT_PERMISSION_DENIED 返回退出码 1", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.INIT_PERMISSION_DENIED).toBe(1);
  });

  it("应该为 PUBLISH_VALIDATION 返回退出码 1", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.PUBLISH_VALIDATION).toBe(1);
  });

  it("应该为 PUBLISH_BUILD_FAILED 返回退出码 1", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.PUBLISH_BUILD_FAILED).toBe(1);
  });

  it("应该为 PUBLISH_DIST_MISSING 返回退出码 1", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.PUBLISH_DIST_MISSING).toBe(1);
  });

  it("应该为 PUBLISH_BASELINE_DOWNGRADE 返回退出码 1", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.PUBLISH_BASELINE_DOWNGRADE).toBe(1);
  });

  it("应该为 DAEMON_INSTALLATION_BROKEN 返回退出码 5", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.DAEMON_INSTALLATION_BROKEN).toBe(5);
  });

  it("应该为 DAEMON_BASELINE_MISMATCH 返回退出码 1", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.DAEMON_BASELINE_MISMATCH).toBe(1);
  });

  it("应该为 DAEMON_DOWNGRADE_REJECTED 返回退出码 4", () => {
    expect(ERROR_CODE_TO_EXIT_CODE.DAEMON_DOWNGRADE_REJECTED).toBe(4);
  });

  it("退出码应该只包含 0, 1, 2, 4, 5", () => {
    const exitCodes = Object.values(ERROR_CODE_TO_EXIT_CODE);
    const uniqueExitCodes = [...new Set(exitCodes)].sort();
    expect(uniqueExitCodes).toEqual([0, 1, 2, 4, 5]);
  });
});

describe("createErrorPayload", () => {
  it("应该创建包含 schema_version 的 ErrorPayload", () => {
    const payload = createErrorPayload(
      "INIT_HOME_NOT_SET",
      { message: "HOME is not set" },
      "1.0.0",
      "linux-x64",
    );

    expect(payload.schema_version).toBe("1.0");
  });

  it("应该包含正确的 error 字段", () => {
    const payload = createErrorPayload(
      "INIT_UNKNOWN_FLAG",
      { message: "Unknown flag: --foo" },
      "1.0.0",
      "win32-x64",
    );

    expect(payload.error.code).toBe("INIT_UNKNOWN_FLAG");
    expect(payload.error.message).toBe("Unknown flag: --foo");
  });

  it("应该包含正确的 context 字段", () => {
    const payload = createErrorPayload(
      "INIT_LOCKED",
      { message: "Lock held", operation: "init" },
      "1.0.0",
      "darwin-arm64",
    );

    expect(payload.context.operation).toBe("init");
    expect(payload.context.platform).toBe("darwin-arm64");
    expect(payload.context.cliVersion).toBe("1.0.0");
  });

  it("应该使用默认消息当 context.message 未提供时", () => {
    const payload = createErrorPayload(
      "INIT_HOME_NOT_SET",
      {},
      "1.0.0",
      "linux-x64",
    );

    expect(payload.error.message).toBe("HOME environment variable is not set");
  });

  it("应该包含 remediation 字段（如果提供）", () => {
    const payload = createErrorPayload(
      "DAEMON_BASELINE_MISMATCH",
      {
        message: "Schema mismatch",
        remediation: {
          action: "Run migration",
          command: "specforge migrate",
        },
      },
      "1.0.0",
      "linux-x64",
    );

    expect(payload.remediation).toEqual({
      action: "Run migration",
      command: "specforge migrate",
    });
  });

  it("应该序列化 details 为 JSON 字符串", () => {
    const payload = createErrorPayload(
      "INIT_PERMISSION_DENIED",
      {
        message: "Permission denied",
        details: { path: "/home/user/.specforge", errno: "EACCES" },
      },
      "1.0.0",
      "linux-x64",
    );

    expect(payload.error.details).toBe('{"path":"/home/user/.specforge","errno":"EACCES"}');
  });
});

describe("emitError", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock stderr.write 和 stdout.write
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it("应该在 stderr 输出人类可读消息", () => {
    const exitCode = emitError(
      "INIT_HOME_NOT_SET",
      { message: "HOME is not set" },
      false,
      "1.0.0",
      "linux-x64",
    );

    expect(stderrSpy).toHaveBeenCalledOnce();
    const stderrOutput = stderrSpy.mock.calls[0][0] as string;
    expect(stderrOutput).toContain("Error [INIT_HOME_NOT_SET]");
    expect(stderrOutput).toContain("HOME is not set");
    expect(stderrOutput).toMatch(/\n$/); // 应该以换行符结尾
    expect(exitCode).toBe(1);
  });

  it("应该在 JSON 模式下额外输出 ErrorPayload 到 stdout", () => {
    const exitCode = emitError(
      "INIT_UNKNOWN_FLAG",
      { message: "Unknown flag: --foo" },
      true,
      "1.0.0",
      "win32-x64",
    );

    expect(stderrSpy).toHaveBeenCalledOnce();
    expect(stdoutSpy).toHaveBeenCalledOnce();

    const stdoutOutput = stdoutSpy.mock.calls[0][0] as string;
    const payload = JSON.parse(stdoutOutput.trim());

    expect(payload.schema_version).toBe("1.0");
    expect(payload.error.code).toBe("INIT_UNKNOWN_FLAG");
    expect(payload.error.message).toBe("Unknown flag: --foo");
    expect(exitCode).toBe(2);
  });

  it("应该在非 JSON 模式下不输出到 stdout", () => {
    emitError(
      "INIT_LOCKED",
      { message: "Lock held" },
      false,
      "1.0.0",
      "darwin-arm64",
    );

    expect(stderrSpy).toHaveBeenCalledOnce();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it("应该返回正确的退出码", () => {
    const testCases: Array<[ErrorCode, number]> = [
      ["INIT_RESOURCE_WARNING", 0],
      ["INIT_UNKNOWN_FLAG", 2],
      ["INIT_HOME_NOT_SET", 1],
      ["INIT_LOCKED", 2],
      ["DAEMON_DOWNGRADE_REJECTED", 4],
      ["DAEMON_INSTALLATION_BROKEN", 5],
    ];

    for (const [code, expectedExitCode] of testCases) {
      const exitCode = emitError(
        code,
        { message: "Test" },
        false,
        "1.0.0",
        "linux-x64",
      );
      expect(exitCode).toBe(expectedExitCode);
    }
  });

  it("应该在消息中包含 details", () => {
    emitError(
      "INIT_PERMISSION_DENIED",
      {
        message: "Permission denied",
        details: { path: "/home/user/.specforge", errno: "EACCES" },
      },
      false,
      "1.0.0",
      "linux-x64",
    );

    const stderrOutput = stderrSpy.mock.calls[0][0] as string;
    expect(stderrOutput).toContain("path=");
    expect(stderrOutput).toContain("errno=");
  });

  it("应该在消息中包含 remediation", () => {
    emitError(
      "DAEMON_BASELINE_MISMATCH",
      {
        message: "Schema mismatch",
        remediation: {
          action: "Run migration",
          command: "specforge migrate",
        },
      },
      false,
      "1.0.0",
      "linux-x64",
    );

    const stderrOutput = stderrSpy.mock.calls[0][0] as string;
    expect(stderrOutput).toContain("Remedy: Run migration");
    expect(stderrOutput).toContain("run: specforge migrate");
  });

  it("应该确保 stderr 消息是单行（无换行符）", () => {
    emitError(
      "INIT_HOME_NOT_SET",
      { message: "HOME is\nnot\nset" },
      false,
      "1.0.0",
      "linux-x64",
    );

    const stderrOutput = stderrSpy.mock.calls[0][0] as string;
    const lines = stderrOutput.split("\n");
    // 应该只有两行：消息行 + 末尾换行符
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("");
    // 消息行不应包含换行符
    expect(lines[0]).not.toContain("\n");
    expect(lines[0]).toContain("HOME is not set"); // 换行符被替换为空格
  });

  it("应该使用默认 cliVersion 和 platform 当未提供时", () => {
    const originalVersion = process.env.npm_package_version;
    process.env.npm_package_version = "2.0.0";

    emitError(
      "INIT_HOME_NOT_SET",
      { message: "Test" },
      true,
    );

    const stdoutOutput = stdoutSpy.mock.calls[0][0] as string;
    const payload = JSON.parse(stdoutOutput.trim());

    expect(payload.context.cliVersion).toBe("2.0.0");
    expect(payload.context.platform).toMatch(/^(win32|darwin|linux)-(x64|arm64)$/);

    process.env.npm_package_version = originalVersion;
  });
});

describe("边界情况", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it("应该处理空 context", () => {
    const exitCode = emitError(
      "INIT_HOME_NOT_SET",
      {},
      false,
      "1.0.0",
      "linux-x64",
    );

    expect(stderrSpy).toHaveBeenCalledOnce();
    expect(exitCode).toBe(1);
  });

  it("应该处理 details 为空对象", () => {
    emitError(
      "INIT_PERMISSION_DENIED",
      { message: "Test", details: {} },
      false,
      "1.0.0",
      "linux-x64",
    );

    const stderrOutput = stderrSpy.mock.calls[0][0] as string;
    expect(stderrOutput).toContain("Error [INIT_PERMISSION_DENIED]");
  });

  it("应该处理 remediation 只有 action 没有 command", () => {
    emitError(
      "DAEMON_BASELINE_MISMATCH",
      {
        message: "Test",
        remediation: { action: "Check logs" },
      },
      false,
      "1.0.0",
      "linux-x64",
    );

    const stderrOutput = stderrSpy.mock.calls[0][0] as string;
    expect(stderrOutput).toContain("Remedy: Check logs");
    expect(stderrOutput).not.toContain("run:");
  });

  it("应该处理非常长的消息", () => {
    const longMessage = "A".repeat(1000);
    emitError(
      "INIT_HOME_NOT_SET",
      { message: longMessage },
      false,
      "1.0.0",
      "linux-x64",
    );

    const stderrOutput = stderrSpy.mock.calls[0][0] as string;
    expect(stderrOutput).toContain(longMessage);
  });
});
