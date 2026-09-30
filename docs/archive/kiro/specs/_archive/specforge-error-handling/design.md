# Design Document: specforge-error-handling

## Architecture Overview

本设计为 SpecForge 系统引入分层错误处理机制，覆盖 Plugin 层、Tool Core 层、动态导入容错、以及日志轮转四个维度。核心设计原则：

1. **不崩溃**：Plugin 层捕获所有异常并静默，确保 OpenCode 会话不中断
2. **可追溯**：Tool Core 层捕获异常后记录详细日志再重新抛出，保留调用栈信息
3. **容错降级**：动态导入失败时跳过非关键检查，不阻塞业务逻辑
4. **资源可控**：日志轮转防止磁盘空间耗尽

## Component Design

### Component 1: Plugin Try-Catch Wrapper

**职责**：包裹 `executeStartupFlow()` 和所有事件处理器，确保异常不逃逸。

**修改文件**：`.opencode/plugins/sf_specforge.ts`

**设计决策**：在 Plugin 导出函数 `sf_specforge` 内部，对 `executeStartupFlow` 调用和每个返回的事件处理器函数进行 try-catch 包裹。

```typescript
// Plugin 导出函数中的 executeStartupFlow 包裹
export const sf_specforge: Plugin = async ({ directory, client }) => {
  const projectRoot = detectProjectRoot(directory)
  let finalMode: StartupMode = "noop"

  // 包裹 executeStartupFlow — 异常时降级但不崩溃
  try {
    const mode = await determineStartupMode(directory)
    finalMode = await executeStartupFlow(mode, projectRoot)
  } catch (err) {
    // 记录错误但继续注册流程
    try {
      await logError(projectRoot, "sf_specforge.startup", err)
    } catch {
      // logError 本身失败时静默
    }
    finalMode = "degraded"
  }

  // 事件处理器包裹模式
  function wrapHandler<T extends (...args: any[]) => Promise<any>>(
    handler: T,
    handlerName: string
  ): T {
    return (async (...args: any[]) => {
      try {
        return await handler(...args)
      } catch (err) {
        try {
          await logError(projectRoot, `sf_specforge.${handlerName}`, err)
        } catch {
          // logError 本身失败时静默
        }
        // 静默返回，不传播异常
      }
    }) as T
  }

  // 注册时包裹每个处理器
  return {
    "tool.execute.before": wrapHandler(createToolBeforeHandler(projectRoot), "tool.execute.before"),
    "tool.execute.after": wrapHandler(createToolAfterHandler(projectRoot, client), "tool.execute.after"),
    event: wrapHandler(createUnifiedEventHandler(projectRoot, client), "event"),
  }
}
```

**关键约束**：
- `logError` 调用本身被 try-catch 包裹，确保二次异常不逃逸
- `executeStartupFlow` 失败时降级到 `degraded` 模式，仍注册基本处理器
- 事件处理器异常时静默返回 `undefined`，不向 OpenCode 运行时传播

---

### Component 2: Tool Core wrapWithErrorLogging Helper

**职责**：提供可复用的高阶函数，为 Tool Core 导出函数添加错误日志记录 + 重新抛出行为。

**新增文件**：无（添加到 `.opencode/tools/lib/utils.ts`）

**设计决策**：创建 `wrapWithErrorLogging()` 辅助函数，避免在 16 个文件中重复编写 try-catch 模式。每个 core 文件的导出函数在函数体开头调用此 wrapper 的内联版本，或将整个函数体包裹。

```typescript
// 添加到 .opencode/tools/lib/utils.ts

/**
 * 错误日志写入路径常量
 */
const ERROR_LOG_RELATIVE_PATH = "specforge/logs/error.log"

/**
 * 为 Tool Core 导出函数提供错误捕获包裹
 * 行为：捕获异常 → 写入 Error_Log → 重新抛出原始异常
 * 
 * @param fn - 被包裹的异步函数
 * @param component - 模块标识（如 "sf_state_read_core"）
 * @param event - 函数名（如 "readStateFile"）
 * @param baseDir - 项目根目录（用于定位 error.log）
 */
export function wrapWithErrorLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  component: string,
  event: string,
  baseDir: string
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args)
    } catch (err) {
      // 写入错误日志（失败时静默）
      try {
        const errorLogPath = join(baseDir, ERROR_LOG_RELATIVE_PATH)
        await appendJsonl(errorLogPath, {
          timestamp: new Date().toISOString(),
          level: "ERROR",
          component,
          event,
          message: err instanceof Error ? err.message : String(err),
        })
      } catch {
        // 日志写入失败时静默，不阻塞重新抛出
      }
      throw err // 重新抛出原始异常
    }
  }) as T
}
```

