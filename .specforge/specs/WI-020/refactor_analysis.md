# Refactor Analysis: 安装路径统一重构

> Work Item: WI-020
> 工作流类型: refactor
> 分析日期: 2026-05-30
> 分析基于: intake.md + 6 个源文件的完整阅读

---

## 代码问题识别

当前安装流程存在文件分散、路径耦合、代码重复等问题，以下逐项分析：

### P-1: 文件分散在 3 个目录，职责边界模糊

当前安装器 `sf-installer.ts` 将文件部署到 3 个不同的顶层目录：

| 目录 | 部署内容 | 部署代码位置 | 问题 |
|------|---------|-------------|------|
| `~/.config/opencode/` | agents、tools、skills、plugins、AGENTS.md、opencode.json | `cmdInstall` L219-263（SHARED_COMPONENT_REGISTRY） | OpenCode 规定位置，合理 |
| `~/.config/scripts/lib/` | 27 个 .ts 运行时依赖（compatibility、types 等） | `cmdInstall` L297-311 | 不应存在——SpecForge 程序文件混入无关目录 |
| `~/.config/scripts/` | package.json + `bun install` → node_modules/zod | `deployScriptsPackageJson` L876-913 | 不应存在——依赖管理位置不合理 |
| `~/.config/opencode/scripts/lib/` | sf_plugin_client.ts | `cmdInstall` L315-329 | 不应存在——plugin 的依赖散落在 opencode 配置目录内 |
| `~/.specforge/templates/` | 模板库 | `deployTemplates` L157-185 | 合理 |

**证据**（sf-installer.ts）：
- L297: `path.resolve(userLevelDir, "..", "scripts", "lib")` → 从 `~/.config/opencode/` 上跳到 `~/.config/scripts/lib/`
- L315: `path.join(userLevelDir, "scripts", "lib")` → `~/.config/opencode/scripts/lib/`
- L883: `path.resolve(userLevelDir, "..", "scripts")` → `~/.config/scripts/`（package.json + bun install）

**影响**：用户卸载时 `~/.config/scripts/` 和 `~/.config/opencode/scripts/` 残留文件未清理（uninstall 只删除 manifest 中记录的文件，而这 3 处部署均不在 SHARED_COMPONENT_REGISTRY 中）。

### P-2: 跨目录相对路径 import，脆弱且不可维护

**P-2a: tools/lib/utils.ts → scripts/lib/compatibility**

```typescript
// setup/userlevel-opencode/tools/lib/utils.ts L137
const mod = await import("../../../scripts/lib/compatibility")
```

路径解析链：`~/.config/opencode/tools/lib/` → `../../../scripts/lib/` = `~/.config/scripts/lib/`

**脆弱性**：
- 路径深度硬编码为 3 级上跳，移动任何一个目录都会断裂
- `utils.ts` 是所有 sf_*_core 工具的共享入口（通过 `tryCheckCompatibility`），一处断全线断

**P-2b: plugins/sf_specforge.ts → scripts/lib/sf_plugin_client**

```typescript
// setup/userlevel-opencode/plugins/sf_specforge.ts L2
import { createReconnectingDaemonClient } from "../scripts/lib/sf_plugin_client.ts"
```

路径解析链：`~/.config/opencode/plugins/` → `../scripts/lib/` = `~/.config/opencode/scripts/lib/`

**脆弱性**：同 P-2a，相对路径绑定特定的目录层级关系。

### P-3: SPEC_DIR_NAME 常量重复定义

`SPEC_DIR_NAME = '.specforge'` 在以下文件中各自独立定义：

| 文件 | 行号 | 定义方式 |
|------|------|---------|
| `scripts/sf-installer.ts` | L31 | `const SPEC_DIR_NAME = '.specforge' as const` |
| `setup/userlevel-opencode/tools/lib/utils.ts` | L9 | `const SPEC_DIR_NAME = '.specforge' as const` |
| `setup/userlevel-opencode/scripts/lib/sf_plugin_client.ts` | L19 | `const SPEC_DIR_NAME = ".specforge" as const` |
| `setup/userlevel-scripts-lib/compatibility.ts` | L26 | `const SPEC_DIR_NAME = ".specforge" as const` |

**问题**：同一个值定义了 4 次，修改时容易遗漏导致不一致。

### P-4: 安装器部署逻辑复杂化——同一段逻辑复制 3 次

