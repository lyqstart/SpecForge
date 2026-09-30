# Requirements Document

## Introduction

**Service Management** 把 SpecForge daemon 与 opencode-server 从"由 OpenCode 插件按需 spawn 的短命进程"转成 **OS 管理的用户级长驻服务**：Linux 用 `systemd --user`，Windows 用 NSSM。多客户端（OpenCode TUI、CLI、Telegram bot、Web UI、远程脚本）通过 HTTP 直接连这两个服务，互不依赖任何客户端的生命周期。

**Parent Specification**：[v6-architecture-overview](../v6-architecture-overview/requirements.md)
**Wave**：V6.1
**Scope**：**P0**（headless / 远程接入场景的关键架构修复，解锁 daemon-core REQ-1.6 headless 模式 + Telegram / OpenClaw / Web UI）

### 解决的问题

V6.0 当前形态有四个相互纠缠的问题：

1. **Daemon 30 秒空闲自动退出**（daemon-core REQ-1.4）—— 远程客户端再连接会失败
2. **`ensureDaemon()` 只在 OpenCode 插件加载时跑一次** —— 插件不持续监管 daemon
3. **薄客户端工具没有自动唤醒** —— 任何"daemon connection failed"直接传递给用户
4. **`specforge daemon start --detach`** 实现不到位

### 解决方案概要

把 daemon 升级为 **机器级单例的 OS 服务**，由 OS 服务管理器管理生命周期；删除 daemon-core REQ-1.4（30s 空闲退出）和 REQ-1.5（`--detach`），新增"优雅停机"需求；插件由"daemon spawner"降级为"事件转发桥"，daemon 不可达时打印明确错误而不是尝试 spawn。

### 范围声明（不重不漏）

本 spec **拥有**：服务 install/uninstall/start/stop/restart/status、跨平台抽象、unit 文件生成、生命周期编排、优雅停机契约、插件重连客户端、CLI 子命令、相关错误码与配置项。
本 spec **不拥有**：daemon 内部业务逻辑（归 daemon-core）、`specforge upgrade` 升级编排（归 distribution）、远程访问鉴权（归 permission-engine）、配置四层合并机制（归 configuration）、NSSM 二进制 bundling（归 distribution）。

---

## Glossary

- **Service_Manager**：跨平台服务管理抽象，由 `SystemdServiceManager`（Linux）和 `NssmServiceManager`（Windows）实现，负责 install/uninstall/start/stop/status 等单服务生命周期操作。
- **Service_Lifecycle_Orchestrator**：跨多服务的启动 / 停机编排器，处理依赖拓扑、回滚、超时；用于把"两个服务（opencode-server + specforge-daemon）"按依赖顺序整体推进到目标态。
- **Service_Unit_Generator**：把 `ServiceInstallSpec` 渲染为 systemd unit 文件文本或 NSSM 命令序列的组件；遵循 always-rewrite 策略，每次升级重写文件，靠顶部 metadata 注释跟踪 schema_version。
- **Graceful_Shutdown_Handler**：优雅停机处理器；注册信号监听（SIGTERM / SERVICE_CONTROL_STOP），收到信号后按优先级顺序（stop-accepting → drain → flush → close → release）执行 `ShutdownTask`，超时硬上限 10 秒，超时后 OS 发 SIGKILL。
- **Reconnecting_Daemon_Client**：插件侧的 HTTP 客户端；postEvent 失败时进入指数退避重连循环（1s/2s/4s/8s/16s/32s，累计 ~60s），超时后进入 degraded 模式，drop 后续事件并 warn 一次。
- **handshake.json**：daemon 启动时写入 `~/.specforge/runtime/handshake.json` 的引导发现文件，含 `schema_version` / `pid` / `port` / `token` / `startedAt` / `version` / `serviceMode`，权限 `0600`。
- **HealthCheckResponse**：daemon 暴露的 `GET /api/v1/healthz` 响应，含 `schema_version` / `status` / `pid` / `version` / `startedAt` / `uptimeSec` / `activeClients` / `pendingEvents` / `lastEventTs`。
- **EnvironmentPrecheck**：服务安装前的环境扫描结果，含平台、systemd / NSSM 可用性、linger 状态、elevated 状态等，分 `blockers`（必须修复）和 `warnings`（可继续）两级。
- **ServiceState**：封闭枚举 `uninstalled` / `stopped` / `starting` / `running` / `stopping` / `failed`；状态来源是 OS 真值（systemctl is-active / NSSM status）+ 退出码，不依赖任何进程内可变状态。
- **机器级伪 projectId**：服务生命周期事件（service.started/stopped/installed/uninstalled/failed）写入 events.jsonl 时使用的固定值 `__machine__`，与真实项目数据完全隔离，承接父 Property 22 Project Isolation。
- **服务依赖图**：本 spec 范围内的服务依赖关系 `G = {specforge-daemon → opencode-server}`，启动顺序 `opencode-server → specforge-daemon`，停机顺序反向。
- **always-rewrite 策略**：每次 install / 升级时重写完整 unit 文件（不做 in-place patch），版本演化由顶部 metadata 注释中的 `schema_version` 字段承载。

