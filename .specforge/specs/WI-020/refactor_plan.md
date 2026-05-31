# Refactor Plan: 安装路径统一重构

> Work Item: WI-020
> 基于: intake.md + refactor_analysis.md + 6 个源文件完整阅读
> 日期: 2026-05-30

---

## 重构策略

本次重构采用**原子切换**策略：将"部署目标路径变更"和"运行时 import 路径变更"作为同一个原子步骤执行，确保在切换前后系统要么完全使用旧路径，要么完全使用新路径，不存在中间的混合状态。具体方法如下：

1. **先加后删**：先添加新的路径基础设施函数（`resolveSpecForgeHome`），再切换部署目标和 import 路径，最后清理旧路径
2. **原子切换**：部署目标变更 + import 路径变更 + package.json 目标变更在同一步骤完成，因为它们相互依赖——任何单独变更都会导致已部署系统无法运行
3. **分层推进**：每一步聚焦一个关注点，验证通过后再进入下一步

---

## 步骤顺序

以下是详细的执行步骤。每步完成后代码均可独立运行和验证。

### Step 1: 添加路径基础设施函数

为运行时程序提供 `resolveSpecForgeHome()` 函数，从 `install.json` 读取安装根路径。此步为纯增量操作，不修改任何现有行为。

**修改文件**: `setup/userlevel-scripts-lib/paths.ts`

**具体改动**:

1. 在文件末尾（L186 之后）添加 `resolveSpecForgeHome()` 函数：

```typescript
/**
 * SpecForge 安装根目录路径（~/.specforge/）
 *
 * 读取 install.json 中的 base_dir 字段获取安装根路径。
 * 若 install.json 不存在或无法解析，回退到 ~/.specforge/。
 */
export function resolveSpecForgeHome(): string {
  const home = osModule.homedir();
  const defaultDir = pathModule.join(home, '.specforge');

  try {
    const installJsonPath = pathModule.join(defaultDir, 'install.json');
    const raw = require('node:fs').readFileSync(installJsonPath, 'utf-8');
    const data = JSON.parse(raw);
    if (data && typeof data.base_dir === 'string') {
      // 展开 ~ 为 home 目录
      return data.base_dir.replace(/^~[/\\]/, home + pathModule.sep);
    }
  } catch {
    // install.json 不存在或解析失败，使用默认路径
  }

  return defaultDir;
}
```

**验证方式**:
```bash
bun -e "import { resolveSpecForgeHome } from './setup/userlevel-scripts-lib/paths'; console.log(resolveSpecForgeHome())"
```
预期输出: `C:\Users\luo\.specforge`（或当前用户的 home 目录下的 `.specforge`）

**安全性**: 纯增量，不影响现有代码。`bun scripts/sf-installer.ts install` 仍然正常工作。

---

### Step 2: 变更部署目标 + 变更 import 路径（原子步骤）

此步将安装器的 3 个部署目标统一为 `~/.specforge/`，同时修改运行时文件的 import 路径以匹配新位置。这是本重构的核心步骤，所有变更必须作为一个整体提交。

#### 2.1 修改安装器: 合并 scripts/lib 部署到 ~/.specforge/lib/

**修改文件**: `scripts/sf-installer.ts`

**具体改动 — cmdInstall (L295-329)**:

将原来分散的两块 scripts/lib 部署代码合并为一个，目标统一为 `~/.specforge/lib/`。

删除 L295-329 的旧代码（两块 deploy scripts/lib 逻辑），替换为：

```typescript
// 部署 lib/ 依赖文件到 ~/.specforge/lib/
// 合并两个源：userlevel-scripts-lib/（26 个 .ts）+ userlevel-opencode/scripts/lib/（sf_plugin_client.ts）
const specForgeDir = getSpecForgeUserDir()
const libTarget = path.join(specForgeDir, "lib")
if (!fs.existsSync(libTarget)) {
  fs.mkdirSync(libTarget, { recursive: true })
}

// 源 1: setup/userlevel-scripts-lib/ → ~/.specforge/lib/
const scriptsLibSource = path.join(sourceDir, "setup", "userlevel-scripts-lib")
if (fs.existsSync(scriptsLibSource)) {
  const scriptsLibFiles = fs.readdirSync(scriptsLibSource).filter((f) => f.endsWith(".ts"))
  for (const file of scriptsLibFiles) {
    fs.copyFileSync(
      path.join(scriptsLibSource, file),
      path.join(libTarget, file)
    )
  }
  deployedCount += scriptsLibFiles.length
}

// 源 2: setup/userlevel-opencode/scripts/lib/ → ~/.specforge/lib/
const pluginScriptsLibSource = path.join(sourceDir, "setup", "userlevel-opencode", "scripts", "lib")
if (fs.existsSync(pluginScriptsLibSource)) {
  const pluginScriptsLibFiles = fs.readdirSync(pluginScriptsLibSource).filter((f) => f.endsWith(".ts"))
  for (const file of pluginScriptsLibFiles) {
    fs.copyFileSync(
      path.join(pluginScriptsLibSource, file),
      path.join(libTarget, file)
    )
  }
  deployedCount += pluginScriptsLibFiles.length
}
```

