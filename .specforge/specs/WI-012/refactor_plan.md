# WI-012 Refactor Plan — SpecForge V6 目录结构治理 P2

**work_item_id**: WI-012
**workflow_type**: refactor
**upstream**: WI-011（P1 代码全量切换，已完成并通过验证）
**关联方案**: `docs/proposals/2026-05-29-directory-structure-governance.md` §9 Phase P2
**风险等级**: 低

---

## 1. 重构策略

本计划采用 **"新增防线 + 白名单驱动 + 自动生成 + 清扫清理"** 四阶段策略，将 P1 完成的一次性路径收口转化为可持续的长期治理机制。

### 策略概述

| 阶段 | 策略 | 目标 |
|------|------|------|
| 防线建设 | CI Lint + Architecture Test | 实现"三道强制门"中的防线 B（PR 期）和防线 C（运行期） |
| 白名单驱动 | `.lintrc-layout.json` 配置化 | 路径违规检测基于可配置白名单，新增白名单项需双人审批 |
| 自动生成约定文档 | `scripts/render-meta-schema.ts` + 手写文档 | 填充 `docs/conventions/` 核心文档，建立约定中心 |
| 清扫清理 | 存量扫描 + 残留删除 + README 更新 | 确保全仓库 0 违规，文档导航完整 |

### 核心原则

1. **零功能修改**：所有改动限定在新增文件、文档修改、CI 配置修改范畴
2. **每步可运行**：每个 Step 完成后，现有测试套件必须 100% 通过
3. **原子回滚**：每个 Step 对应独立 commit，可通过 `git revert` 精准回滚
4. **白名单审批制**：`.lintrc-layout.json` 的任何扩展需双人审批

---

## 2. 不变行为声明

> 以下行为在 P2 全过程中必须严格保持不变。任何违反均视为回归。

### IB-1：所有现有测试套件继续 100% 通过

与 P1 完成后状态一致：

| 测试范围 | 基线结果 |
|---------|---------|
| `packages/types/` | 74 pass / 0 fail |
| `packages/daemon-core/tests/unit/` | 266 pass（5 个 pre-existing SessionRegistry 失败除外） |
| `packages/permission-engine/` | exit 0 |

P2 不得修改任何现有测试的预期结果。

### IB-2：daemon 启动行为、Plugin 加载、所有 8 种工作流正常端到端

P2 不得修改 daemon-core、permission-engine、setup/ 下的任何功能性代码。所有运行时路径解析逻辑与 P1 完成后完全一致。

### IB-3：用户级 / 项目级目录结构与 P1 完成后一致

`LAYOUT` 和 `USER_LAYOUT` 的路径定义不变。`SPEC_DIR_NAME = '.specforge'` 不变。路径构造函数（`resolveProjectPath` / `specPath` / `agentRunArchivePath` / `resolveUserPath`）签名和返回值语义不变。

### IB-4：TypeScript 编译无错误

`bun run typecheck`（或等效命令）通过。P2 新增的文件必须满足 TypeScript strict mode 编译。

### IB-5：`bun scripts/sf-installer.ts verify` 通过

安装器校验功能正常，不受 P2 影响。

### IB-6：现有代码功能零修改

P2 的所有改动限定在：
1. **纯新增文件**：Lint 脚本、Architecture Test、约定文档、meta-schema 渲染器
2. **纯文档修改**：`README.md` 导航更新
3. **CI 配置修改**：`.github/workflows/code-quality.yml` 添加新 job / step
4. **package.json 修改**：新增 `scripts.lint:layout` 条目
5. **可能的遗漏路径修复**：Step 3 扫描发现的存量违规（预期 0 或极少）

不得修改 `packages/` 下任何现有功能代码。

---

## 3. 步骤顺序

### Step 1：实现 CI Lint 规则 `scripts/lint/check-hardcoded-paths.ts`

refs: [refactor_analysis P2-1, P2-4]
constrained_by: 方案 A §8.1（白名单文件清单）, project-rules（TypeScript strict mode）

#### 产出文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `scripts/lint/check-hardcoded-paths.ts` | 新增 | Lint 脚本主文件 |
| `.lintrc-layout.json` | 新增 | 白名单配置 |

#### 功能规格