---

## Requirements

### Requirement 1: 服务安装与卸载

**User Story:** 作为 SpecForge 用户，I want 通过单条命令把 daemon 与 opencode-server 注册为 OS 用户级服务，so that 它们可以被 OS 服务管理器接管生命周期，与任何客户端进程解耦。

#### Acceptance Criteria

1. WHEN 用户执行 `specforge services install`，THE Service_Lifecycle_Orchestrator SHALL 按依赖拓扑顺序为 `opencode-server` 与 `specforge-daemon` 生成 unit 文件并向 OS 服务管理器注册。
2. WHEN 在 Linux 平台执行 install，THE Service_Manager SHALL 把 unit 文件写入 `~/.config/systemd/user/` 目录，并仅使用 `systemctl --user` 子命令，且不调用 `sudo`。
3. WHEN 在 Windows 平台执行 install，THE Service_Manager SHALL 仅使用打包在 `~/.specforge/bin/nssm.exe` 的 NSSM 可执行文件完成注册，不使用 Windows Task Scheduler。
4. WHILE 平台是 macOS（`process.platform === "darwin"`），THE Service_Manager SHALL 在 `EnvironmentPrecheck` 中返回 `blockers` 包含 `code = "PLATFORM_NOT_SUPPORTED"` 并拒绝执行 install。
5. WHEN install 失败，THE Service_Lifecycle_Orchestrator SHALL 反向卸载已成功注册的服务并返回 `OrchestrationResult.rolledBack` 列表，不留下半安装状态。
6. THE Service_Unit_Generator SHALL 每次重写完整 unit 文件而不做 in-place patch，并在文件首行起的注释块中写入 `schema_version: "1.0"`、`generated-by`、`generated-at`、`specforge-version`、`service-name`、`binary-path` 六个 metadata 字段。
7. WHEN 用户执行 `specforge services uninstall`，THE Service_Lifecycle_Orchestrator SHALL 先停止运行中的服务，再从 OS 服务管理器注销，最后删除 unit 文件，按依赖反向顺序进行。
8. WHEN install 已经完成的情况下用户再次执行 `specforge services install`，THE Service_Lifecycle_Orchestrator SHALL 视为 no-op，返回退出码 `0` 并提示"already installed"。

### Requirement 2: 服务依赖与启动 / 停机顺序

**User Story:** 作为 SpecForge 用户，I want 服务按依赖关系自动按序启动与停止，so that daemon 永远不会在 opencode-server 缺位的情况下尝试调用它。

#### Acceptance Criteria

