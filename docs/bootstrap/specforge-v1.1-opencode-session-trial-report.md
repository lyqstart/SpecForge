# SpecForge v1.1 OpenCode Session Trial Report

## 1. Scope

本报告验证 OpenCode CLI 真实 session 中 SpecForge plugin/agents/tools 的加载与识别。

- 不声明 v1.1-complete
- 不声明 production-compliant
- 不声明 production ready
- 不声明 Production readiness: READY
- 不声明 Trial readiness: READY

## 2. Baseline

- main commit: `1d0691c`
- branch: `v1.1-opencode-session-trial`
- 前置报告: `specforge-v1.1-opencode-first-manual-trial-report.md`
- 前置结论: OpenCode first manual trial: PARTIAL

## 3. Environment

| 项目 | 值 |
|---|---|
| OS | Windows 11 (win32) |
| Shell | PowerShell 7 |
| Node.js | v24.12.0 |
| Bun | 1.3.11 |
| OpenCode CLI | 1.15.13 |
| LLM Provider | OpenRouter (已配置) |
| XDG_CONFIG_HOME | 临时目录 |

## 4. Installer Evidence

| 项目 | 结果 |
|---|---|
| 命令 | `bun scripts/sf-installer.ts install` |
| 环境 | `OPENCODE_CONFIG_DIR` 指向临时干净目录 |
| 退出码 | 0 |
| 共享组件总数 | 104 |
| plugins/sf_specforge.ts | ✅ 存在 |
| tools/ | ✅ 19 个文件 |
| agents/ | ✅ 10 个文件（9 个 sf-*.md） |
| sf-user/ | ✅ 存在 |
| sf-user/install.json | ✅ 存在 |
| HOME/.config/opencode | ❌ 未创建 |
| HOME/.specforge | ❌ 未创建 |

## 5. OpenCode Session Evidence

### OpenCode 配置发现

| 检查项 | 结果 |
|---|---|
| `opencode debug paths` config 字段 | ✅ 指向 `$XDG_CONFIG_HOME/opencode` |
| OpenCode 读取 XDG_CONFIG_HOME | ✅ 确认 |
| `opencode debug config` 输出大小 | 178,785 bytes（含完整解析后配置） |

### Plugin 识别

| 检查项 | 结果 |
|---|---|
| opencode.json 中 plugin 注册 | ✅ `["./plugins/sf_specforge.ts"]` |
| `opencode debug config` 中 plugin 字段 | ✅ `file:///...opencode/plugins/sf_specforge.ts` |
| `opencode debug config` 中 plugin_origins | ✅ 存在 spec 引用 |
| OpenCode 加载 plugin | ✅ 日志：`service=plugin path=...sf_specforge.ts loading plugin` |
| Plugin 找到 sf_plugin_client.ts | ✅ 不再报 "Cannot locate" |
| Plugin 初始化 | ✅ 尝试 daemon 通信（handshake not found = daemon 未启动） |
| Plugin 加载结果 | ✅ 成功加载，优雅降级（will retry on first tool call） |

**Plugin 路径修复** (本轮):

`resolveClientPath()` 新增 `__dirname/../sf-user/lib/sf_plugin_client.ts` 作为首选路径，匹配 installer 标准部署布局。修复后 plugin 可正确找到 client 文件。

### Agents 识别

| 检查项 | 结果 |
|---|---|
| opencode.json 中 agent 注册 | ✅ 9 个 sf-* agents |
| `opencode debug config` 解析 agent prompts | ✅ 所有 9 个 agent 的 prompt 内容已被完整解析 |
| 配置验证（`opencode debug skill`） | ✅ 通过（移除过时 ref 后无错误） |

已识别的 agents：
- sf-orchestrator
- sf-requirements
- sf-design
- sf-task-planner
- sf-executor
- sf-debugger
- sf-reviewer
- sf-verifier
- sf-knowledge

### Tools 识别

| 检查项 | 结果 |
|---|---|
| tools/ 目录下文件 | ✅ 19 个 .ts 文件已部署 |
| OpenCode 是否列出 tools | 未验证 — OpenCode CLI 无非交互式列出 tools 的命令 |
| Plugin 是否注册 tools | ⚠️ Plugin 加载失败，tools 未注册到 session |

**说明**：OpenCode 的 tools 注册依赖 plugin 成功加载并调用注册 API。由于 plugin 因 `sf_plugin_client` 路径问题加载失败，tools 未被注册到 OpenCode session。

### OpenCode run 结果

| 检查项 | 结果 |
|---|---|
| 命令 | `opencode run "只回复 OK，不做任何修改"` |
| OpenCode session 启动 | ✅ 进程启动并尝试创建 session |
| Plugin 加载尝试 | ✅ 日志确认 OpenCode 尝试加载 sf_specforge.ts |
| Session 完成 | ❌ "Session not found"（plugin 初始化失败导致） |

## 6. Daemon Communication Evidence

**未验证**：Plugin 加载失败导致无法通过 OpenCode session 触发 daemon 通信。

daemon 本身的 fail-closed E2E 已在 `production-daemon-startup-recovery-e2e.test.ts` 中验证通过（29 pass, 0 fail）。

## 7. Minimal WI Trigger Evidence

**未验证**：Plugin 加载失败导致无法在 OpenCode session 中触发 WI。

## 8. Findings