**应用模式**（在每个 core 文件中）：

由于 `wrapWithErrorLogging` 需要 `baseDir` 参数，而 `baseDir` 是函数参数之一，采用**内联 try-catch 模式**更为直接：

```typescript
// 示例：sf_state_read_core.ts 中的 readStateFile
export async function readStateFile(
  workItemId: string,
  baseDir: string
): Promise<ReadStateResult> {
  try {
    // 动态导入兼容性检查（见 Component 3）
    await tryCheckCompatibility(baseDir, "sf_state_read_core")

    // 原有业务逻辑...
    const result = await loadStateFile(baseDir)
    // ...
    return workItem
  } catch (err) {
    // 错误日志 + 重新抛出
    try {
      const { appendJsonl } = await import("./utils")
      const { join } = await import("node:path")
      await appendJsonl(join(baseDir, "specforge/logs/error.log"), {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        component: "sf_state_read_core",
        event: "readStateFile",
        message: err instanceof Error ? err.message : String(err),
      })
    } catch {
      // 静默
    }
    throw err
  }
}
```

**最终设计决策**：采用**共享 helper 函数 + 内联调用**的混合模式。在 `utils.ts` 中提供 `logErrorToFile()` 辅助函数（简化版，不做 wrapper），每个导出函数内部使用 try-catch 并调用此辅助函数：

```typescript
// utils.ts 新增
export async function logErrorToFile(
  baseDir: string,
  component: string,
  event: string,
  error: unknown
): Promise<void> {
  try {
    const errorLogPath = join(baseDir, ERROR_LOG_RELATIVE_PATH)
    await appendJsonl(errorLogPath, {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      component,
      event,
      message: error instanceof Error ? error.message : String(error),
    })
  } catch {
    // 静默 — 日志写入失败不应影响调用方
  }
}
```

这样每个 core 文件只需：
```typescript
import { logErrorToFile } from "./utils"

export async function someFunction(input: X, baseDir: string): Promise<Y> {
  try {
    // 业务逻辑
  } catch (err) {
    await logErrorToFile(baseDir, "sf_xxx_core", "someFunction", err)
    throw err
  }
}
```

---

### Component 3: Dynamic Import for checkCompatibilityAtEntry

**职责**：将 16 个 core 文件中的静态 `import { checkCompatibilityAtEntry }` 替换为动态 `import()` 调用，使模块缺失时不阻塞执行。

**修改文件**：所有 16 个 `.opencode/tools/lib/*_core.ts` 文件

**设计决策**：提供共享的 `tryCheckCompatibility()` 辅助函数，封装动态导入 + 错误处理逻辑。

```typescript
// 添加到 .opencode/tools/lib/utils.ts

/**
 * 动态导入并执行 checkCompatibilityAtEntry
 * 导入失败时静默跳过（记录日志），不阻塞业务逻辑
 * 
 * @param baseDir - 项目根目录
 * @param component - 调用方模块名（用于日志）
 */
export async function tryCheckCompatibility(
  baseDir: string,
  component: string
): Promise<void> {
  try {
    const modulePath = "../../../scripts/lib/compatibility"
    const mod = await import(modulePath)
    if (mod.checkCompatibilityAtEntry) {
      mod.checkCompatibilityAtEntry(baseDir)
    }
  } catch (err) {
    // 导入失败 → 记录日志并静默跳过
    try {
      const errorLogPath = join(baseDir, "specforge/logs/error.log")
      await appendJsonl(errorLogPath, {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        component,
        event: "dynamic_import_failed",
        message: err instanceof Error ? err.message : String(err),
        module_path: "../../../scripts/lib/compatibility",
      })
    } catch {
      // 日志写入也失败时完全静默
    }
  }
}
```

