# 方案 A：SpecForge V6 目录结构治理

**提案日期**：2026-05-29
**状态**：草案，待评审
**作者**：sf-orchestrator + 用户协作讨论
**关联**：本提案的工程治理框架延伸方案见 `2026-05-29-engineering-playbook-framework.md`

---

## 1. 背景与问题

### 1.1 现状诊断

SpecForge 当前的目录结构存在系统性混乱，根本原因有 4 条：

| 编号 | 根因 | 实证 |
|------|------|------|
| R1 | 架构决策与文档不同步 | ADR-006 明确选 `.specforge/`（带点），但 README、AGENTS.md、8 个 SKILL.md、4 个 Agent prompt 全部写 `specforge/`（不带点） |
| R2 | 代码内部三方约定不一致 | WI-004 impact_analysis.md 实证：`daemon-core/src/tools/lib/*` 用 `.specforge/`；部署态 `.opencode-/tools/lib/*` 用 `specforge/`；Agent prompt 又用 `specforge/`，影响 40+ 文件 |
| R3 | 仓库自身的开发目录与"用户项目目录"语义混淆 | SpecForge 自举开发，导致仓库根既有 `.specforge/`（committed Git）又有 `specforge/`（gitignored 但实际跑数据），两套都在用 |
| R4 | 没有任何编译/运行期约束 | 路径全部是源码里的硬编码字符串，任何人加一行 import 都不会被拦下 |

### 1.2 关键洞察

这不是单纯的"文档过时"问题，而是 **没有 single source of truth + 没有强制约束** 的双重缺位。光修文档没用，下次还会再裂开。

---

## 2. 设计原则

| 原则 | 内容 |
|------|------|
| **单一真相源** | 路径常量定义在唯一一个 TypeScript 文件 `packages/types/src/directory-layout.ts`，其他所有代码和文档都派生于此 |
| **守 ADR-006** | 项目目录用 `.specforge/`（带点），与 `.git/`、`.kiro/`、`.opencode/` 风格一致 |
| **物理集中** | 所有"安装源"集中到仓库根的 `setup/` 目录，一眼可见 |
| **文档自动生成** | 用户文档（directory-layout.md 等）从 schema 自动生成，禁止手写 |
| **三道强制门** | 类型系统 + CI Lint + Architecture Test，编译期/PR 期/运行期全覆盖 |

---

## 3. 开发仓库结构（修订版）

```
SpecForge/
├── .git/
├── .github/
├── .gitignore
├── .kiro/                              # 保留（仓库自身仍用 Kiro 开发）
│   └── steering/
│
├── setup/                              # ★ 新建：所有"安装源"集中
│   ├── README.md                       #   总清单：每个子目录的安装去向
│   ├── userlevel-opencode/             #   → ~/.config/opencode/
│   │   ├── agents/                     #     9 个 Agent
│   │   ├── tools/ + tools/lib/         #     17+ 个 Tool
│   │   ├── skills/                     #     16 个 Skill
│   │   └── plugins/                    #     sf_specforge.ts
│   ├── userlevel-scripts-lib/          #   → ~/.config/opencode/scripts/lib/
│   │                                   #     （tools/lib 动态 import 依赖）
│   └── userlevel-templates/            #   → ~/.specforge/templates/
│       ├── dev-environment.md
│       ├── prod-environment.md
│       └── project-rules/
│
├── packages/                           # 源码 monorepo
│   ├── types/src/
│   │   ├── directory-layout.ts         # ★ 唯一路径常量源（权威 Schema）
│   │   └── meta-schema.ts              # ★ _meta.json 的 zod schema
│   ├── daemon-core/
│   ├── configuration/
│   ├── workflow-runtime/
│   ├── observability/
│   └── ...
│
├── scripts/                            # 纯开发脚本（不再含部署源）
│   ├── sf-installer.ts                 # 改：从 setup/ 读取
│   ├── render-layout.ts                # 文档生成器
│   ├── render-specs-readme.ts          # specs/README.md 渲染器
│   ├── lib/                            # 纯开发态依赖
│   ├── migrations/                     # 数据迁移脚本
│   └── debug/                          # 调试脚本
│
├── tests/
│   ├── architecture/                   # 架构约束测试
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── conventions/                    # ★ 新建：约定中心（详见方案 B）
│   ├── adr/                            # 架构决策记录
│   ├── engineering-lessons/            # 工程经验库（保留）
│   ├── proposals/                      # 提案文档（本文件所在地）
│   └── archive/                        # 历史文档归档
│
├── .specforge/                         # 自举数据（SpecForge 开发自己）
│   └── (与用户项目目录同构)
│
├── package.json / tsconfig.json / vitest.config.ts / bun.lock
├── README.md                           # 仓库门面（精简版，链接到 docs/conventions/）
├── AGENTS.md                           # Agent 系统总览（精简版）
└── CHANGELOG.md
```

