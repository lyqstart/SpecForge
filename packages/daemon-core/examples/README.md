# Daemon Core 使用示例

本目录包含 Daemon Core 的完整使用示例，涵盖以下场景：

## 示例列表

| 文件 | 说明 |
|------|------|
| [`01-cli-integration.ts`](./01-cli-integration.ts) | CLI 集成：启动 Daemon、读取握手文件、发起 HTTP 请求 |
| [`02-thin-plugin-integration.ts`](./02-thin-plugin-integration.ts) | Thin Plugin 集成：会话生命周期、SSE 事件订阅、项目锁 |
| [`03-error-handling.ts`](./03-error-handling.ts) | 错误处理：认证失败、资源冲突、崩溃恢复、重试策略 |

## 快速开始

### 前置条件

```bash
# 安装依赖
bun install

# 构建 daemon-core
bun run build
```

### 运行示例

```bash
# 先启动 Daemon（在另一个终端）
bun run packages/daemon-core/src/index.ts

# 运行 CLI 集成示例
bun run packages/daemon-core/examples/01-cli-integration.ts

# 运行 Thin Plugin 集成示例
bun run packages/daemon-core/examples/02-thin-plugin-integration.ts

# 运行错误处理示例
bun run packages/daemon-core/examples/03-error-handling.ts
```

## 架构概览

```
CLI / Thin Plugin
      │
      │  HTTP/1.1 + Bearer Token
      ▼
┌─────────────────────────────────────┐
│           Daemon Core               │
│                                     │
│  HTTP/SSE Server (127.0.0.1:动态端口) │
│  ├── Event Bus (内部发布/订阅)        │
│  ├── Session Registry               │
│  ├── Project Manager                │
│  ├── State Manager (WAL)            │
│  └── Recovery Subsystem             │
└─────────────────────────────────────┘
      │
      ▼
~/.specforge/runtime/daemon.sock.json  ← 握手文件（pid/port/token）
~/.specforge/projects/<id>/events.jsonl ← WAL 事件日志
~/.specforge/projects/<id>/state.json   ← 状态快照
```

## 关键概念

- **握手文件**：Daemon 启动后写入 `~/.specforge/runtime/daemon.sock.json`，包含 `pid`、`port`、`token`
- **Bearer Token**：所有 HTTP 请求（除健康检查外）必须携带 `Authorization: Bearer <token>`
- **Session 生命周期**：`pending` → `active` → `history`
- **WAL 语义**：先写 `events.jsonl` 并 fsync，再更新 `state.json`
- **项目隔离**：每个项目路径对应独立的 events/state 文件和写锁