```typescript
// scripts/lint/check-hardcoded-paths.ts
// 用法: bun run scripts/lint/check-hardcoded-paths.ts [--fix]
//
// 扫描 *.ts 和 *.md 文件中的违规路径字面量
// 禁止模式（正则匹配）:
//   - /\.specforge[/'"]/
//   - /['"]specforge\//
//   - /['"]runtime\//
//   - /['"]specs\//
//   - /['"]logs\//
//   - /['"]archive\//
//   - /['"]sessions\//
//   - /['"]cas\//
//   - /['"]knowledge\//
//   - /['"]observability\//
//   - /['"]manifest\.json['"]/
//   - /['"]state\.json['"]/
//   - /['"]wal\.jsonl['"]/
//   - /['"]events\.jsonl['"]/
//
// 白名单来源: .lintrc-layout.json
// 退出码: 发现违规 exit 1，无违规 exit 0
```

#### 白名单配置 `.lintrc-layout.json`

```json
{
  "$schema": "https://specforge.dev/schemas/lintrc-layout",
  "version": 1,
  "description": "允许包含裸路径字符串的文件/目录白名单",
  "whitelist": {
    "paths": [
      "packages/types/src/directory-layout.ts",
      "packages/types/src/meta-schema.ts",
      "scripts/lint/check-hardcoded-paths.ts",
      "scripts/render-layout.ts",
      "scripts/render-specs-readme.ts"
    ],
    "globs": [
      "scripts/migrations/**",
      "tests/**/fixtures/**",
      "**/*.test.ts",
      "docs/**"
    ]
  },
  "note": "任何扩展白名单的 PR 必须双人审批"
}
```

#### package.json 变更

```json
{
  "scripts": {
    "lint:layout": "bun run scripts/lint/check-hardcoded-paths.ts"
  }
}
```

#### 验证

- `bun run lint:layout` 在当前仓库执行，白名单文件不报错
- 手动构造违规文件测试 Lint 能正确检出
- 删除测试违规文件后 exit 0

#### 不变行为检查

- [ ] `bun run test` — 所有现有测试通过
- [ ] `bun scripts/sf-installer.ts verify` — 通过
- [ ] 不修改任何 `packages/` 下文件

---

### Step 2：实现 Architecture Test `tests/architecture/directory-layout.test.ts`

refs: [refactor_analysis P2-1, P2-4]
constrained_by: `packages/types/src/directory-layout.ts`（LAYOUT Schema）, `packages/types/src/meta-schema.ts`（_meta.json zod schema）

#### 产出文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `tests/architecture/directory-layout.test.ts` | 新增 | 目录结构验证测试 |

#### 功能规格

```typescript
// tests/architecture/directory-layout.test.ts
//
// 测试用例分组:
//
// Group 1: Schema 常量验证
//   - SPEC_DIR_NAME === '.specforge'
//   - LAYOUT 所有顶层 key 对应的值不含前导 './'
//   - LAYOUT.configFiles 嵌套对象所有值以 'config/' 开头
//   - committed 区 key 集合完整性
//   - gitignored 区 key 集合完整性
//
// Group 2: 路径构造函数验证
//   - resolveProjectPath('/proj', 'runtime') === '/proj/.specforge/runtime'
//   - resolveProjectPath('/proj', 'specs', 'WI-001', 'design.md')
//       === '/proj/.specforge/specs/WI-001/design.md'
//   - specPath('/proj', 'WI-001', 'requirements.md')
//       === '/proj/.specforge/specs/WI-001/requirements.md'
//   - agentRunArchivePath('/proj', 'WI-001', 'sf-design', 1)
//       === '/proj/.specforge/archive/agent_runs/WI-001-sf-design-1'
//   - resolveUserPath('hostProfile') 包含 '.specforge/host-profile.json'
//
// Group 3: _meta.json schema 验证
//   - WorkItemMetaSchema.parse() 对合法 JSON 成功
//   - WorkItemMetaSchema.parse() 对非法 ID 格式抛错
//   - WORKFLOW_TYPES 包含全部 8 个工作流类型
//   - STAGE_TYPES 包含所有阶段名称
//
// Group 4: 仓库实际目录验证（轻量级）
//   - packages/types/src/directory-layout.ts 存在
//   - packages/types/src/meta-schema.ts 存在
//   - docs/conventions/ 目录存在
//   - setup/ 目录存在
```

