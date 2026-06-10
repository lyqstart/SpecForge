# SpecForge v1.1 Production Readiness Assessment

> Generated: 2026-06-11
> Assessment type: Read-only evaluation (no code modifications)
> Assessor: Automated assessment agent

---

## 1. Executive Summary

- **当前状态不是 v1.1-complete** — 仓库中无此 tag，文档中所有引用均为否定声明
- **当前状态不是 production-compliant** — 文档明确标注 "This is NOT production-compliant"
- **当前任务是 production readiness assessment** — 只读评估，不做整改
- **当前结论是评估结果，不是整改完成声明** — 本文档输出 PARTIAL readiness，标识关键缺口和下一步工作

---

## 2. Baseline

| 项目 | 值 |
|---|---|
| main commit | `8f09fef` |
| bootstrap tag | `v1.1-bootstrap-complete` |
| hardening tag | `v1.1-post-bootstrap-hardening-complete` |
| 测试基线 | scripts 27 + daemon-core 96 + workflow-runtime 118 = **241 tests, 0 failures** |
| 错误 tag | 无 `v1.1-complete`，无 `production-compliant` tag |

---

## 3. Evidence Reviewed

### 3.1 文档文件（已读取）

| 文件 | 摘要 |
|---|---|
| `specforge-v1.1-final-validation-report.md` | 7 个验证维度全部 PASS；241 tests 通过；建议打 bootstrap-complete tag，不建议打 v1.1-complete |
| `specforge-v1.1-compliance-gap.md` | 12 项能力状态表；Runtime/Daemon/Extension 全部 Fixed；仍有 installer full release validation pending |
| `specforge-v1.1-post-bootstrap-hardening-final-report.md` | 3 个 non-blocking items 全部修复：vitest module resolution、workflow_type 对齐、XDG_CONFIG_HOME 支持；241 tests pass |
| `specforge-v1.1-runtime-execution-chain-merge-readiness.md` | Runtime 执行链 13 问题修复、Daemon E2E 集成、Production write guard、Extension Subflow E2E 全部完成 |
| `specforge-v1.1-bootstrap-audit-log.md` (tail 100) | 记录从初始 6 P0 blockers 到 Extension Subflow E2E 完成的完整演进，所有生产代码均在 bootstrap 阶段产出 |

### 3.2 核心代码确认（只读）

| 文件 | 确认项 |
|---|---|
| `MergeRunner.ts` | ✅ `executeV11Merge()` 定义于 Line 406，接受 `V11MergeParams`，遍历 `manifest.entries`，验证 `candidate_hash`/`target_base_hash`/`manifest_hash`，只接受 `operation: 'replace'` |
| `CloseGate.ts` | ✅ `validateFromFileSystem()` 定义于 Line 188，接受 `FileSystemValidationParams`，从磁盘读取证据文件 |
| `HTTPServer.ts` | ✅ `registerDefaultRoutes()` (Line 276) 注册 4 条 write-guard 路由: `/api/v1/v11/write-guard/{check,bash,changed-files-audit,escaped-write}` |
| `reconnecting-daemon-client.ts` | ✅ 4 个方法存在: `checkWrite` (Line 597), `bashGuard` (Line 639), `changedFilesAudit` (Line 677), `recordEscapedWrite` (Line 705) |
| `paths.ts` | ✅ `resolveUserLevelDirectory()` 支持 `XDG_CONFIG_HOME`；fallback `$HOME/.config/opencode`；不引用 `~/.specforge` |
| `ExtensionSubflow.ts` | ✅ 完整组件：`ExtensionSubflowScheduler` (10 状态)、`ExtensionAgent`、`FlowResumption` |
| `sf_specforge.ts` | ✅ Plugin 调用 `daemonClient.checkWrite()`, `daemonClient.bashGuard()`, `daemonClient.changedFilesAudit()`, `daemonClient.recordEscapedWrite()`；fail-closed 语义 |

### 3.3 搜索结果

