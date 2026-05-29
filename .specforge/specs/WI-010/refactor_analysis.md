# WI-010 Refactor Analysis — SpecForge V6 目录结构治理 P0

**工作流类型**：refactor
**阶段**：refactor_analysis
**主输入文档**：`docs/proposals/2026-05-29-directory-structure-governance.md`（方案 A）
**关联实证**：`.specforge/specs/WI-004/impact_analysis.md`
**风险路径预判**：`low`（development → verification 直跳）

---

## 代码问题识别

SpecForge V6 项目当前存在**系统性目录路径治理失效**，已通过两个独立来源完成实证：WI-004 impact_analysis 的静态扫描，以及 2026-05-29 诊断会话中 sf-orchestrator 走的 6 轮排查弯路。方案 A §1.1 将根因归纳为以下 4 条（编号 R1-R4）：

**R1 — 架构决策与文档不同步**：ADR-006 明确选定 `.specforge/`（带点）作为权威项目目录名，但 README.md、AGENTS.md、8 个工作流 SKILL.md 文件、4 个 Agent prompt 文件全部写成 `specforge/`（不带点）。决策层的真相未能向下游传导，造成文档层与决策层割裂。

**R2 — 代码内部三方约定不一致**：根据 WI-004 impact_analysis.md §裂缝 #3 的实证扫描，影响面达 **40+ 文件**，分布在三个相互矛盾的约定区：
- `packages/daemon-core/src/tools/lib/*` 共 12 个 core 文件使用 `.specforge/`（带点）
- 部署态 `.opencode-/tools/lib/*` 共 15 个 core 文件使用 `specforge/`（不带点）
- 8 个 SKILL.md + 4 个 Agent prompt 使用 `specforge/specs/`（不带点）

更严重的是 daemon-core 与部署态 tools 使用**完全相反**的约定，磁盘上实际生效的是 daemon 模式的 `.specforge/`，意味着部署态 tools 的路径从未被正确使用过，却长期共存于代码库中无任何告警。

**R3 — 开发目录与"用户项目目录"语义混淆**：SpecForge 自举开发的特性导致仓库根同时存在 `.specforge/`（committed Git）和 `specforge/`（gitignored 但实际运行写入数据），两套并存且都"看起来在工作"。开发者无法直观判断"自己改的代码该读哪一个"。

**R4 — 没有任何编译期/PR 期/运行期约束**：路径全部是源码里的硬编码字符串字面量（`join(baseDir, ".specforge", ...)` 或 `"specforge/specs/" + wi`），任何 PR 新增违规路径都不会被拦下，TypeScript 类型系统、CI Lint、Architecture Test 三道防线全部缺位。

**本次会话的实证案例（验证 R1-R4 的真实代价）**：在 2026-05-29 的诊断会话中，仅"确认 daemon 是否健康"这一基础问题，sf-orchestrator 走了 **6 轮对话弯路**：(1) 误判 plugin 需要外部依赖，让用户加错 `file:` 依赖触发 workspace 解析失败；(2) 误判 `plugin_loaded.txt` 是当前 plugin 写的，实际是旧版残留；(3) 在 `specforge/logs/trace.jsonl`（不带点）找今天的日志，而 daemon 实际写到 `~/.specforge/runtime/events.jsonl`。最终确认系统其实一直正常，**所有诊断弯路都源于"多套路径并存 + 文档与代码不一致"**。如果连维护者都需要 6 轮才能排查，普通用户根本无法自助诊断问题。

## 重构目标

本 WI（P0 阶段）的核心目标是建立**单一真相源（Single Source of Truth）的基础设施**，为后续 P1 全量切换和 P2 强制约束上线打地基。本阶段采取"**纯新增不修改**"的策略，是整个目录结构治理方案中风险最低、回滚成本最低的阶段（详见方案 A §6 + §9）。

**P0 的核心产物清单**（来自方案 A §9 Phase P0 任务表，对应 intake.md §2.1）：