#### 集成方式

Architecture Test 加入 `bun run test` 全量测试集。在 `package.json` 的 `test` script 中追加 `tests/architecture/` 目录，或在 `tests/architecture/` 下创建可被 bun test 自动发现的测试文件。

#### 验证

- `bun test tests/architecture/directory-layout.test.ts` — 全部通过
- `bun run test` — 全量测试集通过（含新增 architecture test）

#### 不变行为检查

- [ ] `bun run test` — 所有现有测试 + 新增测试通过
- [ ] 不修改任何 `packages/` 下现有文件

---

### Step 3：清扫存量违规

refs: [refactor_analysis P2-5]
constrained_by: Step 1 产出的 Lint 脚本和 `.lintrc-layout.json`

#### 执行步骤

1. 运行 `bun run lint:layout` 扫描全仓库
2. 检查输出报告，确认违规数量
3. **预期结果**：P1 已彻底完成全量切换，预期 0 违规
4. 如有遗漏（非白名单文件中的违规路径字面量）：
   - 逐个分析确认是否为真正的违规
   - 如确认违规，修改为使用 `resolveProjectPath` / `specPath` 等函数
   - 每个修复后重新运行 Lint 确认通过

#### 输出

- Lint 扫描报告（stdout 记录）
- 如有修复：列出修复的文件和改动内容
- 如无修复：确认"0 违规"结论

#### 验证

- `bun run lint:layout` — exit 0（0 违规）
- `bun run test` — 所有现有测试通过
- `bun scripts/sf-installer.ts verify` — 通过

#### 不变行为检查

- [ ] `bun run test` — 所有测试通过
- [ ] `bun scripts/sf-installer.ts verify` — 通过
- [ ] 如有修复，修复后 daemon 行为不变

---

### Step 4：填充 `docs/conventions/` 内容

refs: [refactor_analysis P2-2]
constrained_by: 方案 A §7（三层结构：决策层 → Schema 层 → 视图层）

#### 产出文件

| 文件 | 类型 | 优先级 | 说明 |
|------|------|--------|------|
| `docs/conventions/README.md` | 新增 | 必填 | 约定中心导航入口 |
| `docs/conventions/wi-lifecycle.md` | 新增 | 必填 | Work Item 生命周期约定 |
| `docs/conventions/glossary.md` | 新增 | 必填 | 术语表 |
| `docs/conventions/workflow-types.md` | 新增 | 推荐 | 8 种工作流类型详解 |
| `docs/conventions/agent-roles.md` | 新增 | 推荐 | 9 个 Agent 角色与职责 |
| `docs/conventions/meta-json-spec.md` | 新增 | 推荐 | `_meta.json` 规范 |
| `scripts/render-meta-schema.ts` | 新增 | 必填 | `_meta.json` schema 自动文档生成器 |

#### 各文件内容大纲

**`docs/conventions/README.md`**（约定中心导航）：
```markdown
# SpecForge 约定中心

本目录是 SpecForge 项目约定的集中管理区域。

## 自动生成文档
- [目录布局约定](directory-layout.md) — 由 `scripts/render-layout.ts` 从 `directory-layout.ts` 自动生成

## 手写约定文档
- [Work Item 生命周期](wi-lifecycle.md) — WI 从创建到完成的完整流程
- [术语表](glossary.md) — SpecForge 核心术语定义

## 参考文档
- [工作流类型](workflow-types.md) — 8 种工作流的适用场景和阶段
- [Agent 角色](agent-roles.md) — 9 个 Agent 的职责和接口
- [_meta.json 规范](meta-json-spec.md) — Work Item 元数据文件格式

## 维护规则
- 自动生成文档：不要手动编辑，修改对应 schema 后运行渲染脚本
- 手写文档：任何修改需通过 review
```

**`docs/conventions/wi-lifecycle.md`**（Work Item 生命周期）：
- WI 的创建（intake）
- 状态机驱动的阶段流转
- 各工作流的阶段差异
- 产物命名规范（`requirements.md`、`design.md`、`tasks.md` 等）
- `_meta.json` 的写入责任表