### 3.1 关键改动对照表

| 改动 | 原位置 | 新位置 | 说明 |
|------|--------|--------|------|
| OpenCode 资产源 | 根 `.opencode/` | `setup/userlevel-opencode/` | 安装源集中 |
| scripts/lib 部署源 | `scripts/lib/`（双重角色） | `setup/userlevel-scripts-lib/` | 拆分纯部署源，scripts/lib/ 留作开发态 |
| 项目模板源 | 根 `templates/` | `setup/userlevel-templates/` | 模板源集中 |
| 约定文档 | 散落 | `docs/conventions/` | 集中 |
| 临时文件 | 根目录散落 | 删除或归 `scripts/debug/` | 已实证无代码引用 |
| 废弃备份 | `.opencode-/` | 删除 | 误命名/废弃 |
| 根 OpenCode 配置 | `opencode.json`（空文件） | 删除 | 无内容 |
| 根 .opencode/ 自举入口 | 保留 | 删除 | 选项 X：彻底干净，自举走 sf-installer |

### 3.2 需删除的根目录文件清单（已实证无 grep 引用）

- `opencode.json`（仅含 schema 引用）
- `test-error.txt`、`test-output.txt`、`test-output2.txt`、`test-output3.txt`
- `test-help-output.ts`、`test-init.ps1`
- `run-concurrent-init.ps1`、`run-init-test.js`
- `task-4.7-completion-summary.md`
- `agents/`（空目录）
- `.opencode-/`（带尾横线的废弃备份）

---

## 4. 用户项目结构（修订版）

```
<用户项目>/
├── AGENTS.md                          # 自动生成，指向用户级 + 项目级规则
└── .specforge/
    ├── manifest.json                  # 唯一顶层文件（项目已初始化标记）
    ├── .gitignore                     # daemon 管理
    │
    ├── config/                        # ⭐ 所有配置统一这里（committed）
    │   ├── project-rules.md
    │   ├── dev-environment.md
    │   ├── prod-environment.md
    │   ├── project.json
    │   ├── risk_policy.json
    │   └── skill_fragments.json
    │
    ├── specs/                         # 规格文档（committed）
    │   ├── README.md                  # ⭐ daemon 自动维护的总索引（见 §5）
    │   └── WI-XXX/
    │       ├── _meta.json             # ⭐ 结构化元数据，驱动 README 渲染
    │       ├── intake.md
    │       ├── requirements.md
    │       ├── design.md
    │       ├── tasks.md
    │       ├── review_report.md
    │       └── verification_report.md
    │
    ├── knowledge/                     # KG（committed）
    │   └── graph.json
    │
    ├── runtime/                       # gitignored
    │   ├── wal.jsonl                  # ⭐ 状态机 WAL（事件溯源）
    │   ├── state.json
    │   └── checkpoints/
    │
    ├── logs/                          # gitignored，包括 telemetry
    │   ├── telemetry.jsonl            # ⭐ 观测埋点（原 observability/events.jsonl）
    │   ├── trace.jsonl
    │   ├── tool_calls.jsonl
    │   ├── cost.jsonl
    │   ├── conversations.jsonl
    │   ├── app.log
    │   ├── error.log
    │   └── guard.log
    │
    ├── archive/agent_runs/            # gitignored
    ├── sessions/                      # gitignored
    └── cas/                           # gitignored（CAS 内容寻址存储）
```