1. WHEN 用户执行 `specforge services start`，THE Service_Lifecycle_Orchestrator SHALL 按依赖图拓扑顺序先启动 `opencode-server`，待其进入 `running` 状态后再启动 `specforge-daemon`。
2. WHEN 用户执行 `specforge services stop`，THE Service_Lifecycle_Orchestrator SHALL 按依赖反向顺序先停止 `specforge-daemon`，待其离开 `running` 状态后再停止 `opencode-server`。
3. THE systemd unit 文件 SHALL 在 `[Unit]` 段使用 `Wants=opencode-server.service` 与 `After=opencode-server.service` 声明弱依赖。
4. THE NSSM 服务注册 SHALL 通过 `nssm set specforge-daemon DependOnService opencode-server` 声明启动依赖。
5. WHEN `specforge-daemon` 启动时检测到 `opencode-server` 不在 `running` 状态，THE Service_Manager SHALL 返回错误码 `SVC_DEPENDENCY_NOT_RUNNING` 并提示运行 `specforge services start`。
6. WHEN install 已完成且服务处于 `running` 状态时用户再次执行 `specforge services start`，THE Service_Lifecycle_Orchestrator SHALL 视为 no-op，返回退出码 `0` 且不重启服务。
7. WHEN 服务已处于 `stopped` 状态时用户再次执行 `specforge services stop`，THE Service_Lifecycle_Orchestrator SHALL 视为 no-op，返回退出码 `0`。

### Requirement 3: 优雅停机与事件持久化

**User Story:** 作为 SpecForge 运维者，I want daemon 在收到停机信号时能在硬上限内把已 ack 的事件刷盘后再退出，so that 服务重启或升级期间不丢失任何已承诺持久化的事件。

#### Acceptance Criteria

1. WHEN daemon 收到 `SIGTERM`（Linux）或 `SERVICE_CONTROL_STOP`（Windows），THE Graceful_Shutdown_Handler SHALL 按优先级顺序 `stop-accepting → drain → flush → close → release` 执行所有已注册的 `ShutdownTask`。
2. THE Graceful_Shutdown_Handler SHALL 在退出前，把所有"已通过 HTTP 2xx ack 给客户端"的事件 fsync 到 `events.jsonl`，使关停后读取该文件可见全部已 ack 事件。
3. THE Graceful_Shutdown_Handler 总停机超时 SHALL 默认为 10 秒，对应 systemd `TimeoutStopSec=10` 与 NSSM `AppStopMethodConsole` 配置。
4. WHEN 单个 `ShutdownTask` 自身超过 3 秒未完成，THE Graceful_Shutdown_Handler SHALL 记录 warning 事件并继续执行后续 `ShutdownTask`，不阻断整个流程。
5. IF `Graceful_Shutdown_Handler` 总停机超过 10 秒仍未退出，THEN THE Graceful_Shutdown_Handler SHALL 以退出码 `1` 退出，OS 服务管理器将后续发出 `SIGKILL` 强杀。
6. THE Graceful_Shutdown_Handler `[Symbol.asyncDispose]` SHALL 在被调用后释放所有 Disposable 资源（含 timer、HTTP 监听、SSE 流），且 `getActive*Count()` 自检 API 返回 `0`。
7. WHILE `Graceful_Shutdown_Handler` 已处于停机中（`isShuttingDown() === true`），THE Graceful_Shutdown_Handler SHALL 对重复触发请求保持幂等，不再次执行 `ShutdownTask` 序列。

### Requirement 4: 删除 / 修改 daemon-core 既有需求

**User Story:** 作为 SpecForge 架构维护者，I want 在服务化之后清掉与新模型冲突的旧机制，so that 系统不会同时存在"30s 空闲退出"与"OS 接管常驻"两套互斥的生命周期假设。

#### Acceptance Criteria

1. THE specforge-daemon SHALL 删除"30 秒空闲自动退出"行为（原 daemon-core REQ-1.4），即启动后即使无任何 HTTP 请求也持续运行直到收到停机信号。
2. THE specforge-daemon CLI SHALL 删除 `--detach` 命令行 flag（原 daemon-core REQ-1.5），不再接受该参数。
3. WHEN 用户调用 `specforge daemon start` 命令，THE specforge-daemon SHALL 以前台模式（`--foreground`）运行，由 OS 服务管理器负责后台化。
4. THE handshake.json 文件 SHALL 扩展为包含字段 `schema_version: "1.0"` / `pid` / `port` / `token` / `startedAt` / `version` / `serviceMode`，七个字段全部必填，文件权限保持 `0600`。
5. THE specforge-daemon SHALL 暴露 `GET /api/v1/healthz` HTTP 端点，响应 `HealthCheckResponse` 含 `schema_version` / `status` / `pid` / `version` / `startedAt` / `uptimeSec` / `activeClients` / `pendingEvents` / `lastEventTs` 九个字段。