**具体改动 — cmdUpgrade (L491-523)**:

同样替换两块部署代码（L491-506 和 L508-523），使用与 cmdInstall 相同的逻辑（目标为 `~/.specforge/lib/`）。

**具体改动 — deployScriptsPackageJson (L876-913)**:

将 `targetDir` 从 `~/.config/scripts/` 改为 `~/.specforge/`：

```typescript
// L883 原代码:
const targetDir = path.resolve(userLevelDir, "..", "scripts")
// 改为:
const targetDir = getSpecForgeUserDir()
```

同时更新 L895 的日志消息：
```typescript
// 原: console.log(`📦 安装 ~/.config/scripts/ 依赖（zod 等）...`)
// 改:
console.log(`📦 安装 ${targetDir} 依赖（zod 等）...`)
```

#### 2.2 修改 utils.ts: 动态 import 改为绝对路径

**修改文件**: `setup/userlevel-opencode/tools/lib/utils.ts`

**具体改动 — 顶部 import (L1-8)**:

在现有 import 后添加：

```typescript
import { resolveSpecForgeHome } from "../../../scripts/lib/paths"
```

> 注意：此路径为**源码仓库中的相对路径**（开发态）。安装部署后，utils.ts 位于 `~/.config/opencode/tools/lib/`，paths.ts 位于 `~/.specforge/lib/`，二者不在同一目录，所以**部署态**需要通过绝对路径 import。
>
> 但由于 `resolveSpecForgeHome()` 仅在运行时调用（不在模块加载时），且 `utils.ts` 在部署时通过安装器复制，install 后 `~/.config/opencode/tools/lib/utils.ts` 中的 import 路径需要能解析到 `paths.ts`。
>
> **解决方案**：不在顶部静态 import paths.ts，而是在 `tryCheckCompatibility` 内部动态解析绝对路径。

**具体改动 — tryCheckCompatibility (L132-145)**:

替换整个函数体：

```typescript
export async function tryCheckCompatibility(
  baseDir: string,
  component: string
): Promise<void> {
  try {
    // 从 ~/.specforge/install.json 获取安装根路径，拼接绝对路径
    const home = require("node:os").homedir()
    const pathMod = require("node:path")
    const { pathToFileURL } = require("node:url")

    // 尝试读取 install.json 获取 base_dir
    let specForgeHome = pathMod.join(home, ".specforge")
    try {
      const installJson = require("node:fs").readFileSync(
        pathMod.join(specForgeHome, "install.json"), "utf-8"
      )
      const data = JSON.parse(installJson)
      if (data && typeof data.base_dir === "string") {
        specForgeHome = data.base_dir.replace(/^~[/\\]/, home + pathMod.sep)
      }
    } catch { /* 使用默认路径 */ }

    const compatibilityPath = pathMod.join(specForgeHome, "lib", "compatibility.ts")
    const mod = await import(pathToFileURL(compatibilityPath).href)
    if (mod && typeof mod.checkCompatibilityAtEntry === "function") {
      mod.checkCompatibilityAtEntry(baseDir)
    }
  } catch (err) {
    // Import or execution failed — log and silently continue
    await logErrorToFile(baseDir, component, "dynamic_import_failed", err)
  }
}
```

**关键设计决策**:
- 使用 `pathToFileURL()` 将路径转为 `file://` URL，确保 Windows 上正确解析
- 内联读取 install.json，不依赖外部 import（因为 paths.ts 在不同目录）
- 失败时静默降级，与原有行为一致

#### 2.3 修改 sf_specforge.ts: import 改为绝对路径

