# Handoff Prompt — WI-011 P1: SpecForge V6 目录结构治理代码全量切换

> **本文件用法**：在 OpenCode 新会话中，复制本文件全文给 sf-orchestrator，或者直接说：
> "请阅读 `docs/proposals/handoff-p1.md` 并按指令执行"

---

## 1. 你的角色与硬性前置

你是 **sf-orchestrator**，新会话开始。请按 sf-orchestrator 的"启动流程"完成步骤 0-4（版本检测、环境扫描、配置检查），然后阅读本提示词后再创建 Work Item。

⚠️ **绝对不要跳过启动流程**，但也不要在 intake 阶段重新问需求——本提示词已经把所有需求讲清楚了。

---

## 2. 任务背景（必读）

SpecForge 自身正在做"目录结构治理"重构，已分三阶段规划：

| 阶段 | 状态 | 内容 |
|---|---|---|
| **P0** | ✅ **已完成（WI-010）** | Schema 与备份基础设施 |
| **P1** | ⏳ **本会话要做** | 代码全量切换 + 数据迁移执行 + setup/ 搬迁 |
| **P2** | 📋 后续会话 | CI Lint + Architecture Test + 清扫存量 |

**P0 产物（本会话必须复用，不要重新设计）**：
- `packages/types/src/directory-layout.ts` —— 单一真相源 Schema（含 `SPEC_DIR_NAME`、`LAYOUT`、`resolveProjectPath`、`specPath`、`agentRunArchivePath`）
- `packages/types/src/meta-schema.ts` —— `_meta.json` zod schema
- `scripts/migrations/v6-dir-rename.ts` + `v6-dir-backup.ts` —— 迁移与备份脚本（P0 写好但未执行）
- `docs/adr/ADR-006-specforge-dir-naming.md` —— 决策档案

**主输入文档（权威设计来源）**：
- **`docs/proposals/2026-05-29-directory-structure-governance.md`** —— 方案 A 全文，重点看 §9 Phase P1
- `.specforge/specs/WI-010/refactor_analysis.md` —— P0 的 21 条不变行为约束（P1 仍需尊重大部分）
- `.specforge/specs/WI-010/refactor_plan.md` —— P0 完成的具体细节
- `.specforge/specs/WI-010/verification_report.md` —— P0 验证结果

---

## 3. 创建 Work Item

```
work_item_id: WI-011
workflow_type: change_request
title: SpecForge V6 目录结构治理 - P1 代码全量切换与数据迁移
```

理由：P1 改动量大（40+ 文件 200-500 处替换 + 数据迁移 + setup 搬迁），需要走 change_request 完整流程（requirements → design_delta → impact_analysis → tasks → development → review → verification）。

---

## 4. P1 任务清单（必须全部完成）

按方案 A §9 Phase P1 + 本提示词的扩展：

### T1：daemon-core 路径切换（12 个 core 文件）

把以下文件中的硬编码字符串 `".specforge"` / `"specforge/"` 全部替换为 `directory-layout.ts` 的常量调用：

- `packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts`（L221, L272, L438）
- `packages/daemon-core/src/tools/lib/sf_design_gate_core.ts`（L234, L400）
- `packages/daemon-core/src/tools/lib/sf_tasks_gate_core.ts`（L231）
- `packages/daemon-core/src/tools/lib/sf_verification_gate_core.ts`（L494, L694）
- `packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts`（L92-96, L101-102）
- `packages/daemon-core/src/tools/lib/sf_doc_lint_core.ts`（L52）
- `packages/daemon-core/src/tools/lib/sf_knowledge_graph_core.ts`（L977, L1047, L1069, L1099）
- `packages/daemon-core/src/tools/lib/sf_trace_matrix_core.ts`（L183）
- `packages/daemon-core/src/tools/lib/sf_context_build_core.ts`（L312）
- `packages/daemon-core/src/tools/lib/utils.ts`（L149, L164）
- `packages/daemon-core/src/daemon/path-resolver.ts`（L128）
- `packages/daemon-core/src/tools/handlers/sf-state-transition.ts`（L17）

**重点**：用 `import { specPath, resolveProjectPath } from '@specforge/types/directory-layout'` 替换裸字符串。

### T2：部署态 tools 路径切换

将 `.opencode-/tools/lib/` 下的 15 个 core 文件中的 `specforge/`（不带点）路径**统一改为**使用 `directory-layout.ts` 的常量。**注意**：`.opencode-/` 这个目录本身在 P1 中要随 setup/ 搬迁一起处理（见 T6），所以这两个任务有协同关系。

### T3：8 个 SKILL.md 路径修正

