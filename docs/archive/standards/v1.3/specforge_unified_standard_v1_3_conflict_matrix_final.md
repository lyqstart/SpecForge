# SpecForge Unified Standard v1.3 Conflict Matrix Final

本文件记录 v1.1、v1.14、v1.2 实现事实之间的关键冲突和最终裁决。


> 状态：draft / conflict-matrix
> 生成日期：2026-06-30

| ID | 冲突 | v1.1 / Patch 1 | v1.14 | v1.3 统一裁决 | 执行影响 |
|---|---|---|---|---|---|
| C-001 | 标准层级 | v1.1 是 final / executable-standard | v1.14 是 Project Spec Architecture draft | v1.3 统一标准为唯一上位标准；v1.14 降级为内容来源 | 代码、Agent、Tool 只能引用 v1.3 |
| C-002 | 控制面优先级 | Candidate + Gate + User Decision + Merge Runner 是正式规格唯一写入链 | 架构标准中存在较多 AI 操作协议 | AI 操作协议不得绕开控制面 | Agent 只能生成 delta/candidate |
| C-003 | ADR 路径 | MVP 使用 `.specforge/project/decisions.md`，不创建 ADR 目录 | 正式 ADR 放 `.specforge/project/decisions/ADR-*` | `decisions.md` Core；ADR 目录 Conditional Extension | 需要 registry 登记后才创建 ADR 目录 |
| C-004 | 多视角文件路径 | project 根目录已有 Core 文件 | v1.14 多个专题文件直接位于 project 根 | Conditional View 统一放 `.specforge/project/views/` | Path Service 增加 views 路径 |
| C-005 | extension_registry | 新扩展必须登记 | v1.14 没有完全用 registry 管视角和 Gate | 新视角、Gate、artifact_type 均由 registry 管控 | Extension Gate 必须覆盖视角/Gate 类型 |
| C-006 | Candidate 路径 | Candidate 只能在当前 WI `candidates/**` | 示例有 `project/modules/auth/*.candidate.md` | 统一用 `.specforge/work-items/<WI-ID>/candidates/project/...` | candidate_manifest 校验 target/candidate path |
| C-007 | 模块命名 | `MODULE_CODE = [A-Z][A-Z0-9]{1,11}` | 示例使用 `auth`、`MOD-AUTH` | canonical module code 统一为 `MODULE_CODE` | ID、路径、Trace、manifest 统一 |
| C-008 | Gate 命名 | 已有 Gate Runner / gate_summary / hard_gate | v1.14 Gate 名称混合自然语言 | gate id 统一 snake_case | Tool schema 与 registry 统一 |
| C-009 | 文件生成策略 | MVP 目录克制 | v1.14 文件多、专题多 | Core/Conditional/Optional 分级 | 防止机械生成空文件 |
| C-010 | Service vs Module | v1.1 主要定义 Module | v1.14 增加 service_catalog | Module 是规格边界，Service 是运行边界 | service_catalog 是 Conditional View |
| C-011 | `.specforge/reports/` | MVP 禁止 | v1.2 已出现 report 需求 | v1.3 可允许 reports，但必须非真相源 | report 不得替代 evidence |
| C-012 | diagrams | v1.1 没有作为真相源 | v1.14 允许 diagrams | diagrams 是 Optional Extension，不是唯一事实源 | 图必须引用正式规格 |
| C-013 | Compliance level | v1.1 是统一硬标准 | v1.14 有 Minimal/Standard/Extended | 合规等级后置为配置/Playbook，不改变 hard gates | 不能靠降级绕过 hard_gate |
| C-014 | Examples | v1.1 偏执行规则 | v1.14 示例多 | 示例移至 examples，不进入正文 | 避免示例误变强规则 |
| C-015 | 方法论文本 | v1.1 是执行标准 | v1.14 有大量实践解释 | 正文只保留机制映射 | 降低标准噪音 |
