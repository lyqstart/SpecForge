# Implementation Plan: V6 Architecture Overview

## Overview

本 spec 是 **V6 架构权威参考**，不直接交付可执行模块代码。实现计划覆盖三类可编码产物：

1. **架构一致性工件**（Correctness Property 分配登记、ADR 索引、里程碑跟踪）。
2. **文档静态验证**（在 `.opencode/tools/lib/sf_doc_lint_core.ts` 中扩展架构级 lint 规则，对 requirements.md / design.md 做结构校验）。
3. **下游模块 spec 占位**（在 `.kiro/specs/` 下为每个承接 Correctness Property 的下游模块 spec 建立骨架，使"每条架构不变式都有归属"成为可静态验证的事实）。

实现语言：**TypeScript**（对齐现有 `.opencode/tools/` 工具链）。

每一个任务的产出物都可由代码工具验证；不包含任何"用户培训""部署""性能度量"等非编码任务。下游模块 spec（daemon-core、observability 等）的实现不属于本 spec。

## Tasks

- [x] 1. 搭建架构工件基线
  - [x] 1.1 创建 Correctness Property 分配登记 `artifacts/correctness-property-allocation.json`
    - 定义 JSON schema：`{ schema_version, properties: [{ id, title, validates: [], owners: ["daemon-core", ...] }] }`
    - 初始化 30 条 Property（Property 1–30，对齐 design.md "Correctness Properties" 节）
    - 按 design.md Testing Strategy §2 的映射表填入 owners
    - _Requirements: 30.1-30.15, Property 8_
  - [x] 1.2 创建 ADR 索引 `artifacts/adr-index.md`
    - 列出 ADR-001..ADR-020 每条的决策摘要、对应需求编号、链接回 design.md 的锚点
    - 作为后续模块 spec 引用 ADR 的权威入口
    - _Requirements: 1.3, 25.5_
  - [x] 1.3 创建里程碑跟踪模板 `artifacts/milestone-tracker.md`
    - 包含 M1–M9 的主题、覆盖的 P0 项编号、完成判据
    - 每个里程碑预留"里程碑报告"输出锚点（REQ-29.2）
    - _Requirements: 29.1, 29.2_

- [x] 2. 实现架构文档静态 lint 规则（追加到 `.opencode/tools/lib/sf_doc_lint_core.ts`）
  - [x] 2.1 新增规则 `v6_arch_design_principles`
    - 校验 design.md "核心设计原则" 节存在 5 条且编号顺序为 1–5，文本匹配 REQ-1.2 列表
    - 失败时返回 `{ errorCode: "v6_arch_missing_or_reordered_principle", ... }`
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 2.2 新增规则 `v6_arch_not_doing_boundary`
    - 校验 requirements.md REQ-2 与 design.md "V6 不做边界" 节各自包含 6 项架构层边界
    - _Requirements: 2.1, 26.1_
  - [x] 2.3 新增规则 `v6_arch_north_star_scenarios`
    - 校验"北极星目标"声明存在且列出 10 类排障场景
    - _Requirements: 3.1, 3.2_
  - [x] 2.4 新增规则 `v6_arch_scope_lists`
    - 校验 REQ-25 的 P0 列表条目数 = 27、P1 列表条目数 = 15、P2 列表非空
    - _Requirements: 25.1, 25.2, 25.3_
  - [x] 2.5 新增规则 `v6_arch_release_gates`
    - 校验 REQ-27.1 的 6 条发版门槛在 requirements.md 与 design.md Testing Strategy §3 中同步存在
    - _Requirements: 27.1, 27.2_
  - [x] 2.6 新增规则 `v6_arch_platform_declaration`
    - 校验 REQ-28 中 OS 列表、OpenCode 最低版本、运行时、最低/推荐硬件齐全
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_
  - [x] 2.7 新增规则 `v6_arch_milestones`
    - 校验 REQ-29 中每个里程碑有明确主题；允许数量偏离 9 但必须文档化
    - _Requirements: 29.1_
  - [x] 2.8 新增规则 `v6_arch_agent_constitution`
    - 校验 requirements.md Glossary 引用 Agent Constitution 9 条底线（或 design.md §4 "Agent Constitution 9 条"），且至少显式包含"不得绕过 Gate"与"不得伪造验证"
    - _Requirements: 7.8, 30.3_
  - [x] 2.9 为 2.1–2.8 全部新规则编写单元测试
    - 每条规则一个 happy-path + 一个 failing fixture
    - 使用项目现有测试框架
    - _Requirements: 1.2, 2.1, 3.2, 25.1-3, 27.1, 28, 29.1, 7.8_