### Requirement 5: 插件降级与重连

**User Story:** 作为 OpenCode 插件作者，I want 在 daemon 短暂不可达（升级、重启）时插件能自动重连而不是直接放弃或重复 spawn 实例，so that 升级窗口不会让用户看到误导性错误且不会出现双 daemon 实例。

#### Acceptance Criteria

1. THE sf_specforge OpenCode 插件 SHALL 删除 `ensureDaemon()` 与 `daemon-spawn.ts` 中所有 `spawn` 子进程的代码路径，不再尝试拉起 daemon 二进制。
2. WHEN 插件向 daemon 发送事件失败，THE Reconnecting_Daemon_Client SHALL 进入指数退避重连循环，初始退避 `1` 秒，退避因子 `2.0`，序列依次为 `1s / 2s / 4s / 8s / 16s / 32s`，累计上限 `60` 秒。
3. WHEN daemon 在累计退避上限内恢复可达，THE Reconnecting_Daemon_Client SHALL 重读 `handshake.json` 拿到新的 `port` 与 `token`，并重发当前事件。
4. IF daemon 在累计退避超过 `60` 秒后仍不可达，THEN THE Reconnecting_Daemon_Client SHALL 进入 degraded 模式，把 `isDegraded()` 置为 `true`，对后续 `postEvent` 调用直接返回 `{ ok: false, dropped: true, reason: "degraded" }`，并在 stderr 打印一次提示 `"specforge daemon status"` 的 warning。
5. THE Reconnecting_Daemon_Client SHALL 在任意时刻最多保留 1 个活跃 backoff timer，即 `getActiveBackoffTimerCount() ≤ 1`。
6. WHEN `Reconnecting_Daemon_Client.dispose()` 被调用，THE Reconnecting_Daemon_Client SHALL 清除所有 backoff timer，使 `getActiveBackoffTimerCount() === 0`，并使后续 `postEvent` 调用直接返回 `{ ok: false, dropped: true, reason: "disposed" }`。
7. THE sf_specforge 插件 SHALL 同时被 OpenCode TUI 进程与 opencode-server 进程加载，使所有 LLM 调用路径产生的事件流都能流到 daemon（承接父 spec Property 1 SoT）。
8. THE Reconnecting_Daemon_Client `postEvent` 方法 SHALL 不抛出异常，所有错误以 `PostResult` 返回值形式表达。

### Requirement 6: CLI 子命令与 JSON 输出契约

**User Story:** 作为 CLI 用户与脚本作者，I want service 子命令同时支持人类可读模式与 `--json` 模式，so that 我可以在交互终端使用同时也能在自动化脚本中安全解析。

#### Acceptance Criteria

1. THE specforge CLI SHALL 提供 `specforge services {install, uninstall, start, stop, restart, status}` 六个子命令，全部支持 `--json` flag。
2. THE specforge CLI SHALL 提供 `specforge daemon {install-service, uninstall-service, start, stop, restart, status}` 与 `specforge opencode-server {install-service, uninstall-service, start, stop, restart, status}` 两组单服务子命令，全部支持 `--json` flag（与 `services` 多服务命令共享底层实现）。
3. WHEN 调用 `specforge services status --json`，THE specforge CLI SHALL 输出符合 `ServicesStatusJsonPayload` schema 的 JSON，含 `schema_version: "1.0"` / `services` 数组 / `overallExitCode` 三个顶层字段。
4. THE `services[]` 数组中每个元素 SHALL 含 `name` / `state` / `pid` / `port` / `uptimeSec` / `activeClients` / `lastError` 七个字段，未知值用 `null`。
5. THE `overallExitCode` SHALL 在所有服务均 `running` 时为 `0`，任一服务非 `running` 时为 `1`，任一服务 `uninstalled` 时为 `2`。
6. WHEN `specforge services stop` 被调用且未指定 `--timeout`，THE specforge CLI SHALL 使用配置项 `service_management.stop_timeout_sec` 作为停机超时（默认 `10` 秒）。
7. THE specforge CLI 的退出码语义 SHALL 与 cli spec Property 17/18 一致：成功 `0`，业务失败 `1`，环境 / 输入错误 `2`。