| 搜索 | 范围 | 结果 |
|---|---|---|
| `TODO\|FIXME` | `packages/` | 发现于 `observability` (analyst-engine 10 个 stub), `permission-engine` (1 stub), `plugin-loader` tests (4 P2 占位), `daemon-core/dist` (模板占位) — 均为非 v1.1 核心链路 |
| `TODO\|FIXME` | `scripts/` | **0 matches** — 安装链路无遗留 TODO |
| `fail open` | `packages/` | **0 matches** — 无 fail-open 安全缺陷 |
| `v1.1-complete\|production-compliant` | `docs/bootstrap/` | 仅出现于否定声明 ("NOT v1.1-complete", "不建议打") — 无误标 |

### 3.4 缺失文件/证据

| 项目 | 说明 |
|---|---|
| 用户安装指南 | 不存在 `docs/user-guide/` 或等效目录 |
| Work Item 操作指南 | 不存在 |
| 故障恢复文档 | 不存在 |
| Linux/macOS CI 结果 | 不存在（仅 Windows 开发环境测试） |
| 真实 OpenCode session 加载日志 | 不存在 |
| 真实 `Daemon.start()` 启动日志 | 不存在（测试用 HTTPServer 直接启动） |

---

## 4. Readiness Matrix

| # | 维度 | 状态 | 关键证据 | 主要缺口 | 风险等级 | 下一步 |
|---|---|---|---|---|---|---|
| 1 | 安装就绪 | **Partial** | XDG_CONFIG_HOME 支持实现；27 installer tests pass；`resolveUserLevelDirectory()` 源码正确 | 未调用真实 CLI `sf-installer install`；未验证 OpenCode 真实加载 | High | WI-1 |
| 2 | 运行就绪 | **Partial** | HTTPServer routes 注册；96 daemon tests pass；ReconnectingDaemonClient 4 方法已实现 | 未验证真实 `new Daemon().start()` 完整启动；未验证 crash/restart/reconnect | High | WI-2 |
| 3 | 写入控制就绪 | **Ready** | checkWrite fail-closed；allowed_write_files 限制；bashGuard 覆盖 shell；changedFilesAudit + recordEscapedWrite；真实文件系统 E2E | 无 Blocker | Low | — |
| 4 | 规格治理就绪 | **Ready** | executeV11Merge 消费 entries/replace/hash；CloseGate.validateFromFileSystem 读文件证据；legacy rejected；code_only 证据链完整 | 无 Blocker | Low | — |
| 5 | Extension Subflow 就绪 | **Partial** | 20 E2E tests pass；完整 B1-B6 lifecycle；负向测试覆盖 | 未在真实项目中演练；失败/取消/超时未验证 | Medium | WI-5 |
| 6 | 可观测性与审计就绪 | **Partial** | evidence 文件落盘验证；changed_files_audit 记录验证 | 无集中可读 audit dashboard；错误诊断日志未标准化；analyst-engine 10 个 TODO stub | Medium | WI-6 |
| 7 | 跨平台与环境就绪 | **Partial** | Windows 开发环境测试通过 | 未在 Linux/macOS CI 验证；HOME/USERPROFILE 差异未覆盖 | Medium | WI-4 |
| 8 | 文档与用户操作就绪 | **Not Ready** | 只有 bootstrap audit 文档 | 无用户安装指南；无 Work Item 操作指南；无故障恢复文档 | High | WI-3 |

---

## 5. Detailed Findings

### F-001: 缺少真实 OpenCode 加载验证

| 属性 | 值 |
|---|---|
| **ID** | F-001 |
| **标题** | 缺少真实 OpenCode 加载验证 |
| **维度** | 安装就绪 |
| **风险等级** | High |
| **证据** | `sf_specforge.ts` plugin 存在且调用 daemon client 方法，但无日志证明 OpenCode 实际加载该 plugin 并成功执行 `tool.execute.before` hook |
| **影响** | 若 plugin 加载失败（路径错误、依赖缺失、OpenCode 版本不兼容），整个写入控制链路失效 |
| **建议整改** | 在真实 OpenCode session 中触发写操作，观察 plugin log 输出，确认 checkWrite 被调用 |
| **是否阻断** | 是 — 无法确认端到端写入控制在用户环境中生效 |

### F-002: 缺少真实 Daemon.start() 完整启动验证

