# WI-010 Refactor Plan — SpecForge V6 目录结构治理 P0

**工作流类型**：refactor
**阶段**：refactor_plan
**主输入**：`refactor_analysis.md`（含 4 段分析）+ `intake.md`（验收标准）+ `docs/proposals/2026-05-29-directory-structure-governance.md`（方案 A，权威设计源）
**最终风险等级**：**low**
**risk_path**：`low`（development → verification 直跳，跳过 review）

---

## 重构策略

P0 阶段采取**"纯新增不修改"（zero modification to existing paths）**策略，是整个目录结构治理方案（方案 A）的最低风险阶段。本阶段不触动任何现有的硬编码路径（这是 P1 的工作），仅建立**单一真相源（Single Source of Truth, SSOT）的基础设施**：Schema 定义、zod 元数据契约、迁移与备份脚本骨架、ADR 决策记录。任何 P1/P2 范围内的工作（daemon-core 切换、Agent prompt 路径修正、CI Lint、Architecture Test、setup/ 搬迁、sf-installer.ts 改造、render-layout.ts 文档生成器）严禁纳入 P0——这是 risk_path=low 判定能够成立的硬前提。

**三层架构对齐方案 A §7.1**。P0 阶段同时铺设三层中的"决策层"与"Schema 层"，"视图层"留给 P1 的文档生成器：

| 层 | 文件 | P0 是否产出 |
|----|------|-------------|
| 1. 决策层 | `docs/adr/ADR-006-specforge-dir-naming.md` | ✅ 本 WI 补录 |
| 2. Schema 层 | `packages/types/src/directory-layout.ts` + `meta-schema.ts` | ✅ 本 WI 实现 |
| 3. 视图层 | `docs/conventions/directory-layout.md`（由 `render-layout.ts` 输出） | ❌ P1 才做 |

**接口设计原则（编译期防御第一道门的基础）**。`directory-layout.ts` 必须用 TypeScript `as const` 声明 `SPEC_DIR_NAME` 与 `LAYOUT` 字典，使 `keyof typeof LAYOUT` 成为类型系统识别的字面量联合类型——任何 `resolveProjectPath(root, 'wrongKey')` 在编译期就被拒绝。这是方案 A §8 三道强制门中"防线 A"的基础设施，P2 的 CI Lint（防线 B）和 Architecture Test（防线 C）都依赖 P0 把这层 Schema 立稳。

**路径构造函数集合（方案 A §6.2）**。`directory-layout.ts` 必须导出且仅导出三类路径构造能力：(1) `resolveProjectPath(projectRoot, key, ...subpath)` 通用入口，把 `LAYOUT` 字典里的相对路径与项目根拼合；(2) `specPath(projectRoot, workItemId, file)` WI 子路径专用入口（避免上层每次都拼 `'specs/' + wi`）；(3) `agentRunArchivePath(projectRoot, workItemId, agentType, runIndex)` Agent Run 归档路径专用入口（避免上层手拼 `${wi}-${agent}-${idx}` 格式）。三个函数全部基于 `SPEC_DIR_NAME` 常量与 `LAYOUT` 字典推导，是后续 P1 全量替换硬编码字符串的唯一入口。

**Meta Schema 的独立性（方案 A §5.2 + §5.3）**。`meta-schema.ts` 是 `_meta.json` 的 zod schema，必填字段为 `id` / `workflow_type` / `title` / `summary` / `key_decisions` / `current_stage` / `created_at`，可选字段为 `completed_at` / `related_modules` / `upstream_wis` / `downstream_wis`。P0 阶段它是一个孤立模块，daemon 流程不读写 `_meta.json`（首次集成在 P1 的 `render-specs-readme.ts`），因此 schema 变更也不影响任何运行时行为。

**测试策略（方案 A §6 隐含约束 + intake §5 验收标准）**：
- `LAYOUT` 字典每个 key 至少 1 个 assertion（验证路径拼接结果符合预期，特别是嵌套子路径如 `runtimeCheckpoints`、`logsTrace`、`archiveAgentRuns`）。
- 每个路径构造函数覆盖 happy path + ≥ 1 个 edge case：`resolveProjectPath` 的 happy path（无 subpath）+ edge case（多段 subpath 拼接）；`specPath` 的 happy path（普通 WI ID）+ edge case（WI ID 含连字符如 `WI-010`）；`agentRunArchivePath` 的 happy path（runIndex=1）+ edge case（runIndex 为大数如 `99`）。
- `meta-schema.ts` 测试必须含 valid 用例（最小完整对象 + 含所有可选字段对象）+ invalid 用例（缺必填字段、`current_stage` 取非法枚举值、`workflow_type` 取非法字符串）。
- **物理隔离原则**：新增测试只放在 `packages/types/tests/` 下，不写入 fixture，不引入新的全局 mock，不修改 `vitest.config.ts`——这样现有测试套件零冲击。

