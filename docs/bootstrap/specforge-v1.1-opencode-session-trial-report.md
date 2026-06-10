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
| OpenCode 尝试加载 plugin | ✅ 日志确认 `service=plugin path=file:///...sf_specforge.ts` |
| Plugin 加载结果 | ⚠️ 加载但执行失败：`Cannot locate sf_plugin_client` |

**Plugin 加载失败原因分析**：

plugin (`sf_specforge.ts`) 在运行时搜索 `sf_plugin_client.ts`，搜索路径为：
1. `~/.config/opencode/sf-runtime/sf_plugin_client.ts`（旧路径，不存在）
2. `$XDG/opencode/lib/sf_plugin_client.ts`（新路径，但文件实际在 `sf-user/lib/`）

文件实际位置：`$XDG/opencode/sf-user/lib/sf_plugin_client.ts`

这是 plugin 内部路径查找逻辑与 installer 部署布局之间的不一致，需要后续修复。

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
| 5 | Plugin 文件被 OpenCode 发现并尝试加载 | 日志确认 `service=plugin path=...sf_specforge.ts` |
| 6 | 所有 9 个 sf-* Agents 被识别并解析 | `debug config` 输出含完整 prompt |
| 7 | opencode.json 配置验证通过 | `debug skill` 无错误 |
| 8 | 不写 .specforge | 临时 HOME 无 .specforge |

### BLOCKED 项
| # | 项目 | 阻断原因 |
|---|---|---|
| 1 | Plugin 执行 | sf_plugin_client.ts 路径查找不匹配 installer 部署布局 |
| 2 | Tools 注册 | 依赖 plugin 成功执行 |
| 3 | Daemon 通信 | 依赖 plugin → tools 链路 |
| 4 | 最小 WI 触发 | 依赖完整 plugin → daemon 链路 |

### 根因分析

plugin 内部的 `sf_plugin_client.ts` 查找逻辑搜索：
- `$CONFIG/sf-runtime/sf_plugin_client.ts`（旧路径）
- `$CONFIG/lib/sf_plugin_client.ts`（部分匹配）

但 installer 将 `sf_plugin_client.ts` 部署到：
- `$CONFIG/sf-user/lib/sf_plugin_client.ts`

这是 plugin 源码中的路径常量与 installer 部署布局之间的对齐问题。修复方向：
1. 将 plugin 的搜索路径增加 `$CONFIG/sf-user/lib/` 选项；或
2. 将 installer 额外复制 `sf_plugin_client.ts` 到 `$CONFIG/lib/`。

## 9. Final Result

```
OpenCode session trial: PARTIAL
```

**判定依据**：
- OpenCode CLI 可用且 LLM provider 已配置 ✅
- OpenCode 正确读取 XDG 配置 ✅
- Plugin 文件被发现并尝试加载 ✅
- 所有 9 个 Agents 被识别并解析 ✅
- 但 Plugin 执行因内部路径不一致失败 ⚠️
- 导致 tools 注册、daemon 通信、WI 触发均未能完成

## 10. Non-Goals

- This trial does not declare v1.1-complete.
- This trial does not declare production-compliant.
- This trial does not declare production ready.
- This trial does not declare Production readiness: READY.
- This trial does not declare Trial readiness: READY.

## 11. Next Steps

1. 修复 plugin 中 `sf_plugin_client.ts` 的路径查找逻辑，增加 `$CONFIG/sf-user/lib/` 搜索路径
2. 修复后重新执行 `opencode run` 验证 plugin 是否成功初始化
3. 验证 tools 注册
4. 验证 daemon 通信
5. 验证最小 WI 触发