**修改文件**: `setup/userlevel-opencode/plugins/sf_specforge.ts`

**具体改动 — L1-2 import 语句**:

替换为动态 import：

```typescript
import type { Hooks, PluginInput } from "@opencode-ai/plugin"

// 动态加载 sf_plugin_client — 从 ~/.specforge/lib/ 读取
const { join } = require("node:path")
const { homedir } = require("node:os")
const { pathToFileURL } = require("node:url")
const { readFileSync } = require("node:fs")

let specForgeHome = join(homedir(), ".specforge")
try {
  const raw = readFileSync(join(specForgeHome, "install.json"), "utf-8")
  const data = JSON.parse(raw)
  if (data && typeof data.base_dir === "string") {
    specForgeHome = data.base_dir.replace(/^~[/\\]/, homedir() + require("node:path").sep)
  }
} catch { /* 使用默认路径 */ }

const { createReconnectingDaemonClient } = await import(
  pathToFileURL(join(specForgeHome, "lib", "sf_plugin_client.ts")).href
)
```

**关键设计决策**:
- 使用 top-level await（bun 原生支持 ESM top-level await）
- 与 utils.ts 相同的路径解析策略：先读 install.json，再拼接绝对路径，再用 pathToFileURL
- `createReconnectingDaemonClient` 在模块加载时调用（L8），所以 import 必须在顶层完成

#### 2.4 添加 install.json 写入

**修改文件**: `scripts/sf-installer.ts`

**具体改动 — 在 cmdInstall 中 manifest 写入之后（约 L344）添加**:

```typescript
// 写入 install.json（安装元数据）
const installJson = {
  schema_version: "1.0",
  base_dir: getSpecForgeUserDir(),
  shared_version: manifest.shared_version,
  installed_at: manifest.installed_at,
}
const installJsonPath = path.join(getSpecForgeUserDir(), "install.json")
fs.writeFileSync(installJsonPath, JSON.stringify(installJson, null, 2) + "\n")
console.log(`   install.json 已写入: ${installJsonPath}`)
```

同样在 cmdUpgrade 中（manifest 写入之后）添加相同的 install.json 写入逻辑。

**验证方式**:

```bash
# 1. 执行安装
bun scripts/sf-installer.ts install

# 2. 检查新目录结构
ls ~/.specforge/lib/          # 应有 26+ 个 .ts 文件（包含 compatibility.ts, types.ts, sf_plugin_client.ts, paths.ts）
ls ~/.specforge/install.json  # 应存在
ls ~/.specforge/package.json  # 应存在
ls ~/.specforge/node_modules/ # 应存在，包含 zod

# 3. 验证 zod 解析链
bun -e "
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { homedir } from 'node:os'
const p = join(homedir(), '.specforge', 'lib', 'types.ts')
const mod = await import(pathToFileURL(p).href)
console.log('zod 解析成功:', typeof mod.SUPPORTED_SCHEMA_VERSIONS)
"

# 4. 验证旧目录不存在（首次安装时）
# 注意：如果是升级安装，旧目录可能仍存在，需等 Step 4 清理
```

**安全性**: 此步骤完成后，新安装的系统完全使用新路径。旧安装的系统不受影响（源码仓库的变更不影响已部署的文件）。

---

### Step 3: 迁移 manifest 到 ~/.specforge/

将 `specforge-manifest.json` 的存储位置从 `~/.config/opencode/` 迁移到 `~/.specforge/`。此步需要同时修改写入端（安装器）和读取端（compatibility.ts、verify.ts、showVersion）。

#### 3.1 修改 manifest 读写路径

**修改文件**: `scripts/lib/manifest.ts`

**具体改动 — readUserManifest (L95-129)**:

L98 修改 manifest 路径构建方式：

```typescript
// 原代码:
const manifestPath = join(userLevelDir, "specforge-manifest.json")
// 改为: manifest 存放在 ~/.specforge/ 下
const home = require("node:os").homedir()
const manifestPath = join(home, ".specforge", "specforge-manifest.json")
```

**具体改动 — writeUserManifest (L351-364)**:

L362 同样修改路径：

```typescript
// 原代码:
const manifestPath = join(userLevelDir, "specforge-manifest.json")
// 改为:
const home = require("node:os").homedir()
const manifestPath = join(home, ".specforge", "specforge-manifest.json")
```