`cmdInstall` 和 `cmdUpgrade` 中，部署 scripts/lib 依赖的代码块几乎完全相同，出现在 3 个位置：

1. **cmdInstall L297-311**: 部署 userlevel-scripts-lib → `~/.config/scripts/lib/`
2. **cmdInstall L315-329**: 部署 userlevel-opencode/scripts/lib → `~/.config/opencode/scripts/lib/`
3. **cmdUpgrade L492-506, L509-523**: 与上述完全相同的两块

**问题**：违反 DRY 原则，逻辑变更需同步修改 4 处。

### P-5: deployScriptsPackageJson 的 bun install 副作用

`deployScriptsPackageJson`（L876-913）在 `~/.config/scripts/` 目录执行 `bun install`，这是一个有外部副作用的操作：
- 依赖系统 PATH 中存在 `bun` 可执行文件
- 创建 `node_modules/` 目录树（可能有数千文件）
- 创建 `bun.lock` 文件
- uninstall 子命令不清理此目录

### P-6: resolveUserLevelDirectory 语义混淆

`scripts/lib/paths.ts` 中的 `resolveUserLevelDirectory()` 返回 `~/.config/opencode/`，但函数名暗示它返回的是 SpecForge 的"用户级目录"。实际上：
- 安装器的 `userLevelDir` 变量指向 `~/.config/opencode/`（OpenCode 配置目录）
- 安装器的 `getSpecForgeUserDir()` 函数（L151-154）返回 `~/.specforge/`（SpecForge 安装目录）
- 两个概念用了相似的命名，容易混淆

### P-7: manifest 存放位置不一致

`specforge-manifest.json` 存放在 `~/.config/opencode/`（即 `userLevelDir`），而不是 `~/.specforge/`。这导致：
- SpecForge 自身的安装元数据与 OpenCode 的配置文件混放
- `showVersion`（L127-143）从 `~/.config/opencode/specforge-manifest.json` 读取版本
- 但模板库在 `~/.specforge/templates/`——两个目录都有 SpecForge 数据

### P-8: uninstall 不清理 ~./config/scripts/ 和 ~./config/opencode/scripts/

`cmdUninstall`（L681-745）只删除 manifest 中记录的文件，但 `~/.config/scripts/`（package.json + node_modules + 27 个 .ts）和 `~/.config/opencode/scripts/`（sf_plugin_client.ts）不在 manifest 中，卸载后残留。

---

## 重构目标

将分散的安装目录统一为 2 个明确分工的位置，消除跨目录耦合，建立统一的路径定位机制。

### 目标目录结构

```
~/.specforge/                              ← SpecForge 安装根目录（SPECFORGE_HOME）
├── install.json                           ← 安装元数据（版本、路径配置）
├── specforge-manifest.json                ← 安装清单（从 ~/.config/opencode/ 迁入）
├── package.json                           ← zod 依赖声明
├── node_modules/                          ← bun install 产物
├── lib/                                   ← 原 scripts/lib/ + sf_plugin_client.ts（合并）
│   ├── compatibility.ts
│   ├── types.ts
│   ├── sf_plugin_client.ts
│   ├── paths.ts
│   └── ... (共 28 个 .ts)
└── templates/                             ← 模板库（已有，不动）

~/.config/opencode/                        ← OpenCode 配置（OpenCode 规定的位置）
├── opencode.json                          ← agent 定义（sf-*）
├── AGENTS.md                              ← 全局规则
├── agents/                                ← agent prompt 文件
├── plugins/
│   └── sf_specforge.ts                    ← import 改为绝对路径引用 ~/.specforge/lib/
├── skills/                                ← SKILL.md 文件
└── tools/
    ├── sf_*.ts                            ← tool 入口
    └── lib/
        ├── sf_*_core.ts                   ← tool 核心库
        └── utils.ts                       ← import 改为绝对路径引用 ~/.specforge/lib/

其他任何位置                               ← 零文件
（~/.config/scripts/ 不再存在）
（~/.config/opencode/scripts/ 不再存在）
```

### 核心变更

