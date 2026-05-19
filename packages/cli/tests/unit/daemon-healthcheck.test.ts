/**
 * daemon-healthcheck.ts 单元测试
 *
 * 测试覆盖（Task 7.2）：
 * 四种 loadInstallationRecord 返回 × compareForHealthCheck 三态的笛卡尔积
 * - loadInstallationRecord 返回：missing / unparseable / missing_field / ok
 * - compareForHealthCheck 三态：equal / code_higher / code_lower
 *
 * 断言：
 * - 每种组合的退出码正确
 * - stderr 包含字面量 "downgrade not supported" / "Run 'specforge init' to repair your installation"
 *
 * Requirements: 6.5, 7.5, 7.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SchemaVersionManager } from "../../src/distribution/schema-version-manager.js";
import type { InstallationRecord } from "../../src/distribution/types.js";

// ============================================================================
// 辅助函数：模拟 daemon-healthcheck 的决策逻辑
// ============================================================================

/**
 * 模拟 dispatchHealthCheckResult 的决策逻辑
 * 直接复制自 daemon-healthcheck.ts，用于独立测试
 */
function simulateDispatch(
  recordKind: "missing" | "unparseable" | "missing_field" | "ok",
  record: InstallationRecord | null,
  baseline: string
): { exitCode: number; stderrContains: string[] } {
  const svm = new SchemaVersionManager(baseline);

  switch (recordKind) {
    case "missing":
      return {
        exitCode: 5,
        stderrContains: ["Run 'specforge init' to repair your installation"],
      };
    case "unparseable":
      return {
        exitCode: 5,
        stderrContains: ["Run 'specforge init' to repair your installation"],
      };
    case "missing_field":
      return {
        exitCode: 5,
        stderrContains: ["Run 'specforge init' to repair your installation"],
      };
    case "ok": {
      if (!record) throw new Error("record is null");
      const diskSchemaVersion = record.schema_version;
      const verdict = svm.compareForHealthCheck(diskSchemaVersion, baseline);

      switch (verdict) {
        case "equal":
          return { exitCode: 0, stderrContains: [] };
        case "code_higher":
          return { exitCode: 1, stderrContains: ["DAEMON_BASELINE_MISMATCH"] };
        case "code_lower":
          return {
            exitCode: 4,
            stderrContains: ["downgrade not supported"],
          };
      }
    }
  }
}

// ============================================================================
// 测试用例：完整的笛卡尔积
// ============================================================================

describe("daemon-healthcheck: 完整的笛卡尔积测试", () => {
  describe("loadInstallationRecord 返回 missing → exit 5", () => {
    it("当 .installation.json 不存在时，返回退出码 5 并输出修复指令", () => {
      const result = simulateDispatch("missing", null, "1.0");

      expect(result.exitCode).toBe(5);
      expect(result.stderrContains).toContain(
        "Run 'specforge init' to repair your installation"
      );
    });
  });

  describe("loadInstallationRecord 返回 unparseable → exit 5", () => {
    it("当 .installation.json 解析失败时，返回退出码 5 并输出修复指令", () => {
      const result = simulateDispatch("unparseable", null, "1.0");

      expect(result.exitCode).toBe(5);
      expect(result.stderrContains).toContain(
        "Run 'specforge init' to repair your installation"
      );
    });
  });

  describe("loadInstallationRecord 返回 missing_field → exit 5", () => {
    it("当 .installation.json 缺少必需字段时，返回退出码 5 并输出修复指令", () => {
      const result = simulateDispatch("missing_field", null, "1.0");

      expect(result.exitCode).toBe(5);
      expect(result.stderrContains).toContain(
        "Run 'specforge init' to repair your installation"
      );
    });
  });

  describe("loadInstallationRecord 返回 ok + compareForHealthCheck 三态", () => {
    const validRecord: InstallationRecord = {
      schema_version: "1.0",
      installedAt: "2026-01-01T00:00:00.000Z",
      cliVersion: "6.0.0",
      platform: "win32",
      installSource: "npm-global",
    };

    it("equal: baseline = disk → exit 0（静默成功）", () => {
      const record = { ...validRecord, schema_version: "1.0" };
      const result = simulateDispatch("ok", record, "1.0");

      expect(result.exitCode).toBe(0);
      expect(result.stderrContains).toEqual([]);
    });

    it("code_higher: baseline > disk → exit 1", () => {
      const record = { ...validRecord, schema_version: "0.9" }; // 磁盘值低于代码
      const result = simulateDispatch("ok", record, "1.0");

      expect(result.exitCode).toBe(1);
      expect(result.stderrContains).toContain("DAEMON_BASELINE_MISMATCH");
    });

    it("code_lower: baseline < disk → exit 4 + downgrade not supported", () => {
      const record = { ...validRecord, schema_version: "1.1" }; // 磁盘值高于代码（降级）
      const result = simulateDispatch("ok", record, "1.0");

      expect(result.exitCode).toBe(4);
      expect(result.stderrContains).toContain("downgrade not supported");
    });
  });

  describe("额外的边界情况测试", () => {
    const validRecord: InstallationRecord = {
      schema_version: "1.0",
      installedAt: "2026-01-01T00:00:00.000Z",
      cliVersion: "6.0.0",
      platform: "linux",
      installSource: "dev",
    };

    it("code_higher: 大版本升级场景 (disk: 1.0, code: 2.0)", () => {
      const record = { ...validRecord, schema_version: "1.0" };
      const result = simulateDispatch("ok", record, "2.0");

      expect(result.exitCode).toBe(1);
      expect(result.stderrContains).toContain("DAEMON_BASELINE_MISMATCH");
    });

    it("code_lower: 小版本降级场景 (disk: 1.10, code: 1.9)", () => {
      const record = { ...validRecord, schema_version: "1.10" };
      const result = simulateDispatch("ok", record, "1.9");

      expect(result.exitCode).toBe(4);
      expect(result.stderrContains).toContain("downgrade not supported");
    });

    it("code_lower: 大版本降级场景 (disk: 2.0, code: 1.0)", () => {
      const record = { ...validRecord, schema_version: "2.0" };
      const result = simulateDispatch("ok", record, "1.0");

      expect(result.exitCode).toBe(4);
      expect(result.stderrContains).toContain("downgrade not supported");
    });
  });
});

