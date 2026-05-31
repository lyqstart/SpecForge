# Intake: events.jsonl / state.json 从用户全局迁移到项目目录

## 重构目标
将 Work Item 状态数据（events.jsonl + state.json）从用户全局目录 `~/.specforge/runtime/` 迁移到项目目录 `<project>/.specforge/runtime/`。

## 动机
- 状态数据应随项目走，而非依赖用户家目录
- 项目迁移/备份时状态数据跟随
- 多项目隔离更清晰

## 涉及范围

### 必须迁移的文件
- `events.jsonl` → 从 `~/.specforge/runtime/` → `<project>/.specforge/runtime/`
- `state.json` → 从 `~/.specforge/runtime/` → `<project>/.specforge/runtime/`

### 必须保留在用户级的文件
- `handshake.json` — Daemon 发现必需
- `daemon.lock` — 单实例互斥必需

### 受影响组件
| 组件 | 当前路径 | 迁移动作 |
|------|---------|---------|
| StateManager (Daemon.ts:54) | isDaemonGlobal=true → `~/.specforge/runtime/` | 改为 isDaemonGlobal=false，用项目路径 |
| EventLogger (Daemon.ts:95) | basePath=runtimeDir | basePath 改为项目路径 |
| RecoverySubsystem | daemon-global 路径 | 改为 project-scoped 路径 |
| sf_state_transition handler | 双写（全局+项目） | 移除全局写入，只保留项目层 |
| sf_state_read handler | 项目层优先，回退全局层 | 移除全局层回退 |

## 不变行为
- Work Item 状态转换功能不变
- WAL 读写/回放功能不变
- EventBus pub/sub 功能不变
- 所有 HTTP API 响应格式不变
- 所有现有测试必须通过

## 风险等级
高 — 涉及核心运行时文件位置变更，影响 StateManager、RecoverySubsystem、多个工具处理器