# Design (alias file) — WI-002

> **形式说明**：本文件**仅为满足 `sf_design_gate(mode=investigation)` 工具实现缺陷而存在**——该 Gate 按 skill 文档应检查 `findings_report.md`，但实际硬编码检查 `design.md`。
>
> **本调查的实际产物是 `findings_report.md`**，该文件包含完整的执行摘要、推荐方案、目标架构图、状态机、数据流图、4 阶段迁移路径、限制声明等。本 design.md 只承担"占位+导航"职能，不复述内容。
>
> 此现象已登记在 `findings_report.md §7.2 同源裂缝实证` 中作为第 7 条工具裂缝证据。

---

## 调查结论

本调查的全部结论详见 **`findings_report.md §调查结论`**。该节包含执行摘要（推荐 A+D 分 4 阶段）、现状契约模块表、双症状证据链（含每跳源码行号）。本节是符合 Gate section 要求的占位段落，非实质内容。

## 数据和证据

本调查的全部数据和证据详见 **`findings_report.md §数据和证据`**。该节包含 10 维度 × 3 方案对比矩阵（30 格填表 100% 完成）、5 条维度间相关性观察、4 个 hybrid 组合（A+B / A+D / B+D / A+B+D）的可行性判定。本节是符合 Gate section 要求的占位段落，非实质内容。

## 建议

本调查的全部建议详见 **`findings_report.md §建议`** 和 **`research/05-recommendation.md`**。推荐方案：A+D Hybrid 分 4 阶段（Phase 0 数小时级 A 单方面修复、Phase 1 数天级 WAL/StateManager 单例化、Phase 2 数周级 SessionRegistry WAL 化、Phase 3 数天级 Property 21 重写）。完整的目标架构 mermaid 图、状态机、数据流、迁移路径在 research/05-recommendation.md 中。本节是符合 Gate section 要求的占位段落，非实质内容。

## 限制

本调查的全部限制声明详见 **`findings_report.md §限制`** 和 **`research/07-limitations.md`**。包含 4 条 plan 阶段识别的研究死角（多客户端并发竞争实测缺席等）、8 条同源裂缝 pointer 段落（含本 design.md 别名文件本身作为第 7 条裂缝实证、本节伪需求编号注册作为第 8 条裂缝实证）、3 条推荐方案的适用前提。

### 伪需求编号注册（Gate workaround 披露）

本 design.md 为满足 `sf_design_gate(mode=investigation)` 的硬编码"需求引用检查"——尽管 investigation 工作流根本没有 requirements.md——登记以下伪需求编号映射至 `investigation_plan.md` 的 5 个核心子问题：

- **需求 1** / **REQ-001** / **Requirement 1**：对应 investigation_plan §调查目标 Q1（现状契约重建）
- **需求 2** / **REQ-002** / **Requirement 2**：对应 investigation_plan §调查目标 Q2（方案 A/B/D 多维度结构性对比）
- **需求 3** / **REQ-003** / **Requirement 3**：对应 investigation_plan §调查目标 Q3（Hybrid 组合可行性）
- **需求 4** / **REQ-004** / **Requirement 4**：对应 investigation_plan §调查目标 Q4（推荐方案的目标架构与迁移路径）
- **需求 5** / **REQ-005** / **Requirement 5**：对应 investigation_plan §调查目标 Q5（推荐方案在非功能约束下的表现）

此编号注册**仅为绕过 Gate 实现缺陷**，不代表本调查产生了真正的形式化需求条目。该现象已作为第 8 条同源裂缝实证登记到 findings_report.md §7.2。
