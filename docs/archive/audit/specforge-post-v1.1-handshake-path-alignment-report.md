# SpecForge v1.1 Handshake Path Alignment Report

**日期**: 2026-06-12
**分支**: post-v1.1-handshake-path-alignment
**基准 commit**: a60f5f9

---

## 1. 根因分析

### 症状

- Daemon 启动日志：`Handshake file written to: C:\Users\luo\.specforge\runtime\handshake.json`
- OpenCode plugin 报错：`[sf:specforge] Project registration failed: Daemon handshake not found`

### 根因

daemon-core source (`src/daemon/path-resolver.ts`) **已经正确实现 v1.1 路径策略**：

```typescript
// PersonalPathResolver.resolveDaemonRuntimeDir()
return path.join(resolveOpenCodeConfigRoot(), 'sf-user', 'runtime');
// → ~/.config/opencode/sf-user/runtime/
```

但 daemon-core 的 **`dist/` 编译产物是旧版**（`dist/` 在 `.gitignore` 中不受版本控制），仍使用：

```javascript
resolveDaemonRuntimeDir() {
    return path.join(os.homedir(), SPEC_USER_DIR_NAME, 'runtime');
}
// → ~/.specforge/runtime/ (WRONG)
```

用户通过 `bun run dist/index.js` 启动 daemon 时，使用了这个旧版编译产物。

### 不一致点

| 组件 | 路径 | 修复前 | 修复后 |
|------|------|--------|--------|
| daemon source | `resolveOpenCodeConfigRoot() + 'sf-user/runtime/'` | ✅ 正确 | ✅ 正确 |
| daemon stale dist | `os.homedir() + SPEC_USER_DIR_NAME + 'runtime/'` | ❌ legacy | ✅ 重建后正确 |
| plugin client | `resolveOpenCodeConfigRoot() + 'sf-user/runtime/'` | ✅ 正确 | ✅ 正确 |

## 2. 修复动作

### 执行内容

1. 在 `packages/daemon-core/` 执行 `npx tsc` 重新编译 dist
2. dist/ 重建后 `PersonalPathResolver.resolveDaemonRuntimeDir()` 正确调用 `resolveOpenCodeConfigRoot()`

### 无源码修改

daemon-core 源码(`src/`)、plugin client、installer **均无修改**。问题仅在于本地 dist/ 是过期编译产物。

## 3. 真实验证

### Daemon 启动验证

```
执行: bun run dist/index.js (从 packages/daemon-core/)
日志: Handshake file written to: C:\Users\luo\.config\opencode\sf-user\runtime\handshake.json
      Daemon Core started on port 48275
      Daemon Core started successfully
```

### 文件系统验证

```powershell
Test-Path "$env:USERPROFILE\.config\opencode\sf-user\runtime\handshake.json"
# True ✅

Test-Path "$env:USERPROFILE\.specforge\runtime\handshake.json"
# False ✅
```

### Handshake 内容

```json
{
  "schema_version": "1.0",
  "pid": 32016,
  "port": 48275,
  "token": "c5d4b86c...",
  "startedAt": 1781260097406,
  "version": "1.0.0",
  "serviceMode": false
}
```

## 4. 路径策略（确认符合 v1.1）

| 用途 | 路径 | 规则 |
|------|------|------|
| 新默认写入 | `OPENCODE_CONFIG_DIR/sf-user/runtime/handshake.json` | daemon 写入 |
| Fallback（XDG） | `XDG_CONFIG_HOME/opencode/sf-user/runtime/handshake.json` | 如设置 XDG |
| Windows 默认 | `~/.config/opencode/sf-user/runtime/handshake.json` | 无 env 变量时 |
| Legacy | `~/.specforge/runtime/handshake.json` | **不写入，不读取** |

## 5. 测试结果

| 测试包 | 通过 | 失败 | 基线对比 |
|--------|------|------|----------|
| scripts/ | 142 | 0 | 一致 ✅ |
| packages/daemon-core/ | 799 | 302 | 一致 ✅ |
| packages/workflow-runtime/ (non-property) | 1595 | 9 | 一致 ✅ |
| **合计** | **2536** | **311** | **一致 ✅** |

无新增失败。测试日志中 handshake 路径均为新路径。

## 6. 用户操作指南

修复后用户启动 daemon 的正确方式：

```bash
# 方式 1（推荐）：从源码启动（bun 原生支持 TS）
cd /path/to/specforge-repo
bun packages/daemon-core/src/index.ts

# 方式 2：重建 dist 后启动
cd packages/daemon-core
npx tsc
bun run dist/index.js
```

⚠️ **不要**使用未重建的旧 dist 启动。如果曾经编译过旧版本，必须先 `npx tsc` 重建。

## 7. 禁止事项合规

| 项目 | 状态 |
|------|------|
| 修改 daemon-core source | ❌ 未执行（已正确） |
| 修改 plugin client | ❌ 未执行（已正确） |
| 修改 installer | ❌ 未执行 |
| 修改 package.json | ❌ 未执行 |
| 手工复制 handshake 文件 | ❌ 未执行 |
| 让 plugin 读 legacy 路径 | ❌ 未执行 |
| 让 daemon 继续写 legacy | ❌ 未执行 |
| 打 tag | ❌ 未执行 |
| 声明 production ready | ❌ 未执行 |

---

## 回执

```
BRANCH=post-v1.1-handshake-path-alignment
BASE_MAIN_COMMIT=a60f5f9
HEAD_COMMIT=pending
NEW_COMMIT=pending
PUSHED=no
TAGGED=no

ROOT_CAUSE=local dist/ stale (gitignored); source already correct since v1.1 path-resolver refactor
DAEMON_OLD_HANDSHAKE_PATH=C:\Users\luo\.specforge\runtime\handshake.json
DAEMON_NEW_HANDSHAKE_PATH=C:\Users\luo\.config\opencode\sf-user\runtime\handshake.json
PLUGIN_HANDSHAKE_READ_PATH=C:\Users\luo\.config\opencode\sf-user\runtime\handshake.json
LEGACY_HANDSHAKE_FALLBACK_READ_ONLY=yes (not read, not written)

MODIFIED_DAEMON_CORE=no (source already correct; dist rebuilt locally)
MODIFIED_PLUGIN_CLIENT=no
MODIFIED_PATH_RESOLVER=no (source already correct)
MODIFIED_INSTALLER=no
MODIFIED_TESTS=no

DAEMON_LOG_NEW_PATH_VERIFIED=yes (live daemon started, logged new path)
LEGACY_DEFAULT_WRITE_REMOVED=yes (confirmed: Test-Path legacy = False)
OPENCODE_HANDSHAKE_ERROR_RESOLVED=pending (user must restart OpenCode after daemon restart)

TEST_RESULT=2536 pass / 311 fail (no new regressions)
TEST_BASELINE_STATUS=consistent with a60f5f9

REPORT_REL_PATH=docs/audit/specforge-post-v1.1-handshake-path-alignment-report.md

BLOCKING_RUNTIME_GAPS=none (source correct, dist rebuilt, daemon verified)
RECOMMEND_MERGE=yes (report only, no source changes)
RECOMMEND_NEXT_ACTION=restart OpenCode to verify plugin connects, then proceed with manual WI trial
```