**迁移模式**（每个 core 文件）：

Before:
```typescript
import { checkCompatibilityAtEntry } from "../../../scripts/lib/compatibility"

export async function readStateFile(workItemId: string, baseDir: string) {
  checkCompatibilityAtEntry(baseDir)
  // ...
}
```

After:
```typescript
import { tryCheckCompatibility } from "./utils"

export async function readStateFile(workItemId: string, baseDir: string) {
  await tryCheckCompatibility(baseDir, "sf_state_read_core")
  // ...
}
```

**路径解析说明**：
- 当前静态导入路径：`"../../../scripts/lib/compatibility"`（从 `.opencode/tools/lib/` 到 `scripts/lib/`）
- 动态导入使用相同的相对路径字符串
- 由于动态 `import()` 在运行时解析，路径相对于当前文件位置（与静态 import 一致）

**关键约束**：
- `checkCompatibilityAtEntry` 原本是同步函数，但动态 `import()` 是异步的，因此 `tryCheckCompatibility` 必须是 async
- 所有调用 `checkCompatibilityAtEntry` 的导出函数已经是 `async function`，因此添加 `await` 不改变签名
- 对于同步导出函数（如 `checkWorkflowGuards`），不应用动态导入（这些函数不调用 `checkCompatibilityAtEntry`）

---

### Component 4: Log Rotation for conversations.jsonl

**职责**：在 conversations.jsonl 超过 100MB 时执行编号轮转，保留最近 3 个历史文件。

**修改文件**：`.opencode/plugins/sf_specforge.ts`

**设计决策**：轮转检查在每次写入 conversations.jsonl **之前**执行（而非定时器），确保文件大小始终受控。

```typescript
// 添加到 sf_specforge.ts

const LOG_ROTATION_THRESHOLD_BYTES = 100 * 1024 * 1024 // 100MB
const LOG_ROTATION_MAX_HISTORY = 3

/**
 * 检查并执行 conversations.jsonl 日志轮转
 * 
 * 轮转策略：
 * 1. 检查文件大小是否超过阈值
 * 2. 删除超过 MAX_HISTORY 的历史文件（.4, .5, ...）
 * 3. 将现有历史文件编号递增（.3→删除, .2→.3, .1→.2）
 * 4. 将当前文件重命名为 .1
 * 5. 创建新的空文件
 */
async function rotateConversationsLog(filePath: string): Promise<void> {
  // Step 1: 检查文件大小
  let fileSize: number
  try {
    const stats = await stat(filePath)
    fileSize = stats.size
  } catch {
    // 文件不存在或无法 stat → 无需轮转
    return
  }

  if (fileSize <= LOG_ROTATION_THRESHOLD_BYTES) {
    return // 未超过阈值
  }

  // Step 2: 删除超过 MAX_HISTORY 的文件
  for (let i = LOG_ROTATION_MAX_HISTORY + 1; i <= LOG_ROTATION_MAX_HISTORY + 5; i++) {
    try {
      await unlink(`${filePath}.${i}`)
    } catch {
      break // 文件不存在，停止
    }
  }

  // Step 3: 递增编号（从高到低避免覆盖）
  for (let i = LOG_ROTATION_MAX_HISTORY; i >= 1; i--) {
    const src = i === 1 ? `${filePath}.1` : `${filePath}.${i}`
    const dst = `${filePath}.${i + 1}`
    
    if (i === LOG_ROTATION_MAX_HISTORY) {
      // 最高编号直接删除
      try { await unlink(src) } catch { /* 不存在则忽略 */ }
    } else {
      // 递增编号
      try {
        await access(src)
        const { rename } = await import("node:fs/promises")
        await rename(src, dst)
      } catch { /* 源文件不存在则跳过 */ }
    }
  }

  // Step 4: 当前文件 → .1
  try {
    const { rename } = await import("node:fs/promises")
    await rename(filePath, `${filePath}.1`)
  } catch (err) {
    // 重命名失败 → 记录错误，继续使用当前文件
    throw err
  }

  // Step 5: 创建新空文件
  await writeFile(filePath, "", "utf-8")
}
```

