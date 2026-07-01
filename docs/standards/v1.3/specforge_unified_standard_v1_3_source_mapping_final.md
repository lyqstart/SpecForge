# SpecForge Unified Standard v1.3 Source Mapping Final

本文件说明统一标准各章节来自 v1.1、Patch 1、Patch 2、v1.14 与 v1.2 差距审查的映射关系。


> 状态：draft / source-mapping
> 生成日期：2026-06-30

| v1.3 章节 | 主要来源 | 处理方式 |
|---|---|---|
| 0A 本融合版硬裁决 | 本轮融合裁决 + v1.2 差距审查 | 新增 |
| 0 总则 | v1.1 0 总则 | 保留并升级优先级到 v1.3 |
| 1 目录边界与路径治理 | v1.1 1 + v1.14 4 | 以 v1.1 为准，补充 views / ADR conditional |
| 2 项目级正式规格真相源 | v1.1 2 + v1.14 3/5 | 保留 v1.1 Core，吸收 v1.14 Project Spec 概念 |
| 2A Project Spec 多视角体系 | v1.14 2.4-2.19 / 5 / 14 | 新增机制化章节 |
| 3 ID 与基础格式规则 | v1.1 3 | 保留；裁决 v1.14 示例命名 |
| 4 Work Item 事务模型 | v1.1 4 + v1.14 7 | 以 v1.1 为准，吸收多视角 impact 字段 |
| 5 状态机 | v1.1 5 | 保留 |
| 6 用户请求入口、分类与路径选择 | v1.1 6 + v1.14 15 | 保留并扩展多视角影响分析 |
| 7 Workflow Path 标准 | v1.1 7 + v1.14 13 | 以 v1.1 workflow_path 为准，专题流程变为 Gate/Extension |
| 8 Candidate 与 Delta | v1.1 8 + v1.14 3.4/3.5 | 以 v1.1 Candidate 完整文件规则为准 |
| 9 Gate | v1.1 9 + v1.14 14 | 合并专题 Gate，新增 registry 管理要求 |
| 10 User Decision | v1.1 10 | 保留 |
| 11 Merge Runner | v1.1 11 + v1.14 Merge | 以 v1.1 合并规则为准 |
| 12 code_permission / Write Guard | v1.1 12 | 保留 |
| 13 Verification / Trace / Evidence | v1.1 13 + v1.14 Traceability | 保留并扩展 VIEW / ADR Trace |
| 14 Agent 职责 | v1.1 14 + v1.14 15 | 保留边界，吸收 AI 架构操作协议 |
| 15 close_gate | v1.1 15 | 保留 |
| 16 rollback / superseded | v1.1 16 + v1.14 架构演进 | 保留并统一演进/回滚 |
| Extension Subflow | v1.1 Patch 1 | 保留并扩展到视角/Gate/artifact_type |
| removed_content_log | v1.14 示例/方法论/重复论证 | 新增 |