> 注意：`manifest.ts` 中还有 `readAndValidateManifest`（L158）和 `writeManifest`（L560）函数也使用 `join(targetDir, "specforge-manifest.json")` 构建路径。这些函数的 `targetDir` 参数由调用方传入，需检查调用方传入的值。
>
> - `readAndValidateManifest` 被 `verify.ts` 的 `verifyInstallation` 调用，传入 `targetDir` = `userLevelDir`
> - `writeManifest` 被 reconcile 流程调用
>
> **方案**: 为这些函数新增参数 `specForgeDir`，或者直接在函数内部使用 `~/.specforge/`。推荐在函数内部硬编码路径，与 `readUserManifest`/`writeUserManifest` 保持一致。

**修改文件**: `scripts/lib/verify.ts`

**具体改动 — verifyInstallation (L85-136)**:

L87 修改调用方式，传入正确的目录：

```typescript
// 原代码:
const manifestResult = await readAndValidateManifest(targetDir)
// 需要确认 readAndValidateManifest 内部路径已更新（见上文 manifest.ts 改动）
```

由于 `readAndValidateManifest` 在 `manifest.ts` 内部已改为使用 `~/.specforge/`，verify.ts 调用时只需确保传入的参数不影响路径构建。如果 `readAndValidateManifest` 内部完全自行构建路径（不依赖 targetDir 参数），则 verify.ts 无需修改。

#### 3.2 修改 compatibility.ts: manifest 读取路径

**修改文件**: `setup/userlevel-scripts-lib/compatibility.ts`

**具体改动 — assertCompatibility (L141-142)**:

```typescript
// 原代码:
const userLevelDir = resolveUserLevelDirectory()
const userManifestPath = join(userLevelDir, `${SPEC_DIR_NAME.slice(1)}-manifest.json`)

// 改为: manifest 现在位于 ~/.specforge/specforge-manifest.json
const home = require("node:os").homedir()
const userManifestPath = join(home, SPEC_DIR_NAME, `${SPEC_DIR_NAME.slice(1)}-manifest.json`)
```

#### 3.3 修改 sf-installer.ts: showVersion 和 cmdVerify

**修改文件**: `scripts/sf-installer.ts`

**具体改动 — showVersion (L127-143)**:

L128 修改 manifest 路径：

```typescript
// 原代码:
const manifestPath = path.join(userLevelDir, "specforge-manifest.json")
// 改为:
const manifestPath = path.join(getSpecForgeUserDir(), "specforge-manifest.json")
```

**具体改动 — cmdVerify (L641-675)**:

L658 调用 `verifyInstallation(userLevelDir)` — 如果 verify.ts 内部已自行解析路径，此处参数可保持不变或改为传入 specForgeDir。根据 verify.ts 的改动情况调整。

**具体改动 — cmdUninstall (L681-745)**:

L727 修改 manifest 删除路径：

```typescript
// 原代码:
const manifestPath = path.join(userLevelDir, "specforge-manifest.json")
// 改为:
const manifestPath = path.join(getSpecForgeUserDir(), "specforge-manifest.json")
```

同时在 uninstall 中添加 `install.json` 的删除：

```typescript
// 删除 install.json
const installJsonPath = path.join(getSpecForgeUserDir(), "install.json")
if (fs.existsSync(installJsonPath)) {
  fs.unlinkSync(installJsonPath)
}
```

**验证方式**:

```bash
# 1. 执行安装
bun scripts/sf-installer.ts install

# 2. 检查 manifest 位置
ls ~/.specforge/specforge-manifest.json   # 应存在
ls ~/.config/opencode/specforge-manifest.json  # 不应存在

# 3. 版本显示
bun scripts/sf-installer.ts --version     # 应正常显示版本

# 4. 完整性校验
bun scripts/sf-installer.ts verify        # 应通过

# 5. 兼容性检查（在任意 SpecForge 项目中）
bun -e "
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { homedir } from 'node:os'
const p = join(homedir(), '.specforge', 'lib', 'compatibility.ts')
const mod = await import(pathToFileURL(p).href)
const result = mod.checkCompatibilityAtEntry(process.cwd())
console.log('兼容性检查通过')
"
```

---

### Step 4: 添加旧路径清理逻辑

在 uninstall 和 upgrade 子命令中添加对旧部署路径的清理。此步确保已安装用户升级后不会遗留旧目录。

**修改文件**: `scripts/sf-installer.ts`