**集成点**：在 `createUnifiedEventHandler` 中，写入 `conversationFile` 之前调用轮转检查：

```typescript
// 在 event handler 中
if (event.type === "message.updated" || event.type === "message.part.updated") {
  // 轮转检查（失败时静默）
  try {
    await rotateConversationsLog(conversationFile)
  } catch (err) {
    await logError(projectRoot, "log_rotation", err)
  }
  
  // 正常写入
  const msgEntry = buildLogEntry(...)
  await appendJsonlSafe(conversationFile, msgEntry)
}
```

**轮转时序**：
```
Before rotation:
  conversations.jsonl      (>100MB, current)
  conversations.jsonl.1    (previous)
  conversations.jsonl.2    (older)
  conversations.jsonl.3    (oldest, will be deleted)

After rotation:
  conversations.jsonl      (new, empty)
  conversations.jsonl.1    (was current)
  conversations.jsonl.2    (was .1)
  conversations.jsonl.3    (was .2)
```

---

### Component 5: Error Log Format Specification

**职责**：定义统一的 JSONL 错误日志格式，确保所有写入方产出一致的记录结构。

**文件路径**：`specforge/logs/error.log`

**记录格式**：

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "ERROR",
  "component": "sf_state_read_core",
  "event": "readStateFile",
  "message": "state.json not found at /path/to/specforge/runtime/state.json"
}
```

**字段规范**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `timestamp` | string | ✓ | ISO 8601 格式，含时区（UTC Z 后缀） |
| `level` | string | ✓ | 固定值 `"ERROR"` |
| `component` | string | ✓ | 产生错误的模块标识（如 `"sf_state_read_core"`、`"sf_specforge.startup"`） |
| `event` | string | ✓ | 错误事件类型（函数名或事件标识，如 `"readStateFile"`、`"dynamic_import_failed"`） |
| `message` | string | ✓ | 人类可读的错误描述（通常为 `Error.message`） |

**附加字段**（可选，特定场景）：

| 字段 | 类型 | 场景 |
|------|------|------|
| `module_path` | string | 动态导入失败时记录目标模块路径 |
| `payload` | object | 需要附加上下文信息时 |

**写入方职责**：
- Plugin 层：使用 `logError()` 函数（已存在，内部调用 `appendJsonlSafe`）
- Tool Core 层：使用 `logErrorToFile()` 新函数（内部调用 `appendJsonl`）
- 两者均在写入前自动创建目录（`mkdir recursive`）

**与现有 `logError` 的关系**：
- Plugin 中的 `logError()` 已满足格式要求（timestamp、level、component、event、message）
- Tool Core 中的 `logErrorToFile()` 产出相同格式
- 两者写入同一文件 `specforge/logs/error.log`

---

## Data Flow

```
异常发生
    │
    ├─ Plugin 层（sf_specforge.ts）
    │   ├─ executeStartupFlow 异常 → logError → 降级到 degraded 模式
    │   └─ 事件处理器异常 → logError → 静默返回
    │
    ├─ Tool Core 层（*_core.ts）
    │   ├─ 业务逻辑异常 → logErrorToFile → 重新抛出
    │   └─ 动态导入失败 → logErrorToFile → 静默跳过
    │
    └─ 日志轮转（conversations.jsonl）
        ├─ 写入前检查大小
        ├─ 超过 100MB → 执行轮转
        └─ 轮转失败 → logError → 继续使用当前文件
```

---

## Error Handling Strategy

| 层级 | 捕获行为 | 日志函数 | 异常传播 |
|------|----------|----------|----------|
| Plugin startup | 捕获 + 降级 | `logError()` | 不传播 |
| Plugin event handlers | 捕获 + 静默 | `logError()` | 不传播 |
| Tool Core exports | 捕获 + 日志 + 重抛 | `logErrorToFile()` | 重新抛出 |
| Dynamic import | 捕获 + 日志 + 跳过 | `logErrorToFile()` | 不传播 |
| Log rotation | 捕获 + 日志 + 继续 | `logError()` | 不传播 |
| logError 自身失败 | 静默忽略 | — | 不传播 |

---

## Interface Definitions

### logErrorToFile (新增到 utils.ts)

```typescript
/**
 * 将错误信息写入 Error_Log（specforge/logs/error.log）
 * 写入失败时静默，不抛出异常
 */
