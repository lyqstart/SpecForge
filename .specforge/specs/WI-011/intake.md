# WI-011 Intake — SpecForge V6 目录结构治理 P1 代码全量切换与数据迁移

**work_item_id**: WI-011
**workflow_type**: change_request
**title**: SpecForge V6 目录结构治理 - P1 代码全量切换与数据迁移

---

## 1. 业务背景与动机

SpecForge 自身正在进行"目录结构治理"重构，已分三阶段规划：
- **P0**（WI-010，已完成）：建立了单一真相源 Schema（`directory-layout.ts`）+ 迁移/备份脚本 + ADR-006 决策记录
- **P1**（本 WI）：代码全量切换 + 数据迁移执行 + setup/ 搬迁
- **P2**（后续 WI）：CI Lint + Architecture Test + 清扫存量

P1 是风险最高的阶段，涉及 40+ 文件 200-500 处替换 + 数据迁移 + setup/ 搬迁。

## 2. 受影响的功能模块

### 核心代码路径切换
- `packages/daemon-core/src/tools/lib/` — 12 个 core 文件
- `.opencode/tools/lib/` — 15 个部署态 core 文件
- `packages/permission-engine/src/` — 5 个文件
- `packages/daemon-core/src/daemon/path-resolver.ts`
- `packages/daemon-core/src/tools/handlers/sf-state-transition.ts`

### 文档路径修正
- `.opencode/skills/sf-workflow-*/SKILL.md` — 8 个 SKILL 文件
- `.opencode/agents/sf-*.md` — 4 个 Agent prompt 文件

### 安装源重组
- `setup/` 目录新建（从 `.opencode/`、`scripts/lib/`、`templates/` 搬迁）
- `scripts/sf-installer.ts` 改造
- `scripts/lib/` 相关文件

### 新增工具
- `scripts/render-layout.ts` — 文档生成器
- `scripts/render-specs-readme.ts` — specs/README.md 渲染器
- `docs/conventions/directory-layout.md` — 自动生成的约定文档

### 数据迁移
- 仓库自身 `.specforge/` + `specforge/` 双目录合并
- 备份 + 迁移执行

### 清理
- 删除 `.opencode-/`（废弃备份）
- 删除根 `opencode.json`（空文件）
- 删除根目录临时文件

## 3. 期望的变更结果

### T1：daemon-core 路径切换（12 个 core 文件）
把硬编码字符串 `.specforge` / `specforge/` 全部替换为 `directory-layout.ts` 的常量调用。

### T2：部署态 tools 路径切换
`.opencode/tools/lib/` 下的 15 个 core 文件中的 `specforge/`（不带点）路径统一改为使用常量。

### T3：8 个 SKILL.md 路径修正
修正 `specforge/specs/` → `.specforge/specs/`（带点）。

### T4：4 个 Agent prompt 路径修正
同样修正路径引用。

### T5：permission-engine 与其他模块路径切换
`packages/permission-engine/` 的 5 个文件路径切换。

### T6：setup/ 目录搬迁
建立 `setup/` 目录结构，用 `git mv` 保证历史可追溯。

### T7：sf-installer.ts 改造
从 `setup/` 读取安装源。

### T8：文档生成器 render-layout.ts
实现自动文档生成，维护 marker 之间的内容。

### T9：specs/README.md 自动渲染机制
实现 `_meta.json` 驱动的 specs/README.md 渲染。

### T10：数据迁移实际执行
强制备份 → 验证备份 → 合并双目录 → 删除旧目录 → 跑迁移脚本验证。

### T11：清理废弃备份
删除 `.opencode-/`、`opencode.json`、临时文件。

## 4. P0 产物（必须复用）

- `packages/types/src/directory-layout.ts` — 单一真相源 Schema
- `packages/types/src/meta-schema.ts` — `_meta.json` zod schema
- `scripts/migrations/v6-dir-rename.ts` + `v6-dir-backup.ts` — 迁移与备份脚本
- `docs/adr/ADR-006-specforge-dir-naming.md` — 决策档案

## 5. 不变行为约束（继承自 WI-010）

- daemon 启动行为、Plugin 加载、所有 8 种工作流正常端到端
- 所有 `sf_*` tool 的 MCP I/O schema 不变（仅内部实现切换路径常量，对外接口零变化）
- 现有所有 unit/integration/property test 必须 100% 继续通过
- Plugin 与 daemon 通信协议不变

## 6. 已知 SpecForge bug（规避方法）

| Bug | 规避方法 |
|---|---|
| `sf_artifact_write` 的 `file_type` 不含 `refactor_plan`/`design_delta`/`impact_analysis` 等 | 降级用 `write` 工具直写 `.specforge/specs/WI-011/<file>.md`，在 work_log 记录 |
| `sf_knowledge_graph` 的 `code_file` 节点要求 `metadata.path` | 调用时确保 metadata 含 path 字段 |
| `sf_state_transition` 的 risk_path 守卫拒绝 development → verification 直跳 | 走 development → review → verification 路径 |
| `sf_verification_gate` 偶发首次 fail（缓存）后立即再调用就 pass | 失败后直接重试一次 |
| task tool 偶发返回空 task_result（实际成功）| 不要被空结果误导，用 sf_safe_bash 检查实际产物确认 |
| daemon-core SessionRegistry 5 个 pre-existing 失败 | 不要尝试在本 WI 修，记入 review_report 的"已知问题" |

## 7. 风险与成本

- **风险等级**：中高（涉及 40+ 文件核心代码切换 + 数据迁移）
- **预估 token 消耗**：80K - 200K
- **预估时间**：1-3 小时
- **回滚成本**：中等（git revert + 备份恢复）

## 8. 工作流推进建议

分 6 批执行：
1. 批次 1：T1+T2+T5（daemon-core + tools/lib + permission-engine 路径切换）
2. 批次 2：T3+T4（SKILL.md + Agent prompt 路径修正）
3. 批次 3：T6+T7（setup/ 搬迁 + sf-installer.ts 改造）
4. 批次 4：T8+T9（文档生成器）
5. 批次 5：T10（数据迁移实际执行，最高风险）
6. 批次 6：T11（清理废弃文件）

## 9. 验收标准

- 所有 12 个 daemon-core core 文件不再含 `.specforge` / `specforge/` 字符串字面量
- 所有 8 个 SKILL.md + 4 个 Agent prompt 路径统一为 `.specforge/`
- `setup/` 目录建成，含 3 个子目录 + README.md，sf-installer.ts 从 setup/ 读
- 根目录无 `.opencode-/`、`opencode.json`、临时调试文件
- `docs/conventions/directory-layout.md` 由 `render-layout.ts` 生成
- `specs/README.md` 自动渲染机制生效，含 WI-001 ~ WI-011 所有索引
- 所有现有测试套件继续 100% 通过
- `bun scripts/sf-installer.ts verify` 通过

## 10. 权威设计来源

- `docs/proposals/2026-05-29-directory-structure-governance.md` — 方案 A 全文
- `.specforge/specs/WI-010/refactor_analysis.md` — P0 的 21 条不变行为约束
- `.specforge/specs/WI-010/refactor_plan.md` — P0 完成的具体细节
- `.specforge/specs/WI-010/verification_report.md` — P0 验证结果
- `docs/adr/ADR-006-specforge-dir-naming.md` — 决策档案
- `packages/types/src/directory-layout.ts` — 单一真相源 Schema