- [x] 3. Checkpoint - 本阶段 lint 对当前文档为零违例
  - 对当前 requirements.md / design.md 运行所有新 lint 规则
  - 修复文档结构问题直至全部通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 实现 Correctness Property 分配覆盖验证器
  - [x] 4.1 创建 `artifacts/cp_allocation_verifier.ts`：解析 design.md
    - 抽取 `Property N: Title` 与其 `**Validates: Requirements ...**` 标注
    - 输出结构化 `Array<{ id, validates }>`
    - _Requirements: 30.1-30.15_
  - [x] 4.2 扩展 4.1 的验证器：读取 task 1.1 的 allocation JSON
    - 交叉核对每个 Property 至少有 ≥ 1 个 owner 模块 spec
    - 对每个 owner，检查 `.kiro/specs/{owner}/` 是否存在（依赖任务 6 的 stub）
    - _Requirements: 30.1-30.15; Testing Strategy §2_
  - [x] 4.3 实现覆盖报告生成：孤儿 Property（无 owner）与悬空 owner（指向不存在 spec）均为失败
    - 以 `--json` 模式输出稳定 `errorCode` 契约（对齐 Error Handling §"稳定契约"）
    - _Requirements: 30.1-30.15, REQ-25.4_
  - [x] 4.4 为 allocation JSON 编写 round-trip 属性测试
    - **Property 8: Serialization Round-trip**
    - **Validates: Requirements 30.8**
    - 使用 `fast-check` 生成随机 `CorrectnessPropertyAllocation` 对象，断言 `parse(serialize(x)) == x`
    - 迭代次数 ≥ 100
  - [x] 4.5 为 4.1–4.3 编写单元测试
    - 覆盖：全部 Property 有 owner（pass）、某 Property 缺 owner（fail）、某 owner 指向不存在目录（fail）
    - _Requirements: 30.1-30.15_

- [x] 5. 实现 Scope Boundary 静态验证器
  - [x] 5.1 创建 `artifacts/scope_boundary_verifier.ts`：解析 requirements.md REQ-25
    - 抽取 P0 / P1 / P2 每条的文本标签到结构化列表
    - _Requirements: 25.1, 25.2, 25.3_
  - [x] 5.2 定义下游 spec 的 scope-tag 元数据约定
    - 写入 `artifacts/scope-tag-convention.md`：下游 spec 的 `.config.kiro` 文件需包含 `scopeTag ∈ { "p0", "p1", "p2" }`
    - _Requirements: 25.4, Property 15_
  - [x] 5.3 实现 scope 一致性校验
    - 读取 `.kiro/specs/*/config.kiro`，对每个下游 spec 按其 scopeTag 与 REQ-25 列表比对
    - 对 V6.0 release 分支（`scopeTag == "p0"`）项目不得依赖 `p1` / `p2` 能力
    - 失败时返回 `errorCode: "v6_scope_boundary_violation"`
    - _Requirements: 25.4, 30.15_
  - [x] 5.4 为 5.3 编写单元测试
    - **Property 15: Scope Boundary**
    - **Validates: Requirements 30.15, 25.4**
    - 包含故意把某个 stub 标为 `p0` 但引用 P1 能力的反例 fixture，断言验证器正确 fail

