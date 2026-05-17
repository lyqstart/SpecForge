---
inclusion: always
---

# 项目目录结构规范（AI 必读）

**生效日期**：2026-05-12
**适用范围**：SpecForge 仓库内所有开发活动

## 一、目录结构总览

```
SpecForge/
├── .kiro/
│   ├── specs/                        # 纯设计文档（禁止放源码）
│   │   ├── v6-architecture-overview/ # 父规范 + artifacts
│   │   ├── <module>/                 # 每个模块的 spec
│   │   │   ├── .config.kiro         # spec 元数据
│   │   │   ├── requirements.md      # 需求文档
│   │   │   ├── design.md            # 设计文档
│   │   │   ├── tasks.md             # 任务清单
│   │   │   └── artifacts/           # 可选：图表、JSON 工件
│   │   └── _archive/                # 历史 spec（V1–V5）归档
│   └── steering/                    # AI steering 规则
│
├── packages/                         # 所有 V6 模块源码（monorepo）
│   ├── daemon-core/
│   ├── configuration/
│   ├── permission-engine/
│   ├── observability/
│   ├── scope-gate/
│   ├── workflow-runtime/
│   ├── opencode-adapter/
│   ├── plugin-loader/
│   ├── multimodal/
│   ├── migration/
│   ├── self-healing/
│   └── cli/
│
├── .opencode/                        # SpecForge 框架（Agent/Tool/Skill/Plugin）
│   ├── agents/
│   ├── tools/ + tools/lib/
│   ├── skills/
│   └── plugins/
│
├── scripts/                          # 安装器、构建脚本
├── tests/                            # 跨模块集成/e2e/回归测试
├── docs/                             # 用户文档
│   └── archive/                     # 历史设计文档归档
│
├── package.json                      # workspace 根配置（唯一）
├── tsconfig.json                     # 根 TypeScript 配置
├── vitest.config.ts                  # 根测试配置
├── opencode.json                     # OpenCode Agent 注册
└── README.md
```

## 二、硬规则

### 规则 1：Spec 目录只放文档

`.kiro/specs/<module>/` 下**只允许**存在以下文件：
- `.config.kiro` — spec 元数据
- `requirements.md` — 需求文档
- `design.md` — 设计文档
- `tasks.md` — 任务清单
- `artifacts/` — 图表、JSON 工件、验证脚本
- `.kiro/` 子目录 — spec 级元数据（metadata.json 等）

**禁止**在 spec 目录下放置：
- ❌ `src/`、`tests/`、`dist/`、`node_modules/`
- ❌ `package.json`、`tsconfig.json`、`vitest.config.ts`
- ❌ 任何可执行源码文件（.ts/.js）

### 规则 2：源码统一放 packages/

所有 V6 模块的源码必须放在 `packages/<module>/` 下，结构为：
```
packages/<module>/
├── src/              # 源码
├── tests/            # 模块级测试（unit/property/integration）
├── package.json      # 模块依赖（必须含 schema_version 字段）
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### 规则 3：禁止在根目录放临时文件

- ❌ 不在根目录创建 `test_*.ts`、`debug_*.ts`、`check_*.js` 等临时调试文件
- ❌ 不在根目录创建一次性文档（如 `xxx_answers.md`）
- ✅ 调试脚本放 `scripts/debug/`（用完即删）
- ✅ 一次性沟通文档放 `docs/archive/`

### 规则 4：.gitignore 必须排除

以下内容**必须**在 .gitignore 中：
```
node_modules/
dist/
*.tsbuildinfo
specforge/          # 项目级运行时（Plugin 自动生成）
test_log/
.backup/
test_output.txt
*.log
package-lock.json   # 项目用 bun，不用 npm
```

### 规则 5：包管理器统一用 bun

**依据**：REQ-28 AC-3「运行时：首选 Bun，其次 Node.js（LTS）」；M7 分发方式为 npm 包。

- ✅ 开发/测试/构建一律用 `bun`（`bun install`、`bun run build`）
  - **全量回归**（CI / Phase 收尾）：`bun run test`（走 package.json 的 `scripts.test`）
  - **单任务交付验证**：`bun test <具体文件路径>` —— 只跑你这次新增/修改的测试文件，禁止裸跑 `bun test` 或 `bun run test`，详见 `.opencode/skills/superpowers-verification-before-completion/SKILL.md`
- ✅ 锁文件只保留 `bun.lock`，禁止提交 `package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`
- ✅ workspace 依赖使用 `workspace:*` 协议（bun 原生支持）
- ✅ 直接运行 TypeScript 文件用 `bun run <file>.ts`（无需 ts-node 或先编译）
- ✅ 分发时打成 npm 包发布到 registry（`bun publish` 或 `npm publish`，两者等效）
- ❌ 禁止在脚本、文档、CI 中使用 `npm install`、`npm run`、`npx` 命令
- ❌ 禁止引入 `ts-node`、`tsx` 等 Node.js TypeScript 运行器作为开发依赖

**文档中的命令示例**：
```bash
# 安装依赖
bun install

# 运行测试（全量，CI / Phase 收尾用）
bun run test

# 单任务交付验证（推荐）：只跑你这次写的测试文件
bun test packages/<module>/tests/<your-new-test>.test.ts

# 运行单个脚本
bun run scripts/sf-installer.ts install

# 构建
bun run build
```

### 规则 6：根目录只有一个 package.json

- 根 `package.json` 使用 workspaces 字段管理所有子包
- workspaces 指向 `packages/*`
- `.opencode/` 独立管理自己的依赖（不纳入 workspaces，因为它不是标准 npm 包）
- 禁止出现 `package-workspace.json` 等重复配置

### 规则 7：历史 spec 归档

已完成或废弃的 spec（V1–V5 系列）统一移入 `.kiro/specs/_archive/`，不与活跃 spec 混放。

### 规则 8：模块创建流程

新建一个 V6 模块时，必须同时：
1. 在 `.kiro/specs/<module>/` 创建 spec 文档（requirements.md, design.md, tasks.md）
2. 在 `packages/<module>/` 创建源码骨架（src/, tests/, package.json）
3. 在根 `package.json` 的 workspaces 中注册新包
4. 两者通过 tasks.md 中的路径引用关联：`packages/<module>/src/...`

### 规则 9：跨模块测试

- 模块内测试放 `packages/<module>/tests/`
- 跨模块集成测试放根目录 `tests/integration/`
- 端到端测试放根目录 `tests/e2e/`
- Property-Based 测试放 `packages/<module>/tests/property/`

## 三、路径引用约定

在 tasks.md 或 design.md 中引用源码路径时，使用**相对于仓库根目录**的路径：
- ✅ `packages/daemon-core/src/event-bus/EventBus.ts`
- ❌ `.kiro/specs/daemon-core/src/event-bus/EventBus.ts`
- ❌ `daemon-core/src/event-bus/EventBus.ts`

## 四、违规检测

AI 在执行任务时，如果发现以下情况应主动提醒用户：
1. 有人在 `.kiro/specs/` 下创建了 src/ 或 tests/ 目录
2. 根目录出现了临时调试文件
3. 新模块没有同时创建 spec 文档和 packages 源码目录
4. package.json 缺少 schema_version 字段
