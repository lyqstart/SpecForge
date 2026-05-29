# ADR-006: SpecForge 项目目录命名约定

## Status

**Accepted** (2026-05-29)

- **Source**: WI-010 / [`docs/proposals/2026-05-29-directory-structure-governance.md`](../proposals/2026-05-29-directory-structure-governance.md)
- **Related**: `.kiro/specs/v6-architecture-overview/design.md` L251（原始 ADR 索引行）
- **Supersedes**: 无
- **Superseded by**: 无

---

## Context

SpecForge V6 项目长期存在**目录路径命名的系统性混乱**，根因可归纳为 4 条（R1–R4）：

| 编号 | 根因 | 实证 |
|------|------|------|
| R1 | 架构决策与文档不同步 | `v6-architecture-overview/design.md` L251 ADR-006 行明确选 `.specforge/`（带点），但 README、AGENTS.md、8 个 SKILL.md、4 个 Agent prompt 全部写 `specforge/`（不带点） |
| R2 | 代码内部三方约定不一致 | WI-004 impact_analysis.md 实证：`daemon-core/src/tools/lib/*` 用 `.specforge/`；部署态 `.opencode-/tools/lib/*` 用 `specforge/`；Agent prompt 用 `specforge/`，影响 40+ 文件 |
| R3 | 开发目录与"用户项目目录"语义混淆 | SpecForge 自举开发，仓库根同时存在 `.specforge/`（committed）与 `specforge/`（gitignored），双目录并存 |
| R4 | 没有任何编译期/PR 期/运行期约束 | 路径全部是源码里硬编码字符串字面量，无法在 PR 期被拦下 |

**WI-010 推进过程中又发现多个 SpecForge 自身工具的衍生问题**，进一步印证治理必要性：

- `sf_artifact_write` 的 `file_type` 枚举不含 `refactor_plan` 与 `refactor_analysis`（无法用工具写产物，sf-design 必须降级用 `write` 工具直写磁盘）
- `sf_knowledge_graph` 的 `code_file` 节点要求 `metadata.path`，但此约束在 daemon 工具文档中未列出（首次调用即报错）
- 多套日志位置并存（`~/.specforge/runtime/events.jsonl` vs `<project>/.specforge/runtime/` vs `<project>/specforge/logs/`），连维护者诊断 daemon 健康都要 6 轮排查弯路

**这些都是缺乏 single source of truth + 强制约束的直接产物**。本 ADR 旨在锁定权威决策，为后续 P1 全量切换与 P2 强制约束打地基。

---

## Decision

**SpecForge 在用户项目根目录下创建的工具数据目录，统一命名为 `.specforge/`（带点）。**

不允许使用 `specforge/`（不带点）作为任何项目级数据目录名。

### 决策理由

1. **风格统一**：与 `.git/`、`.kiro/`、`.opencode/` 一致——这些都是同类"工具内部状态目录"，遵循 Unix dotfile 惯例
2. **IDE 默认隐藏**：带点目录在 VSCode/Cursor/Windows 文件管理器中默认隐藏，符合"用户不应直接编辑工具内部状态"的语义
3. **降低视觉噪音**：项目根目录看起来更干净，工具数据不污染开发者的工作视野
4. **迁移成本最低**：daemon-core 代码（12 个 core 文件）已经在使用 `.specforge/`，反向迁移成本远高于正向收敛
5. **CI Lint 判定清晰**：任何字符串字面量 `'specforge/'`（不带点）即视为违规，规则简单可机器执行

### 决策范围

本 ADR 适用范围：

- ✅ 用户项目根目录下的 SpecForge 数据目录（项目级）
- ✅ 用户主目录下的 SpecForge 全局数据目录（`~/.specforge/`，用户级）
- ✅ 所有 daemon-core 工具的路径构造
- ✅ 所有 SKILL.md 与 Agent prompt 中的路径引用
- ✅ 所有用户文档（README、AGENTS.md、CHANGELOG 等）

本 ADR **不适用**范围：

- ❌ `~/.config/opencode/`（用户级 OpenCode 共享组件，OpenCode 工具链原生约定，不归 SpecForge 管）
- ❌ 仓库源码中的包名 `@specforge/*`（npm scope，与目录名解耦）

---

## Consequences

### 正面后果

1. **单一真相源可以建立**——`packages/types/src/directory-layout.ts`（本 WI 的 T1 产物）能够定义为权威 Schema，所有代码必须通过它构造路径
2. **CI Lint 有判定标准**——任何 PR 中出现 `'specforge/'` 字符串字面量（白名单除外）直接拒绝
3. **Architecture Test 可机械验证**——实际磁盘目录树可与 Schema 比对，偏离即失败
4. **新人 onboarding 体验改善**——单一目录命名约定，无需在多套并存中猜测
5. **文档可自动生成**——`docs/conventions/directory-layout.md` 由 `render-layout.ts`（P1 产物）从 Schema 输出，文档永不过时

### 负面后果

1. **用户发现性略弱**——带点目录默认隐藏，用户首次接触项目时不知道工具数据在哪。**缓解措施**：根 README.md 必须显式提到 `.specforge/` 目录用途；AGENTS.md 自动生成并指向 conventions 文档
2. **历史代码与文档存在大量 `specforge/` 使用**——P1 阶段需要全量切换 40+ 文件 200-500 处替换
3. **存量用户项目数据需要迁移**——用户项目根下若已有 `specforge/` 目录，需通过 `scripts/migrations/v6-dir-rename.ts` 重命名

### 迁移路径

按治理方案 A §9 分三阶段推进：

| Phase | WI 角色 | 内容 | 风险 |
|-------|---------|------|------|
| **P0** | 本 WI（WI-010, refactor） | 建立 `directory-layout.ts` Schema + `meta-schema.ts` + 迁移/备份脚本骨架 + 本 ADR | 低（纯新增） |
| **P1** | 后续 WI（change_request） | 全量切换 40+ 文件 200-500 处路径引用 + 文档生成器 `render-layout.ts` + setup/ 目录搬迁 + sf-installer.ts 改造 + 数据迁移执行 | 中高 |
| **P2** | 后续 WI（refactor） | 上线 CI Lint（防线 B）+ Architecture Test（防线 C）+ 清扫存量违规 | 低 |

### 回滚条件

本决策一旦 accepted **不再回滚**。如有强烈反对意见（如发现 `.specforge/` 与某个广泛使用的工具产生致命冲突），必须通过新 ADR（如 ADR-006a）显式撤销并附完整理由。

---

## 引用

- 主提案：[`docs/proposals/2026-05-29-directory-structure-governance.md`](../proposals/2026-05-29-directory-structure-governance.md)
- 关联实证：[`.specforge/specs/WI-004/impact_analysis.md`](../../.specforge/specs/WI-004/impact_analysis.md)
- 本 WI 的 refactor_analysis：[`.specforge/specs/WI-010/refactor_analysis.md`](../../.specforge/specs/WI-010/refactor_analysis.md)
- 本 WI 的 refactor_plan：[`.specforge/specs/WI-010/refactor_plan.md`](../../.specforge/specs/WI-010/refactor_plan.md)
- 原始 ADR 索引行：`.kiro/specs/v6-architecture-overview/design.md` L251
- 工程治理框架（关联方案）：[`docs/proposals/2026-05-29-engineering-playbook-framework.md`](../proposals/2026-05-29-engineering-playbook-framework.md)
