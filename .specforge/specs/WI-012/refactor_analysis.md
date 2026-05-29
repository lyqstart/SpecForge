# WI-012 Refactor Analysis — SpecForge V6 目录结构治理 P2

**work_item_id**: WI-012
**workflow_type**: refactor
**upstream**: WI-011（P1 代码全量切换，已完成并通过验证）
**关联方案**: `docs/proposals/2026-05-29-directory-structure-governance.md` §9 Phase P2

---

## 代码问题识别

### P2-1：CI 级别的路径违规检测缺失（防线 B 未上线）

方案 A §8 定义了"三道强制门"：A（TypeScript 类型编译期）、B（CI Lint PR 期）、C（Architecture Test 运行期）。

- **防线 A 已上线**（P0 交付）：`LAYOUT` 使用 `as const` 声明，传错 key 编译失败 ✅
- **防线 B 未实现**：不存在任何 CI Lint 规则来扫描 `.ts` 文件中的违规路径字面量（如 `'.specforge'`、`'specforge/'`、`'runtime/state.json'` 等裸字符串）。当前没有 `.lintrc-layout.json` 或等效白名单配置。
- **防线 C 未实现**：不存在 `tests/architecture/directory-layout.test.ts` 或任何运行时目录结构验证测试。

**后果**：P1 完成的全量路径收口是一次性行为。未来开发者可以在新代码中重新引入硬编码路径字符串，无任何自动检测机制拦截。

### P2-2：`docs/conventions/` 目录内容缺失

方案 A §7 定义了三层结构：决策层（ADR）→ Schema 层（directory-layout.ts）→ 视图层（`docs/conventions/`）。

当前 `docs/conventions/` 目录仅有 1 个文件：
- `docs/conventions/directory-layout.md`（由 `scripts/render-layout.ts` 自动生成）✅

缺失的核心约定文档（方案 A §3 和方案 B 要求）：
- **约定文档入口**：`docs/conventions/README.md`（约定中心导航）
- **工作流文档约定**：工作流阶段结构、产物命名规范
- **Agent 协作约定**：Agent 间接口规范、产物格式标准
- **测试约定**：测试目录组织、命名规范、覆盖率要求

### P2-3：README.md 缺少文档导航入口

当前 `README.md`（435 行）内容详尽但缺少指向 `docs/conventions/` 的导航入口。用户和开发者无法从仓库门面快速找到约定中心。README 的"目录结构"段（L137-L188）仍使用旧描述，未体现 P1 的 `setup/` 目录等变化。

### P2-4：CI pipeline 未集成防线 B/C

当前 `.github/workflows/code-quality.yml` 仅包含：
- 异步资源规范审查
- 工作流文档同步检查
- 单元测试

缺少：
- 路径字面量 Lint 检查（防线 B）
- Architecture Test 运行（防线 C）

### P2-5：存量违规扫描未执行

P1 完成了 daemon-core + permission-engine + 部署态的全量路径切换，但未使用自动化工具做最终存量扫描确认。需要以 Lint 规则扫描一次全仓库，确认 0 残留（白名单文件除外）。

### P2-6：根目录可能残留临时调试文件

P1 验证报告确认清理完成（验证项 8），但方案 A §3.2 列出的文件清单需再次确认：
- `opencode.json`（空文件）— 应已删除
- `test-error.txt`、`test-output*.txt` 等调试文件 — 应已删除
- `.opencode-/`（废弃备份）— 应已删除
- `agents/`（空目录）— 应已删除

---

## 重构目标

### G1：实现 CI Lint 规则（防线 B）

**目标**：创建自定义 Lint 脚本，在 CI 的 PR 阶段扫描 `.ts` 文件中的违规路径字面量。

**产出**：
- `scripts/lint-path-literals.ts`：Lint 脚本，扫描除白名单外的所有 `.ts` 文件
- `.lintrc-layout.json`：白名单配置（定义哪些文件/目录允许包含裸路径字符串）
- CI 集成到 `.github/workflows/code-quality.yml`

**白名单文件（基于方案 A §8.1）**：
- `packages/types/src/directory-layout.ts`（schema 自身）
- `scripts/migrations/**`（迁移脚本）
- `tests/**/fixtures/**`（测试 fixture）
- `**/*.test.ts`（测试代码，仅限 mock 路径）
- `scripts/lint-path-literals.ts`（Lint 脚本自身）

### G2：实现 Architecture Test（防线 C）

**目标**：创建 `tests/architecture/` 目录下的运行时验证测试，确认实际目录结构符合 `LAYOUT` Schema。

**产出**：
- `tests/architecture/directory-layout.test.ts`：验证 `.specforge/` 目录结构
- CI 集成（作为 test job 的一部分运行）

**验证内容**：
- `LAYOUT` 中定义的所有 committed 区路径存在
- `USER_LAYOUT` 中定义的用户级路径结构正确
- `SPEC_DIR_NAME` 值为 `'.specforge'`
- 路径构造函数（`resolveProjectPath` / `specPath` / `agentRunArchivePath`）输出正确

### G3：清扫全仓库存量违规

**目标**：用 G1 的 Lint 脚本扫描全仓库，修复所有现存违规。

**预期**：P1 已完成绝大部分切换，此任务预期发现 0 或极少数遗漏。每个遗漏都是一个 bug，需单独分析确认后修复。

### G4：填充 `docs/conventions/` 核心文档

**目标**：在 `docs/conventions/` 目录下填充至少 4 个核心约定文档。

**产出**：
- `docs/conventions/README.md`（约定中心导航）
- `docs/conventions/workflow-standards.md`（工作流阶段结构、产物命名规范）
- `docs/conventions/testing-standards.md`（测试目录组织、命名规范、覆盖率要求）
- `docs/conventions/agent-collaboration.md`（Agent 间接口规范、产物格式标准）