| 属性 | 值 |
|---|---|
| **ID** | F-002 |
| **标题** | 缺少真实 Daemon.start() 完整启动验证 |
| **维度** | 运行就绪 |
| **风险等级** | High |
| **证据** | 测试使用 `new HTTPServer().start()` 直接启动（v11-full-daemon-startup-writeguard-e2e.test.ts），未经过 `Daemon` 类的完整初始化（StateManager、WAL、EventBus、plugin 加载等） |
| **影响** | Daemon 类可能在初始化阶段因配置错误、端口冲突、StateManager 异常等导致启动失败 |
| **建议整改** | 创建集成测试调用 `new Daemon(config).start()`，验证 health endpoint + write-guard routes 均可用 |
| **是否阻断** | 是 — 无法确认生产启动路径无异常 |

### F-003: 缺少用户操作文档

| 属性 | 值 |
|---|---|
| **ID** | F-003 |
| **标题** | 缺少用户操作文档 |
| **维度** | 文档与用户操作就绪 |
| **风险等级** | High |
| **证据** | `docs/` 目录只有 `bootstrap/` 子目录含审计和验证报告；无 `README` 级安装指南、无 Work Item 操作指南、无 troubleshooting 文档 |
| **影响** | 用户无法自助安装、使用或诊断问题；增加支持负担 |
| **建议整改** | 编写 `docs/user-guide/installation.md`、`docs/user-guide/work-items.md`、`docs/user-guide/troubleshooting.md` |
| **是否阻断** | 是 — 生产产品无文档不可交付 |

### F-004: 缺少真实 CLI sf-installer install 调用验证

| 属性 | 值 |
|---|---|
| **ID** | F-004 |
| **标题** | 缺少真实 CLI sf-installer install 调用验证 |
| **维度** | 安装就绪 |
| **风险等级** | High |
| **证据** | installer tests 验证了 `resolveUserLevelDirectory()` 路径逻辑，但从未调用 `sf-installer install` CLI 入口；未验证文件拷贝、权限设置、符号链接创建等真实安装行为 |
| **影响** | 路径逻辑正确但安装流程可能在 CLI 入口层失败（参数解析、权限提升、目标目录已存在等） |
| **建议整改** | 在干净环境中调用 `npx sf-installer install` 或等效 CLI，验证安装产出物完整 |
| **是否阻断** | 是 — 安装是用户首次接触点 |

### F-005: 缺少 daemon crash/restart/reconnect 验证

| 属性 | 值 |
|---|---|
| **ID** | F-005 |
| **标题** | 缺少 daemon crash/restart/reconnect 验证 |
| **维度** | 运行就绪 |
| **风险等级** | High |
| **证据** | ReconnectingDaemonClient 有 backoff 和 degraded mode 实现（源码确认），但无测试验证 daemon 进程退出后 client 自动重连、WAL 数据恢复、inflight 请求重试行为 |
| **影响** | 生产环境 daemon 异常退出后，plugin 可能永久阻断写入（fail-closed）或丢失审计数据 |
| **建议整改** | 创建 E2E 测试：启动 daemon → kill → 验证 client 进入 degraded → 重启 daemon → 验证 client 恢复 |
| **是否阻断** | 是 — 生产环境必须容忍进程重启 |

### F-006: 缺少 Linux/macOS CI 跨平台验证

| 属性 | 值 |
|---|---|
| **ID** | F-006 |
| **标题** | 缺少 Linux/macOS CI 跨平台验证 |
| **维度** | 跨平台与环境就绪 |
| **风险等级** | Medium |
| **证据** | 所有 241 tests 仅在 Windows 开发环境运行；GitHub Actions workflows 存在（code-quality.yml 等）但无跨平台 matrix 配置 |
| **影响** | 路径分隔符差异（`path.sep`）、HOME vs USERPROFILE、符号链接行为差异可能导致 Linux/macOS 上行为不同 |
| **建议整改** | 配置 CI matrix `[ubuntu-latest, macos-latest, windows-latest]`，确认 241 tests 全平台通过 |
| **是否阻断** | 否 — 但 Medium 风险，建议 GA 前修复 |

### F-007: Extension Subflow 缺少失败/超时验证

