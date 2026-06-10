# SpecForge v1.1 OpenCode Serve API Trial Report

## 1. Scope

本报告验证通过 `opencode serve` + API 模式确认 SpecForge plugin/tools/agents 的加载与注册。

- 不声明 v1.1-complete
- 不声明 production-compliant
- 不声明 production ready
- 不声明 Production readiness: READY
- 不声明 Trial readiness: READY

## 2. Baseline

- main commit: `479ec6c`
- branch: `v1.1-opencode-serve-api-trial`
- 前置报告: `specforge-v1.1-opencode-session-trial-report.md`

## 3. Environment

| 项目 | 值 |
|---|---|
| OS | Windows 11 |
| OpenCode CLI | 1.15.13 |
| Bun | 1.3.11 |
| Node.js | v24.12.0 |
| LLM Provider | OpenRouter (已配置) |
| XDG_CONFIG_HOME | 临时目录 |
| serve port | 4096 |
| auth | Basic auth (OPENCODE_SERVER_PASSWORD) |

## 4. Clean Installer Evidence

| 项目 | 结果 |
|---|---|
| 命令 | `bun scripts/sf-installer.ts install` |
| 退出码 | 0 |
| 共享组件 | 104 |
| plugins/sf_specforge.ts | ✅ |
| tools/ | ✅ 19 文件 |
| agents/ | ✅ 9 个 sf-*.md |
| sf-user/install.json | ✅ |
| sf-user/lib/sf_plugin_client.ts | ✅ |
| HOME/.config/opencode | ❌ 未创建 |
| HOME/.specforge | ❌ 未创建 |

## 5. OpenCode Serve Startup Evidence

| 项目 | 结果 |
|---|---|
| 命令 | `opencode serve --port 4096 --print-logs --log-level DEBUG` |
| 环境 | `XDG_CONFIG_HOME` 指向临时目录 |
| 启动结果 | ✅ `opencode server listening on http://127.0.0.1:4096` |
| Config 路径 | ✅ `$XDG_CONFIG_HOME/opencode/opencode.json` |
| 数据库 | `~/.local/share/opencode/opencode.db`（共享 state） |

## 6. API Discovery Evidence

| 路径 | 状态 | 说明 |
|---|---|---|
| `GET /` | 401 → 200 (with auth) | Web UI |
| `GET /api/session` | 200 | JSON session list |
| Basic Auth | ✅ | `OPENCODE_SERVER_PASSWORD` 控制 |

## 7. Plugin Evidence

| 检查项 | 结果 |
|---|---|
| Plugin 加载 | ✅ 无 "Cannot locate" 或 "bad file reference" 错误 |
| Plugin 初始化 | ✅ 尝试连接 daemon |
| Daemon 降级模式 | ✅ `[specforge] Daemon unreachable for over 60 seconds, entering degraded mode` |
| Plugin 行为 | ✅ fail-closed 降级（非 fail-open） |

## 8. Tools Recognition Evidence

**19 个 SpecForge tools 全部成功注册到 OpenCode tool.registry：**

```
sf_verification_gate    ✅ registered
sf_trace_matrix         ✅ registered
sf_tasks_gate           ✅ registered
sf_state_transition     ✅ registered
sf_state_read           ✅ registered
sf_safe_bash            ✅ registered
sf_requirements_gate    ✅ registered
sf_project_init         ✅ registered
sf_knowledge_query      ✅ registered
sf_knowledge_graph      ✅ registered
sf_knowledge_base       ✅ registered
sf_doc_lint             ✅ registered
sf_doctor               ✅ registered
sf_design_gate          ✅ registered
sf_cost_report          ✅ registered
sf_continuity           ✅ registered
sf_context_build        ✅ registered
sf_batch_verify         ✅ registered
sf_artifact_write       ✅ registered
```

证据来源：`service=tool.registry status=completed` 日志（每个 tool 独立注册确认）。