**迁移与备份的解耦**。`v6-dir-rename.ts` 与 `v6-dir-backup.ts` 是**两个独立脚本文件**，可独立执行：备份脚本只负责 `~/.specforge/backups/<ts>/` 全量快照（结构 + 内容 + mtime），不依赖迁移脚本；迁移脚本只负责扫描 `specforge/` → `.specforge/` 重命名，可调用备份脚本（推荐）或假设备份已完成（独立模式）。两脚本必须支持 `--dry-run` 模式，输出"将要操作的清单"而不实际触动磁盘。**P0 阶段只编写脚本代码，不实际跑迁移与备份**——执行属于 P1 阶段的范畴。

**与现有代码的解耦边界**。P0 阶段新增的所有代码（`directory-layout.ts` / `meta-schema.ts` / 两个迁移脚本）**不被任何现有代码 import**——daemon-core、`.opencode/tools/lib`、SKILL.md、Agent prompt 在 P0 完成后仍走原硬编码路径，运行时行为零变化。这正是 risk_path=low 的核心依据：新增代码与运行时主路径在 P0 阶段是"物理隔离的孤立模块"。

---

## 步骤顺序

P0 共 6 个任务（T1-T6），按依赖关系排序。**每个任务完成后整个仓库的现有测试套件必须继续 100% 通过**（这是 risk_path=low 判定的硬条件）。任务间的依赖关系如下：

```
T1 ──┬── T3 (依赖 T1)
     └── T5 (依赖 T1)
T2 ───── T4 (依赖 T2)
T6 (无依赖，与 T1-T5 并行)
```

### T1 — 实现 directory-layout.ts（Schema 核心）

- **依赖**：无
- **产出文件**：`packages/types/src/directory-layout.ts`（约 150 行）
- **内容要点**：
  - 顶层 `export const SPEC_DIR_NAME = '.specforge' as const;`
  - `export const LAYOUT = { ... } as const;` 含全部子目录键（参见方案 A §6.2，覆盖 committed 区：`manifest` / `config` / `configFiles.*` / `specs` / `specsReadme` / `knowledge` / `knowledgeGraph`；gitignored 区：`runtime` / `runtimeWal` / `runtimeState` / `runtimeCheckpoints` / `logs` / `logsTelemetry` / `logsTrace` / `logsToolCalls` / `logsCost` / `logsConversations` / `archive` / `archiveAgentRuns` / `sessions` / `cas`）
  - 导出函数 `resolveProjectPath(projectRoot, key, ...subpath)`、`specPath(projectRoot, workItemId, file)`、`agentRunArchivePath(projectRoot, workItemId, agentType, runIndex)`
- **完成验证标准**：
  - 至少 5 个公共导出可达（`SPEC_DIR_NAME` / `LAYOUT` / `resolveProjectPath` / `specPath` / `agentRunArchivePath`）
  - `bun run tsc --noEmit -p packages/types` 编译通过（无类型错误）
  - 文件不 import 任何现有 daemon-core / tools 模块（保持孤立）
- **完成后系统状态**：仓库新增 1 个孤立模块文件，无现有代码 import，daemon 运行时行为零变化；现有 `bun run test` 套件继续全绿。

### T2 — 实现 meta-schema.ts（_meta.json 的 zod schema）

- **依赖**：无（与 T1 解耦，可并行实现）
- **产出文件**：`packages/types/src/meta-schema.ts`（约 80 行）
- **前置动作**：`packages/types/package.json` 新增 `zod` 依赖（这是 refactor_analysis §不变行为声明 §4 配置文件不变 中明确允许的唯一例外）
- **内容要点**：
  - 导出 `WorkItemMetaSchema`（zod object schema）
  - 必填字段：`id` (string)、`workflow_type` (enum: feature_spec / bugfix_spec / refactor / investigation / change_request / ops_task / quick_change / design_first)、`title` (string)、`summary` (string，≤ 200 字)、`key_decisions` (string[])、`current_stage` (enum)、`created_at` (ISO datetime)
  - 可选字段：`completed_at` (ISO datetime)、`related_modules` (string[])、`upstream_wis` (string[])、`downstream_wis` (string[])
  - 导出推导类型 `export type WorkItemMeta = z.infer<typeof WorkItemMetaSchema>;`