export async function logErrorToFile(
  baseDir: string,
  component: string,
  event: string,
  error: unknown
): Promise<void>
```

### tryCheckCompatibility (新增到 utils.ts)

```typescript
/**
 * 动态导入并执行 checkCompatibilityAtEntry
 * 导入或执行失败时静默跳过并记录日志
 */
export async function tryCheckCompatibility(
  baseDir: string,
  component: string
): Promise<void>
```

### rotateConversationsLog (Plugin 内部函数)

```typescript
/**
 * 检查文件大小并执行轮转
 * 轮转失败时抛出异常（由调用方捕获并记录）
 */
async function rotateConversationsLog(filePath: string): Promise<void>
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Plugin startup exception containment

*For any* exception thrown by `executeStartupFlow()`, the Plugin export function SHALL NOT propagate the exception to the caller, and SHALL still return a valid handler registration object.

**Validates: Requirements 1.1, 1.4**

### Property 2: Event handler exception containment

*For any* event handler (tool.execute.before, tool.execute.after, event) and *for any* exception thrown during handler execution, the wrapped handler SHALL NOT propagate the exception to the OpenCode runtime.

**Validates: Requirements 1.2, 1.4**

### Property 3: Tool Core error logging and re-throw

*For any* Tool Core exported async function and *for any* exception thrown during execution, the function SHALL write an error log entry containing `timestamp` (ISO 8601), `level` ("ERROR"), `component` (module name), `event` (function name), and `message` (error description) to `specforge/logs/error.log`, and then re-throw the original exception unchanged.

**Validates: Requirements 2.1, 2.2, 5.1, 5.2**

### Property 4: Tool Core resilience to log write failure

*For any* Tool Core exported function, when the error log write itself fails (e.g., disk full, permission denied), the function SHALL still re-throw the original business logic exception without modification.

**Validates: Requirements 2.4**

### Property 5: Dynamic import failure does not alter return value

*For any* Tool Core function that calls `tryCheckCompatibility`, and *for any* valid input, the function's return value SHALL be identical regardless of whether the compatibility module is available or unavailable.

**Validates: Requirements 3.2, 3.4**

### Property 6: Dynamic import failure logging

*For any* failure of the dynamic `import()` call to `scripts/lib/compatibility`, the system SHALL write a log entry to Error_Log with `event` equal to `"dynamic_import_failed"` and the failed module path included.

**Validates: Requirements 3.3**

### Property 7: Log rotation preserves numbered file ordering

*For any* initial state of conversations.jsonl history files (`.1`, `.2`, `.3`), after a rotation operation, the previous `.1` file content SHALL be at `.2`, the previous `.2` content SHALL be at `.3`, and the new `.1` SHALL contain the previous main file content.

**Validates: Requirements 4.2**

### Property 8: Log rotation enforces retention limit

*For any* rotation operation, after completion there SHALL be at most 3 numbered history files (`.1`, `.2`, `.3`). Any file with number > 3 SHALL be deleted.

**Validates: Requirements 4.3**

### Property 9: Log rotation produces empty main file

*For any* successful rotation operation, the main `conversations.jsonl` file SHALL exist and have size 0 bytes after rotation completes.

**Validates: Requirements 4.4**

### Property 10: Error log entries are valid JSONL with required fields

*For any* error record written to `specforge/logs/error.log`, the record SHALL be a single valid JSON line containing all required fields: `timestamp` (ISO 8601 format string), `level` (value "ERROR"), `component` (non-empty string), `event` (non-empty string), and `message` (string).

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 11: Error log directory auto-creation

*For any* state where `specforge/logs/` directory does not exist, writing an error log entry SHALL succeed after automatically creating the directory structure.

**Validates: Requirements 5.4**