### 4.1 关键改动说明

| 改动 | 原状 | 新状 | 理由 |
|------|------|------|------|
| 根命名 | `.specforge/` + `specforge/` 并存 | 只有 `.specforge/` | 守 ADR-006 |
| 配置文件位置 | 顶层 + `config/` 分散 | 统一到 `.specforge/config/` | 找配置只去一个地方 |
| WAL 命名 | `runtime/events.jsonl` | `runtime/wal.jsonl` | 语义更清晰 |
| Telemetry 位置 | `observability/events.jsonl` | `logs/telemetry.jsonl` | 砍掉 observability/ 单独目录，避免和 WAL 重名 |
| WI 索引 | 无 | `specs/README.md` | 一次看完所有 WI 的全貌 |
| WI 元数据 | 无 | `WI-XXX/_meta.json` | 驱动 README 渲染 |

---

## 5. specs/README.md 索引设计

### 5.1 文件内容样式

```md
<!-- BEGIN: specforge-managed (DO NOT EDIT MANUALLY) -->
<!-- 由 daemon 在每次状态流转后自动重新生成。手动修改会被覆盖。-->

# Work Items 总索引

最后更新：2026-05-29 14:32:11
总数：12 (completed: 8, active: 3, blocked: 1)

---

## WI-001 用户登录功能

- **工作流**：feature_spec
- **状态**：completed
- **创建/完成**：2026-05-01 / 2026-05-10
- **关联模块**：packages/auth, packages/web-ui

**摘要**：实现 OAuth2 用户登录，支持 GitHub / Google / Microsoft 三方登录。
统一 JWT 鉴权，集成到现有的 web-ui 用户中心模块。

**关键决策**：
- 采用 JWT + Refresh Token 双 Token 方案（拒绝单 Token：安全性不够）
- Token 过期：access=15min, refresh=7day
- **拒绝**实现"记住我"功能（产品决策：默认每次登录）
- **拒绝**将用户密码哈希存本地（统一用 OAuth，不存密码）

---
<!-- END: specforge-managed -->
```

### 5.2 背后驱动数据 `_meta.json`

```json
{
  "id": "WI-001",
  "workflow_type": "feature_spec",
  "title": "用户登录功能",
  "summary": "实现 OAuth2 用户登录，支持 GitHub / Google / Microsoft 三方登录。统一 JWT 鉴权，集成到现有的 web-ui 用户中心模块。",
  "key_decisions": [
    "采用 JWT + Refresh Token 双 Token 方案（拒绝单 Token：安全性不够）",
    "Token 过期：access=15min, refresh=7day",
    "**拒绝**实现\"记住我\"功能（产品决策：默认每次登录）"
  ],
  "related_modules": ["packages/auth", "packages/web-ui"],
  "current_stage": "completed",
  "created_at": "2026-05-01T09:23:14Z",
  "completed_at": "2026-05-10T16:42:08Z",
  "downstream_wis": [],
  "upstream_wis": []
}
```

### 5.3 维护责任表

| 字段 | 谁写 | 何时写 |
|------|------|--------|
| `id` / `workflow_type` / `title` / `created_at` | sf-orchestrator | 创建 WI 时（intake 流转那一刻） |
| `summary` | sf-requirements（或 sf-design for design-first） | requirements/design 阶段完成时，从规格文档的"## 摘要"段提取 |
| `key_decisions` | sf-design | design 阶段完成时，从 design.md 的"## 关键决策"段提取 |
| `key_decisions` 追加 | sf-reviewer / sf-debugger | 如果 review/debug 阶段产生新决策，**追加**而非覆盖 |
| `related_modules` | sf-task-planner | tasks 阶段，从 tasks.md 引用的源码路径反推 |
| `current_stage` | daemon | `sf_state_transition` 时自动更新 |
| `completed_at` | daemon | 流转到 completed 时自动写入 |
| `downstream_wis` / `upstream_wis` | sf-knowledge | WI 完成后由 sf-knowledge 提取依赖关系 |

