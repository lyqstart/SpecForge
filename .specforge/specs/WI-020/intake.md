# Intake: 安装路径统一重构

## 重构目标

统一 SpecForge 安装流程的文件部署位置。当前安装器将文件分散到 3 个不同的目录（`~/.config/opencode/`、`~/.config/scripts/`、`~/.specforge/`），需要统一为 2 个明确分工的目录。

## 当前问题

### 文件分散在 3 个目录

| 目录 | 存放内容 | 问题 |
|------|---------|------|
| `~/.config/opencode/` | agents、tools、skills、plugins、AGENTS.md、opencode.json | ✅ OpenCode 规定的配置位置，合理 |
| `~/.config/scripts/` | package.json + node_modules/zod | ❌ 不应该存在 |
| `~/.config/scripts/lib/` | 27 个 .ts 运行时依赖（compatibility、types 等） | ❌ 不应该存在 |
| `~/.specforge/templates/` | 模板库 | ✅ 在正确位置 |

### 跨目录 import 路径耦合

1. **tools/lib/utils.ts** L137: `import("../../../scripts/lib/compatibility")` — 从 `~/.config/opencode/tools/lib/` 上跳三级到 `~/.config/`，再找 `scripts/lib/`
2. **plugins/sf_specforge.ts** L2: `import("../scripts/lib/sf_plugin_client.ts")` — 相对路径引用 `~/.config/opencode/scripts/lib/`

### 路径常量散落

`SPEC_DIR_NAME = '.specforge'` 在多个文件中重复定义，没有统一的路径定位机制。

## 重构方案

### 目标目录结构

```
~/.specforge/                              ← SpecForge 安装根目录（SPECFORGE_HOME）
├── install.json                           ← 安装元数据（版本、路径配置）
├── package.json                           ← zod 依赖声明
├── node_modules/                          ← bun install 产物
├── lib/                                   ← 原 scripts/lib/ + sf_plugin_client.ts
│   ├── compatibility.ts
│   ├── types.ts
│   ├── sf_plugin_client.ts
│   ├── paths.ts
│   └── ... (共 28 个 .ts)
├── templates/                             ← 模板库（已有，不动）
└── specforge-manifest.json                ← 安装清单

~/.config/opencode/                        ← OpenCode 配置（OpenCode 规定的位置）
├── opencode.json                          ← agent 定义（sf-*）
├── AGENTS.md                              ← 全局规则
├── agents/                                ← agent prompt 文件（9 + 1）
├── plugins/
│   └── sf_specforge.ts                    ← import 改为绝对路径引用 ~/.specforge/lib/
├── skills/                                ← SKILL.md 文件（18 个）
└── tools/
    ├── sf_*.ts                            ← tool 入口（18 个）
    └── lib/
        ├── sf_*_core.ts                   ← tool 核心库（~28 个）
        └── utils.ts                       ← import 改为绝对路径引用 ~/.specforge/lib/

其他任何位置                               ← 零文件
```

### 路径定位策略

1. **安装器**：硬编码默认安装位置 `~/.specforge/`，不读配置文件
2. **运行时程序**（tools/plugins）：从配置文件 `~/.specforge/install.json` 读取安装根路径，所有子路径相对它派生
3. **install.json 格式**：
   ```json
   {
     "schema_version": "1.0",
     "base_dir": "~/.specforge",
     "shared_version": "3.5.0",
     "installed_at": "2026-05-30T00:00:00Z"
   }
   ```

### import 路径改造

1. **plugins/sf_specforge.ts**：`import "../scripts/lib/sf_plugin_client.ts"` → 绝对路径 `~/.specforge/lib/sf_plugin_client.ts`
2. **tools/lib/utils.ts**：`import("../../../scripts/lib/compatibility")` → 绝对路径 `~/.specforge/lib/compatibility`

### 需要验证

- bun 运行时从 `~/.config/opencode/tools/lib/` 用绝对路径动态 import `~/.specforge/lib/compatibility.ts` 后，compatibility.ts → types.ts → zod 的解析链是否通畅

## 不变行为声明

1. `~/.config/opencode/` 下的 agents、tools、skills、plugins、AGENTS.md、opencode.json 的文件内容和功能不变
2. OpenCode 加载 plugin/tool 的方式不变（仍然从 `~/.config/opencode/` 读取）
3. 安装器的 4 个子命令（install/upgrade/verify/uninstall）行为不变
4. zod 依赖的解析必须正常工作
5. specforge-manifest.json 的格式和用途不变（仅存放位置从 `~/.config/opencode/` 移到 `~/.specforge/`）

## 涉及的代码范围

- `scripts/sf-installer.ts` — 部署路径全部重写
- `scripts/lib/registry.ts` — 可能需要调整注册表
- `setup/userlevel-opencode/tools/lib/utils.ts` — import 路径改造
- `setup/userlevel-opencode/plugins/sf_specforge.ts` — import 路径改造
- `setup/userlevel-scripts-lib/paths.ts` — 路径常量统一
- `scripts/lib/paths.ts` — resolveUserLevelDirectory 语义可能需调整