### Requirement 7: 环境预检

**User Story:** 作为 SpecForge 用户，I want 在 install 之前知道当前机器是否满足前置条件以及如何修复缺失项，so that 我可以一次性把环境调整到位而不是在执行中途撞墙。

#### Acceptance Criteria

1. THE Service_Manager `precheckEnvironment()` SHALL 返回 `EnvironmentPrecheck` 含 `schema_version: "1.0"` / `platform` 字段以及 `blockers` 与 `warnings` 两个数组。
2. WHILE 平台是 Linux 且 `systemctl --user list-units` 调用失败，THE Service_Manager SHALL 在 `blockers` 中追加 `code = "SYSTEMD_NOT_AVAILABLE"`，在 `message` 中说明不支持 WSL1 / Alpine 等非 systemd 发行版，并附 `suggestion`。
3. WHILE 平台是 Linux 且 `loginctl show-user $USER` 输出 `Linger=no`，THE Service_Manager SHALL 在 `warnings`（不在 `blockers`）中追加 `code = "LINGER_NOT_ENABLED"`，在 `suggestion` 中提示运行 `loginctl enable-linger $USER`。
4. WHILE 平台是 Windows 且 `~/.specforge/bin/nssm.exe` 文件不存在且 PATH 中也找不到 nssm，THE Service_Manager SHALL 在 `blockers` 中追加 `code = "NSSM_NOT_FOUND"`，并附部署指引。
5. WHILE 平台是 Windows 且当前进程未以 Administrator 权限运行（仅在 install / uninstall 操作前检查），THE Service_Manager SHALL 在 `blockers` 中追加 `code = "NOT_ELEVATED"`。
6. IF `EnvironmentPrecheck.blockers` 非空，THEN THE Service_Lifecycle_Orchestrator SHALL 拒绝执行 install / uninstall，并以退出码 `2` 返回。
7. WHILE 平台是 Windows，THE Service_Manager SHALL 在 V6.1 范围内允许以 LocalSystem 身份注册服务作为 fallback（不强制切到当前用户），并在选择 fallback 时输出 warning `code = "SVC_NSSM_REQUIRES_USER_PASSWORD"`。

### Requirement 8: 默认配置与配置项

**User Story:** 作为 SpecForge 用户，I want service-management 在默认配置下安全可用且不开启远程访问，so that 安装即可用而不会意外暴露任何网络面。

#### Acceptance Criteria

1. THE configuration spec 默认 yaml SHALL 包含 `service_management` 配置段，含 `schema_version: "1.0"`。
2. THE `service_management.auto_enable_at_boot` SHALL 默认为 `true`（用户级，无害）。
3. THE `service_management.stop_timeout_sec` SHALL 默认为 `10`，与 systemd `TimeoutStopSec` 及 NSSM `AppStopMethodConsole` 配置一致。
4. THE `service_management.plugin_reconnect_max_sec` SHALL 默认为 `60`，对应 Reconnecting_Daemon_Client 累计退避上限。
5. THE `service_management.plugin_reconnect_initial_sec` SHALL 默认为 `1`，THE `service_management.plugin_reconnect_backoff_factor` SHALL 默认为 `2.0`。
6. THE service_management 默认配置 SHALL 不含任何启用远程访问的字段，远程访问启停由 permission-engine spec Property 26 控制（承接关系，不在本 spec 实现）。

### Requirement 9: 服务生命周期事件

**User Story:** 作为 SpecForge 观测者，I want 每次服务 install/start/stop/uninstall 都在 events.jsonl 留下结构化事件，so that 我可以审计与调试服务级别的状态变更。

#### Acceptance Criteria