**具体改动 — cmdUninstall (L681-745)**:

在 Step 6（删除 User_Manifest）之后、Step 7（显示卸载摘要）之前，添加旧路径清理：

```typescript
// Step 6.5: 清理旧版本遗留目录
// 旧版安装器将 scripts/lib 部署到以下位置，升级后需清理
const oldPaths = [
  path.resolve(userLevelDir, "..", "scripts"),          // ~/.config/scripts/ (package.json + node_modules + 26 .ts)
  path.join(userLevelDir, "scripts"),                   // ~/.config/opencode/scripts/ (sf_plugin_client.ts)
  path.join(userLevelDir, "specforge-manifest.json"),   // 旧版 manifest 位置（若仍存在）
]

for (const oldPath of oldPaths) {
  if (fs.existsSync(oldPath)) {
    try {
      fs.rmSync(oldPath, { recursive: true, force: true })
      console.log(`   ✓ 已清理旧路径: ${oldPath}`)
    } catch {
      console.warn(`   ⚠ 无法清理旧路径: ${oldPath}`)
    }
  }
}
```

**具体改动 — cmdUpgrade (L392-634)**:

在 Step 9（journal 清理）之后、成功摘要之前，添加相同的旧路径清理逻辑：

```typescript
// 清理旧版本遗留目录
const oldPaths = [
  path.resolve(userLevelDir, "..", "scripts"),          // ~/.config/scripts/
  path.join(userLevelDir, "scripts"),                   // ~/.config/opencode/scripts/
  path.join(userLevelDir, "specforge-manifest.json"),   // 旧版 manifest
]

for (const oldPath of oldPaths) {
  if (fs.existsSync(oldPath)) {
    try {
      fs.rmSync(oldPath, { recursive: true, force: true })
      console.log(`   ✓ 已清理旧路径: ${oldPath}`)
    } catch {
      console.warn(`   ⚠ 无法清理旧路径: ${oldPath}`)
    }
  }
}
```

**验证方式**:

```bash
# 1. 先用旧版安装器安装（或手动创建旧目录结构）
#    跳过此步如果已是新安装

# 2. 执行升级
bun scripts/sf-installer.ts upgrade --force

# 3. 检查旧目录已清理
# ~/.config/scripts/          — 不应存在
# ~/.config/opencode/scripts/ — 不应存在

# 4. 完整卸载测试
bun scripts/sf-installer.ts install
bun scripts/sf-installer.ts uninstall

# 5. 检查所有 SpecForge 相关路径已清理
ls ~/.specforge/              — 不应存在（或仅剩空目录）
ls ~/.config/scripts/         — 不应存在
ls ~/.config/opencode/scripts/ — 不应存在
```

---

### Step 5: SPEC_DIR_NAME 常量统一

消除 4 处 `SPEC_DIR_NAME = '.specforge'` 的重复定义，统一使用 paths.ts 中的导出常量。此步为代码质量改善，不影响功能。

**修改文件**: `setup/userlevel-opencode/tools/lib/utils.ts`

**具体改动 — L9**:

```typescript
// 删除:
const SPEC_DIR_NAME = '.specforge' as const;
// 替换为内联使用（因为 utils.ts 与 paths.ts 在部署后不在同一目录，
// 且 utils.ts 已有内联的 install.json 读取逻辑，增加一个常量 import
// 的复杂度不值得——直接使用字符串字面量 ".specforge" 更清晰）
```

由于 utils.ts 部署在 `~/.config/opencode/tools/lib/`，无法通过相对路径 import paths.ts（它们不在同一目录树），且 utils.ts 的 `SPEC_DIR_NAME` 仅用于 2 处（L93, L108），都是项目级 `.specforge/` 目录路径拼接。**建议保留 utils.ts 中的本地定义**，改为注释说明来源：

```typescript
/** SpecForge 项目级目录名 — 与 paths.ts/SPEC_DIR_NAME 保持同步 */
const SPEC_DIR_NAME = '.specforge' as const;
```

**修改文件**: `setup/userlevel-opencode/scripts/lib/sf_plugin_client.ts`

**具体改动 — L19**:

```typescript
// 删除:
const SPEC_DIR_NAME = ".specforge" as const;
// 替换为从 paths.ts import（部署后 sf_plugin_client.ts 与 paths.ts 在同一目录 ~/.specforge/lib/）
import { posixToNative } from "./paths"
// 但 sf_plugin_client.ts 当前不使用 posixToNative，且 paths.ts 未导出 SPEC_DIR_NAME
// 所以最佳方案：保留本地定义，添加同步注释
```