1. **`packages/types/src/directory-layout.ts`**（~150 行）— 唯一路径常量源（权威 Schema），导出 `SPEC_DIR_NAME` 常量、`LAYOUT` 字典、`resolveProjectPath()` / `specPath()` / `agentRunArchivePath()` 三个路径构造函数。这是方案 A §6.2 的核心交付物。
2. **`packages/types/src/meta-schema.ts`**（~80 行）— `_meta.json` 的 zod schema，为 P1 阶段的 `specs/README.md` 自动渲染机制（方案 A §5）提供数据契约。
3. **`scripts/migrations/v6-dir-rename.ts`**（~200 行）— 数据迁移脚本，扫描 `specforge/` → `.specforge/` 重命名（P0 阶段**只生成代码、不执行迁移**）。
4. **`scripts/migrations/v6-dir-backup.ts`**（~100 行）— 迁移前自动备份机制，备份到 `~/.specforge/backups/<ts>/`，保证迁移可逆。
5. **`docs/adr/ADR-006-specforge-dir-naming.md`**（~50 行）— 补录 ADR-006，含 Context / Decision / Consequences / Status 标准段，正式锁定带点命名决策。
6. **`packages/types/tests/directory-layout.test.ts`** + **`packages/types/tests/meta-schema.test.ts`**（~120+60 行）— 单元测试覆盖所有 LAYOUT key 与 schema 边界。

**总计**：约 760 行新增代码，**零行修改**现有代码。

**P0 与 P1/P2 的关系**：P0 只建立 Schema 与备份基础设施，**不触动**现有代码的硬编码路径；P1（独立 WI，工作流类型 change_request）才进行 daemon-core 12 个 core 文件 + 部署态 tools + 8 个 SKILL.md + 4 个 Agent prompt 的全量切换，预估改动量 40+ 文件、200-500 处替换；P2（独立 WI，工作流类型 refactor）才上线 CI Lint 与 Architecture Test 两道强制门并清扫存量。**任何属于 P1/P2 的工作（如 daemon-core 代码切换、CI Lint 规则、文档生成器 `render-layout.ts`、setup/ 目录搬迁）严禁纳入 P0 范围**——这是 P0 风险等级判定为"低"的前提。

## 不变行为声明

P0 阶段是**纯新增**，必须严格保证以下 5 类行为零变化。每条约束都写明可验证的判定标准（验证方式由 verification 阶段执行）。

### 1. 用户可见行为不变

- daemon 启动行为不变：监听端口、handshake 写入位置（`~/.specforge/runtime/`）、启动日志格式、PID 文件位置均与 P0 前完全一致
- Plugin 加载行为不变：`sf_specforge.ts` plugin 加载机制不变，加载顺序不变，加载失败的报错信息不变
- 所有现有工作流（feature_spec / bugfix_spec / refactor / investigation / change_request / ops_task / quick_change / design_first）能在 P0 完成后继续正常执行端到端流程
- 所有现有 Work Item 的状态机和 Gate 行为不变：相同输入下，Gate pass/fail 判定结果与 P0 前完全一致
- 用户项目首次初始化的目录结构不变：仍按现状创建（即 `.specforge/` 与 `specforge/` 双目录并存的现状不被破坏）

### 2. 代码层公共 API 不变

- daemon-core 所有 **public** 导出（`packages/daemon-core/src/index.ts` 中的公共接口）签名与运行时行为不变
- `PersonalPathResolver` 与 `EnterprisePathResolver` 类的 public 方法签名、返回值类型、抛错条件均不变
- 所有 `sf_*` tool（`sf_artifact_write` / `sf_requirements_gate` / `sf_design_gate` / `sf_tasks_gate` / `sf_verification_gate` / `sf_state_transition` / `sf_knowledge_graph` 等 17+ 个）的 MCP 输入参数 schema 与输出 JSON 结构完全不变
- `sf-installer.ts` 的 `install` / `upgrade` / `verify` / `uninstall` 四个子命令的 CLI 参数解析、执行步骤、退出码均不变

### 3. 测试基线不变

- 现有所有 unit / integration / property test **必须 100% 继续通过**，零失败、零跳过新增
- 仓库根 `bun run test` 命令在 P0 完成后的输出结果（通过数、跳过数、覆盖率）与 P0 前一致
- 新增测试只覆盖 P0 新增的模块（`packages/types/tests/directory-layout.test.ts` + `meta-schema.test.ts`），**不得修改**任何已有测试文件的断言或 fixture

### 4. 配置文件不变