1. WHEN 服务进入 `running` 状态，THE Service_Lifecycle_Orchestrator SHALL 写入 `action = "service.started"` 事件到 events.jsonl，payload 含 `serviceName` 与 `pid`。
2. WHEN 服务进入 `stopped` 状态，THE Service_Lifecycle_Orchestrator SHALL 写入 `action = "service.stopped"` 事件到 events.jsonl，payload 含 `serviceName` 与 `exitCode`。
3. WHEN 服务进入 `installed` / `uninstalled` 状态，THE Service_Lifecycle_Orchestrator SHALL 写入 `action = "service.installed"` 或 `service.uninstalled"` 事件，payload 含 `serviceName`。
4. WHEN 服务进入 `failed` 状态，THE Service_Lifecycle_Orchestrator SHALL 写入 `action = "service.failed"` 事件，payload 含 `serviceName` / `exitCode` / `reason`。
5. THE 服务生命周期事件 SHALL 使用机器级伪 `projectId = "__machine__"`，与任何真实项目数据完全隔离（承接父 spec Property 22 Project Isolation）。
6. THE 服务生命周期事件 SHALL 完全遵守父 spec Property 30 Event Schema，含 `schema_version: "1.0"` / `eventId` / `ts` / `projectId` / `action` / `payload` / `metadata.source = "service-management"`。

### Requirement 10: 错误码与诊断

**User Story:** 作为 SpecForge 用户，I want 服务管理失败时能拿到结构化的错误码、根因描述与可执行的修复建议，so that 我不需要逐项查日志就能修复问题。

#### Acceptance Criteria

1. WHEN install / uninstall / start / stop 失败，THE Service_Manager SHALL 抛出包含 `code` / `message` / `suggestion` 三件套的错误，对应文档 §Error Handling 错误码表。
2. THE 错误码集合 SHALL 至少包含：`SVC_SYSTEMD_NOT_AVAILABLE` / `SVC_LINGER_NOT_ENABLED` / `SVC_NSSM_NOT_FOUND` / `SVC_NOT_ELEVATED` / `SVC_BINARY_MISSING` / `SVC_PORT_IN_USE` / `SVC_OPENCODE_SERVER_BINARY_MISSING` / `SVC_DEPENDENCY_NOT_RUNNING` / `SVC_GRACEFUL_TIMEOUT` / `SVC_INSTALL_ROLLBACK_FAILED` / `SVC_HEALTH_CHECK_FAILED` / `SVC_NSSM_REQUIRES_USER_PASSWORD` / `SVC_AUTO_RECONNECT_GAVE_UP` 十三个。
3. WHEN start 后健康检查在 `5` 秒内未通过，THE Service_Manager SHALL 抛出 `SVC_HEALTH_CHECK_FAILED`，`suggestion` 中含日志路径 `~/.specforge/logs/<svc>.err`。
4. WHEN handshake.json 中的 daemon 端口已被其他进程占用，THE Service_Manager SHALL 抛出 `SVC_PORT_IN_USE` 并建议运行 `specforge daemon status`。
5. THE Service_Manager 的所有 `child_process.spawn` 调用 SHALL 设置默认 `30` 秒超时（lessons C2/C3），超时后清理子进程并以 `SVC_GRACEFUL_TIMEOUT` 或 `SVC_HEALTH_CHECK_FAILED` 形式向上返回。

### Requirement 11: 安全边界

**User Story:** 作为 SpecForge 安全审计者，I want 服务化引入的额外攻击面被收敛在用户级、明确的边界内，so that 服务管理不会扩大持续 root / Administrator 权限或开放任何网络面。

#### Acceptance Criteria

1. THE Service_Manager Linux 实现 SHALL 仅写入 `~/.config/systemd/user/` 路径，不写入 `/etc/systemd/system/` 或任何系统级路径。
2. THE Service_Manager Windows 实现 SHALL 仅在 install / uninstall 操作时一次性需要 Administrator 权限，运行时不需要持续提权。
3. THE handshake.json 文件 SHALL 维持权限 `0600`（POSIX）/ ACL 仅当前用户可读（Windows），daemon 启动时无条件以这个权限创建。
4. THE Service_Manager SHALL 不在日志或事件 payload 中明文记录 handshake.json 中的 `token` 字段。
5. THE service-management 默认配置 SHALL 不开启远程访问；任何远程暴露由 permission-engine spec Property 26 与 configuration spec 的显式开关控制。
6. WHEN 升级流程触发 stop → 替换二进制 → start 周期，THE Service_Lifecycle_Orchestrator 配合 daemon Graceful_Shutdown_Handler SHALL 使该周期不出现"半开半关"的不一致状态：每个时刻服务要么完整 running，要么完整 stopped/uninstalled，没有中间 HTTP 部分可达的窗口。