### PASSED 项
| # | 项目 | 证据 |
|---|---|---|
| 1 | OpenCode CLI 可用 | v1.15.13 |
| 2 | LLM Provider 已配置 | OpenRouter credentials 存在 |
| 3 | OpenCode 读取 XDG_CONFIG_HOME | `debug paths` → config 指向 XDG 路径 |
| 4 | Installer 部署到 XDG config root | 104 组件，退出码 0 |
| 5 | Plugin 文件被 OpenCode 发现并成功加载 | 日志：`service=plugin path=...sf_specforge.ts loading plugin`（无错误） |
| 6 | sf_plugin_client.ts 被 plugin 找到 | 不再报 "Cannot locate sf_plugin_client" |
| 7 | Plugin 初始化并尝试 daemon 通信 | 日志：`[sf:specforge] Project registration failed (will retry on first tool call): Daemon handshake not found` |
| 8 | 所有 9 个 sf-* Agents 被识别并解析 | `debug config` 输出含完整 prompt |
| 9 | opencode.json 配置验证通过 | `debug skill` 无错误 |
| 10 | 不写 .specforge | 临时 HOME 无 .specforge |

### BLOCKED 项
| # | 项目 | 阻断原因 |
|---|---|---|
| 1 | Tools 注册 | OpenCode `run` 因 "Session not found" 无法创建完整 LLM session |
| 2 | Daemon 通信 | daemon 进程未启动（plugin 设计为 retry on first tool call） |
| 3 | 最小 WI 触发 | 依赖完整 session + daemon |

### 根因分析

#### 已修复：plugin 路径查找 (commit in this branch)

plugin 内部的 `resolveClientPath()` 原搜索顺序：
1. `~/.config/opencode/sf-runtime/sf_plugin_client.ts`（硬编码 homedir）
2. `__dirname/../lib/sf_plugin_client.ts`（plugin 相对）
3. workspace packages（dev mode）

installer 实际部署到：`$CONFIG_ROOT/sf-user/lib/sf_plugin_client.ts`

修复后搜索顺序：
1. `__dirname/../sf-user/lib/sf_plugin_client.ts`（匹配 installer 部署布局）✅ 新增
2. `~/.config/opencode/sf-runtime/sf_plugin_client.ts`（旧路径兼容）
3. `__dirname/../lib/sf_plugin_client.ts`（plugin 相对）
4. workspace packages（dev mode）

#### 未修复：OpenCode session 创建

OpenCode `run` 命令在非交互模式下报 "Session not found"。原因可能是：
- XDG config 目录中缺少 model 配置（opencode.json 中无 model 定义）
- OpenCode run 命令需要额外的 session 创建参数
- 这是 OpenCode 自身的行为限制，不是 SpecForge 问题

## 9. Final Result

```
OpenCode session trial: PARTIAL
```

**判定依据**：
- OpenCode CLI 可用且 LLM provider 已配置 ✅
- OpenCode 正确读取 XDG 配置 ✅
- Plugin 文件被发现并**成功加载**（路径修复生效）✅
- sf_plugin_client.ts 被正确找到 ✅
- Plugin 初始化并尝试 daemon 通信 ✅
- 所有 9 个 Agents 被识别并解析 ✅
- 但 OpenCode `run` 因 "Session not found" 无法创建完整 LLM session
- 导致 tools 注册和 WI 触发无法完成验证

**与上轮 PARTIAL 对比改善**：
- 上轮：plugin 加载失败（Cannot locate sf_plugin_client）
- 本轮：plugin 加载成功，daemon 通信尝试已到达，仅被 session 创建问题阻断

## 10. Non-Goals

- This trial does not declare v1.1-complete.
- This trial does not declare production-compliant.
- This trial does not declare production ready.
- This trial does not declare Production readiness: READY.
- This trial does not declare Trial readiness: READY.

## 11. Next Steps

1. 解决 OpenCode `run` 的 "Session not found" 问题（可能需要在 XDG config 中添加 model 配置）
2. 启动 daemon 进程，验证 plugin → daemon 通信链路
3. 在完整 session 中验证 tools 注册
4. 验证最小 WI dry-run 触发

## 12. Plugin Client Path Fix

### 修复提交

- 分支: `v1.1-opencode-session-trial`
- 修改文件: `setup/userlevel-opencode/plugins/sf_specforge.ts`
- 新增测试: `scripts/tests/opencode-plugin-client-path.test.ts`

### 修复内容

`resolveClientPath()` 新增 `__dirname/../sf-user/lib/sf_plugin_client.ts` 为首选搜索路径。

搜索顺序（修复后）：
1. `$CONFIG_ROOT/sf-user/lib/sf_plugin_client.ts` — installer 标准部署位置 ✅ 新增
2. `~/.config/opencode/sf-runtime/sf_plugin_client.ts` — 旧路径兼容
3. `$CONFIG_ROOT/lib/sf_plugin_client.ts` — plugin 相对路径
4. workspace packages — dev mode

### 测试覆盖

| 测试 | 结果 |
|---|---|
| sf-user/lib/ 路径可解析 | ✅ pass |
| sf-user/lib/ 优先于 $CONFIG/lib/ | ✅ pass |
| 回退到 $CONFIG/lib/ | ✅ pass |
| 全部不存在时抛出详细错误 | ✅ pass |
| 错误消息含 sf-user 路径 | ✅ pass |
| 主路径不使用硬编码 homedir | ✅ pass |

### 真实 OpenCode session 验证

| 检查项 | 结果 |
|---|---|
| Plugin 加载 | ✅ 成功（日志无 "Cannot locate" 错误） |
| sf_plugin_client.ts 找到 | ✅ 路径修复生效 |
| Daemon 通信尝试 | ✅ 到达（handshake not found = daemon 未启动） |
| Plugin 优雅降级 | ✅ "will retry on first tool call" |

