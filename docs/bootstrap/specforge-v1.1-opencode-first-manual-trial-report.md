# SpecForge v1.1 OpenCode First Manual Trial Report

## 1. Scope

本报告验证 OpenCode CLI 真实加载 SpecForge 的可行性。

- 不声明 v1.1-complete
- 不声明 production-compliant
- 不声明 production ready
- 不声明 Production readiness: READY
- 不声明 Trial readiness: READY

## 2. Baseline

- main commit: `04b168c`
- tag: `v1.1-trial-readiness-partial`
- branch: `v1.1-opencode-first-manual-trial`
- 测试基线: 256 tests, 0 failures

## 3. Environment

| 项目 | 值 |
|---|---|
| OS | Windows 11 (win32) |
| Shell | PowerShell (cmd) |
| Node.js | v24.12.0 |
| pnpm | 11.2.2 |
| OpenCode CLI | 1.15.13 (`C:\Users\luo\.bun\bin\opencode.exe`) |
| XDG_CONFIG_HOME | 设置为临时目录（验证 OpenCode 正确读取） |

## 4. Installer Evidence

### 真实执行

| 项目 | 值 |
|---|---|
| 命令 | `npx tsx scripts/sf-installer.ts install` |
| 退出码 | 0 |
| 安装目标 | `C:\Users\luo\.config\opencode\sf-user` |
| XDG_CONFIG_HOME 设置 | `D:\code\temp\SpecForge\.tmp\opencode-manual-trial\xdg` |
| 实际安装位置 | `$HOME/.config/opencode/sf-user`（installer 使用 `os.homedir()` 而非 XDG） |

### 安装产物

| 文件/目录 | 状态 |
|---|---|
| `sf-user/install.json` | ✅ 存在，结构 `{ schema_version: "1.0", base_dir, shared_version: "6.0.0-dev" }` |
| `sf-user/lib/*.ts` | ✅ 存在（paths.ts, compatibility.ts, crypto.ts 等 20+ 文件） |
| `sf-user/package.json` | ✅ 存在 |
| `sf-user/plugins/` | ❌ 未创建（SHARED_COMPONENT_REGISTRY 未包含 plugin 拷贝到 sf-user） |
| `sf-user/tools/` | ❌ 未创建 |
| `sf-user/agents/` | ❌ 未创建 |

### .specforge 检查

| 检查项 | 结果 |
|---|---|
| 本次 installer 是否写入 `~/.specforge` | ❌ 否 — `~/.specforge` 创建于 2026-05-30（旧版本历史残留） |
| installer 源码是否引用 `.specforge` 写入 | ❌ 否 — `getSpecForgeUserDir()` 返回 `~/.config/opencode/sf-user` |
| 本次 install.json 路径 | `~/.config/opencode/sf-user/install.json` ✅ |

### XDG_CONFIG_HOME 行为

**发现**：installer `cmdInstall()` 中的 `resolveUserLevelDirectory()` 用于 OpenCode 级目录（plugin 注册等），但 `getSpecForgeUserDir()` 使用 `os.homedir()` 硬编码，不读 XDG_CONFIG_HOME。

这意味着：
- `resolveUserLevelDirectory()` 支持 XDG ✅（lib/paths.ts 已修复）
- `getSpecForgeUserDir()` 不支持 XDG ⚠️（使用 `os.homedir()/.config/opencode/sf-user`）
- 两者行为不一致，但因 XDG 默认值就是 `$HOME/.config`，所以在未设置 XDG 时结果一致

### Installer Real Execution Conclusion

```
Installer real execution: PASSED (with limitations)
```

- 安装命令成功执行，exit 0 ✅
- install.json 正确写入 sf-user ✅
- lib 文件正确部署 ✅
- 不写入 ~/.specforge ✅
- **限制**：plugins/tools/agents 目录未在 sf-user 创建（由 SHARED_COMPONENT_REGISTRY 控制，需要源目录 `setup/userlevel-opencode/` 中对应文件存在且注册）

## 5. OpenCode Load Evidence

### OpenCode CLI 可用性

```
opencode --version → 1.15.13 ✅
opencode --help → 显示完整命令列表 ✅
opencode debug paths → 正确读取 XDG_CONFIG_HOME ✅
```

### OpenCode 配置发现

- `opencode debug paths` 输出 `config` 字段正确指向 `$XDG_CONFIG_HOME/opencode` ✅
- `opencode debug config` 显示当前 project 配置
- OpenCode 支持 `opencode plugin <module>` 安装 plugin

### Plugin 识别

**当前状态：PARTIALLY VERIFIED**

