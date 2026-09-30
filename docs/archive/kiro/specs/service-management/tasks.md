# Implementation Plan: Service Management（W6.1）

## Overview

按 design.md 的 "Components and Interfaces / Data Models / Cross-platform Implementation Matrix / Algorithmic Pseudocode / Correctness Properties / Testing Strategy" 各节，把 service-management 模块拆成 11 个 Phase 共 13 个顶层任务。所有源码落在 `packages/service-management/src/`、daemon-core 联动在 `packages/daemon-core/src/`、CLI 命令在 `packages/cli/src/commands/`、插件改造在 `.opencode/plugins/sf_specforge.ts`，spec 目录只放文档。包管理器统一用 bun，所有 JSON/YAML 持久化文件带 `schema_version: "1.0"`，所有持有异步资源的类（ServiceManager 实现、ServiceLifecycleOrchestrator、GracefulShutdownHandler、ReconnectingDaemonClient）实现 `Disposable` + `Symbol.asyncDispose` + `getActive*Count()` 自检 API + CARU 四阶段；构造器仅赋值字段，spawn / 注册信号 / 启 timer 必须在显式 `start()` / `attachToProcess()` 中（lessons-injected JS1/JS2/JS3）；测试 `afterEach` 必须断言所有自检计数器归零（T1）；任何 `Promise.race` 在 `finally` 中 `clearTimeout` 败者（C1）。

实现语言：**TypeScript**（design.md 已用 TS interface 定义所有契约；伪代码部分仅用于描述算法不变量）。

> Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

**Parent Specification**：[v6-architecture-overview](../v6-architecture-overview/)
**Wave**：V6.1
**Scope**：**P0**

**承接的 Correctness Properties**（来自父 spec / 本 spec）：
- Inherited Property 1: Single Source of Truth（不破坏，承接位置见 requirements.md "Inherited Properties from Parent Spec"）
- Inherited Property 22: Project Isolation（机器级伪 projectId `__machine__` 隔离）
- Inherited Property 30: Event Schema（服务生命周期事件遵守父 schema）
- Property 1: Startup Order Preservation（本 spec 自有 PBT）
- Property 2: Idempotent Operations（本 spec 自有 PBT）
- Property 4: Graceful Shutdown No Event Loss（本 spec 自有 PBT，承接父 Property 7 的关停延伸）

## Tasks