### Requirement 12: 跨平台行为对等

**User Story:** 作为 SpecForge 跨平台用户，I want 同一条命令序列在 Linux 与 Windows 上观察到的状态序列等价，so that 我的脚本与文档可以无差别迁移。

#### Acceptance Criteria

1. THE Service_Manager Linux 与 Windows 实现 SHALL 暴露完全相同的 `ServiceManager` 接口签名（含 `install` / `uninstall` / `start` / `stop` / `restart` / `status` / `precheckEnvironment` / `dispose` 八个方法）。
2. WHEN 同一条 `(install, start, stop, uninstall)` 命令序列在 Linux 与 Windows 平台执行，THE Service_Manager SHALL 在每条命令完成后产生等价的 `ServiceState` 序列（即 `uninstalled → stopped → starting → running → stopping → stopped → uninstalled`）。
3. THE Service_Manager `restart` 命令 SHALL 在 Linux 上等价于"先 stop 后 start"语义，在 Windows 上若 NSSM ≥ 6.0 使用内置 restart 命令，否则等价于"先 stop 后 start"。
4. THE Service_Manager 错误码 SHALL 在 Linux 与 Windows 上保持同一集合，平台特有错误（`SYSTEMD_NOT_AVAILABLE` / `LINGER_NOT_ENABLED` / `NSSM_NOT_FOUND` / `NOT_ELEVATED`）以平台无关的 `EnvironmentPrecheck` 字段区分。

---

## Correctness Properties

> *A property is a characteristic or behavior that should hold true across all valid executions of a system. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

本节列出本 spec 自有的 3 条可执行属性。Property 编号 1/2/4 与 design.md `§Correctness Properties` 严格对应（编号跳过 3 是有意的：design 中原 Property 3"跨平台行为等价"经反思后降级为 INTEGRATION 测试，对应 Requirement 12，不再以 PBT 形式表达）。

### Property 1: Startup Order Preservation

*For all* 服务集合 `S = {opencode-server, specforge-daemon}` 与依赖图 `G = {daemon → opencode-server}`，对**任意**调用序列 `σ ∈ Sequence({install, start, stop, restart, uninstall} × S × T)`（`T` 是时间间隔），在每个观察时刻 `t` 满足以下两条蕴含式：

```
state(daemon, t) === "running"  ⟹  ∃ ε ≥ 0, state(server, t-ε) === "running"
state(server, t) === "stopped"  ⟹  ∃ ε ≥ 0, state(daemon, t-ε) ∈ {"stopped", "uninstalled"}
```

即：`specforge-daemon` 进入 running 不早于 `opencode-server` 进入 running；`opencode-server` 离开 running 不早于 `specforge-daemon` 离开 running。

**Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.5**

### Property 2: Idempotent Operations

*For all* 命令序列 `σ` 与目标态命令 `c ∈ {install, uninstall, start, stop}` 与服务 `s ∈ S` 与重复次数 `N ∈ [1, 10]`：

```
finalState(σ ++ [c(s)] × N)  ===  finalState(σ ++ [c(s)])
```

即：在 `σ` 之后连续执行 `c(s)` N 次与执行一次得到相同的最终 `ServiceStatus`（除 `startedAt` 等观测字段外 byte-equal）。`restart` 不在幂等命令集合内（仅保证执行后状态收敛到 `running`，不保证多次 restart 等价于一次）。

**Validates: Requirements 1.8, 2.6, 2.7**

### Property 4: Graceful Shutdown No Event Loss

*For all* daemon 收到停机信号的时刻 `t_stop`，对**任意**已被 daemon 通过 HTTP 2xx ack 给客户端的事件 `e`（`e.ts < t_stop`），关停完成后 events.jsonl 中存在 `e`：

```
∀ e: ack(e, t_e) ∧ t_e < t_stop  ⟹  e ∈ readEventsJsonl(t_stop + shutdownDuration)
```