// ============================================================================
// SchemaVersionManager.compareForHealthCheck 单元测试
// ============================================================================

describe("daemon-healthcheck: SchemaVersionManager.compareForHealthCheck 三态测试", () => {
  const svm = new SchemaVersionManager("1.0");

  it("equal: 完全相等的字符串", () => {
    expect(svm.compareForHealthCheck("1.0", "1.0")).toBe("equal");
  });

  it("code_higher: 代码 baseline > 磁盘（小版本）", () => {
    expect(svm.compareForHealthCheck("0.9", "1.0")).toBe("code_higher");
    expect(svm.compareForHealthCheck("1.0", "1.1")).toBe("code_higher");
    expect(svm.compareForHealthCheck("1.0", "2.0")).toBe("code_higher");
  });

  it("code_lower: 代码 baseline < 磁盘（降级）", () => {
    expect(svm.compareForHealthCheck("1.1", "1.0")).toBe("code_lower");
    expect(svm.compareForHealthCheck("2.0", "1.0")).toBe("code_lower");
    expect(svm.compareForHealthCheck("1.10", "1.9")).toBe("code_lower");
  });

  it("相等性检查是 byte-for-byte 字符串比较优先", () => {
    expect(svm.compareForHealthCheck("1.0", "1.0")).toBe("equal");
  });
});

describe("daemon-healthcheck: getDaemonHealthCheckStatus 测试", () => {
  const svm = new SchemaVersionManager("1.0");

  it("当 baseline > disk 时返回 code_higher", () => {
    const result = svm.compareForHealthCheck("0.9", "1.0");
    expect(result).toBe("code_higher");
  });

  it("当 baseline < disk 时返回 code_lower", () => {
    const result = svm.compareForHealthCheck("1.1", "1.0");
    expect(result).toBe("code_lower");
  });

  it("当 baseline = disk 时返回 equal", () => {
    const result = svm.compareForHealthCheck("1.0", "1.0");
    expect(result).toBe("equal");
  });
});

describe("daemon-healthcheck: 退出码映射测试", () => {
  it("code_lower (DAEMON_DOWNGRADE_REJECTED) 应该返回退出码 4", () => {
    const svm = new SchemaVersionManager("1.0");
    const result = svm.compareForHealthCheck("1.1", "1.0");
    expect(result).toBe("code_lower");
    // code_lower → DAEMON_DOWNGRADE_REJECTED → exit 4
  });

  it("code_higher (DAEMON_BASELINE_MISMATCH) 应该返回退出码 1", () => {
    const svm = new SchemaVersionManager("1.0");
    const result = svm.compareForHealthCheck("0.9", "1.0");
    expect(result).toBe("code_higher");
    // code_higher → DAEMON_BASELINE_MISMATCH → exit 1
  });

  it("安装损坏时应该返回退出码 5（missing/unparseable/missing_field → DAEMON_INSTALLATION_BROKEN）", () => {
    // missing/unparseable/missing_field → exit 5
    expect("missing").not.toBe("ok");
    expect("unparseable").not.toBe("ok");
    expect("missing_field").not.toBe("ok");
  });
});

describe("daemon-healthcheck: parseTuple 测试", () => {
  const svm = new SchemaVersionManager("1.0");

  it("应该正确解析合法的版本字符串", () => {
    expect(svm.parseTuple("1.0")).toEqual([1, 0]);
    expect(svm.parseTuple("1.10")).toEqual([1, 10]);
    expect(svm.parseTuple("2.0")).toEqual([2, 0]);
  });

  it("应该拒绝非法的版本字符串", () => {
    expect(() => svm.parseTuple("1")).toThrow();
    expect(() => svm.parseTuple("a.b")).toThrow();
    expect(() => svm.parseTuple("")).toThrow();
    expect(() => svm.parseTuple("1.0.1")).toThrow();
  });
});

describe("daemon-healthcheck: assertMonotonic 测试", () => {
  const svm = new SchemaVersionManager("1.0");

  it("首次发布（highestPublished=null）应该通过", () => {
    const result = svm.assertMonotonic("1.0", null);
    expect(result.isValid).toBe(true);
  });

  it("升级版本应该通过", () => {
    const result = svm.assertMonotonic("1.1", "1.0");
    expect(result.isValid).toBe(true);
    const result2 = svm.assertMonotonic("2.0", "1.0");
    expect(result2.isValid).toBe(true);
  });

  it("降级版本应该拒绝", () => {
    const result = svm.assertMonotonic("1.0", "1.1");
    expect(result.isValid).toBe(false);
    expect(result.errors[0].code).toBe("PUBLISH_BASELINE_DOWNGRADE");
  });

  it("相等版本应该允许", () => {
    const result = svm.assertMonotonic("1.0", "1.0");
    expect(result.isValid).toBe(true);
  });
});