注：`docs/conventions/directory-layout.md` 已由 P1 交付，不计入新增。

### G5：清理根目录残留文件

**目标**：二次确认并删除方案 A §3.2 列出的所有应删除文件。

**验证方式**：确认文件不存在或已删除。

### G6：更新 README.md 顶层导航

**目标**：在 `README.md` 中添加指向 `docs/conventions/` 的导航入口，更新"目录结构"段以反映 P1 后的仓库实际状态。

**改动范围**：仅文档修改，不影响任何功能代码。

---

## 不变行为声明

> 以下行为在 P2 全过程中必须严格保持不变。任何违反均视为回归。

### IB-1：所有现有测试套件继续 100% 通过

与 P1 完成后状态一致：
- `packages/types/` — 74 pass / 0 fail
- `packages/daemon-core/tests/unit/` — 266 pass（5 个 pre-existing SessionRegistry 失败除外）
- `packages/permission-engine/` — exit 0

P2 不得修改任何现有测试的预期结果。

### IB-2：daemon 启动行为、Plugin 加载、所有 8 种工作流正常端到端

P2 不得修改 daemon-core、permission-engine、setup/ 下的任何功能性代码。所有运行时路径解析逻辑与 P1 完成后完全一致。

### IB-3：用户级 / 项目级目录结构与 P1 完成后一致

`LAYOUT` 和 `USER_LAYOUT` 的路径定义不变。`SPEC_DIR_NAME` = `'.specforge'` 不变。路径构造函数（`resolveProjectPath` / `specPath` / `agentRunArchivePath` / `resolveUserPath`）签名和返回值语义不变。

### IB-4：TypeScript 编译无错误

`bun run typecheck`（或等效命令）通过。P2 新增的文件必须满足 TypeScript strict mode 编译。

### IB-5：`bun scripts/sf-installer.ts verify` 通过

安装器校验功能正常，不受 P2 影响。

### IB-6：现有代码功能零修改

P2 的所有改动限定在以下范畴：
1. **纯新增文件**：Lint 脚本、Architecture Test、约定文档
2. **纯文档修改**：`README.md` 导航更新
3. **CI 配置修改**：`.github/workflows/code-quality.yml` 添加新 job
4. **可能的遗漏路径修复**：G3 扫描发现的存量违规（预期 0 或极少）

不得修改 `packages/` 下任何现有功能代码。

---

## 风险评估

**风险等级：低**

### 判定依据

| 任务 | 改动类型 | 影响范围 | 回滚难度 | 风险 |
|------|---------|---------|---------|------|
| G1（CI Lint） | 纯新增文件 | 0 现有文件受影响 | 删除新增文件 | 极低 |
| G2（Architecture Test） | 纯新增测试文件 | 0 现有文件受影响 | 删除新增文件 | 极低 |
| G3（清扫违规） | 可能的少量路径修复 | 仅限遗漏文件 | git revert | 低 |
| G4（docs/conventions） | 纯文档新增 | 0 代码影响 | 删除新增文件 | 极低 |
| G5（删除残留文件） | 删除无引用文件 | 0 功能影响 | git revert | 极低 |
| G6（README 更新） | 纯文档修改 | 0 代码影响 | git revert | 极低 |

### 理由

1. **新增代码与现有功能解耦**：G1（Lint 脚本）和 G2（Architecture Test）是全新的独立文件，不 import 任何现有模块的核心逻辑，也不被任何现有模块 import。
2. **P1 已完成大部分工作**：G3 的存量清扫预期发现 0 或极少遗漏（P1 验证报告确认 15/15 验收标准全部满足）。
3. **CI 集成是增量的**：在现有 `code-quality.yml` 中添加新 job，不影响已有 job 的运行。
4. **所有改动可原子回滚**：每个 G 是独立的 commit（或一组 commit），可通过 `git revert` 精准回滚。
5. **不变行为有明确的验证手段**：IB-1（测试通过）、IB-4（编译通过）、IB-5（安装器校验通过）均可在 CI 中自动验证。

### 潜在风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| G3 发现大量遗漏 | 开发周期延长 | 低概率（P1 已全量验证），发生时逐个分析 |
| CI Lint 白名单不够精确 | CI 红灯误报 | 白名单支持 glob 模式，可快速扩展 |
| Architecture Test 在 CI 环境失败 | CI 红灯 | 测试仅验证 Schema 常量值和路径构造函数，不依赖实际文件系统状态 |
| Lint 规则过于严格 | 误拦截合法代码 | 白名单机制 + 任何白名单扩展需双人审批 |

---

## 关键输入文件参考

| 文件 | 角色 | 本分析中的引用 |
|------|------|---------------|
| `packages/types/src/directory-layout.ts` | Schema 层单一真相源 | G1（Lint 扫描目标）、G2（测试验证对象）、IB-3 |
| `packages/types/src/meta-schema.ts` | _meta.json zod schema | G2（测试覆盖范围） |
| `.specforge/specs/WI-011/verification_report.md` | P1 验证结果 | P2-1~P2-6 问题基线、IB-1~IB-5 不变行为基准 |
| `docs/proposals/2026-05-29-directory-structure-governance.md` | 方案全文 | §8（三道强制门）、§9（P2 任务列表） |
| `.github/workflows/code-quality.yml` | CI pipeline | G1、G2 集成目标 |
| `scripts/render-layout.ts` | 文档生成器 | G4 参考实现模式 |
| `docs/conventions/directory-layout.md` | 已有约定文档 | G4 需保持一致 |