- [x] 6. 创建下游模块 spec 骨架（每个 spec 承接对应 Correctness Property）
  - 每个骨架包含：`requirements.md`（引用本 spec 并引用承接的 Property 编号）、`.config.kiro`（含 `scopeTag`、`parentSpec: "v6-architecture-overview"`）。
  - 骨架不实现业务代码，仅建立"Property 有归属"的静态事实，供任务 4.3 / 5.3 验证。
  - [x] 6.1 创建 `.kiro/specs/daemon-core/` 骨架
    - 承接 Properties 1, 2, 5, 6, 7, 20, 21, 22, 30
    - scopeTag: p0
    - _Requirements: 30.1, 30.2, 30.5, 30.6, 30.7; 4, 12, 13, 19_
  - [x] 6.2 创建 `.kiro/specs/permission-engine/` 骨架
    - 承接 Properties 3, 10, 16, 26, 28
    - scopeTag: p0
    - _Requirements: 30.3, 30.10; 7, 16, 17_
  - [x] 6.3 创建 `.kiro/specs/opencode-adapter/` 骨架
    - 承接 Properties 4, 12
    - scopeTag: p0
    - _Requirements: 30.4, 30.12; 8_
  - [x] 6.4 创建 `.kiro/specs/observability/` 骨架
    - 承接 Properties 2, 8, 9, 10, 30
    - scopeTag: p0
    - _Requirements: 30.2, 30.8, 30.9, 30.10; 3, 19, 20_
  - [x] 6.5 创建 `.kiro/specs/configuration/` 骨架
    - 承接 Properties 11, 19（配置合并确定性、热加载边界）
    - scopeTag: p0
    - _Requirements: 30.11; 9_
  - [x] 6.6 创建 `.kiro/specs/migration/` 骨架
    - 承接 Properties 14 与 Recovery Repair（Property 20）的迁移侧
    - scopeTag: p0
    - _Requirements: 30.14; 18_
  - [x] 6.7 创建 `.kiro/specs/multimodal/` 骨架
    - 承接 Properties 9, 13, 23
    - scopeTag: p0（骨架）/ p2（完整支持）—— 通过 scopeTag 约束仅骨架部分在 V6.0 启用
    - _Requirements: 30.9, 30.13; 14_
  - [x] 6.8 创建 `.kiro/specs/self-healing/` 骨架
    - 承接 Properties 24, 25
    - scopeTag: p0（仅 Diagnose 阶段）/ p2（完整闭环）
    - _Requirements: 15_
  - [x] 6.9 创建 `.kiro/specs/workflow-runtime/` 骨架
    - 承接 Property 29（compositeGate 语义，注意其中组合能力归 P1）
    - scopeTag: p0（基础）/ p1（组合）
    - _Requirements: 23, 24_
  - [x] 6.10 创建 `.kiro/specs/cli/` 骨架
    - 承接 Properties 17, 18
    - scopeTag: p0
    - _Requirements: 11_
  - [x] 6.11 创建 `.kiro/specs/plugin-loader/` 骨架
    - 承接 Property 28（Plugin Permission Gate；静态检查部分 P0，运行时沙箱 P2）
    - scopeTag: p0（静态）/ p2（沙箱）
    - _Requirements: 17_
  - [x] 6.12 创建 `.kiro/specs/scope-gate/` 骨架
    - 承接 Property 15（即 REQ-25 的 P0/P1/P2 边界运行时强制）
    - scopeTag: p0
    - _Requirements: 25.4, 30.15_

- [x] 7. Checkpoint - 覆盖率 100%
  - 运行任务 4.3 的覆盖报告：30 条 Correctness Property 全部有 ≥ 1 个 owner，且每个 owner 目录存在
  - 运行任务 5.3 的 scope 校验：所有 stub 的 scopeTag 与 REQ-25 分类一致
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. 装配 V6 架构验证管道
  - [x] 8.1 创建 `scripts/sf_v6_arch_check.ts` 顶层入口
    - 依序调用：sf_doc_lint（含任务 2 的新规则）→ CP 覆盖验证器（任务 4）→ Scope 边界验证器（任务 5）
    - 支持 `--json` 输出统一错误结构 `{ errorCode, message, context }`
    - 非零退出码表示至少一项未通过
    - _Requirements: 27.1 门槛 6（文档完整）_
  - [x] 8.2 集成测试：对当前 spec 运行 sf_v6_arch_check 端到端
    - 期望零违例
    - 并包含 fixture：故意损坏 allocation JSON / design.md 后期望对应 errorCode
    - _Requirements: 27.1 门槛 6_

- [x] 9. Final checkpoint - 全部交付物验证
  - 运行 sf_v6_arch_check（任务 8.1）得到零违例
  - 任务 4.3 覆盖报告 = 100%
  - 任务 5.3 scope 校验通过
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 标记 `*` 的任务为可选，可在 MVP 阶段跳过（不实现）；未标记 `*` 的任务必须实现。
- 本 spec 不交付 daemon / permission-engine / observability 等模块的业务代码；下游模块 spec 负责。
- 每个下游 spec 骨架必须在其自身 design.md 的 Testing Strategy 中以可执行 PBT 细化本 spec 的 Correctness Properties，并在 property 声明处标注 `Derived-From: v6-architecture-overview Property N`。
- 架构不变式（Property 1–30）本 spec 只做"静态可验证归属"；可执行 PBT 归属于下游模块 spec。
- 所有持久化 JSON 工件（如 `correctness-property-allocation.json`）必须包含 `schema_version` 字段，便于未来迁移（REQ-18, Property 14）。
- ErrorCode 字段一经定义即进入 SpecForge Runtime Contract，minor 版本不得变更其语义（对齐 design.md Error Handling §"稳定契约"）。

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "5.2"] },
    { "id": 1, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "6.10", "6.11", "6.12", "2.1", "4.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "4.2", "5.3"] },
    { "id": 3, "tasks": ["2.3", "4.3", "5.4"] },
    { "id": 4, "tasks": ["2.4", "4.4"] },
    { "id": 5, "tasks": ["2.5", "4.5"] },
    { "id": 6, "tasks": ["2.6"] },
    { "id": 7, "tasks": ["2.7"] },
    { "id": 8, "tasks": ["2.8"] },
    { "id": 9, "tasks": ["2.9"] },
    { "id": 10, "tasks": ["8.1"] },
    { "id": 11, "tasks": ["8.2"] }
  ]
}
```
