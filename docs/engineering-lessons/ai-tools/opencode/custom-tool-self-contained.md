---
id: opencode-custom-tool-self-contained
scope: tool-specific
tool: opencode
roles: [executor, architect]
severity: high
tags: [opencode, custom-tool, plugin, import, deployment, self-contained]
created: 2026-05-20
updated: 2026-05-20
related: [shell-command-execution, host-environment-detection]
---

# OpenCode 自定义工具必须完全自包含（禁止跨目录 import）

## 症状

安装 SpecForge 后，OpenCode 所有 agent（包括内置 Build/Plan）全部卡死——发消息后无任何回复，底部一直转圈。

卸载 SpecForge（删除 `~/.config/opencode/tools/` 目录）后立即恢复正常。

## 根因

`~/.config/opencode/tools/lib/sf_safe_bash_core.ts` 文件中有如下 import：

```typescript
// ❌ 指向仓库目录，部署后路径断裂
import type { HostProfile } from "../../../scripts/lib/host-profile/types"
import { loadHostProfile } from "../../../scripts/lib/host-profile/scanner"
```

这些相对路径在开发仓库（`D:\code\temp\SpecForge\.opencode\tools\lib\`）里是有效的，但部署到 `C:\Users\luo\.config\opencode\tools\lib\` 后，`../../../scripts/` 指向了不存在的路径。

**OpenCode 加载自定义工具时的行为**：
1. 扫描 `~/.config/opencode/tools/` 目录下所有 `.ts` 文件
2. 尝试解析每个文件的 import 链
3. 如果 import 解析失败 → **整个工具加载系统崩溃**
4. 崩溃后 LLM 的 function calling 机制失效 → 所有 agent 卡死

**关键发现**：不是只有调用该工具时才出问题——**工具文件存在就会被加载**，import 失败会影响所有 agent。

## 解决方案

### 规则：自定义工具的所有 import 必须限制在 `tools/` 目录内

✅ **正确**：只 import 同目录或子目录的文件
```typescript
// tools/lib/sf_safe_bash_core.ts
import type { SafeBashArgs } from "./sf_safe_bash_types"     // ✅ 同目录
import { applyRules } from "./sf_safe_bash_rules"            // ✅ 同目录
import { executeCommand } from "./sf_safe_bash_executor"     // ✅ 同目录
```

❌ **错误**：import 跨出 tools/ 目录
```typescript
// tools/lib/sf_safe_bash_core.ts
import type { HostProfile } from "../../../scripts/lib/host-profile/types"  // ❌ 跨目录
import { scanHostProfile } from "../../../scripts/lib/host-profile/scanner" // ❌ 跨目录
```

### 如果需要外部模块的类型或逻辑

**方案 A（推荐）：内联**

把需要的类型和函数直接写在工具的 lib 文件里：

```typescript
// 不 import 外部文件，直接内联类型定义
interface HostProfile {
  os: { platform: string; ... }
  shells: Array<{ name: string; path: string | null; ... }>
  shell_rules: { preferred_shell: string | null; ... }
  ...
}

// 不 import 外部函数，直接内联加载逻辑
async function loadHostProfile(): Promise<HostProfile | null> {
  const profilePath = path.join(os.homedir(), ".specforge", "host-profile.json")
  try {
    return JSON.parse(await fs.readFile(profilePath, "utf-8"))
  } catch { return null }
}
```

**方案 B：运行时动态读取**

如果逻辑太复杂不适合内联，改成运行时读取 JSON 配置文件（不在 import 阶段依赖外部代码）：

```typescript
// 运行时读取，不在 import 阶段解析
const config = JSON.parse(await fs.readFile("~/.specforge/host-profile.json", "utf-8"))
```

**方案 C：只 import node: 内置模块**

```typescript
import * as os from "node:os"       // ✅ Node 内置
import * as path from "node:path"   // ✅ Node 内置
import * as fs from "node:fs/promises" // ✅ Node 内置
import { spawn } from "node:child_process" // ✅ Node 内置
```

### 允许的 import 范围

| import 来源 | 是否允许 | 说明 |
|------------|---------|------|
| `node:*` 内置模块 | ✅ | fs, path, os, child_process 等 |
| `@opencode-ai/plugin` | ✅ | OpenCode SDK（运行时提供） |
| 同目录 `./xxx` | ✅ | tools/lib/ 内部互相引用 |
| 父目录 `../xxx`（仍在 tools/ 内） | ✅ | tools/sf_safe_bash.ts import tools/lib/xxx |
| 跨出 tools/ 的 `../../xxx` | ❌ | 部署后路径断裂 |
| npm 包（非 node: 前缀） | ⚠️ | 需要确认 OpenCode 运行时有该包 |

## 预防机制

### 开发时检查

在安装器（`sf-installer.ts`）部署 tools 文件前，加一个检查：

```typescript
// 检查所有 tools 文件是否有跨目录 import
const toolFiles = glob("tools/**/*.ts")
for (const file of toolFiles) {
  const content = readFileSync(file, "utf-8")
  if (/from\s+["']\.\.\/\.\.\/\.\./.test(content)) {
    throw new Error(`${file} 有跨目录 import，部署后会断裂！`)
  }
}
```

### CI 检查

```bash
# 检查 .opencode/tools/ 下是否有跨出 tools 目录的 import
grep -rn 'from.*\.\./\.\./\.\.' .opencode/tools/ && echo "ERROR: 跨目录 import" && exit 1
```

### 安装器 registry.ts 注释

在 `SHARED_COMPONENT_REGISTRY` 的 tools 部分加注释：

```typescript
// ⚠️ 所有 tools/*.ts 和 tools/lib/*.ts 必须完全自包含
// 禁止 import 跨出 tools/ 目录的文件（部署后路径会断裂）
// 详见 docs/engineering-lessons/ai-tools/opencode/custom-tool-self-contained.md
```

## 相关错误

| 症状 | 原因 |
|------|------|
| 安装 SpecForge 后所有 agent 卡死 | tools/ 下有跨目录 import |
| 只有特定工具调用时卡死 | 该工具的 import 在运行时才解析失败 |
| OpenCode 启动慢（>10s） | tools/ 下文件太多或 import 链太深 |
| 把 CLI 校验脚本放进 `.opencode/tools/` 导致 OpenCode 启动卡死 | tools/ 下任何 .ts 都会被 import 注册为 tool；如果文件顶层 `main()` + `process.exit()`，import 时立刻把 OpenCode 进程杀掉。CLI 脚本应放 `scripts/`，或加 `import.meta.main` 守卫（前者优先） |

## 参考

- OpenCode 自定义工具文档：https://docs.opencode.ai/docs/custom-tools
- 本次事故排查过程：SpecForge V6.0 sf_safe_bash 部署后 OpenCode 卡死（2026-05-20）
- 互补经验：[shell-command-execution](../../universal/shell-command-execution.md)