- 根 `package.json` 与各 package 的 `package.json` 的 `dependencies` / `devDependencies` / `scripts` 字段不变
- **唯一允许的例外**：`packages/types/package.json` 可新增 `zod` 依赖（meta-schema.ts 必需）
- 根 `tsconfig.json` 与各 package 的 `tsconfig.json` 不变；唯一允许的例外：`packages/types/tsconfig.json` 若需新增 `exports` 入口，仅追加不修改既有字段
- 根 `vitest.config.ts` 不变（新增测试自动被 glob 匹配，无需修改配置）
- `.gitignore` 不变（P0 新增文件全部位于已被 tracked 的目录下）

### 5. 数据兼容性

- 迁移脚本 `scripts/migrations/v6-dir-rename.ts` 与 `v6-dir-backup.ts` 在 P0 阶段**只生成代码、不执行**——`bun run` 这两个脚本不在 P0 的任务步骤中
- 迁移脚本必须支持 `--dry-run` 模式，且 dry-run 输出必须能列出所有将要重命名的路径，不实际触动磁盘
- 备份机制必须设计为**可逆**：备份目录 `~/.specforge/backups/<ts>/` 必须包含被迁移目录的完整快照（结构 + 内容 + 修改时间），任何对现有数据的写入操作必须先完成备份
- 任何 P0 新增代码**不得直接读写**仓库现有 `.specforge/` 或 `specforge/` 数据目录（除测试用临时目录外）

## 风险评估

**风险等级**：**低**
**最终判定**：`risk_path = low`（refactor 工作流低风险路径，development → verification 直跳，不经过 review 阶段）

5 个维度逐一论证（对照 intake.md §4 风险表 + 方案 A §9 Phase P0 风险说明）：

### 维度 1：代码风险 — 低

P0 阶段**纯新增**，无任何现有文件的修改（除 `packages/types/package.json` 必要新增 zod 依赖、`packages/types/tsconfig.json` 可能必要追加 exports 入口外）。新增代码位于独立模块 `packages/types/src/` 与独立目录 `scripts/migrations/`，与 daemon-core 运行时主路径**完全解耦**——daemon 在 P0 完成后仍走原硬编码路径（这正是 P1 才要切换的内容）。新增代码不被任何现有调用方 import，对运行时行为零影响。

### 维度 2：数据风险 — 低

迁移脚本（T4 / T5）在 P0 阶段**只生成、不执行**——执行迁移属于 P1 阶段的 T8 任务范围。P0 完成后磁盘上的 `.specforge/` 与 `specforge/` 双目录现状保持不变。备份机制本身设计为可逆，但 P0 阶段也不实际触发备份。即使 P0 全部回滚（删除所有新增文件），现有数据无任何丢失风险。

### 维度 3：接口风险 — 低

不修改任何公共 API：daemon-core public exports 不动，`sf_*` tool 的 MCP schema 不动，CLI 命令行为不动。新增的 `directory-layout.ts` 是一个**孤立的导出模块**，P0 阶段没有任何现有代码 import 它（首次 import 发生在 P1）。`meta-schema.ts` 同理为孤立模块，`_meta.json` 文件本身在 P0 阶段不被任何 daemon 流程读写。

### 维度 4：测试风险 — 极低

新增测试只覆盖新增模块，与现有测试在物理位置上隔离（`packages/types/tests/` 是独立测试目录）。新增测试不修改任何 fixture、不引入新的全局 mock、不修改 vitest 配置。`bun run test` 的现有测试套件继续以原始顺序、原始环境运行。

### 维度 5：回滚成本 — 极低

回滚操作简化为"删除新增文件"——单条 `git revert` 即可完整撤销 P0 的全部改动，无需触动任何磁盘数据、无需迁移回退、无需缓存清理。回滚后系统状态与 P0 启动前 bit-for-bit 一致。

**综合判定**：P0 满足 refactor 工作流低风险路径的全部判定条件（纯新增 / 不改公共接口 / 测试基线零冲击 / 回滚 O(1) 复杂度），因此 `risk_path = low`，development 阶段完成后直接进入 verification 阶段，跳过 review 阶段。最终判定结果由 `refactor_plan_gate` 在阶段流转时再次确认。