- **完成验证标准**：
  - 至少导出 `WorkItemMetaSchema` 与 `WorkItemMeta` 两个符号
  - `bun run tsc --noEmit -p packages/types` 编译通过
  - 模块不被任何现有代码 import（保持孤立）
- **完成后系统状态**：`packages/types/package.json` 新增 `zod` 依赖；新增 1 个孤立 schema 模块；daemon 运行时不读写 `_meta.json`（首次集成在 P1）；现有测试套件继续全绿。

### T3 — 单元测试 directory-layout

- **依赖**：T1（必须先完成）
- **产出文件**：`packages/types/tests/directory-layout.test.ts`（约 120 行）
- **覆盖要点**：
  - **LAYOUT 完整性测试**：遍历 `LAYOUT` 所有 key，每个 key 至少 1 个 assertion 验证拼接结果（特别是嵌套子路径如 `configFiles.projectRules` 应拼出 `<root>/.specforge/config/project-rules.md`）
  - **resolveProjectPath 测试**：happy path（`resolveProjectPath('/proj', 'runtime')` → `/proj/.specforge/runtime`）+ edge case（多段 subpath：`resolveProjectPath('/proj', 'specs', 'WI-001', 'design.md')` → `/proj/.specforge/specs/WI-001/design.md`）
  - **specPath 测试**：happy path（普通 WI ID）+ edge case（WI ID 含连字符如 `WI-010`，验证不被 `path.join` 异常处理）
  - **agentRunArchivePath 测试**：happy path（runIndex=1，产出 `/proj/.specforge/archive/agent_runs/WI-001-sf-design-1`）+ edge case（runIndex=99 的大数字）
  - **SPEC_DIR_NAME 常量测试**：断言常量值为字面量 `'.specforge'`
- **完成验证标准**：
  - `bun test packages/types/tests/directory-layout.test.ts` 通过，0 失败
  - 测试覆盖 `LAYOUT` 字典中的所有 key（含 `configFiles` 的所有嵌套键）
  - 仓库根 `bun run test` 全套测试继续全绿（新增测试不破坏现有套件）
- **完成后系统状态**：新增独立测试文件 1 个，`packages/types/tests/` 测试目录建立；现有测试套件零冲击。

### T4 — 单元测试 meta-schema

- **依赖**：T2（必须先完成）
- **产出文件**：`packages/types/tests/meta-schema.test.ts`（约 60 行）
- **覆盖要点**：
  - **valid 用例**：(a) 最小完整对象（只含必填字段）通过 `WorkItemMetaSchema.parse()` 不抛错；(b) 含全部可选字段的完整对象通过校验
  - **invalid 用例**：(a) 缺必填字段（如缺 `id`）应抛 ZodError；(b) `workflow_type` 取非法字符串（如 `'unknown'`）应抛 ZodError；(c) `current_stage` 取非法枚举值应抛 ZodError；(d) `summary` 字段类型错（如传入数字）应抛 ZodError
- **完成验证标准**：
  - `bun test packages/types/tests/meta-schema.test.ts` 通过，0 失败
  - 至少 6 个测试用例（≥ 2 valid + ≥ 4 invalid）
  - 仓库根 `bun run test` 全套测试继续全绿
- **完成后系统状态**：新增独立测试文件 1 个；`zod` 在 devDependencies 路径上被首次使用（验证 T2 的依赖新增正确）；现有测试套件零冲击。

### T5 — 迁移与备份脚本

- **依赖**：T1（必须 import `directory-layout.ts` 的 `SPEC_DIR_NAME`，保证两脚本使用同一真相源）
- **产出文件**：
  - `scripts/migrations/v6-dir-rename.ts`（约 200 行）
  - `scripts/migrations/v6-dir-backup.ts`（约 100 行）
