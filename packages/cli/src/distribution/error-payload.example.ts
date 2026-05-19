/**
 * error-payload 使用示例
 * 
 * 本文件展示如何使用 error-payload 模块的各种功能
 */

import { emitError, createErrorPayload, ERROR_CODE_TO_EXIT_CODE } from "./error-payload.js";

// ============================================================================
// 示例 1: 基本错误发出（非 JSON 模式）
// ============================================================================

function example1_basicError() {
  console.log("=== 示例 1: 基本错误发出 ===\n");
  
  const exitCode = emitError(
    "INIT_HOME_NOT_SET",
    {
      message: "HOME environment variable is not set",
      operation: "init",
    },
    false, // 非 JSON 模式
    "1.0.0",
    "linux-x64",
  );
  
  console.log(`退出码: ${exitCode}\n`);
}

// ============================================================================
// 示例 2: JSON 模式错误发出
// ============================================================================

function example2_jsonMode() {
  console.log("=== 示例 2: JSON 模式错误发出 ===\n");
  
  const exitCode = emitError(
    "INIT_UNKNOWN_FLAG",
    {
      message: "Unknown flag: --foo",
      operation: "init",
      details: { flag: "--foo", validFlags: ["--force", "--json", "--help"] },
    },
    true, // JSON 模式
    "1.0.0",
    "win32-x64",
  );
  
  console.log(`退出码: ${exitCode}\n`);
}

// ============================================================================
// 示例 3: 带补救措施的错误
// ============================================================================

function example3_withRemediation() {
  console.log("=== 示例 3: 带补救措施的错误 ===\n");
  
  const exitCode = emitError(
    "DAEMON_BASELINE_MISMATCH",
    {
      message: "Schema version mismatch: disk=1.0, code=2.0",
      operation: "daemon-start",
      details: {
        diskVersion: "1.0",
        codeVersion: "2.0",
      },
      remediation: {
        action: "Run migration to upgrade schema",
        command: "specforge migrate",
      },
    },
    false,
    "2.0.0",
    "darwin-arm64",
  );
  
  console.log(`退出码: ${exitCode}\n`);
}

// ============================================================================
// 示例 4: 仅创建 ErrorPayload（不发出）
// ============================================================================

function example4_createPayloadOnly() {
  console.log("=== 示例 4: 仅创建 ErrorPayload ===\n");
  
  const payload = createErrorPayload(
    "INIT_LOCKED",
    {
      message: "Another init process is running",
      operation: "init",
      details: {
        lockFile: "/home/user/.specforge/.init.lock",
        pid: 12345,
      },
    },
    "1.0.0",
    "linux-x64",
  );
  
  console.log("ErrorPayload:", JSON.stringify(payload, null, 2));
  console.log();
}

// ============================================================================
// 示例 5: 查询退出码映射表
// ============================================================================

function example5_exitCodeMapping() {
  console.log("=== 示例 5: 退出码映射表 ===\n");
  
  console.log("所有 ErrorCode 及其退出码：");
  for (const [code, exitCode] of Object.entries(ERROR_CODE_TO_EXIT_CODE)) {
    console.log(`  ${code.padEnd(30)} → ${exitCode}`);
  }
  console.log();
  
  // 按退出码分组
  const byExitCode = new Map<number, string[]>();
  for (const [code, exitCode] of Object.entries(ERROR_CODE_TO_EXIT_CODE)) {
    if (!byExitCode.has(exitCode)) {
      byExitCode.set(exitCode, []);
    }
    byExitCode.get(exitCode)!.push(code);
  }
  
  console.log("按退出码分组：");
  for (const [exitCode, codes] of [...byExitCode.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  退出码 ${exitCode}:`);
    for (const code of codes) {
      console.log(`    - ${code}`);
    }
  }
  console.log();
}

// ============================================================================
// 示例 6: 警告类错误（退出码 0）
// ============================================================================

function example6_warningError() {
  console.log("=== 示例 6: 警告类错误 ===\n");
  
  const exitCode = emitError(
    "INIT_RESOURCE_WARNING",
    {
      message: "Low disk space: 20 GB free, 40 GB recommended",
      operation: "init",
      details: {
        freeSpace: "20 GB",
        recommended: "40 GB",
      },
    },
    false,
    "1.0.0",
    "win32-x64",
  );
  
  console.log(`退出码: ${exitCode} (警告不阻止安装)\n`);
}

// ============================================================================
// 运行所有示例
// ============================================================================

if (import.meta.main) {
  console.log("error-payload 使用示例\n");
  console.log("=".repeat(60));
  console.log();
  
  example1_basicError();
  example2_jsonMode();
  example3_withRemediation();
  example4_createPayloadOnly();
  example5_exitCodeMapping();
  example6_warningError();
  
  console.log("=".repeat(60));
  console.log("所有示例运行完成");
}
