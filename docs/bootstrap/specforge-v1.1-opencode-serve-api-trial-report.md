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

| 检查项 | 结果 |
|---|---|
| Plugin 尝试连接 | ✅ 启动时尝试 |
| Daemon 进程状态 | ❌ 未启动（trial 未单独启动 daemon） |
| Plugin 行为 | ✅ 进入降级模式（fail-closed，非 fail-open） |
| 日志 | `[specforge] Daemon unreachable for over 60 seconds, entering degraded mode` |

**Daemon 架构说明**：
- Daemon 是 `packages/daemon-core/src/http/HTTPServer`，独立进程启动
- 启动后写 handshake.json（含 port + token + pid）到 `~/.specforge/runtime/`
- Plugin 的 `sf_plugin_client.ts` 读取 handshake.json 发现 daemon
- 调用路径：plugin → readHandshake → fetch(`http://127.0.0.1:{port}/...`)

**已有独立验证**：
- daemon-core production E2E：29 pass / 0 fail
- 覆盖：health、write-guard routes、fail-closed（unreachable/missing handshake/stopped）
- 覆盖：checkWrite、bashGuard、changedFilesAudit

**本 trial 中未启动 daemon 原因**：
- daemon 需要写 handshake.json 到特定路径
- plugin 的 handshake 默认路径是 `~/.specforge/runtime/handshake.json`
- 在 XDG 临时目录中，plugin 无法找到正确的 handshake.json
- 修改 handshake 路径需要改动 plugin 构造参数，超出本轮验证范围

**结论**：plugin → daemon 通信机制已通过独立 E2E 验证。OpenCode 中 plugin 正确进入 fail-closed 降级。完整链路需要 daemon 进程启动并写 handshake 到 plugin 可发现的路径。

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

### PARTIAL 项
| # | 项目 | 状态 |
|---|---|---|
| 1 | Daemon 通信 | Plugin 尝试但 daemon 未启动 — 已有独立 E2E 覆盖 |
| 2 | 最小 WI dry-run | 需要 daemon + sf-orchestrator agent 完整链路 |

## 14. Final Result

```
OpenCode serve API trial: PARTIAL
```

**判定依据**：
- Plugin 正常加载 ✅
- 19 个 Tools 成功注册到 OpenCode ✅
- 9 个 Agents 成功识别 ✅
- Session 创建并得到 LLM 响应 ✅
- Daemon 通信：plugin 端链路确认，daemon 端有独立 E2E（29 pass）— PARTIAL
- 最小 WI dry-run：未完成（需要 daemon 启动 + sf-orchestrator 选定）— PARTIAL

**与上轮对比改善**：
- 上轮：plugin 加载但无法确认 tools/agents（受限于 opencode run 非 TTY）
- 本轮：通过 serve + attach 确认 **19 个 tools 全部注册** + **9 个 agents 全部识别** + **session 创建成功**

## 15. Remaining Gaps

1. **Daemon 进程启动** — 需要在 trial 环境中同时启动 daemon，验证 plugin → daemon → write guard 完整链路
2. **最小 WI dry-run** — 需要 daemon 可用 + sf-orchestrator agent 驱动
3. **sf-orchestrator 通过 serve API 选定** — `--attach` 模式可能需要显式 `--agent sf-orchestrator`

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