### 5.4 强制要求 Agent 配合

为了让 `summary` 和 `key_decisions` 能稳定提取，**强制规格文档结构**：

- 所有 `requirements.md` / `design.md` 必须包含 `## 摘要`（≤ 200 字）段
- 所有 `design.md` 必须包含 `## 关键决策`（条目列表）段
- `sf_requirements_gate` / `sf_design_gate` 加新检查：缺这两段不给过 Gate

### 5.5 渲染流程

```
某 WI 状态流转 → sf_state_transition 内部触发：
  1. 读取 specs/ 下所有 WI-XXX/_meta.json
  2. 按 current_stage + created_at 排序（active 在前，completed 在后按时间倒序）
  3. 渲染 specs/README.md，覆盖 marker 之间的内容
  4. 失败不阻塞主流转（降级：写一条错误到 logs/error.log）
```

---

## 6. directory-layout.ts Schema 设计

### 6.1 文件位置

`packages/types/src/directory-layout.ts`

### 6.2 接口设计

```ts
// 顶层常量
export const SPEC_DIR_NAME = '.specforge' as const;

// 子目录键
export const LAYOUT = {
  // committed
  manifest:        'manifest.json',
  config:          'config',
  configFiles: {
    projectRules:    'config/project-rules.md',
    devEnv:          'config/dev-environment.md',
    prodEnv:         'config/prod-environment.md',
    project:         'config/project.json',
    riskPolicy:      'config/risk_policy.json',
    skillFragments:  'config/skill_fragments.json',
  },
  specs:           'specs',
  specsReadme:     'specs/README.md',
  knowledge:       'knowledge',
  knowledgeGraph:  'knowledge/graph.json',
  
  // gitignored
  runtime:         'runtime',
  runtimeWal:      'runtime/wal.jsonl',
  runtimeState:    'runtime/state.json',
  runtimeCheckpoints: 'runtime/checkpoints',
  
  logs:            'logs',
  logsTelemetry:   'logs/telemetry.jsonl',
  logsTrace:       'logs/trace.jsonl',
  logsToolCalls:   'logs/tool_calls.jsonl',
  logsCost:        'logs/cost.jsonl',
  logsConversations: 'logs/conversations.jsonl',
  
  archive:         'archive',
  archiveAgentRuns: 'archive/agent_runs',
  sessions:        'sessions',
  cas:             'cas',
} as const;

// 路径构造函数（唯一允许构造路径的入口）
export function resolveProjectPath(
  projectRoot: string,
  key: keyof typeof LAYOUT,
  ...subpath: string[]
): string {
  const relativePath = LAYOUT[key];
  return path.join(projectRoot, SPEC_DIR_NAME, relativePath as string, ...subpath);
}

// WI 子路径
export function specPath(
  projectRoot: string,
  workItemId: string,
  file: string
): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'specs', workItemId, file);
}

// Agent Run 归档路径
export function agentRunArchivePath(
  projectRoot: string,
  workItemId: string,
  agentType: string,
  runIndex: number
): string {
  return path.join(
    projectRoot, SPEC_DIR_NAME,
    'archive/agent_runs',
    `${workItemId}-${agentType}-${runIndex}`
  );
}
```

### 6.3 用法对比

```ts
// 旧（禁止）
const reqPath = join(baseDir, ".specforge", "specs", workItemId, "requirements.md");
const statePath = `${projectRoot}/.specforge/runtime/state.json`;

// 新（强制）
import { specPath, resolveProjectPath } from '@specforge/types/directory-layout';
const reqPath = specPath(baseDir, workItemId, "requirements.md");
const statePath = resolveProjectPath(projectRoot, 'runtimeState');
```