- [x] 1. Phase 1：包骨架、类型与错误码
  - [x] 1.1 创建 `packages/service-management/` 包骨架：`package.json`（含 `schema_version: "1.0"`、`workspace:*` 协议依赖 daemon-core / configuration / cli 的共享类型、devDep 含 `fast-check`、`proper-lockfile`）、`tsconfig.json`（继承根配置、`outDir: dist`）、`vitest.config.ts`（**必含** `testTimeout: 10000` / `hookTimeout: 5000` / `teardownTimeout: 3000` / `pool: 'forks'`，并在文件顶部加注释指引"卡死时临时启用 `--reporter=hanging-process`"）、`README.md`、`src/index.ts` 桶式导出占位
    - 文件：`packages/service-management/package.json`、`packages/service-management/tsconfig.json`、`packages/service-management/vitest.config.ts`、`packages/service-management/README.md`、`packages/service-management/src/index.ts`
    - 在根 `package.json` 的 `workspaces` 中注册新包路径
    - _Requirements: 1.1（项目结构基础）_
  - [x] 1.2 定义共享类型在 `packages/service-management/src/types/`：拆分为 `service-state.ts`（封闭枚举 `ServiceState`）、`service-install-spec.ts`（`ServiceInstallSpec` 含 11 字段）、`service-status.ts`（`ServiceStatus` 含 `schema_version: "1.0"`）、`service-unit-metadata.ts`（`ServiceUnitMetadata` 含 6 字段）、`environment-precheck.ts`（`EnvironmentPrecheck` + `PrecheckIssue` 封闭 `code` 枚举含 `PLATFORM_NOT_SUPPORTED`/`SYSTEMD_NOT_AVAILABLE`/`LINGER_NOT_ENABLED`/`NSSM_NOT_FOUND`/`NOT_ELEVATED`/`PORT_IN_USE`/`BINARY_MISSING`/`OPENCODE_SERVER_BINARY_MISSING`/`WORKING_DIR_MISSING`/`SVC_NSSM_REQUIRES_USER_PASSWORD`）、`orchestration-result.ts`（`OrchestrationResult` + `Map<string, ServiceStatus>` 序列化辅助）、`nssm-command.ts`（`NssmCommand`）、`shutdown.ts`（`ShutdownTask` / `ShutdownPriority` 封闭枚举）、`handshake.ts`（**扩展** `HandshakeFile` 含 7 字段：`schema_version` / `pid` / `port` / `token` / `startedAt` / `version` / `serviceMode`）、`healthcheck.ts`（`HealthCheckResponse` 含 9 字段）、`status-json-payload.ts`（`ServicesStatusJsonPayload` + `overallExitCode: 0|1|2`）；通过 `src/types/index.ts` 桶式导出
    - 文件：`packages/service-management/src/types/*.ts`、`packages/service-management/src/types/index.ts`
    - _Requirements: 1.6, 4.4, 4.5, 6.3, 6.4, 7.1, 7.4, 9.6_
  - [x] 1.3 实现错误码与错误工厂在 `packages/service-management/src/errors/`：定义 `ErrorCode` 封闭枚举严格包含 13 条（`SVC_SYSTEMD_NOT_AVAILABLE` / `SVC_LINGER_NOT_ENABLED` / `SVC_NSSM_NOT_FOUND` / `SVC_NOT_ELEVATED` / `SVC_BINARY_MISSING` / `SVC_PORT_IN_USE` / `SVC_OPENCODE_SERVER_BINARY_MISSING` / `SVC_DEPENDENCY_NOT_RUNNING` / `SVC_GRACEFUL_TIMEOUT` / `SVC_INSTALL_ROLLBACK_FAILED` / `SVC_HEALTH_CHECK_FAILED` / `SVC_NSSM_REQUIRES_USER_PASSWORD` / `SVC_AUTO_RECONNECT_GAVE_UP`），每个错误抛出时携带 `{ code, message, suggestion }` 三件套；`ErrorCode → exitCode` 映射表（环境/输入错误 = 2、业务失败 = 1、warning-only = 0）；提供 `createServiceError(code, ctx)` 工厂；超时错误必须含 `operation` / `timeoutMs` / `attempts` / `lastError` / `suggestion`（lessons-injected C3）
    - 文件：`packages/service-management/src/errors/error-codes.ts`、`packages/service-management/src/errors/service-error.ts`、`packages/service-management/src/errors/exit-code-map.ts`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 2. Phase 2：ServiceUnitGenerator（systemd unit 文件 + NSSM 命令序列）
  - [x] 2.1 实现 `ServiceUnitGenerator` 接口与默认实现：`generateSystemdUnit(spec)` 渲染 systemd unit 文件文本（首行起含 6 字段 metadata 注释块：`schema_version: 1.0` / `generated-by` / `generated-at` / `specforge-version` / `service-name` / `binary-path`，分隔 `=== END METADATA ===` 行；`[Unit]` 段含 `Wants=` / `After=` 弱依赖；`[Service]` 段含 `ExecStart=`/`Restart=on-failure`/`RestartSec=5s`/`KillSignal=SIGTERM`/`TimeoutStopSec=10`/`StandardOutput=append:<path>`/`StandardError=append:<path>`/`Environment=`；`[Install]` 段 `WantedBy=default.target`），`generateNssmCommands(spec, nssmExePath)` 返回幂等 `NssmCommand[]` 序列（含 `install`/`set AppDirectory`/`set AppEnvironmentExtra`/`set Start SERVICE_AUTO_START`/`set DependOnService`/`set AppStdout`/`set AppStderr`/`set AppExit Default Restart`/`set AppRestartDelay 5000`/`set AppStopMethodSkip 0`），`parseMetadata(unitContent)` 解析顶部注释返回 `ServiceUnitMetadata | null`（损坏则 null）；**always-rewrite** 策略，不做 in-place patch
    - 文件：`packages/service-management/src/unit-generator/service-unit-generator.ts`、`packages/service-management/src/unit-generator/default-impl.ts`、`packages/service-management/src/unit-generator/index.ts`
    - _Requirements: 1.6, 2.3, 2.4_
  - [x]* 2.2 编写 `service-unit-generator` 单元测试：覆盖 systemd unit 文件渲染（含 metadata 6 字段断言、`Wants=`/`After=`/`KillSignal=SIGTERM`/`TimeoutStopSec=10`/`StandardOutput=append:` 字面量出现）、NSSM 命令序列（每条命令 `subcommand`/`args`/`allowFailure` 字段完整、依赖声明 `DependOnService` 出现）、`parseMetadata` 在 `"# === GENERATED BY..."` 完整块、缺字段、损坏块三种情况下的返回；幂等性（同 spec 渲染两次结果 byte-equal）
    - 文件：`packages/service-management/tests/unit/service-unit-generator.test.ts`
    - _Requirements: 1.6, 2.3, 2.4_