| 属性 | 值 |
|---|---|
| **ID** | F-007 |
| **标题** | Extension Subflow 缺少失败/超时验证 |
| **维度** | Extension Subflow 就绪 |
| **风险等级** | Medium |
| **证据** | 20 E2E tests 覆盖正向 6 场景 + 负向 8 场景，但负向场景仅测试结构验证（缺字段、错格式），未测试超时/网络中断/agent 无响应/用户取消后清理 |
| **影响** | 生产环境中 sf-extension agent 挂起时，主流程可能永久阻塞 |
| **建议整改** | 添加超时 E2E 测试：设置 extension agent timeout → 验证 scheduler 进入 rejected 状态 → 主流程可恢复 |
| **是否阻断** | 否 — 但建议 GA 前修复 |

### F-008: 缺少集中 audit 可观测面板

| 属性 | 值 |
|---|---|
| **ID** | F-008 |
| **标题** | 缺少集中 audit 可观测面板 |
| **维度** | 可观测性与审计就绪 |
| **风险等级** | Medium |
| **证据** | `packages/observability/src/analyst-engine/index.ts` 中 10 个分析方法全部为 TODO stub；`changed_files_audit.json` 虽然落盘但无聚合查看工具 |
| **影响** | 运维人员无法快速查看审计状态、识别异常写入、追溯权限违规 |
| **建议整改** | 实现至少 1 个 CLI 命令（如 `sf audit list`）聚合显示 changed_files_audit 和 escaped_write 记录 |
| **是否阻断** | 否 — 原始文件可手动检查 |

### F-009: 缺少真实项目 Work Item 端到端演练

| 属性 | 值 |
|---|---|
| **ID** | F-009 |
| **标题** | 缺少真实项目 Work Item 端到端演练 |
| **维度** | Extension Subflow 就绪 / 运行就绪 |
| **风险等级** | Medium |
| **证据** | 所有 E2E 测试在 temp 目录中用程序化方式驱动；从未在真实项目中创建 WI → 编辑代码 → 触发 gate → merge → close 完整流程 |
| **影响** | 可能存在真实用户场景中的交互问题（并发 WI、大文件 merge、特殊字符路径等） |
| **建议整改** | 在 SpecForge 仓库自身上创建一个 test WI，验证完整 lifecycle |
| **是否阻断** | 否 — 程序化 E2E 已验证核心逻辑正确 |

### F-010: daemon-core 部分测试使用 mini HTTP server 非完整 Daemon

| 属性 | 值 |
|---|---|
| **ID** | F-010 |
| **标题** | daemon-core 部分测试使用 mini HTTP server 非完整 Daemon |
| **维度** | 运行就绪 |
| **风险等级** | Low |
| **证据** | `v11-live-daemon-protocol-prototype.test.ts` 使用 `http.createServer` 手动创建 mini server；`v11-full-daemon-startup-writeguard-e2e.test.ts` 使用 `new HTTPServer()` 而非 `new Daemon()` |
| **影响** | 路由层逻辑验证充分，但不覆盖 Daemon 类初始化链路中可能的异常 |
| **建议整改** | 与 F-002 合并解决：创建使用 `new Daemon().start()` 的集成测试 |
| **是否阻断** | 否 — 路由层正确性已验证 |

---

## 6. Recommended Next Work Items

| 优先级 | ID | 标题 | 阻断? | 预估工作量 | 依赖 |
|---|---|---|---|---|---|
| P0 | WI-1 | OpenCode Real Integration E2E | 是 | 1-2d | 需要真实 OpenCode 环境 |
| P0 | WI-2 | Full Daemon Startup & Recovery E2E | 是 | 1-2d | — |
| P0 | WI-3 | User Operation Documentation | 是 | 2-3d | WI-1, WI-2 完成后写最终版 |
| P1 | WI-4 | Cross-Platform CI Pipeline | 否 | 1d | GitHub Actions 配置 |
| P1 | WI-5 | Extension Subflow Failure Handling | 否 | 1d | — |
| P2 | WI-6 | Audit Observability CLI | 否 | 1-2d | — |

### WI-1: OpenCode Real Integration E2E