即：daemon 必须在 graceful shutdown 期间把所有已 ack 的事件刷盘，不丢失任何已承诺持久化的事件。本属性与父 spec Property 7 (WAL Ordering) 正交：父 Property 保证写入顺序，本 Property 保证关停时已 ack 的不丢。

**Validates: Requirements 3.1, 3.2, 3.5**

### PBT 配置约束

- **库**：`fast-check`（与项目既有 PBT 一致）
- **迭代次数**：每条 Property 测试 ≥ 100 次
- **测试落点**：`packages/service-management/tests/property/`
- **Tag 格式**：`Feature: service-management, Property {n}: {text}`
- **Property 4 额外注**：`Derived-From: v6-architecture-overview Property 7 (extension)`

### Property Reflection（去冗余声明）

| Property | 量词空间 | 与父规范关系 | 与本 spec 其他 Property 关系 |
|---|---|---|---|
| Property 1（启动顺序） | 命令序列 × 时间步 | 本 spec 自有 | 与 Property 2 量词空间正交 |
| Property 2（幂等性） | 命令序列 × 重复次数 | 本 spec 自有 | 与 Property 1 量词空间正交 |
| Property 4（关停不丢事件） | 事件流 × SIGTERM 时刻 | 父 Property 7 的关停延伸 | 量词空间独立 |

三条 PBT 量词空间互不重叠，无冗余。原候选 Property 3（跨平台行为等价）已降级为 INTEGRATION 测试（对应 Requirement 12）；候选"插件重连不抛出"已降级为 EXAMPLE 测试（对应 Requirement 5）。

---

## Inherited Properties from Parent Spec

本 spec 必须保持承接以下来自 [v6-architecture-overview](../v6-architecture-overview/requirements.md) 的 properties。本 spec **不重复实现**它们的 PBT，仅保证设计与实现不破坏其约束。

### Inherited Property 1: Single Source of Truth (SoT)

**承接位置**：本 spec Requirement 5.1（删除插件 spawn）+ 5.7（TUI 与 opencode-server 双进程加载插件）+ Requirement 4（daemon 删除 30s idle exit）+ Requirement 9.5（机器级伪 projectId）。

**约束**：所有客户端（TUI、CLI、Telegram bot、Web UI）必须通过 daemon 的 HTTP API 写状态。本 spec 不引入任何旁路写入路径。daemon 是 OS 服务的机器级单例（systemd / NSSM 都保证只有一个实例）。

### Inherited Property 22: Project Isolation

**承接位置**：本 spec Requirement 9.5（服务事件使用机器级伪 projectId `__machine__`）。

**约束**：服务是机器级的，但项目数据是项目级的。本 spec 不引入任何机器级数据写入路径——所有项目数据仍然通过 daemon HTTP API 写入项目级 events.jsonl / state.json，由 daemon-core 的 per-project lock 保证隔离。

### Inherited Property 30: Event Schema

**承接位置**：本 spec Requirement 9.6（服务生命周期事件遵守父 Event Schema）。

**约束**：服务生命周期事件（`service.started` / `service.stopped` / `service.installed` / `service.uninstalled` / `service.failed`）由 daemon 写入 events.jsonl，事件 schema 完全遵守父规范，含 `schema_version: "1.0"` / `eventId` / `ts` / `projectId` / `action` / `payload` / `metadata.schemaVersion: "1.0"` / `metadata.source: "service-management"`。

---

## References

- 父规范：[v6-architecture-overview](../v6-architecture-overview/)
- 设计文档：[design.md](./design.md)
- 上游 spec：[daemon-core](../daemon-core/)（修改 REQ-1.3/1.4/1.5）
- 上游 spec：[cli](../cli/)（新增 service 子命令）
- 上游 spec：[configuration](../configuration/)（新增 service_management config 段）
- 上游 spec：[permission-engine](../permission-engine/)（远程访问鉴权 Property 26）
- 上游 spec：[distribution](../distribution/)（NSSM bundling 与 `specforge upgrade`）
- 工程经验：`docs/engineering-lessons/universal/async-resource-lifecycle.md`
- 工程经验：`docs/engineering-lessons/universal/javascript-explicit-resource-management.md`
- ADR 列表：design.md §"关键设计决策"（ADR-SM-001 ~ ADR-SM-015）