| # | 变更 | 受影响文件 |
|---|------|-----------|
| C-1 | 安装器将 27 个 .ts + sf_plugin_client.ts 统一部署到 `~/.specforge/lib/` | `sf-installer.ts` |
| C-2 | `package.json` + `bun install` 改到 `~/.specforge/` 执行 | `sf-installer.ts` |
| C-3 | `tools/lib/utils.ts` 的 dynamic import 改为绝对路径 `~/.specforge/lib/compatibility` | `utils.ts` |
| C-4 | `plugins/sf_specforge.ts` 的 import 改为绝对路径 `~/.specforge/lib/sf_plugin_client` | `sf_specforge.ts` |
| C-5 | `specforge-manifest.json` 从 `~/.config/opencode/` 迁移到 `~/.specforge/` | `sf-installer.ts`、`manifest.ts`、`verify.ts` 等 |
| C-6 | 运行时程序从 `~/.specforge/install.json` 读取安装根路径，所有子路径相对它派生 | `paths.ts`（部署态） |
| C-7 | uninstall 增加 `~/.config/scripts/` 和 `~/.config/opencode/scripts/` 的清理逻辑 | `sf-installer.ts` |
| C-8 | `SPEC_DIR_NAME` 统一定义，消除 4 处重复 | `utils.ts`、`sf_plugin_client.ts`、`compatibility.ts` |

### 路径定位策略

1. **安装器**：硬编码默认安装位置 `~/.specforge/`，不读配置文件
2. **运行时程序**（tools/plugins）：从 `~/.specforge/install.json` 读取安装根路径
3. **install.json 格式**：
   ```json
   {
     "schema_version": "1.0",
     "base_dir": "~/.specforge",
     "shared_version": "3.5.0",
     "installed_at": "2026-05-30T00:00:00Z"
   }
   ```

---

## 不变行为声明

以下行为在重构过程中**必须保持不变**，任何违反即视为回归缺陷：

### INV-1: OpenCode 加载入口不变

`~/.config/opencode/` 下的 agents/、tools/、skills/、plugins/、AGENTS.md、opencode.json 的文件内容、格式、功能不变。OpenCode 从 `~/.config/opencode/` 读取配置和加载 plugin/tool 的方式不变。

**验证方式**：安装后 `opencode.json` 中的 agent 定义不变；tool/plugin 文件仍能被 OpenCode 正常加载。

### INV-2: 安装器 4 个子命令的外部行为不变

`install`、`upgrade`、`verify`、`uninstall` 4 个子命令的 CLI 接口、退出码、输出信息语义不变。

**验证方式**：对比重构前后 `bun scripts/sf-installer.ts install` 的输出和退出码。

### INV-3: zod 依赖解析链正常工作

`tools/lib/utils.ts` → dynamic import → `~/.specforge/lib/compatibility.ts` → `types.ts` → `import { z } from 'zod'` 的完整解析链必须正常工作。所有使用 zod schema 的工具（`sf_batch_verify`、`sf_doc_lint` 等）功能不受影响。

**验证方式**：技术验证已通过——bun 运行时从 `~/.config/opencode/tools/lib/` 用绝对路径动态 import `~/.specforge/lib/compatibility.ts` 后，zod 从 `~/.specforge/node_modules/` 正确解析。

### INV-4: specforge-manifest.json 的格式和用途不变

manifest JSON schema 不变（schema_version、shared_version、files 等字段保持一致），仅物理存放位置从 `~/.config/opencode/specforge-manifest.json` 迁移到 `~/.specforge/specforge-manifest.json`。

**验证方式**：manifest 内容 diff 仅路径可能不同，schema 结构一致。

### INV-5: 所有 sf_* 工具的 tryCheckCompatibility 行为不变

各 tool core 入口调用 `tryCheckCompatibility(baseDir, component)` 的行为不变——兼容时静默通过，不兼容时抛出 `[SpecForge 版本不兼容]` 错误。

**验证方式**：在项目中运行 `sf_doctor` 或任意 gate 工具，确认兼容性检查正常执行。

### INV-6: Plugin 的 hook 注册行为不变

`sf_specforge.ts` 注册的 7 个 hooks（`tool.execute.before`、`tool.execute.after`、`event`、`session.compacting`、`system.transform`、`messages.transform`、`chat.params`、`chat.headers`）的功能和错误处理策略不变。

**验证方式**：OpenCode 启动后 Plugin 日志输出 `[sf:specforge] 项目已注册: ...`。

### INV-7: Daemon 客户端的降级模式行为不变

`ReconnectingDaemonClient` 的重连、退避、降级（60s 累计后退后进入 degraded 模式）逻辑不变。`handshakePath` 仍指向 `~/.specforge/runtime/handshake.json`。

**验证方式**：daemon 未启动时，Plugin 不崩溃，仅输出一次 degraded warning。