修正以下文件中的 `specforge/specs/` → `.specforge/specs/`（带点）：
- `.opencode/skills/sf-workflow-feature-spec/SKILL.md`
- `.opencode/skills/sf-workflow-bugfix-spec/SKILL.md`
- `.opencode/skills/sf-workflow-design-first/SKILL.md`
- `.opencode/skills/sf-workflow-investigation/SKILL.md`
- `.opencode/skills/sf-workflow-change-request/SKILL.md`
- `.opencode/skills/sf-workflow-refactor/SKILL.md`
- `.opencode/skills/sf-workflow-ops-task/SKILL.md`
- `.opencode/skills/sf-workflow-quick-change/SKILL.md`

### T4：4 个 Agent prompt 路径修正

- `.opencode/agents/sf-requirements.md`
- `.opencode/agents/sf-design.md`
- `.opencode/agents/sf-task-planner.md`
- `.opencode/agents/sf-knowledge.md`

### T5：permission-engine 与其他模块的路径切换

- `packages/permission-engine/src/index.ts`（L80, L306）`./specforge/observability/events.jsonl` → 改用 `directory-layout.ts` 的 `logsTelemetry` 常量 + ADR-006 的新位置
- `packages/permission-engine/src/services/static-api-checker.ts`（L394）
- `packages/permission-engine/src/services/plugin-permission-validator.ts`（L95）
- `packages/permission-engine/src/services/plugin-loader-integration.ts`（L164）
- `packages/permission-engine/examples/event-logging-example.ts`（L104）

### T6：setup/ 目录搬迁

按方案 A §A 的新仓库结构，建立：

```
setup/
├── README.md
├── userlevel-opencode/   ← 从仓库根的 .opencode/ 搬迁（保留原 .opencode/ 直到 sf-installer.ts 改造完成）
├── userlevel-scripts-lib/ ← 从 scripts/lib/ 提取纯部署源（开发态保留 scripts/lib/）
└── userlevel-templates/  ← 从 templates/ 搬迁
```

注意：搬迁过程必须保证 git 历史可追溯（用 `git mv` 而非 cp + rm）。

### T7：sf-installer.ts 改造

让 sf-installer.ts 从 `setup/` 目录读取安装源，而非根目录的 `.opencode/`/`templates/`/`scripts/lib/`。

涉及修改：
- `scripts/sf-installer.ts`（多处 `path.join(sourceDir, ".opencode", ...)` 改为 `path.join(sourceDir, "setup", "userlevel-opencode", ...)`）
- `scripts/lib/discovery.ts`（扫描入口改）
- `scripts/lib/executor.ts` / `manifest.ts` / `verify.ts` 等

### T8：文档生成器 render-layout.ts

实现 `scripts/render-layout.ts`：
- 输入：`packages/types/src/directory-layout.ts` 的 `LAYOUT` 常量
- 输出：覆盖 README.md / AGENTS.md / 各 SKILL.md / 各 Agent prompt 中 `<!-- BEGIN: directory-layout -->` 与 `<!-- END: directory-layout -->` 之间的内容

第一次跑时这些 marker 不存在，需要先**手动**或脚本插入 marker，然后生成器自动维护内容。

### T9：specs/README.md 自动渲染机制

实现方案 A §5 的 `specs/README.md` 自动渲染：
- 新增 `scripts/render-specs-readme.ts`，输入是所有 WI 目录下的 `_meta.json`
- 集成到 daemon：每次 `sf_state_transition` 后调用一次（在 `sf-state-transition.ts` handler 末尾）
- 强制规格 Gate 检查 `requirements.md` / `design.md` 含 `## 摘要` 和 `## 关键决策` 段
- 给现有的 WI-001 ~ WI-010 各补一份 `_meta.json`（手动生成 + 用户补充摘要/关键决策）

### T10：数据迁移实际执行

⚠️ **危险操作，必须先备份**：

```powershell
# 1. 强制备份
bun run scripts/migrations/v6-dir-backup.ts --target=D:\code\temp\SpecForge --force

# 2. 验证备份完整
ls $env:USERPROFILE\.specforge\backups\

# 3. 实际执行迁移（注意：当前仓库 .specforge/ + specforge/ 共存会触发 fail-safe）
# 必须先人工合并：把 specforge/* 内容合并到 .specforge/* 同名子目录
# 然后 rm specforge/  
# 最后跑 rename 验证（应该 exit 0 因为已无冲突）
```

由于仓库自身的特殊状态（双目录并存且都有数据），T10 需要 **半手动** 操作：先合并数据 + 删除旧目录，再跑迁移脚本验证状态干净。

### T11：清理废弃备份