由于 `sf_plugin_client.ts` 部署后位于 `~/.specforge/lib/`，与 `paths.ts` 同目录，理论上可以 import。但 `paths.ts` 当前未导出 `SPEC_DIR_NAME` 常量。需要在 paths.ts 中添加导出：

**修改文件**: `setup/userlevel-scripts-lib/paths.ts`

在 `resolveSpecForgeHome()` 函数之前添加常量导出：

```typescript
/** SpecForge 用户级安装目录名 */
export const SPEC_DIR_NAME = ".specforge" as const
```

然后修改 `sf_plugin_client.ts`：

```typescript
// 删除 L19:
const SPEC_DIR_NAME = ".specforge" as const;
// 替换为:
import { SPEC_DIR_NAME } from "./paths"
```

修改 `compatibility.ts`：

```typescript
// 删除 L26:
const SPEC_DIR_NAME = ".specforge" as const
// 替换为（compatibility.ts 与 paths.ts 部署后同在 ~/.specforge/lib/）:
import { SPEC_DIR_NAME } from "./paths"
```

> 注意：compatibility.ts 当前 L13 已有 `import { resolveUserLevelDirectory } from "./paths"`，只需在同一行添加 `SPEC_DIR_NAME`：
> ```typescript
> import { resolveUserLevelDirectory, SPEC_DIR_NAME } from "./paths"
> ```

**验证方式**:

```bash
# 1. 全局搜索 SPEC_DIR_NAME 定义，应只剩 2 处：
#    - setup/userlevel-scripts-lib/paths.ts（统一定义，已导出）
#    - setup/userlevel-opencode/tools/lib/utils.ts（保留，因跨目录无法 import）

# 2. 重新安装验证
bun scripts/sf-installer.ts install

# 3. 兼容性检查仍正常
bun scripts/sf-installer.ts verify
```

---

## 风险等级判定

**风险等级：低**

### 判定依据

| 因素 | 评估 |
|------|------|
| **代码范围可控** | 变更集中在 6 个文件（sf-installer.ts, utils.ts, sf_specforge.ts, paths.ts, compatibility.ts, manifest.ts），不涉及业务逻辑修改 |
| **技术验证已通过** | zod 依赖解析链在目标路径 `~/.specforge/lib/` 下已验证可工作；bun 运行时绝对路径 import 链通畅 |
| **行为边界清晰** | 8 条不变行为声明（INV-1 至 INV-8），每条都有明确验证方式 |
| **无外部 API 变更** | 安装器 CLI 接口不变，opencode.json schema 不变，OpenCode 加载方式不变 |
| **可回滚** | 重构前版本可通过 git revert 恢复；已安装文件可通过 uninstall 清理 |
| **无并发风险** | 安装器有 acquireInstallLock 机制，无竞态条件 |
| **步骤间独立可验证** | 每步都有明确的验证命令，可以独立确认该步骤的正确性 |

### 潜在风险点及缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Windows 路径分隔符：绝对路径 import 在 Windows 上需正确处理反斜杠 | Plugin/Tool 加载失败 | 已在 Step 2 中使用 `pathToFileURL()` 将路径转为 `file://` URL，跨平台安全 |
| 旧版本升级兼容：已安装用户 `~/.config/scripts/` 有残留 | 磁盘空间浪费（不影响功能） | Step 4 添加了 upgrade 时的旧路径清理逻辑 |
| `sf_specforge.ts` 改为 top-level await | 若 OpenCode plugin 加载不支持 top-level await 则 Plugin 无法加载 | bun 运行时原生支持 top-level await；且 sf_specforge.ts 原本就有异步初始化流程 |
| manifest 迁移后旧版 installer 读取失败 | 使用旧版 installer 的 verify 命令会报 manifest 不存在 | upgrade 命令会同时清理旧 manifest 位置并写入新位置，不存在中间状态 |
| `resolveSpecForgeHome()` 内联在 utils.ts 而非 import paths.ts | 代码重复，未来路径变更需改两处 | 重复范围小（仅 3 行路径读取逻辑），且 utils.ts 跨目录 import 的复杂度更高；已在 Step 5 注释标注同步关系 |