---

## 7. 单一真相源机制

### 7.1 三层结构

| 层 | 文件 | 角色 |
|----|------|------|
| 1. 决策层 | `docs/adr/ADR-006-specforge-dir-naming.md` | 不可变决策记录（为什么这么定） |
| 2. Schema 层 | `packages/types/src/directory-layout.ts` | 机器可读真相（路径长什么样） |
| 3. 视图层 | `docs/conventions/directory-layout.md` | 人可读视图（由 Schema 自动生成） |

### 7.2 文档生成器

| 脚本 | 输入 | 输出 |
|------|------|------|
| `scripts/render-layout.ts` | directory-layout.ts | `docs/conventions/directory-layout.md` + README/AGENTS.md 中的 `<!-- BEGIN: layout -->` marker |
| `scripts/render-specs-readme.ts` | 所有 WI 的 `_meta.json` | `<project>/.specforge/specs/README.md` |

---

## 8. 三道强制门

| 门 | 强度 | 实现 | 拦什么 |
|----|------|------|--------|
| **A. TypeScript 类型** | 编译期 | LAYOUT 是 `as const`，传错 key 编译失败 | 传错路径 key |
| **B. CI Lint** | PR 期 | 自定义 lint 规则扫描 .ts 文件，禁止字符串字面量 `'\.specforge'`、`'specforge/'`、`'runtime/'` 等模式 | 裸路径字符串 |
| **C. Architecture Test** | CI test 阶段 | `tests/architecture/directory-layout.test.ts` 跑 fs.readdir 扫描实际目录树，与 Schema 比对 | 实际偏离 Schema |

### 8.1 白名单文件清单

允许写裸路径字符串的地方：

- `packages/types/src/directory-layout.ts`（schema 自身）
- `scripts/migrations/**`（迁移脚本，必须处理旧路径）
- `tests/**/fixtures/**`（测试 fixture）
- `**/*.test.ts`（测试代码，但仅限 mock 路径）

白名单要写到 `.lintrc-layout.json`，**任何扩展白名单的 PR 必须双人审批**。

---

## 9. 落地路径（P0/P1/P2 三阶段）

### Phase P0：Schema 与备份基础设施

**工作流类型**：refactor（低风险路径）
**预估改动量**：< 500 行代码

| 任务 | 内容 |
|------|------|
| T1 | 实现 `packages/types/src/directory-layout.ts` |
| T2 | 实现 `packages/types/src/meta-schema.ts`（zod schema） |
| T3 | 补录 ADR-006 与本提案的链接 |
| T4 | 写数据迁移脚本：扫描所有 `specforge/` → `.specforge/` 重命名 |
| T5 | 写备份机制：迁移前自动 backup 到 `~/.specforge/backups/<ts>/` |
| T6 | 单元测试覆盖所有 LAYOUT key |

**风险**：极低，纯新增。
**回滚**：删除新增文件即可。

### Phase P1：代码全量切换

**工作流类型**：change_request
**预估改动量**：40+ 文件，约 200-500 处替换

| 任务 | 内容 |
|------|------|
| T1 | daemon-core 12 个 core 文件全部替换为 schema 调用 |
| T2 | `.opencode/` 部署态 tools 同步切换 |
| T3 | 8 个 SKILL.md 中的路径引用同步 |
| T4 | 4 个 Agent prompt 中的路径引用同步 |
| T5 | permission-engine 等其他模块的硬编码路径切换 |
| T6 | 实现 `scripts/render-layout.ts` 文档生成器 |
| T7 | 用生成器一次性更新 README、AGENTS.md 中的 `<!-- BEGIN: layout -->` 段落 |
| T8 | `setup/` 目录搬迁 + sf-installer.ts 改造从 `setup/` 读 |
| T9 | 实现 `scripts/render-specs-readme.ts` + daemon 集成 |
| T10 | 全量回归测试 |

