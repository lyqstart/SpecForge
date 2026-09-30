# Requirements Document

## Introduction

SpecForge 系统当前缺少全局错误处理机制。当 Plugin 顶层、Tool Core 导出函数或安装器中发生未捕获异常时，可能导致进程崩溃或错误信息丢失。本需求定义一套分层错误处理策略：Plugin 层捕获并静默、Tool Core 层捕获记录后重新抛出、安装器动态导入容错、以及日志文件轮转机制，确保系统在异常情况下保持稳定运行并留存可追溯的错误记录。

## Glossary

- **Plugin**: 指 `sf_specforge.ts` 统一插件文件，部署于 `~/.config/opencode/plugins/`，OpenCode 启动时自动加载
- **Tool_Core**: 指 `.opencode/tools/lib/` 目录下以 `_core.ts` 结尾的 16 个模块文件，每个模块导出一个或多个业务逻辑函数
- **Error_Log**: 指 `specforge/logs/error.log` 文件，以 JSONL 格式存储错误记录
- **logError**: 指 `sf_specforge.ts` 中已有的 `logError()` 函数，接受 projectRoot、component、error 三个参数，将错误写入 Error_Log
- **appendJsonlSafe**: 指 `sf_specforge.ts` 中已有的 `appendJsonlSafe()` 函数，安全追加 JSONL 记录到指定文件，写入失败时静默
- **utils_logError**: 指 `.opencode/tools/lib/utils.ts` 中通过 `writeLog()` 和 `appendJsonl()` 组合实现的日志写入能力
- **checkCompatibilityAtEntry**: 指 `scripts/lib/compatibility.ts` 中导出的版本兼容性检查函数，当前被 Tool_Core 文件通过静态 import 引用
- **Installer**: 指 `scripts/sf-installer.ts` 安装器 CLI 脚本
- **Conversations_JSONL**: 指 `specforge/logs/conversations.jsonl` 文件，记录会话对话数据
- **Log_Rotation**: 指当日志文件超过大小阈值时，将当前文件重命名归档并创建新文件的机制

## Requirements

### Requirement 1: Plugin 顶层错误捕获

**User Story:** As a SpecForge 用户, I want Plugin 在遇到未预期异常时不崩溃, so that OpenCode 会话不会因 Plugin 内部错误而中断。

#### Acceptance Criteria

1. WHEN Plugin 的 `executeStartupFlow()` 抛出异常, THE Plugin SHALL 捕获该异常、调用 logError 将错误写入 Error_Log、并继续执行后续注册流程而不终止进程
2. WHEN Plugin 的事件处理器（tool.execute.before、tool.execute.after、event handler）抛出异常, THE Plugin SHALL 捕获该异常、调用 logError 将错误写入 Error_Log、并静默返回而不向调用方传播异常
3. THE Plugin SHALL 在每个顶层 try-catch 中使用已有的 `logError()` 函数写入错误记录
4. WHEN logError 本身写入失败, THE Plugin SHALL 静默忽略写入失败而不抛出二次异常

### Requirement 2: Tool Core 导出函数错误捕获

**User Story:** As a SpecForge 开发者, I want Tool Core 的导出函数在异常时记录详细错误日志, so that 问题可被事后追溯定位。

#### Acceptance Criteria

1. WHEN Tool_Core 的导出函数执行过程中抛出异常, THE Tool_Core SHALL 捕获该异常、将错误信息写入 Error_Log、然后重新抛出原始异常
2. THE Tool_Core SHALL 在错误日志条目中包含 timestamp、level（值为 "ERROR"）、component（值为该 Tool_Core 模块名）、event（值为函数名）、以及 message（异常消息）字段
3. THE Tool_Core SHALL 使用 `.opencode/tools/lib/utils.ts` 中的 `appendJsonl()` 函数写入 Error_Log
4. WHEN 错误日志写入本身失败, THE Tool_Core SHALL 静默忽略写入失败并继续重新抛出原始异常
5. THE Tool_Core SHALL 对所有 16 个 `_core.ts` 文件中的公开导出函数（export function 和 export async function）应用此错误捕获模式

### Requirement 3: checkCompatibilityAtEntry 动态导入

**User Story:** As a SpecForge 用户, I want 兼容性检查模块加载失败时不阻塞工具执行, so that 在 scripts/lib/ 缺失的环境中工具仍可正常运行。

#### Acceptance Criteria

1. THE Tool_Core SHALL 将 `checkCompatibilityAtEntry` 的 import 从静态 import 语句改为动态 `import()` 调用
2. WHEN 动态导入 `checkCompatibilityAtEntry` 失败（模块不存在或加载错误）, THE Tool_Core SHALL 静默跳过兼容性检查并继续执行业务逻辑
3. WHEN 动态导入失败, THE Tool_Core SHALL 将导入失败事件写入 Error_Log，记录包含 component、event（值为 "dynamic_import_failed"）、以及失败模块路径
4. THE Tool_Core SHALL 确保动态导入失败不改变函数的返回值语义

### Requirement 4: Conversations JSONL 日志轮转

**User Story:** As a SpecForge 用户, I want conversations.jsonl 在超过 100MB 时自动轮转, so that 磁盘空间不会被无限增长的日志文件耗尽。

#### Acceptance Criteria

1. WHEN Conversations_JSONL 文件大小超过 100MB, THE Plugin SHALL 执行日志轮转操作
2. WHEN 执行日志轮转, THE Plugin SHALL 将当前文件重命名为 `conversations.jsonl.1`，并将已有的历史文件编号依次递增（`.1` → `.2`，`.2` → `.3`）
3. THE Plugin SHALL 保留最近 3 个历史轮转文件（`.1`、`.2`、`.3`），删除编号超过 3 的历史文件
4. WHEN 轮转完成后, THE Plugin SHALL 创建一个新的空 `conversations.jsonl` 文件供后续写入
5. WHEN 轮转过程中发生文件系统错误（权限不足、磁盘满等）, THE Plugin SHALL 将错误写入 Error_Log 并继续使用当前文件而不中断会话记录
6. THE Plugin SHALL 在每次追加写入 Conversations_JSONL 之前检查文件大小是否超过阈值

### Requirement 5: 错误日志格式规范

**User Story:** As a SpecForge 运维人员, I want 错误日志采用统一的 JSONL 格式, so that 日志可被自动化工具解析和分析。

#### Acceptance Criteria

1. THE Error_Log SHALL 以 JSONL 格式存储，每行一条独立的 JSON 记录
2. THE Error_Log 中每条记录 SHALL 包含以下必填字段：`timestamp`（ISO 8601 格式）、`level`（值为 "ERROR"）、`component`（产生错误的模块标识）、`event`（错误事件类型）、`message`（人类可读的错误描述）
3. THE Error_Log SHALL 存储于 `specforge/logs/error.log` 路径
4. WHEN Error_Log 所在目录不存在, THE 写入方 SHALL 自动创建目录结构后再写入