**`docs/conventions/glossary.md`**（术语表）：
- Work Item (WI)
- Spec Directory
- LAYOUT / USER_LAYOUT
- SPEC_DIR_NAME
- committed 区 / gitignored 区
- Gate（质量门禁）
- Agent / Sub-Agent / Orchestrator
- Knowledge Graph / Knowledge Base
- CAS（内容寻址存储）
- WAL（写前日志）

**`scripts/render-meta-schema.ts`**：
- 从 `packages/types/src/meta-schema.ts` 读取 `WorkItemMetaSchema` 和相关常量
- 自动生成 `docs/conventions/meta-json-spec.md`
- 参考 `scripts/render-layout.ts` 的实现模式

#### 验证

- 所有必填文档存在且内容非空
- `scripts/render-meta-schema.ts` 可执行并生成正确输出
- 手写文档内容准确，与现有代码和 schema 一致

#### 不变行为检查

- [ ] `bun run test` — 所有现有测试通过
- [ ] 不修改任何 `packages/` 下现有文件
- [ ] `docs/conventions/directory-layout.md` 不变（仍由 `render-layout.ts` 生成）

---

### Step 5：删除根目录残留临时文件

refs: [refactor_analysis P2-6]
constrained_by: 方案 A §3.2（需删除文件清单）, WI-011 验证报告（验证项 8 已确认清理）

#### 执行步骤

1. 逐个确认方案 A §3.2 列出的文件是否仍存在
2. 对仍存在的文件执行删除
3. 预期结果：P1 验证报告确认已清理，此步骤可能 0 操作

#### 待确认文件清单

| 文件 | 预期状态 |
|------|---------|
| `opencode.json`（空文件） | 已删除（WI-011 验证项 8 确认） |
| `test-error.txt` | 已删除 |
| `test-output.txt` | 已删除 |
| `test-output2.txt` | 已删除 |
| `test-output3.txt` | 已删除 |
| `test-help-output.ts` | 已删除 |
| `test-init.ps1` | 已删除 |
| `run-concurrent-init.ps1` | 已删除 |
| `run-init-test.js` | 已删除 |
| `task-4.7-completion-summary.md` | 已删除 |
| `agents/`（空目录） | 已删除 |
| `.opencode-/`（废弃备份） | 已删除 |

#### 验证

- 上述文件均不存在
- `bun run test` — 所有现有测试通过

#### 不变行为检查

- [ ] `bun run test` — 所有测试通过
- [ ] 删除操作不影响任何有代码引用的文件

---

### Step 6：删除 `.kiro/specs/_archive/`（需用户确认）

refs: [方案 A §3, 方案 A §10.1 D3]
constrained_by: 用户确认（`.kiro/` 的任何变更需用户批准）

> ⚠️ **本步骤需要用户确认才能执行。**
> 如用户不确认，跳过本步骤，不影响后续步骤执行。

#### 执行步骤

1. **确认**：用户明确同意移动 `.kiro/specs/_archive/`
2. **移动**：将 `.kiro/specs/_archive/` 全部内容移到 `docs/archive/kiro-specs/`
3. **保留**：`.kiro/steering/` 不动（仍在用 Kiro 开发）
4. **保留**：`.kiro/specs/` 下非 `_archive/` 的活跃 spec 不动
5. **验证**：`docs/archive/kiro-specs/` 包含全部 17 个归档 spec 目录

#### 移动清单

已知归档内容（17 个目录 + 1 个 zip）：

```
docs/archive/kiro-specs/
├── specforge-v5-knowledge/
├── specforge-v4-platform/
├── specforge-v37-verification-strategy/
├── specforge-v36-workflows/
├── specforge-v35-unified-plugin/
├── specforge-v34-user-install/
├── specforge-v33-parallel-tasks/
├── specforge-v32-orchestrator-split/
├── specforge-v31-token-monitor/
├── specforge-v3-cost-tracking/
├── specforge-v2-efficiency/
├── specforge-v1-mvp/
├── specforge-v1-complete/
├── specforge-install-commands/
├── specforge-error-handling/
├── specforge-ears-format/
├── installer-reconcile-redesign/
└── _task_meta_backup_2026-05-13.zip
```

#### 验证

- `docs/archive/kiro-specs/` 存在且包含上述内容
- `.kiro/steering/` 仍存在且内容不变
- `bun run test` — 所有现有测试通过