- 删除 `.opencode-/`（带尾横线的废弃备份）
- 删除根 `opencode.json`（空文件）
- 删除根目录散落的临时文件（`test-*.txt`、`run-*.js` 等，已在 P0 发现无 grep 引用）

---

## 5. 不变行为约束（继承自 WI-010）

必须严格保证：

- ✅ daemon 启动行为、Plugin 加载、所有 8 种工作流正常端到端
- ✅ 所有 `sf_*` tool 的 MCP I/O schema 不变（**仅内部实现切换路径常量，对外接口零变化**）
- ✅ 现有所有 unit/integration/property test **必须 100% 继续通过**（增量执行验证，每个文件改完跑对应包测试）
- ✅ Plugin 与 daemon 通信协议不变

---

## 6. 已知 SpecForge bug（来自 WI-010 实证，规避方法）

| Bug | 规避方法 |
|---|---|
| `sf_artifact_write` 的 `file_type` 不含 `refactor_plan`/`design_delta`/`impact_analysis` 等 | 降级用 `write` 工具直写 `.specforge/specs/WI-011/<file>.md`，在 work_log 记录 |
| `sf_knowledge_graph` 的 `code_file` 节点要求 `metadata.path` | 调用时确保 metadata 含 path 字段 |
| `sf_state_transition` 的 risk_path 守卫拒绝 development → verification 直跳 | 走 development → review → verification 路径 |
| `sf_verification_gate` 偶发首次 fail（缓存）后立即再调用就 pass | 失败后直接重试一次 |
| task tool 偶发返回空 task_result（实际成功）| 不要被空结果误导，**用 sf_safe_bash 检查实际产物**确认 |
| daemon-core SessionRegistry 5 个 pre-existing 失败 | 不要尝试在本 WI 修，记入 review_report 的"已知问题" |

---

## 7. 风险与成本预警

- **风险等级**：**中高**（涉及 40+ 文件核心代码切换 + 数据迁移）
- **预估 token 消耗**：80K - 200K
- **预估时间**：1-3 小时
- **回滚成本**：中等（git revert + 备份恢复）

---

## 8. 验收标准（出 P1 必须满足）

- [ ] 所有 12 个 daemon-core core 文件不再含 `'\.specforge'`/`'specforge/'` 字符串字面量（**完全收口到 directory-layout.ts**）
- [ ] 所有 8 个 SKILL.md + 4 个 Agent prompt 中路径已统一为 `.specforge/`
- [ ] `setup/` 目录建成，含 3 个子目录 + README.md，sf-installer.ts 从 setup/ 读
- [ ] 根目录无 `.opencode-/`、`opencode.json`、临时调试文件
- [ ] `docs/conventions/directory-layout.md` 由 `render-layout.ts` 生成
- [ ] README.md / AGENTS.md / SKILL.md / Agent prompt 中的 `<!-- BEGIN: directory-layout -->` marker 段全部由生成器维护
- [ ] `specs/README.md` 自动渲染机制生效，含 WI-001 ~ WI-011 所有索引
- [ ] daemon 状态流转后自动更新 `specs/README.md`
- [ ] 用户项目级目录从 `specforge/` 迁移到 `.specforge/` 完成（仓库自身）
- [ ] **所有现有测试套件继续 100% 通过**（无新增失败）
- [ ] `bun scripts/sf-installer.ts verify` 通过

---

## 9. 工作流推进建议

由于 P1 任务密度高，建议**分批派单**，每批做完验证后再下一批：

1. **批次 1**：T1+T2+T5（daemon-core + tools/lib + permission-engine 路径切换），完成后跑全测试
2. **批次 2**：T3+T4（SKILL.md + Agent prompt 路径修正），文档类
3. **批次 3**：T6+T7（setup/ 搬迁 + sf-installer.ts 改造），中等风险
4. **批次 4**：T8+T9（文档生成器），新功能
5. **批次 5**：T10（数据迁移实际执行），**最高风险，必须先备份**
6. **批次 6**：T11（清理废弃文件），收尾

每批派单都用 `sf-executor`，关键文件改动后跑 `sf-reviewer`。

---

## 10. 完成后告诉用户的话

P1 完成（流转到 completed）后，请向用户报告：

```
WI-011 P1 已完成。
- 改动文件数：XX
- 测试通过率：YYY/ZZZ
- 已知 pre-existing 失败：N 个（与本 WI 无关）
- 用户可以验收：(1) 跑 sf_doctor、(2) 跑 sf-installer.ts verify、(3) 看 docs/conventions/directory-layout.md
准备启动 P2（CI Lint + Architecture Test + 清扫存量）请用：docs/proposals/handoff-p2.md
```