**风险**：中高，涉及核心数据路径。
**回滚条件**：任一测试失败立即回滚（用 P0 的备份机制）。

### Phase P2：强制约束上线 + 清扫存量

**工作流类型**：refactor
**预估改动量**：< 1000 行（多为新增 lint 规则和测试）

| 任务 | 内容 |
|------|------|
| T1 | 实现 CI Lint 规则（防线 B） |
| T2 | 实现 Architecture Test（防线 C） |
| T3 | CI 集成 |
| T4 | 跑一遍存量代码，把所有现存违规修干净 |
| T5 | 填充 `docs/conventions/` 内容 |
| T6 | 删除根目录散落临时文件（已实证无引用） |
| T7 | 删除 `.opencode-/`、根 `.opencode/`、根 `opencode.json` |

**风险**：低。
**特殊注意**：CI Lint 上线后短期会有红灯密集，需安排集中清扫时间。

---

## 10. 决策记录

### 10.1 已确认决策

| ID | 决策 | 来源 |
|----|------|------|
| D1 | 守 ADR-006，用 `.specforge/`（带点） | 用户确认 |
| D2 | 删除 `.opencode-/`（带尾横线废弃备份） | 用户确认 |
| D3 | `.kiro/` 暂不动（仍用 Kiro 开发） | 用户确认 |
| D4 | 根目录无引用临时文件删除 | grep 实证 |
| D5 | `cas/` 保留 + 加 LRU；`observability/` 砍掉并入 `logs/` | 用户确认 |
| D6 | 三道强制门（A 类型 + B Lint + C ArchTest），不要 Pre-commit Hook | 用户确认 |
| D7 | 走 investigation 工作流先调查（已可省略，见落地建议） | 用户确认 |
| 新-1 | 安装源全部移到 `setup/` 目录 | 用户确认 |
| 新-2 | 约定文档集中到 `docs/conventions/`（详见方案 B） | 用户确认 |
| 新-3 | specs/README.md 含完整摘要+关键决策；用 `WI-001` 不带链接；背后 `_meta.json` 驱动 | 用户确认 |
| 新-4 | events.jsonl 命名：`runtime/wal.jsonl` + `logs/telemetry.jsonl`（方案 γ） | 用户确认 |
| 新-5 | 配置统一到 `.specforge/config/` | 用户确认 |
| 新-6 | 删除根 `opencode.json`（空文件） + 删除根 `.opencode/`（选项 X 彻底干净） | 用户确认 |

### 10.2 待方案 B 决定的关联项

- ADR 与 WI design.md 单向溯源关系（方案 B §3）
- Engineering Playbook 模板包（方案 B §4）

---

## 11. 验收标准

本方案的落地完成时必须满足：

- [ ] `packages/types/src/directory-layout.ts` 存在，导出 LAYOUT 常量和 resolveProjectPath 等函数
- [ ] daemon-core 所有 core 文件不再含 `'\.specforge'`、`'specforge/'` 字符串字面量（白名单除外）
- [ ] `setup/` 目录建成，sf-installer.ts 从 `setup/` 读取
- [ ] 根目录无 `opencode.json`、`.opencode/`、`.opencode-/`、临时调试文件
- [ ] `docs/conventions/directory-layout.md` 由生成器输出，与 schema 一致
- [ ] CI Lint 规则启用，且 PR 期能拦截违规
- [ ] Architecture Test 通过，覆盖所有 LAYOUT key
- [ ] `bun scripts/sf-installer.ts verify` 通过
- [ ] 用户项目可正常初始化（迁移脚本对旧项目验证通过）

---

## 12. 引用

- ADR-006：`v6-architecture-overview/design.md` L251
- WI-004 impact_analysis：`.specforge/specs/WI-004/impact_analysis.md`（三方不一致实证）
- 关联方案：`docs/proposals/2026-05-29-engineering-playbook-framework.md`（方案 B）