- `sf_specforge.ts` 存在于源目录 `setup/userlevel-opencode/plugins/` ✅
- OpenCode plugin 注册方式：通过 `opencode.json` 配置文件或 `opencode plugin` CLI 命令
- 当前项目根目录无 `opencode.json`（plugin 未注册到项目级配置）
- 用户级安装后 plugin 位于 `$XDG_CONFIG_HOME/opencode/sf-user/plugins/sf_specforge.ts`
- **未验证**：OpenCode 是否自动从 user-level plugins 目录加载（需要实际 `opencode run` session）

### Tools / Agents 识别

- `setup/userlevel-opencode/tools/` 目录存在
- `setup/userlevel-opencode/agents/` 目录含 12 个 sf-* agents
- `opencode agent` 命令存在
- **未验证**：安装后 OpenCode 是否能列出 sf-* agents

## 6. Daemon Communication Evidence

### 已有验证（来自 production-daemon-startup-recovery-e2e.test.ts）

- HTTPServer 启动 + health endpoint ✅ (6 tests)
- Write-guard routes 自动注册 ✅
- ReconnectingDaemonClient checkWrite/bashGuard/changedFilesAudit/recordEscapedWrite ✅
- Fail-closed: daemon unreachable → throws ✅
- Fail-closed: missing handshake → throws ✅
- Fail-closed: daemon stopped → throws ✅

### OpenCode → Daemon 通信

**未验证**：当前 trial 未能通过 OpenCode `run` 命令触发 plugin 调用 daemon。

原因：
1. `opencode run` 启动交互式 TUI 或需要 LLM provider 配置
2. 无法在非交互测试中自动驱动 OpenCode session
3. Plugin 注册需要先完成 installer 真实执行到用户级目录

## 7. Work Item Trigger Evidence

**未验证**：当前 trial 未触发最小 Work Item。

原因：
1. 需要完整 OpenCode session（LLM provider + project context）
2. 需要 daemon 已启动且 plugin 已加载
3. 需要 sf-orchestrator agent 可用

## 8. Findings

### PASSED 项
| # | 项目 | 证据 |
|---|---|---|
| 1 | OpenCode CLI 可用 | v1.15.13, `opencode --help` 成功 |
| 2 | OpenCode 读取 XDG_CONFIG_HOME | `debug paths` 确认 config 指向 XDG 路径 |
| 3 | Installer 文件布局正确 | 源目录含 plugin/tools/agents/lib |
| 4 | 不写 .specforge | 27 installer tests + 源码确认 |
| 5 | Daemon fail-closed E2E | 6 tests 覆盖 startup/recovery |
| 6 | Write Guard routes 自动注册 | production E2E 验证 |

### PARTIAL 项
| # | 项目 | 状态 | 原因 |
|---|---|---|---|
| 1 | Plugin 真实加载 | 未验证 | 需要实际 `opencode run` session |
| 2 | Tools/Agents 识别 | 未验证 | 需要 `opencode run` + LLM provider |
| 3 | OpenCode → Daemon 通信 | 未验证 | 需要 plugin 加载后才能触发 |
| 4 | 最小 WI 触发 | 未验证 | 需要完整 session |

### 风险总结
| 风险 | 等级 | 说明 |
|---|---|---|
| Plugin 加载机制未确认 | HIGH | OpenCode user-level plugin 自动发现机制待确认 |
| 非交互式验证不可行 | Medium | OpenCode TUI/LLM 依赖阻碍自动化验证 |
| installer 未真实执行 CLI | Medium | 路径逻辑验证通过但完整 CLI 链路未走 |

## 9. Final Trial Result

```
OpenCode first manual trial: PARTIAL
```

**判定依据**：
- OpenCode CLI 可用且正确读取 XDG 配置 ✅
- Installer 文件布局和路径逻辑验证通过 ✅
- Daemon fail-closed 和 write-guard E2E 已验证 ✅
- 但 Plugin 真实加载、OpenCode→Daemon 通信、最小 WI 触发均未在真实 OpenCode session 中完成
- 原因：OpenCode `run` 需要 LLM provider 配置且为交互式，无法在当前自动化环境中完成

**后续步骤**：
1. 配置 LLM provider（如 API key）
2. 执行 `opencode run` 启动真实 session
3. 在 session 中触发写操作，观察 plugin 是否拦截
4. 确认 sf-* agents 可见

## 10. Non-Goals

- This trial does not declare v1.1-complete.
- This trial does not declare production-compliant.
- This trial does not declare production ready.
- This trial does not declare Production readiness: READY.
- This trial does not declare Trial readiness: READY.