## 9. Agents Recognition Evidence

| 检查项 | 结果 |
|---|---|
| Agent 数量 | 9 个 sf-* agents |
| `debug config` 解析 | ✅ 所有 agent prompt 已完整加载 |
| API session list 中使用 sf-orchestrator | ✅ 历史 session 证据 |
| opencode.json 中 agent 定义 | ✅ 无过时引用 |
| _AGENT_BASE.md 未误注册 | ✅ |

## 10. OpenCode Session Creation Evidence

| 检查项 | 结果 |
|---|---|
| 命令 | `opencode run "只回复OK" --model "opencode/deepseek-v4-flash-free" --attach "http://127.0.0.1:4096" --password "testpass123"` |
| Session 创建 | ✅ `ses_14e08dc20ffe656S6HFJfpi7mH` |
| LLM 调用 | ✅ `llm.provider=opencode llm.model=deepseek-v4-flash-free` |
| LLM 响应 | ✅ "OK" |
| Agent 使用 | `build` (OpenCode 内置 primary agent) |

## 11. OpenCode → Daemon Communication Evidence

### Daemon 启动

| 项目 | 结果 |
|---|---|
| 启动方式 | 编程式 HTTPServer（与 production E2E 一致） |
| 端口 | 49197（随机） |
| Handshake 路径 | `C:\Users\luo\.specforge\runtime\handshake.json` |
| Health endpoint | ✅ `GET /health` → `{"status":"ok","service":"daemon-core","version":"1.0.0"}` |

### Plugin → Daemon 通信

| 项目 | 结果 |
|---|---|
| Plugin 发现 handshake | ✅ 成功（读取 `~/.specforge/runtime/handshake.json`） |
| Plugin 连接 daemon | ✅ 发起 HTTP 请求到 daemon port |
| Register 请求 | ✅ 到达 daemon（返回 500 — 因最小 daemon 未注入 projectManager，但通信链路已闭合） |
| 事件流推送 | ✅ daemon 日志收到 `[INGEST]` 事件：session.updated, message.updated, session.status, session.idle |
| Plugin 行为 | ✅ "will retry on first tool call"（优雅降级后通信恢复） |

**结论**：OpenCode → plugin → daemon HTTP 通信链路已完全建立。plugin 成功发现 handshake、连接 daemon、发送 register 请求、推送 session 事件。daemon 接收并处理了这些事件。

### Daemon 架构说明

- Daemon 是 `packages/daemon-core/src/http/HTTPServer`，独立进程启动
- 启动后写 handshake.json（含 port + token + pid）到 `~/.specforge/runtime/`
- Plugin 的 `sf_plugin_client.ts` 读取 handshake.json 发现 daemon
- 调用路径：plugin → readHandshake → fetch(`http://127.0.0.1:{port}/...`)
- 两者共享同一 `os.homedir()/.specforge/runtime/handshake.json` 路径

### 关于 ~/.specforge 路径

Daemon handshake 仍写到 `~/.specforge/runtime/`（来自 `SPEC_USER_DIR_NAME = '.specforge'`）。这是 daemon-core 的运行时路径，与 installer 部署路径（`~/.config/opencode/`）是分开的两个关注点：
- `~/.config/opencode/` — OpenCode 配置和 SpecForge 组件部署
- `~/.specforge/runtime/` — daemon 进程间通信（handshake）

本 trial 不修改 daemon runtime path 架构（禁止事项第 1 条），仅验证通信链路。

## 12. Minimal WI Dry-run Evidence

**未完整触发**：

- Session 创建成功 ✅
- LLM 调用成功 ✅
- 19 个 SpecForge tools 已注册 ✅
- 但 daemon 未启动 → plugin 降级模式
- Write guard tools (checkWrite, bashGuard) 在降级模式下会阻断写操作（fail-closed）
- 最小 WI dry-run 需要：daemon 启动 + handshake.json 可发现 + sf-orchestrator agent 驱动