- **内容要点**：
  - **v6-dir-backup.ts**：扫描指定目录（默认 `<project>/specforge/` 与 `<project>/.specforge/`），完整快照（结构 + 内容 + mtime）写入 `~/.specforge/backups/<ISO-ts>/`。必须支持 `--dry-run`（只输出"将要备份的文件清单"不写盘）和 `--source <path>` / `--dest <path>` 参数。
  - **v6-dir-rename.ts**：扫描项目根的 `specforge/`，列出将重命名为 `.specforge/` 的目标路径；从 `directory-layout.ts` 导入 `SPEC_DIR_NAME` 作为目标命名。必须支持 `--dry-run`（输出迁移清单不修改磁盘）、`--skip-backup`（跳过自动调用 backup，假设已备份）、`--project <path>` 参数。默认行为：dry-run 模式下先调用 backup 的 dry-run。
  - **接口解耦**：两脚本可独立 `bun run`，rename 不强依赖 backup（通过 `--skip-backup` 解耦）。
- **完成验证标准**：
  - 两个脚本文件存在并通过 `bun run tsc --noEmit` 类型检查
  - `bun run scripts/migrations/v6-dir-rename.ts --dry-run --project /tmp/fake` 退出码 0 且输出迁移清单（不实际触动磁盘——这是 refactor_analysis §不变行为声明 §5 数据兼容性的硬约束）
  - `bun run scripts/migrations/v6-dir-backup.ts --dry-run --source /tmp/fake` 退出码 0 且输出备份清单（不实际写 `~/.specforge/backups/`）
  - 脚本中**唯一**允许的字符串字面量路径是 `'specforge'`（旧路径，必须硬编码因为这是要被迁移的源——属于方案 A §8.1 白名单的合法用例 `scripts/migrations/**`）
- **完成后系统状态**：仓库新增 2 个独立迁移脚本，**P0 阶段不实际执行**；磁盘上 `.specforge/` 与 `specforge/` 双目录现状保持不变；现有测试套件继续全绿。

### T6 — 补录 ADR-006 文档

- **依赖**：无（纯文档，与 T1-T5 并行）
- **产出文件**：`docs/adr/ADR-006-specforge-dir-naming.md`（约 50 行）
- **内容要点**（必须含 4 个标准段，方案 A §11 验收标准）：
  - **Context**：为什么需要这个决策——SpecForge 自举开发导致 `.specforge/` 与 `specforge/` 双目录混乱，引用 WI-004 impact_analysis 与 2026-05-29 诊断会话的 6 轮排查弯路为实证。
  - **Decision**：正式锁定 `.specforge/`（带点）作为权威项目目录命名。理由：与 `.git/` / `.kiro/` / `.opencode/` 风格一致；带点目录在 Unix/Windows 文件管理器默认隐藏，符合"用户不应直接编辑工具内部状态"的语义。
  - **Consequences**：列出正面后果（终结路径混乱、为三道强制门铺设基础、可在 P1 全量切换）+ 负面后果（短期 P1 阶段需 40+ 文件替换、`.specforge/` 在某些 Shell 中需特殊 glob 处理）。
  - **Status**：`Accepted`（采纳），关联本提案 `docs/proposals/2026-05-29-directory-structure-governance.md` 与本 WI（WI-010）。
- **完成验证标准**：
  - 文件存在，含 4 个一级或二级标题段：`## Context` / `## Decision` / `## Consequences` / `## Status`
  - 引用方案 A 文档路径与 WI-010 ID
  - Status 段明确为 `Accepted`
- **完成后系统状态**：新增 1 个 ADR 文档，与代码无依赖；现有测试套件零冲击。

---

### 步骤顺序的关键性质

1. **执行顺序总览**：T1 ‖ T2 ‖ T6（三个无依赖任务可并行起手） → T3（依赖 T1） + T4（依赖 T2） → T5（依赖 T1）。建议串行执行顺序：T1 → T2 → T3 → T4 → T5 → T6（线性最稳，便于 verification 阶段按序回溯）。
2. **每步后系统状态承诺**：
   - 每个任务完成后，仓库根 `bun run test` 套件继续 100% 通过（现有测试 + 已新增测试）。
   - 每个任务完成后，daemon 进程行为零变化（仍走原硬编码路径，未被任何 P0 新增模块影响）。
   - 每个任务完成后，单条 `git revert` 即可完整撤销该任务的全部改动。
3. **任务间无环依赖**：T1 → {T3, T5}；T2 → T4；T6 无依赖。依赖图为 DAG，可拓扑排序，不存在循环依赖。
4. **不变行为遵守**：所有 6 个任务严格遵守 refactor_analysis §不变行为声明的 5 类约束（用户可见行为 / 公共 API / 测试基线 / 配置文件 / 数据兼容性），尤其是：
   - 唯一配置文件变更：T2 的 `packages/types/package.json` 新增 `zod`（这是 §4 明确允许的例外）
   - 唯一测试新增位置：`packages/types/tests/`（物理隔离，不触动现有测试）
   - 迁移脚本只生成不执行：T5 的两个脚本在 P0 阶段不被 `bun run` 实际执行（除 dry-run 验证）