- [x] 3. Phase 3：跨平台 ServiceManager（systemd / NSSM 实现 + precheck）
  - [x] 3.1 实现 `ServiceManager` 接口（`packages/service-management/src/service-manager/service-manager.ts`）+ `SystemdServiceManager`（Linux）：`install` / `uninstall` / `start` / `stop` / `restart` / `status` / `precheckEnvironment` / `dispose` 八方法签名；`SystemdServiceManager.install` 走 atomic write（tmp + rename）+ `systemctl --user daemon-reload` + 可选 `enable`，失败时回滚已写 unit 文件并 daemon-reload；`status` 解析 `systemctl --user is-active <name>` + `systemctl --user show <name> --property=MainPID,ActiveState,SubState,ExecMainStartTimestamp` 映射到 `ServiceState`；所有 `child_process.spawn` 调用强制 30s 超时（lessons-injected C2/C3），超时 → `SVC_GRACEFUL_TIMEOUT`；`precheckEnvironment` 检查 `systemctl --user list-units` 是否可用（不可用追加 `SYSTEMD_NOT_AVAILABLE` blocker）、`loginctl show-user $USER | grep Linger=yes`（缺失追加 `LINGER_NOT_ENABLED` warning）；构造器无副作用（lessons-injected JS1）；实现 `Disposable` + `Symbol.asyncDispose`
    - 文件：`packages/service-management/src/service-manager/service-manager.ts`、`packages/service-management/src/service-manager/systemd-service-manager.ts`
    - _Requirements: 1.1, 1.2, 1.5, 1.7, 1.8, 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 7.1, 7.2, 7.3, 7.6, 10.5, 11.1, 12.1_
  - [x] 3.2 实现 `NssmServiceManager`（Windows）：通过 `child_process.spawn` 调用 `~/.specforge/bin/nssm.exe`（路径来自 PathResolver；缺失则 `SVC_NSSM_NOT_FOUND` blocker），按 design.md "Cross-platform Implementation Matrix" 实现 install/uninstall/start/stop/restart/status；`status` 解析 `nssm status <name>` + `nssm dump <name>`；`precheckEnvironment` 检查 elevated 运行（缺失则 `NOT_ELEVATED` blocker，仅 install/uninstall 前必检）、NSSM 二进制存在性、当前用户名；V6.1 接受 LocalSystem 作为 fallback，选择 fallback 时输出 `SVC_NSSM_REQUIRES_USER_PASSWORD` warning；`restart` 在 NSSM ≥ 6.0 用内置，否则 stop+start 等价语义；所有命令 30s 超时；构造器无副作用；实现 `Disposable` + `Symbol.asyncDispose`
    - 文件：`packages/service-management/src/service-manager/nssm-service-manager.ts`
    - _Requirements: 1.1, 1.3, 1.5, 1.7, 1.8, 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 7.1, 7.4, 7.5, 7.7, 10.5, 11.2, 12.1, 12.3_
  - [x] 3.3 实现 `precheckEnvironment` 平台分发与 macOS 拒绝：`packages/service-management/src/service-manager/precheck.ts` 暴露 `runPrecheck(platform)`，`process.platform === "darwin"` 直接返回 `EnvironmentPrecheck` 含 `blockers` 包含 `code: "PLATFORM_NOT_SUPPORTED"` + suggestion；`win32` → 调用 `NssmServiceManager.precheckEnvironment`；`linux` → 调用 `SystemdServiceManager.precheckEnvironment`；返回值 `schema_version: "1.0"`、阻塞性 issue 进 `blockers`、非阻塞进 `warnings`
    - 文件：`packages/service-management/src/service-manager/precheck.ts`
    - _Requirements: 1.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  - [x] 3.4 实现 `createServiceManager(platform, opts)` 工厂在 `packages/service-management/src/service-manager/factory.ts`：按 `process.platform` 返回对应实现（darwin → 抛 `createServiceError("PLATFORM_NOT_SUPPORTED")`，win32 → `NssmServiceManager`，linux → `SystemdServiceManager`）；接受 `binDir` / `unitDir` 等配置注入
    - 文件：`packages/service-management/src/service-manager/factory.ts`、`packages/service-management/src/service-manager/index.ts`
    - _Requirements: 1.4, 12.1_
  - [x]* 3.5 编写 `systemd-service-manager` 单元测试：mock `child_process.spawn` 返回各种 systemctl/loginctl 输出，覆盖 install/uninstall/start/stop/status 路径、回滚（atomic write 失败、daemon-reload 失败两种）、`is-active` 三态（active/inactive/failed）映射到 `ServiceState`、precheck `SYSTEMD_NOT_AVAILABLE` blocker 与 `LINGER_NOT_ENABLED` warning、30s spawn 超时触发 `SVC_GRACEFUL_TIMEOUT`、`afterEach` 断言无残留 timer
    - 文件：`packages/service-management/tests/unit/systemd-service-manager.test.ts`
    - _Requirements: 1.1, 1.2, 1.5, 1.7, 1.8, 7.2, 7.3, 7.6, 10.5_
  - [x]* 3.6 编写 `nssm-service-manager` 单元测试：mock NSSM CLI 调用，覆盖 install（含 admin 检查）/ uninstall / start / stop / restart / status，`nssm dump` 解析、依赖声明 `DependOnService`、LocalSystem fallback 触发 `SVC_NSSM_REQUIRES_USER_PASSWORD` warning、`NSSM_NOT_FOUND` blocker
    - 文件：`packages/service-management/tests/unit/nssm-service-manager.test.ts`
    - _Requirements: 1.1, 1.3, 1.5, 7.4, 7.5, 7.7, 12.3_
  - [x]* 3.7 编写 `precheck` 单元测试：覆盖 `darwin` 平台立即拒绝（`PLATFORM_NOT_SUPPORTED`）、Linux/Windows 分发正确、`schema_version: "1.0"` 字段存在、`blockers`/`warnings` 数组结构
    - 文件：`packages/service-management/tests/unit/precheck.test.ts`
    - _Requirements: 1.4, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 4. Phase 4：ServiceLifecycleOrchestrator + HealthCheck + 生命周期事件
  - [x] 4.1 实现 `ServiceLifecycleOrchestrator`（`packages/service-management/src/orchestrator/service-lifecycle-orchestrator.ts`）：`installAll` / `startAll` / `stopAll` / `uninstallAll` / `statusAll` 五方法 + `dispose`；`startAll` 按依赖图 `G = {specforge-daemon → opencode-server}` 拓扑排序，前驱进入 `running` 后启动后继；`stopAll` 反向顺序；`installAll` 失败时反向卸载已注册服务并填充 `OrchestrationResult.rolledBack`；no-op 检测（已 installed 再 install / 已 running 再 start / 已 stopped 再 stop 均返回退出码 0）；构造器无副作用；实现 `Disposable` + `Symbol.asyncDispose`；`getActivePendingOpCount()` 自检 API
    - 文件：`packages/service-management/src/orchestrator/service-lifecycle-orchestrator.ts`、`packages/service-management/src/orchestrator/index.ts`
    - _Requirements: 1.1, 1.5, 1.7, 1.8, 2.1, 2.2, 2.6, 2.7, 12.2_
  - [x] 4.2 实现 daemon HealthCheck 等待逻辑（`packages/service-management/src/orchestrator/healthcheck.ts`）：`waitForHealthy(serviceName, timeoutMs)` 在 daemon 启动后 5 秒 deadline 内轮询 `GET http://127.0.0.1:<port>/api/v1/healthz`（port/token 来自 handshake.json）；失败抛 `SVC_HEALTH_CHECK_FAILED`，suggestion 含日志路径；轮询用 `setTimeout(500ms)` 但**外层 deadline 兜底**（lessons-injected C2，已知有限轮询）；`Promise.race` 的败者 timer 在 finally 中 clearTimeout（C1）；`opencode-server` 的健康检查走 `http://127.0.0.1:4096/`（status < 500 即视为 ready）
    - 文件：`packages/service-management/src/orchestrator/healthcheck.ts`
    - _Requirements: 2.1, 2.5, 10.3_
  - [x] 4.3 实现服务生命周期事件发射（`packages/service-management/src/orchestrator/lifecycle-events.ts`）：`emitServiceEvent(action, payload)` 通过 daemon HTTP `POST /api/v1/ingest/event` 写入 events.jsonl，事件 `schema_version: "1.0"` / `eventId: <UUIDv7>` / `ts` / `projectId: "__machine__"` / `action ∈ {service.started, service.stopped, service.installed, service.uninstalled, service.failed}` / `payload` / `metadata.schemaVersion: "1.0"` / `metadata.source: "service-management"`；`installAll` / `startAll` / `stopAll` / `uninstallAll` 在状态转换点（installed/uninstalled/started/stopped/failed）调用 emit；token 字段不写入日志/事件 payload（Req 11.4）
    - 文件：`packages/service-management/src/orchestrator/lifecycle-events.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 11.4_
  - [x]* 4.4 编写 `service-lifecycle-orchestrator` 单元测试：mock `ServiceManager` 接口，覆盖 `startAll` 拓扑顺序（验证 daemon 在 server `running` 后才 start）、`stopAll` 反向顺序、`installAll` 失败回滚（中途某服务 install 抛错 → 已 install 服务被反向 uninstall 进 `rolledBack`）、no-op 路径（已 running 再 start 退出 0）、`SVC_DEPENDENCY_NOT_RUNNING`（在 daemon 启动时检测 server 未 running）、超时；`afterEach` 断言 `getActivePendingOpCount() === 0`
    - 文件：`packages/service-management/tests/unit/service-lifecycle-orchestrator.test.ts`
    - _Requirements: 1.1, 1.5, 1.8, 2.1, 2.2, 2.5, 2.6, 2.7_

- [x] 5. Checkpoint - ServiceManager + Orchestrator 已完成
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Phase 5：GracefulShutdownHandler + daemon-core 联动（删除 idle exit / `--detach`，扩展 handshake，新增 healthz）
  - [x] 6.1 实现 `GracefulShutdownHandler`（`packages/service-management/src/shutdown/graceful-shutdown-handler.ts`）：`AsyncDisposable` 接口；`attachToProcess()` 注册 `SIGTERM` / `SIGINT` / `SERVICE_CONTROL_STOP`（Windows 等价）信号；`register(name, task, priority)` 登记 `ShutdownTask` 按 `ShutdownPriority`（`stop-accepting` → `drain` → `flush` → `close` → `release`）顺序；`trigger(reason)` 按优先级顺序执行，**同 priority 内反向注册顺序并行**，单 task 默认 3s 超时（warning 但继续），总停机默认 10s 超时（超时 → `process.exit(1)`，OS 后续 `SIGKILL`）；幂等（`isShuttingDown()` 已 true 直接返回）；`Promise.race` 败者 timer 在 finally 中 clearTimeout（C1）；构造器无副作用；提供 `getActiveTaskCount()` / `getActiveTimerCount()` 自检 API
    - 文件：`packages/service-management/src/shutdown/graceful-shutdown-handler.ts`、`packages/service-management/src/shutdown/index.ts`
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 6.2 daemon-core 联动 1（删除 idle exit + `--detach` + 接入 GSH）：在 `packages/daemon-core/src/` 中**删除**"30 秒空闲自动退出"实现（原 daemon-core REQ-1.4）与 `--detach` flag 解析（原 REQ-1.5）；daemon CLI 改为以前台模式（`--foreground`）运行；在 daemon 启动早期实例化 `GracefulShutdownHandler`、注册 HTTP server stop-accepting / Event Bus drain / events.jsonl flush+fsync / SSE 关闭 / Disposable 资源 dispose 各阶段任务；保证已 ack（HTTP 2xx 已返回客户端）的事件在退出前 fsync 到 events.jsonl
    - 文件：`packages/daemon-core/src/`（按现状定位 idle-exit、detach flag、startup hook 接入点）
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_
  - [x] 6.3 daemon-core 联动 2（扩展 handshake.json + `GET /api/v1/healthz`）：扩展 `~/.specforge/runtime/handshake.json` 写入路径以新增 4 字段 `schema_version: "1.0"` / `startedAt`（epoch ms）/ `version`（daemon 版本字符串）/ `serviceMode`（boolean，由启动参数或环境变量 `SPECFORGE_RUN_MODE=service` 决定），文件权限保持 `0600`；新增 HTTP endpoint `GET /api/v1/healthz` 响应 `HealthCheckResponse` 9 字段（`schema_version`/`status` ∈ `ok|degraded|shutting-down` / `pid` / `version` / `startedAt` / `uptimeSec` / `activeClients` / `pendingEvents` / `lastEventTs`）；endpoint 不需要 Bearer Token（用于服务管理器探活）但仅监听 127.0.0.1
    - 文件：`packages/daemon-core/src/`（按现状定位 handshake writer、HTTP router 接入点）
    - _Requirements: 4.4, 4.5, 11.3_
  - [x]* 6.4 编写 `graceful-shutdown-handler` 单元测试：覆盖 priority 顺序执行（5 阶段断言；同 priority 内反向注册顺序）、单 task 3s 超时不阻断后续、总 10s 超时 → `process.exit(1)`（mock `process.exit`）、幂等（多次 `trigger` 仅执行一次）、`SIGTERM` 信号触发；用 `vi.useFakeTimers()`（lessons-injected T4）模拟超时；`afterEach` 断言 `getActiveTaskCount() === 0` 与 `getActiveTimerCount() === 0`
    - 文件：`packages/service-management/tests/unit/graceful-shutdown-handler.test.ts`
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 7. Phase 6：ReconnectingDaemonClient + 插件改造
  - [x] 7.1 实现 `ReconnectingDaemonClient`（`packages/service-management/src/plugin/reconnecting-daemon-client.ts`）：`postEvent(type, data)` 永不抛出；首次失败 → 进入指数退避循环（initial 1s、factor 2.0、序列 1/2/4/8/16/32s、累计上限 60s，配置可注入），重试前重读 `handshake.json` 拿新 port/token；累计超过 60s 仍不可达 → 进入 `degraded` 模式（`isDegraded() === true`），后续 `postEvent` 立刻返回 `{ ok: false, dropped: true, reason: "degraded" }` 并 stderr **打印一次** warning 含 `"specforge daemon status"`；`dispose()` 清掉所有 backoff timer 使 `getActiveBackoffTimerCount() === 0`，后续 `postEvent` 返回 `{ ok: false, dropped: true, reason: "disposed" }`；任意时刻 `getActiveBackoffTimerCount() ≤ 1`（不变量）；构造器无副作用，实现 `Disposable` + `Symbol.asyncDispose`；`Promise.race` 败者 timer finally clearTimeout（C1）；token 字段不打日志（Req 11.4）
    - 文件：`packages/service-management/src/plugin/reconnecting-daemon-client.ts`、`packages/service-management/src/plugin/index.ts`
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 11.4_
  - [x] 7.2 修改 `.opencode/plugins/sf_specforge.ts`：**删除** `ensureDaemon()` 函数与 `daemon-spawn.ts` 中所有 `spawn` 子进程的代码路径（删除 `daemon-spawn.ts` 整个文件）、**删除** `initProjectIfNeeded()`（项目级初始化由 installer 拥有）；用 `createReconnectingDaemonClient` 替换原直连客户端，所有 hook（tool.invoking 等）通过新客户端 `postEvent`；保证插件**同时被 OpenCode TUI 进程与 opencode-server 进程加载**（修改 `.opencode/plugins/` 下加载入口或在两个进程对应配置点显式注册），degraded 时 stderr 不刷屏（warn-once 语义）
    - 文件：`.opencode/plugins/sf_specforge.ts`、删除 `.opencode/plugins/daemon-spawn.ts`
    - _Requirements: 5.1, 5.7, 5.8_
  - [x]* 7.3 编写 `reconnecting-daemon-client` 单元测试：用 `vi.useFakeTimers()` 模拟退避（避免真等 60s），覆盖首次失败 → 重连成功（重读 handshake）、累计 60s 后 degraded、`degraded` 模式 `postEvent` 立即 dropped、`dispose()` 后 `postEvent` 返回 `disposed`、warn-once 语义（`console.warn` 仅调用 1 次）、`getActiveBackoffTimerCount() ≤ 1` 不变量、`postEvent` 永不抛出（用 generative input fuzz 至少 50 个错误注入路径）；`afterEach` 断言 `getActiveBackoffTimerCount() === 0`
    - 文件：`packages/service-management/tests/unit/reconnecting-daemon-client.test.ts`
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.8_

- [x] 8. Phase 7：CLI 子命令（`services` / `daemon` / `opencode-server`）+ JSON 输出契约
  - [x] 8.1 实现 `specforge services {install,uninstall,start,stop,restart,status}` 子命令：在 `packages/cli/src/commands/services/` 创建 `install.ts` / `uninstall.ts` / `start.ts` / `stop.ts` / `restart.ts` / `status.ts` / `index.ts`（注册到 `packages/cli/src/cli.ts`），全部支持 `--json` flag；`stop` 支持 `--timeout=<sec>` 默认走 `service_management.stop_timeout_sec`（10）；底层调 `ServiceLifecycleOrchestrator`；交互模式输出按 design.md "Example Usage"（`✓ Installed: ...` / `✓ Started: ... (pid X, port Y)` 等）；退出码遵循 cli spec Property 17/18 语义（成功 0、业务失败 1、环境/输入错误 2）
    - 文件：`packages/cli/src/commands/services/*.ts`、`packages/cli/src/cli.ts`（注册子命令）
    - _Requirements: 1.1, 1.7, 1.8, 2.1, 2.2, 2.6, 2.7, 6.1, 6.6, 6.7_
  - [x] 8.2 实现 `specforge daemon {install-service,uninstall-service,start,stop,restart,status}` 与 `specforge opencode-server {install-service,uninstall-service,start,stop,restart,status}` 单服务子命令：复用 `services/*.ts` 底层实现，仅过滤 `serviceName`；保留现有 `specforge daemon start/stop/restart/status`（删除 idle-exit + `--detach` 已在 daemon-core 联动完成）的人类可读输出契约；全部支持 `--json`
    - 文件：`packages/cli/src/commands/daemon/install-service.ts` / `uninstall-service.ts` / `start.ts` 等、`packages/cli/src/commands/opencode-server/*.ts`、`packages/cli/src/cli.ts`
    - _Requirements: 4.3, 6.2, 6.6, 6.7_
  - [x] 8.3 实现 `--json` 输出 payload：`status` 命令输出严格遵守 `ServicesStatusJsonPayload` schema（`schema_version: "1.0"` / `services` 数组每项 7 字段 / `overallExitCode ∈ 0|1|2`，规则：全 running → 0、任一非 running → 1、任一 uninstalled → 2）；`install` / `uninstall` / `start` / `stop` / `restart` 输出对应的最小 JSON 含 `schema_version` / `success` / `perService` / `error`；JSON 模式禁止 ANSI 控制字符
    - 文件：`packages/cli/src/commands/services/json-payload.ts`
    - _Requirements: 6.3, 6.4, 6.5, 6.7_
  - [x]* 8.4 编写 `services-cli` 单元测试：覆盖 `services status --json` 输出严格符合 `ServicesStatusJsonPayload` schema、`overallExitCode` 三态规则（0/1/2）、`stop --timeout` 与配置默认值 fallback（10s）、idempotent no-op（已 running 再 start → 退出 0 + "already running"）、`install` 失败退出码 1（业务）vs 2（precheck blockers）
    - 文件：`packages/cli/tests/unit/services-cli.test.ts`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 9. Phase 8：默认配置项（`service_management` 段）
  - [x] 9.1 在 configuration spec 的默认配置生成器中追加 `service_management` 段：`schema_version: "1.0"` / `auto_enable_at_boot: true` / `stop_timeout_sec: 10` / `plugin_reconnect_max_sec: 60` / `plugin_reconnect_initial_sec: 1` / `plugin_reconnect_backoff_factor: 2.0`；**禁止**写入任何启用远程访问的字段；通过 configuration spec 的 `buildDefaultConfig()` 注入（不在本包重复实现合并机制）
    - 文件：`packages/configuration/src/`（按现状定位 default builder 接入点）
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [x] 9.2 在 CLI 子命令实现中读取配置（通过 configuration spec 的 typed access API）替换硬编码默认值：`stop --timeout` fallback 到 `service_management.stop_timeout_sec`；`ReconnectingDaemonClient` 工厂从配置读 `plugin_reconnect_*` 三参数；`installAll` 的 `enableAtBoot` 字段从 `auto_enable_at_boot` 读
    - 文件：`packages/cli/src/commands/services/`、`packages/service-management/src/plugin/`（构造点接入配置）
    - _Requirements: 6.6, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 10. Checkpoint - CLI + 默认配置完成（功能闭环已通）
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Phase 9：Property-Based Tests（恰好 3 条，对应 §Correctness Properties）
  - [x]* 11.1 编写 `service-management-property-1-startup-order-preservation.property.test.ts`
    - **Property 1: Startup Order Preservation**
    - **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.5**
    - 用 `fast-check` 生成随机命令序列 `σ ∈ Sequence({install, start, stop, restart, uninstall} × {opencode-server, specforge-daemon} × T)`（T 为时间间隔，可乱序与重复），用内存 mock `ServiceManager` 执行 `ServiceLifecycleOrchestrator`，在每个时间步检查蕴含式：`state(daemon, t) === "running" ⟹ ∃ε≥0, state(server, t-ε) === "running"` 与 `state(server, t) === "stopped" ⟹ ∃ε≥0, state(daemon, t-ε) ∈ {"stopped","uninstalled"}`；迭代 ≥ 100；test describe **必须**含字面量 `Feature: service-management, Property 1: Startup Order Preservation`；`afterEach` 断言所有 orchestrator 实例 `getActivePendingOpCount() === 0`（lessons-injected X2/T1）；用 `vi.useFakeTimers()` 控制时间步（T4）
    - 文件：`packages/service-management/tests/property/service-management-property-1-startup-order-preservation.property.test.ts`
  - [x]* 11.2 编写 `service-management-property-2-idempotent-operations.property.test.ts`
    - **Property 2: Idempotent Operations**
    - **Validates: Requirements 1.8, 2.6, 2.7**
    - 用 `fast-check` 生成 `(σ, c, s, repeatN ∈ [1, 10])` 四元组，`c ∈ {install, uninstall, start, stop}`、`s ∈ {opencode-server, specforge-daemon}`；用内存 mock `ServiceManager` 跑两遍：一次 `σ ++ [c(s)] × N`，一次 `σ ++ [c(s)]`；断言最终 `ServiceStatus`（除 `startedAt` / `pid` 等观测字段外）byte-equal；`restart` 不在幂等命令集合内（仅断言执行后状态收敛到 running）；迭代 ≥ 100；describe 含 `Feature: service-management, Property 2: Idempotent Operations`
    - 文件：`packages/service-management/tests/property/service-management-property-2-idempotent-operations.property.test.ts`
  - [x]* 11.3 编写 `service-management-property-4-graceful-shutdown-no-event-loss.property.test.ts`
    - **Property 4: Graceful Shutdown No Event Loss**
    - **Validates: Requirements 3.1, 3.2, 3.5**
    - **Derived-From: v6-architecture-overview Property 7 (extension)**
    - 用 `fast-check` 生成 `(事件流 E, SIGTERM 时刻 t_stop)` 二元组，每个事件标记 `ack: bool` 与 `ts`；用真实 daemon 二进制（或受控 fake daemon-core 暴露 events.jsonl writer + GSH 集成）+ 临时数据目录跑：注入事件 → 在 `t_stop` 触发 SIGTERM → 等待 graceful shutdown 完成 → 读 events.jsonl；断言 `∀ e ∈ E: ack(e) ∧ e.ts < t_stop ⟹ e ∈ readEventsJsonl()`；迭代 ≥ 100；describe 含 `Feature: service-management, Property 4: Graceful Shutdown No Event Loss; Derived-From: v6-architecture-overview Property 7 (extension)`；用动态追踪列表清理临时数据目录（lessons-injected T1）；测试本身用 OS 级 timeout 包裹（v6-development-workflow 派单地雷区警告）
    - 文件：`packages/service-management/tests/property/service-management-property-4-graceful-shutdown-no-event-loss.property.test.ts`
    - _Requirements: 3.1, 3.2, 3.5_

- [x] 12. Phase 10：集成测试 + CI 矩阵
  - [x]* 12.1 编写 `linux-systemd-full-lifecycle.test.ts`：在 Linux runner 上跑 `install → enable → start → status → restart → stop → disable → uninstall` 完整周期，每步断言 `systemctl --user is-active` / `~/.config/systemd/user/<name>.service` 文件存在性；用唯一服务名 `specforge-daemon-test-<uuid>` 隔离；`afterEach` 用追踪列表清理已注册测试服务
    - 文件：`tests/integration/service-management/linux-systemd-full-lifecycle.test.ts`
    - 平台：Linux only
    - _Requirements: 1.1, 1.2, 1.7, 2.1, 2.2_
  - [x]* 12.2 编写 `windows-nssm-full-lifecycle.test.ts`：在 Windows runner 上跑同一周期，断言 `nssm status <name>` 返回值与 `Get-Service` 状态；用唯一服务名隔离
    - 文件：`tests/integration/service-management/windows-nssm-full-lifecycle.test.ts`
    - 平台：Windows only
    - _Requirements: 1.1, 1.3, 1.7, 2.1, 2.2_
  - [x]* 12.3 编写 `cross-platform-equivalence.test.ts`：同一条 `(install, start, stop, uninstall)` 命令序列在 Linux 与 Windows 上（matrix 跑）观察到的 `ServiceState` 序列等价（`uninstalled → stopped → starting → running → stopping → stopped → uninstalled`）；承接 Requirement 12（原 design Property 3 降级）
    - 文件：`tests/integration/service-management/cross-platform-equivalence.test.ts`
    - 平台：双平台
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - [x]* 12.4 编写 `dependency-order-real.test.ts`：真实服务管理器下，断言 `services start` 先启动 server 后启动 daemon、`services stop` 反向、`services start specforge-daemon`（单独）在 server 未 running 时返回 `SVC_DEPENDENCY_NOT_RUNNING`
    - 文件：`tests/integration/service-management/dependency-order-real.test.ts`
    - 平台：双平台
    - _Requirements: 2.1, 2.2, 2.5_
  - [x]* 12.5 编写 `graceful-shutdown-real.test.ts`：daemon 收到 SIGTERM 后真实写盘 events.jsonl，断言 `t_stop` 之前已 ack 的事件全部存在；模拟单 task 超 3s（warning 但继续）与总 10s 超时（强杀 + 退出码 1）两条路径
    - 文件：`tests/integration/service-management/graceful-shutdown-real.test.ts`
    - 平台：双平台
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x]* 12.6 编写 `plugin-reconnect-real.test.ts`：真实启动 daemon → `kill -9` → 60s 内重启，断言插件 `ReconnectingDaemonClient` 重连成功且 `degraded === false`；额外路径：60s 内不重启 → 插件进入 degraded
    - 文件：`tests/integration/service-management/plugin-reconnect-real.test.ts`
    - 平台：双平台
    - _Requirements: 5.2, 5.3, 5.4_
  - [x]* 12.7 编写 `upgrade-restart-cycle.test.ts`：模拟升级 stop → 替换二进制 → start，断言事件链不丢、半开半关窗口不存在（升级期间任一时刻服务要么完整 running 要么完整 stopped/uninstalled）
    - 文件：`tests/integration/service-management/upgrade-restart-cycle.test.ts`
    - 平台：双平台
    - _Requirements: 11.6_
  - [x]* 12.8 编写 `precheck-blocking.test.ts`：mock 缺 systemd / 缺 NSSM / 未 elevated 三种环境，断言 `services install` 在 blockers 非空时返回退出码 2 不执行任何 OS 操作；`darwin` 平台下断言 `PLATFORM_NOT_SUPPORTED` blocker
    - 文件：`tests/integration/service-management/precheck-blocking.test.ts`
    - 平台：双平台 + 模拟 darwin（process.platform mock）
    - _Requirements: 1.4, 7.1, 7.2, 7.4, 7.5, 7.6_
  - [x] 12.9 创建 `.github/workflows/service-management-smoke.yml`：`fail-fast: false` + `matrix.os: [ubuntu-latest, windows-latest]`（**不**含 macos-latest，因平台不支持），`timeout-minutes: 15`；步骤跑 `bun test packages/service-management/tests/` 与 `bun test tests/integration/service-management/`；任一矩阵作业非 0 即整 workflow 失败
    - 文件：`.github/workflows/service-management-smoke.yml`
    - _Requirements: 12.1, 12.2, 12.4_

- [x] 13. Final Checkpoint - 全部产物可发布
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 标 `*` 的子任务为可选（property tests / unit tests / integration tests），可为 MVP 跳过；标无 `*` 的子任务必须实现
- 每条任务用 `_Requirements: X.Y_` 标注实现的 acceptance criteria（来自 requirements.md 的 Requirement 1～12）
- 3 条 PBT 任务（11.1 / 11.2 / 11.3）均显式标注 `Property N: <Title>` + `Validates: Requirements ...`，Property 4 额外标注 `Derived-From: v6-architecture-overview Property 7 (extension)`（按 design.md "Correctness Properties" 与 v6-development-workflow 第 6 节"承接 Correctness Property 的规矩"要求）
- 所有持有异步资源的类（ServiceManager 实现、ServiceLifecycleOrchestrator、GracefulShutdownHandler、ReconnectingDaemonClient）严格遵守 async-resource-coding-standards：构造器无副作用 / Disposable + Symbol.asyncDispose / `getActive*Count()` 自检 API / `afterEach` 断言清零；任何 `Promise.race` 在 finally 中 clearTimeout 败者
- 所有 JSON/YAML 持久化文件携带 `schema_version: "1.0"`（systemd unit metadata block / `handshake.json` / `HealthCheckResponse` / `ServicesStatusJsonPayload` / `EnvironmentPrecheck` / `OrchestrationResult` / `ServiceStatus` / `ServiceUnitMetadata` / 默认配置 `service_management` 段）
- 包管理器统一 bun（`bun install` / `bun run build` / `bun test <文件>`），用户安装命令仍是 `npm install -g @specforge/cli`（distribution spec 拥有）
- 源码与测试位置严格遵守 project-structure.md 规则 1/2：`.kiro/specs/service-management/` 只放文档；源码在 `packages/service-management/src/` + daemon-core 联动在 `packages/daemon-core/src/` + CLI 命令在 `packages/cli/src/commands/services|daemon|opencode-server/` + 配置默认值在 `packages/configuration/src/` + 插件改造在 `.opencode/plugins/sf_specforge.ts`；测试在 `packages/service-management/tests/{unit,property}/` 与 `tests/integration/service-management/`；CI workflow 在 `.github/workflows/service-management-smoke.yml`
- macOS 不支持（ADR-SM-001）：精检 `darwin` 平台直接返回 `PLATFORM_NOT_SUPPORTED` blocker；CI 矩阵不含 `macos-latest`
- 错误码集合 13 条一经实现即进入 SpecForge Runtime Contract，minor 版本不得变更其语义
- 依赖 spec：configuration（默认配置生成）、cli（`--json` 双模式契约 / 退出码语义）、daemon-core（idle exit / `--detach` 删除 / handshake 扩展 / healthz 端点）；下游 spec：distribution（`specforge upgrade` 调用本 spec `services stop/start`）

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "6.1", "7.1"] },
    { "id": 3, "tasks": ["2.2", "6.4", "7.3"] },
    { "id": 4, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 5, "tasks": ["3.4", "3.5", "3.6", "3.7"] },
    { "id": 6, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 7, "tasks": ["4.4", "6.2", "6.3"] },
    { "id": 8, "tasks": ["7.2"] },
    { "id": 9, "tasks": ["8.3", "9.1"] },
    { "id": 10, "tasks": ["8.1", "8.2"] },
    { "id": 11, "tasks": ["8.4", "9.2"] },
    { "id": 12, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 13, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8"] },
    { "id": 14, "tasks": ["12.9"] }
  ]
}
```