#### 不变行为检查

- [ ] `bun run test` — 所有测试通过
- [ ] `.kiro/steering/` 未被修改

---

### Step 7：更新 README.md 顶层导航

refs: [refactor_analysis P2-3]
constrained_by: 纯文档修改

#### 改动范围

在 `README.md` 中：

1. **添加约定中心导航入口**：在"目录结构"段后或文档合适位置添加指向 `docs/conventions/` 的链接
2. **更新"目录结构"段**（L137-L188）：反映 P1 后的仓库实际状态
   - 将 `.opencode/` 描述替换为 `setup/` 目录描述
   - 将 `specforge/`（不带点）替换为 `.specforge/`（带点）
   - 添加 `docs/conventions/` 目录描述
   - 更新用户项目视角中的目录结构（与 `directory-layout.md` 一致）

#### 改动示例

```markdown
## 目录结构

### 本仓库（开发视角）

```
SpecForge/                        # 仓库根目录
├── .kiro/
│   └── steering/                # AI 开发规则
├── setup/                       # 安装源集中管理
│   ├── userlevel-opencode/      # → ~/.config/opencode/
│   ├── userlevel-scripts-lib/   # → ~/.config/opencode/scripts/lib/
│   └── userlevel-templates/     # → ~/.specforge/templates/
├── packages/                    # V6 模块源码（monorepo）
│   ├── daemon-core/
│   ├── configuration/
│   ├── permission-engine/
│   ├── observability/
│   ├── scope-gate/
│   ├── workflow-runtime/
│   └── types/
├── scripts/                     # 开发脚本 + 文档生成器
├── tests/                       # 跨模块集成/e2e/架构测试
├── docs/
│   ├── conventions/             # 约定中心（详见 docs/conventions/README.md）
│   ├── adr/                     # 架构决策记录
│   ├── engineering-lessons/     # 工程经验库
│   ├── proposals/               # 提案文档
│   └── archive/                 # 历史文档归档
└── .specforge/                  # 自举数据（SpecForge 开发自己）
```

### 文档导航

- **约定中心**：[docs/conventions/README.md](docs/conventions/README.md) — 目录布局、WI 生命周期、术语表等核心约定
- **架构决策**：[docs/adr/](docs/adr/) — ADR 编号索引
- **工程经验**：[docs/engineering-lessons/](docs/engineering-lessons/) — 团队踩坑记录
```

#### 验证

- README.md 中包含指向 `docs/conventions/` 的导航链接
- "目录结构"段反映 P1 后的仓库实际状态
- `bun run test` — 不受影响

#### 不变行为检查

- [ ] 仅修改 `README.md`
- [ ] 不影响任何功能代码

---

### Step 8：全量回归测试

refs: [IB-1, IB-4, IB-5]
constrained_by: 所有不变行为声明

#### 执行步骤

1. 运行 `bun run test` — 全量测试通过
   - `packages/types/` — 74 pass / 0 fail（新增 architecture test 可能增加数量）
   - `packages/daemon-core/tests/unit/` — 266 pass（pre-existing 失败除外）
   - `packages/permission-engine/` — exit 0
2. 运行 `bun scripts/sf-installer.ts verify` — 通过
3. 运行 `bun run lint:layout` — exit 0（0 违规）
4. 确认 TypeScript 编译无错误

#### 通过标准

| 检查项 | 通过条件 |
|--------|---------|
| 全量测试 | 所有测试通过（pre-existing 失败除外） |
| 安装器校验 | exit 0 |
| 路径 Lint | exit 0（0 违规） |
| TypeScript 编译 | 无错误 |

#### 不变行为检查

- [ ] IB-1：所有现有测试套件 100% 通过
- [ ] IB-2：daemon 启动行为不变
- [ ] IB-3：目录结构与 P1 完成后一致
- [ ] IB-4：TypeScript 编译无错误
- [ ] IB-5：安装器校验通过
- [ ] IB-6：现有代码功能零修改

---

## 4. 风险等级判定

### 最终风险等级：低

### 判定依据