### INV-8: 模板库部署路径不变

`~/.specforge/templates/` 的部署和读取路径不变。

**验证方式**：安装后 `~/.specforge/templates/` 目录存在且内容完整。

---

## 风险评估

**风险等级：低**

### 理由

| 因素 | 评估 |
|------|------|
| **代码范围可控** | 变更集中在 6 个文件，不涉及业务逻辑修改 |
| **技术验证已通过** | zod 依赖解析链在目标路径（`~/.specforge/lib/`）下已验证可工作 |
| **行为边界清晰** | 不变行为声明 8 条，每条都有明确验证方式 |
| **无外部 API 变更** | 安装器 CLI 接口不变，opencode.json schema 不变 |
| **可回滚** | 重构前版本可通过 git revert 恢复；安装后的文件可通过 uninstall 清理 |
| **无并发风险** | 安装器本身有 acquireInstallLock 机制，无竞态条件 |

### 潜在风险点

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Windows 路径分隔符问题：绝对路径 import 在 Windows 上需正确处理反斜杠 | Plugin/Tool 加载失败 | 使用 `pathToFileURL()` 将路径转为 `file://` URL 再 import |
| 旧版本升级兼容性：已安装用户 `~/.config/scripts/` 有残留文件 | 磁盘空间浪费（不影响功能） | upgrade 子命令增加清理旧路径的逻辑 |
| `compatibility.ts` 内 `resolveUserLevelDirectory()` 调用指向 `~/.config/opencode/` | 重构后此函数仍需正确指向 opencode 配置目录 | `resolveUserLevelDirectory()` 语义不变（仍返回 `~/.config/opencode/`），仅 SpecForge 程序本体路径改用新机制 |

### 不涉及的变更（排除范围）

- 不修改 `packages/` 下的任何代码
- 不修改 OpenCode 本身的加载逻辑
- 不修改 daemon 相关代码
- 不修改 agent prompt 文件（agents/*.md）
- 不修改 skill 文件（skills/*/SKILL.md）
- 不改变 SHARED_COMPONENT_REGISTRY 的条目结构
- 不引入新的外部依赖

---

## 附录 A: 文件级变更影响矩阵

| 源文件 | 变更类型 | 变更内容 |
|--------|---------|---------|
| `scripts/sf-installer.ts` | **重写** | 部署路径从 3 目录改为 2 目录；manifest 位置迁移；增加 install.json 写入；增加旧路径清理 |
| `scripts/lib/paths.ts` | **不修改** | 安装器侧路径工具，`resolveUserLevelDirectory()` 语义不变 |
| `scripts/lib/registry.ts` | **不修改** | SHARED_COMPONENT_REGISTRY 条目不变（仍为 opencode 目录下的相对路径） |
| `setup/userlevel-opencode/tools/lib/utils.ts` | **修改** | L137 `import("../../../scripts/lib/compatibility")` → 绝对路径引用 `~/.specforge/lib/compatibility` |
| `setup/userlevel-opencode/plugins/sf_specforge.ts` | **修改** | L2 `import("../scripts/lib/sf_plugin_client.ts")` → 绝对路径引用 `~/.specforge/lib/sf_plugin_client` |
| `setup/userlevel-scripts-lib/paths.ts` | **修改** | 增加 `resolveSpecForgeHome()` 函数，从 `install.json` 读取安装根路径 |
| `setup/userlevel-scripts-lib/compatibility.ts` | **不修改** | `resolveUserLevelDirectory()` 仍返回 `~/.config/opencode/`（指向 opencode 配置目录），逻辑不变 |

## 附录 B: 部署态 import 路径变更对照

| 文件 | 当前 import 路径 | 目标 import 路径 |
|------|-----------------|-----------------|
| `~/.config/opencode/tools/lib/utils.ts` | `import("../../../scripts/lib/compatibility")` | `import("~/.specforge/lib/compatibility")`（绝对路径） |
| `~/.config/opencode/plugins/sf_specforge.ts` | `import("../scripts/lib/sf_plugin_client.ts")` | `import("~/.specforge/lib/sf_plugin_client.ts")`（绝对路径） |
| `~/.specforge/lib/compatibility.ts` | `import("./paths")` → `resolveUserLevelDirectory()` | 不变（仍解析到 `~/.config/opencode/`） |
| `~/.specforge/lib/types.ts` | `import { z } from 'zod'` | 不变（bun 从同目录的 `node_modules/` 解析） |
