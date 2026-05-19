# Error Payload 模块

## 概述

`error-payload.ts` 模块实现了 Distribution spec 的错误处理机制，提供：

1. **ErrorCode → exitCode 映射表**：12 条 ErrorCode 全覆盖
2. **ErrorPayload 工厂函数**：构造结构化错误对象
3. **emitError 函数**：统一的错误输出接口

## 核心功能

### 1. ErrorCode 到退出码映射

```typescript
import { ERROR_CODE_TO_EXIT_CODE } from "./error-payload.js";

// 查询退出码
const exitCode = ERROR_CODE_TO_EXIT_CODE.INIT_HOME_NOT_SET; // 1
```

**退出码语义**：
- `0`: 仅警告（INIT_RESOURCE_WARNING）
- `1`: 一般错误（HOME 未设置、权限拒绝、baseline 不匹配等）
- `2`: 用户输入错误（未知 flag、锁冲突）
- `4`: 降级拒绝（DAEMON_DOWNGRADE_REJECTED）
- `5`: 安装损坏（DAEMON_INSTALLATION_BROKEN）

### 2. 创建 ErrorPayload

```typescript
import { createErrorPayload } from "./error-payload.js";

const payload = createErrorPayload(
  "INIT_HOME_NOT_SET",
  {
    message: "HOME environment variable is not set",
    operation: "init",
    details: { platform: "linux" },
    remediation: {
      action: "Set HOME environment variable",
      command: "export HOME=/home/user",
    },
  },
  "1.0.0",  // CLI 版本
  "linux-x64",  // 平台
);
```

### 3. 发出错误

```typescript
import { emitError } from "./error-payload.js";

// 非 JSON 模式：仅 stderr 输出
const exitCode = emitError(
  "INIT_UNKNOWN_FLAG",
  {
    message: "Unknown flag: --foo",
    operation: "init",
  },
  false,  // jsonMode = false
);

// JSON 模式：stderr + stdout（JSON）
const exitCode = emitError(
  "INIT_UNKNOWN_FLAG",
  {
    message: "Unknown flag: --foo",
    operation: "init",
  },
  true,  // jsonMode = true
);
```

## ErrorCode 完整列表

### INIT 类（5 条）

| ErrorCode | 退出码 | 说明 |
|-----------|--------|------|
| `INIT_RESOURCE_WARNING` | 0 | 资源不足警告（不阻止安装） |
| `INIT_UNKNOWN_FLAG` | 2 | 未知命令行 flag |
| `INIT_HOME_NOT_SET` | 1 | HOME 环境变量未设置 |
| `INIT_LOCKED` | 2 | 另一个 init 进程正在运行 |
| `INIT_PERMISSION_DENIED` | 1 | 权限拒绝 |

### PUBLISH 类（4 条）

| ErrorCode | 退出码 | 说明 |
|-----------|--------|------|
| `PUBLISH_VALIDATION` | 1 | 包验证失败 |
| `PUBLISH_BUILD_FAILED` | 1 | 构建失败 |
| `PUBLISH_DIST_MISSING` | 1 | dist 文件缺失 |
| `PUBLISH_BASELINE_DOWNGRADE` | 1 | baseline 单调性违反 |

### DAEMON 类（3 条）

| ErrorCode | 退出码 | 说明 |
|-----------|--------|------|
| `DAEMON_INSTALLATION_BROKEN` | 5 | .installation.json 损坏/缺失 |
| `DAEMON_BASELINE_MISMATCH` | 1 | baseline 不匹配（需迁移） |
| `DAEMON_DOWNGRADE_REJECTED` | 4 | 降级拒绝 |

## ErrorContext 接口

```typescript
interface ErrorContext {
  /** 人类可读的错误消息 */
  message?: string;
  
  /** 额外的结构化详情（可选） */
  details?: Record<string, unknown>;
  
  /** 操作名称（用于 ErrorPayload.context.operation） */
  operation?: string;
  
  /** 补救措施（可选） */
  remediation?: {
    action: string;
    command?: string;
  };
}
```

## ErrorPayload 结构

```typescript
interface ErrorPayload {
  schema_version: "1.0";
  error: {
    code: ErrorCode;
    message: string;
    details?: string;  // JSON 字符串
  };
  context: {
    operation: string;
    platform: string;
    cliVersion: string;
  };
  remediation?: {
    action: string;
    command?: string;
  };
}
```

## 输出行为

### 非 JSON 模式

```bash
$ specforge init --unknown-flag
Error [INIT_UNKNOWN_FLAG]: Unknown flag: --unknown-flag | Remedy: Use --help to see valid flags
```

- stderr 输出单行人类可读消息
- 返回对应的退出码

### JSON 模式

```bash
$ specforge init --unknown-flag --json
Error [INIT_UNKNOWN_FLAG]: Unknown flag: --unknown-flag | Remedy: Use --help to see valid flags
{"schema_version":"1.0","error":{"code":"INIT_UNKNOWN_FLAG","message":"Unknown flag: --unknown-flag"},"context":{"operation":"init","platform":"linux-x64","cliVersion":"1.0.0"},"remediation":{"action":"Use --help to see valid flags"}}
```

- stderr 输出单行人类可读消息
- stdout 输出单行 JSON（ErrorPayload）
- 返回对应的退出码

## 使用示例

完整的使用示例请参考 `error-payload.example.ts`。

## 测试

单元测试位于 `tests/unit/error-payload.test.ts`，覆盖：

- ✅ 映射表完整性（12 条 ErrorCode）
- ✅ 每个 ErrorCode 的退出码正确性
- ✅ createErrorPayload 工厂函数
- ✅ emitError 的 stderr/stdout 输出
- ✅ JSON 模式和非 JSON 模式
- ✅ 边界情况处理

运行测试：

```bash
bun test packages/cli/tests/unit/error-payload.test.ts
```

## 设计原则

1. **单一真值来源**：ErrorCode → exitCode 映射表是唯一的退出码来源
2. **结构化错误**：ErrorPayload 提供机器可读的错误信息
3. **人类友好**：stderr 消息包含 ErrorCode、消息、详情和补救措施
4. **模式一致**：JSON 模式和非 JSON 模式的行为一致
5. **可测试性**：所有函数都是纯函数或有明确的副作用边界

## 相关文档

- [Distribution Requirements](../../../../.kiro/specs/distribution/requirements.md)
- [Distribution Design](../../../../.kiro/specs/distribution/design.md)
- [Distribution Types](./types.ts)