---

## 风险等级判定

**最终风险等级**：**low**
**risk_path 值**：`low`

### 5 维度判定依据（与 refactor_analysis §风险评估 一致）

#### 维度 1：代码风险 — **低**

P0 是**纯新增**，新增代码与现有代码物理解耦。**唯一对现有文件的修改**是 `packages/types/package.json` 新增 `zod` 依赖（T2 必需，refactor_analysis §不变行为声明 §4 已明确列为允许例外）。其余 760 行代码全部为新增文件，分布在 `packages/types/src/`、`packages/types/tests/`、`scripts/migrations/`、`docs/adr/` 四个目录，与 daemon-core 运行时主路径（`packages/daemon-core/src/tools/lib/*`）**完全解耦**——daemon 在 P0 完成后仍走原硬编码路径，这正是 P1 才要切换的内容。新增代码不被任何现有调用方 import，运行时行为零影响。

#### 维度 2：数据风险 — **低**

迁移脚本（T5 的 `v6-dir-rename.ts` 与 `v6-dir-backup.ts`）在 P0 阶段**只生成代码、不执行实际迁移**——执行属于 P1 阶段 T8 的范畴。dry-run 验证（`bun run scripts/migrations/v6-dir-rename.ts --dry-run --project /tmp/fake`）只输出清单不写盘。P0 完成后磁盘上的 `.specforge/` 与 `specforge/` 双目录现状保持不变。即使 P0 全部回滚（删除所有新增文件），现有数据无任何丢失风险。

#### 维度 3：接口风险 — **低**

P0 不修改任何公共 API：daemon-core public exports 不动；`PersonalPathResolver` / `EnterprisePathResolver` 类签名不动；17+ 个 `sf_*` tool 的 MCP 输入/输出 schema 完全不动；`sf-installer.ts` 的 4 个 CLI 子命令行为不动。新增的 `directory-layout.ts` 与 `meta-schema.ts` 是**孤立的导出模块**，P0 阶段没有任何现有代码 import 它们——首次 import 发生在 P1 的代码切换任务中。

#### 维度 4：测试风险 — **极低**

新增测试（T3 / T4）只覆盖新增模块，与现有测试在物理位置上隔离（`packages/types/tests/` 是新建独立测试目录）。新增测试不修改任何 fixture、不引入新的全局 mock、不修改 `vitest.config.ts` 与 `bun.lock` 之外的配置。`bun run test` 的现有测试套件继续以原始顺序、原始环境运行。每个任务完成后必须验证现有测试仍 100% 通过——这是 risk_path=low 判定能在 verification 阶段被复核通过的硬证据。

#### 维度 5：回滚成本 — **极低**

回滚操作简化为"删除新增文件 + 撤销 `packages/types/package.json` 的 zod 依赖添加"。单条 `git revert <commit>` 即可完整撤销 P0 的全部改动，无需触动任何磁盘数据（迁移脚本未执行）、无需迁移回退、无需缓存清理、无需重启 daemon。回滚后系统状态与 P0 启动前 bit-for-bit 一致。

### 守卫约束（refactor 工作流双路径状态机）

**判定结果**：P0 满足 refactor 工作流低风险路径（`risk_path=low`）的全部判定条件：
- ✅ 纯新增，无现有路径硬编码修改（除 zod 依赖外）
- ✅ 不改任何公共接口（daemon-core / sf-installer / sf_* tools / Path Resolver 类）
- ✅ 测试基线零冲击（现有测试 100% 继续通过）
- ✅ 回滚成本 O(1)（单条 git revert）
- ✅ 数据零风险（迁移脚本只生成不执行）

**因此**：development 阶段完成后，工作流将根据本 `risk_path=low` 判定**直接流转到 verification 阶段，跳过 review 阶段**（refactor 工作流低风险路径的状态机分支）。最终判定结果将由 `refactor_plan_gate` 在本阶段流转时再次校验确认；行为不变性的硬证据将由 verification 阶段通过"仓库根 `bun run test` 现有套件零失败 + 6 个任务的产出全部满足完成验证标准"两类证据复核。

