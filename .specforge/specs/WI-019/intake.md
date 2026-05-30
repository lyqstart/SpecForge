# Intake: Daemon 运行中突然不可达

## Bug 描述

SpecForge daemon 在 Windows 上运行正常，但使用过程中突然提示 "Daemon connection failed: Unable to connect. Is the computer able to access the url?"。daemon 进程未退出，短暂不可达后又恢复。表现为间歇性连接失败。

## 当前行为

1. OpenCode 正常使用 SpecForge 工具
2. 当 orchestrator 触发 `sf_state_transition` 时，daemon 的 HTTP 服务器暂时无法 accept 新连接
3. 所有并发的工具调用（sf_safe_bash 等）报 "Unable to connect"
4. 短暂（50~500ms）后自动恢复

## 预期行为

daemon 始终可访问，不会因内部 I/O 操作导致 HTTP 服务不可达。

## 复现环境

- OS: Windows 11 家庭版
- Node.js: v24.12.0
- SpecForge: V6 (daemon-core)
- events.jsonl: 6.4 MB

## 根因分析

### 核心问题：`fsSync.fsyncSync` 阻塞 Node.js 事件循环

**阻塞点清单：**

| 文件 | 行号 | 操作 |
|------|------|------|
| `wal/WAL.ts` | 74-78 | `fsSync.openSync` + `fsSync.fsyncSync` |
| `state/StateManager.ts` | 420-424 | `fsSync.openSync` + `fsSync.fsyncSync` |
| `recovery/RecoverySubsystem.ts` | 499-501 | `fsSync.openSync` + `fsSync.fsyncSync` |
| `recovery/RecoverySubsystem.ts` | 523-527 | `fsSync.openSync` + `fsSync.fsyncSync` |
| `tools/lib/sf_project_init_core.ts` | 300-317 | `execSync` (node/bun/git --version) |

### 故障链条

每次 `sf_state_transition` 触发 **两次** fsyncSync：
1. WAL.appendEvent → fsyncSync(events.jsonl, 6.4MB)
2. StateManager.writeStateFile → fsyncSync(state.json)

在 Windows 上，`fsyncSync` 映射到 `FlushFileBuffers`，耗时 50~500ms。期间事件循环完全阻塞 → HTTP 服务器无法 accept → 所有并发请求失败。

### 次级问题

- daemon 崩溃后 handshake.json 未清理 → 重启后客户端连旧端口失败
- thin-client 单例不刷新端口 → daemon 重启后永久失联
- events.jsonl 无归档机制 → 文件持续增长恶化 fsync 耗时