**目标**: 验证 sf_specforge.ts plugin 在真实 OpenCode session 中加载并正确拦截写操作。

**验证步骤**:
1. 启动 OpenCode with SpecForge plugin
2. 触发一次受限写操作（写入 allowed_write_files 外的路径）
3. 确认 plugin 抛出 `[SF WriteGuard] BLOCKED` 错误
4. 触发一次合法写操作，确认 checkWrite 返回 allowed=true
5. 检查 daemon 审计日志包含对应记录

### WI-2: Full Daemon Startup & Recovery E2E

**目标**: 验证 `new Daemon(config).start()` 完整启动，以及进程重启后 client 自动重连。

**验证步骤**:
1. 调用 `new Daemon(config).start()` — 确认 health + write-guard routes 可用
2. Kill daemon process
3. 验证 ReconnectingDaemonClient 进入 degraded mode
4. 重启 daemon
5. 验证 client 自动恢复连接

### WI-3: User Operation Documentation

**目标**: 编写用户可操作的文档。

**交付物**:
- `docs/user-guide/installation.md` — 安装前提、安装步骤、验证安装
- `docs/user-guide/work-items.md` — 创建/管理/关闭 Work Items
- `docs/user-guide/troubleshooting.md` — 常见错误码、日志位置、恢复步骤

### WI-4: Cross-Platform CI Pipeline

**目标**: 确保 241 tests 在 Linux/macOS/Windows 三平台通过。

**交付物**:
- 修改 `.github/workflows/code-quality.yml` 添加 matrix strategy
- 确认所有路径操作使用 `path.join()`/`path.sep` 而非硬编码

### WI-5: Extension Subflow Failure Handling

**目标**: 验证 extension agent 超时/失败/取消后系统可恢复。

**交付物**:
- 超时 E2E：agent 超时 → scheduler 进入 rejected → 主流程可选恢复
- 取消 E2E：用户在 gate 阶段取消 → 清理临时文件 → 主流程恢复
- 网络异常 E2E：agent 生成 candidate 后 daemon 不可达 → fail-closed → 重试

---

## 7. Non-Goals

- **不声明 v1.1 complete** — 存在 5 个 High findings 未解决
- **不声明 production-compliant** — 文档与集成验证不满足生产交付标准
- **不修改主链路** — 本评估为只读操作，未修改任何源文件
- **不打 tag** — 评估不改变仓库状态
- **不替代人工验收** — 本评估标识缺口，最终 production sign-off 需人工决策

---

## 8. Final Assessment

```
┌─────────────────────────────────────────────────────────────────┐
│  Production Readiness: PARTIAL                                   │
│                                                                  │
│  Ready:    2/8 维度 (写入控制、规格治理)                          │
│  Partial:  5/8 维度 (安装、运行、Extension、可观测、跨平台)       │
│  Not Ready: 1/8 维度 (文档与用户操作)                             │
│                                                                  │
│  Blocking Findings: 5 (F-001 ~ F-005, 均为 High)                 │
│  Non-Blocking Findings: 5 (F-006 ~ F-010, Medium/Low)            │
│                                                                  │
│  核心代码治理链路: 单元/E2E 验证通过 (241 tests, 0 failures)       │
│  安全模型: fail-closed 语义已验证 (无 fail-open)                  │
│  生产部署验证: NOT DONE (真实 Daemon + OpenCode 未验证)           │
│  用户文档: NOT EXISTS                                             │
│                                                                  │
│  Resolution path: 完成 WI-1 ~ WI-3 后可进入 production sign-off  │
└─────────────────────────────────────────────────────────────────┘
```

**结论**: SpecForge v1.1 核心代码治理链路已有较充分的单元 / E2E 验证（241 tests, fail-closed 语义, 无 fail-open），但仍缺少真实 OpenCode 加载、完整 daemon 生产启动、crash/reconnect、真实项目 Work Item 演练等生产环境证据，且用户文档尚未编写。因此当前只能判定为 **Production readiness: PARTIAL**。建议优先完成 WI-1（OpenCode 真实加载）、WI-2（Daemon 完整启动与恢复）、WI-3（用户文档）后再进行最终 production sign-off。