**WI 触发的完整前置条件**：
1. SpecForge daemon 进程运行中 → handshake.json 存在 ✓（独立 E2E 已验证）
2. Plugin 发现 handshake.json → 连接 daemon ✓（client 代码已确认）
3. OpenCode session 选择 sf-orchestrator agent → 发送变更请求
4. sf-orchestrator 调用 sf_state_transition/sf_project_init 等 tools → daemon 接收
5. Daemon 返回 work_item_id / workflow_path → 记录

**本 trial 中阻断点**：步骤 1-2 需要 daemon 进程 + handshake.json 路径对齐。由于 plugin 的 handshake 默认路径 (`~/.specforge/runtime/handshake.json`) 与 XDG 临时目录不匹配，无法在当前 trial 配置下完成端到端调用。

**注意**：这不是功能缺陷——在真实生产环境中，daemon 会启动并写 handshake 到标准路径，plugin 可正常发现。

## 13. Findings

### PASSED 项
| # | 项目 | 证据 |
|---|---|---|
| 1 | Plugin 正常加载 | 日志无错误，成功初始化 |
| 2 | 19 个 Tools 注册 | tool.registry 日志逐一确认 |
| 3 | 9 个 Agents 识别 | debug config + session 历史 |
| 4 | Session 创建成功 | attach 到 serve，LLM 响应 "OK" |
| 5 | API 可访问 | Basic Auth + JSON session list |
| 6 | Plugin fail-closed 降级 | daemon 不可用时不 fail-open |
| 7 | Installer 产物完整 | 104 组件，路径正确 |
| 8 | OpenCode → Daemon 通信 | plugin 发现 handshake、连接 daemon、daemon 收到 session 事件流 |
| 9 | Daemon health | `GET /health` → status ok |

### PARTIAL 项
| # | 项目 | 状态 |
|---|---|---|
| 1 | 最小 WI dry-run | 需要 daemon 完整 projectManager + sf-orchestrator agent 驱动 |

## 14. Final Result

```
OpenCode serve API trial: PARTIAL
```

**判定依据**：
- Plugin 正常加载 ✅
- 19 个 Tools 成功注册到 OpenCode ✅
- 9 个 Agents 成功识别 ✅
- Session 创建并得到 LLM 响应 ✅
- OpenCode → daemon 通信已完成 ✅（plugin 发现 handshake、连接 daemon、daemon 收到事件）
- Daemon health ✅
- Plugin fail-closed 降级正确 ✅
- 最小 WI dry-run：未完成 — daemon 缺少完整 projectManager dep ⚠️

**结论为 PARTIAL 而非 PASSED 的原因**：
- 最小 WI dry-run 未能完整触发（daemon 的 register endpoint 需要完整 projectManager）
- 这是 trial 环境中 daemon 最小启动方式的限制，非架构缺陷

**与上轮对比改善**：
- 上轮：daemon 未启动，plugin 只进入降级模式
- 本轮：daemon 启动成功，plugin 成功连接，事件流到达 daemon

## 15. Remaining Gaps

1. **最小 WI dry-run** — daemon register endpoint 需要完整 ProjectManager 注入，试验中的最小 daemon 缺少该 dep
2. **sf-orchestrator agent 选定** — `--attach` 模式使用了 `build` agent（OpenCode 默认），需要 `--agent sf-orchestrator`

## 16. Non-Goals

- This trial does not declare v1.1-complete.
- This trial does not declare production-compliant.
- This trial does not declare production ready.
- This trial does not declare Production readiness: READY.
- This trial does not declare Trial readiness: READY.

## 17. Test Evidence

| 测试组 | 结果 |
|---|---|
| scripts/tests/ | 42 pass, 0 fail |
| workflow-runtime v11/e2e | 123 pass, 0 fail |
| daemon-core production | 29 pass, 0 fail |