| Step | 改动类型 | 影响范围 | 回滚难度 | 风险 |
|------|---------|---------|---------|------|
| Step 1（CI Lint） | 纯新增文件 | 0 现有文件受影响 | 删除新增文件 + git revert package.json | 极低 |
| Step 2（Architecture Test） | 纯新增测试文件 | 0 现有文件受影响 | 删除新增文件 | 极低 |
| Step 3（清扫违规） | 可能的少量路径修复 | 仅限遗漏文件 | git revert | 低 |
| Step 4（docs/conventions） | 纯文档新增 + 脚本新增 | 0 代码影响 | 删除新增文件 | 极低 |
| Step 5（删除残留） | 删除无引用文件 | 0 功能影响 | git revert | 极低 |
| Step 6（移动 _archive） | 文件移动（需确认） | 0 代码影响 | git revert | 极低 |
| Step 7（README 更新） | 纯文档修改 | 0 代码影响 | git revert | 极低 |
| Step 8（回归测试） | 纯验证 | 0 改动 | N/A | 无 |

### 走低风险路径

根据 Refactor 工作流双路径状态机：
- **低风险路径**：development → verification（跳过 review）
- **判定依据**：纯新增 lint + 测试 + 文档，现有功能零修改，所有改动可原子回滚

### 潜在风险缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Step 3 发现大量遗漏 | 开发周期延长 | 低概率（P1 已全量验证），发生时逐个分析 |
| CI Lint 白名单不够精确 | CI 红灯误报 | 白名单支持 glob 模式，可快速扩展 |
| Architecture Test 在 CI 环境失败 | CI 红灯 | 测试仅验证 Schema 常量和路径构造函数，不依赖实际文件系统状态 |
| Step 6 用户不确认 | 跳过该步骤 | 不影响其他步骤，可后续单独执行 |

---

## 5. 产出文件汇总

### 新增文件

| 文件路径 | Step | 说明 |
|---------|------|------|
| `scripts/lint/check-hardcoded-paths.ts` | Step 1 | CI Lint 规则脚本 |
| `.lintrc-layout.json` | Step 1 | 白名单配置 |
| `tests/architecture/directory-layout.test.ts` | Step 2 | 目录结构验证测试 |
| `docs/conventions/README.md` | Step 4 | 约定中心导航 |
| `docs/conventions/wi-lifecycle.md` | Step 4 | WI 生命周期约定 |
| `docs/conventions/glossary.md` | Step 4 | 术语表 |
| `docs/conventions/workflow-types.md` | Step 4 | 工作流类型详解 |
| `docs/conventions/agent-roles.md` | Step 4 | Agent 角色职责 |
| `docs/conventions/meta-json-spec.md` | Step 4 | _meta.json 规范 |
| `scripts/render-meta-schema.ts` | Step 4 | meta-schema 自动文档生成器 |

### 修改文件

| 文件路径 | Step | 改动内容 |
|---------|------|---------|
| `package.json` | Step 1 | 新增 `scripts.lint:layout` |
| `.github/workflows/code-quality.yml` | Step 1 或独立 | 新增 Lint job 和 Architecture Test step |
| `README.md` | Step 7 | 添加约定中心导航、更新目录结构段 |

### 可能修改（Step 3 扫描结果决定）

| 文件路径 | Step | 条件 |
|---------|------|------|
| 少量 `.ts` 文件 | Step 3 | 仅当 Lint 扫描发现遗漏违规时 |

### 可能移动（Step 6 需用户确认）

| 来源 | 目标 | Step |
|------|------|------|
| `.kiro/specs/_archive/` | `docs/archive/kiro-specs/` | Step 6 |

---

## 6. 关键参考文件

| 文件 | 角色 |
|------|------|
| `packages/types/src/directory-layout.ts` | Schema 层单一真相源（LAYOUT + USER_LAYOUT + 路径构造函数） |
| `packages/types/src/meta-schema.ts` | _meta.json 的 zod schema（WorkItemMetaSchema） |
| `docs/proposals/2026-05-29-directory-structure-governance.md` | 方案全文（§8 三道强制门、§9 P2 任务列表） |
| `.specforge/specs/WI-011/verification_report.md` | P1 验证结果基线 |
| `.github/workflows/code-quality.yml` | CI pipeline 集成目标 |
| `scripts/render-layout.ts` | 文档生成器参考实现 |
| `docs/conventions/directory-layout.md` | 已有约定文档（保持不变） |
| `package.json` | scripts 配置 |
