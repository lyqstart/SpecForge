# SpecForge 当前约定导航

> Role: DERIVED REFERENCE
>
> 这里解释当前实现合同，不是产品权威。产品范围与架构以 `docs/product-specification/specforge-product-specification.md` 为准；文件角色以 Authority Registry 为准。若本文与实现合同不一致，应修复本文或实现，而不是把本文提升为并行权威。

| 文档 | 职责 | 直接依据 |
|---|---|---|
| [directory-layout.md](directory-layout.md) | 自动生成的项目级目录投影 | `packages/types/src/directory-layout.ts` |
| [file-naming.md](file-naming.md) | 当前文件与 ID 命名摘要 | SPS §4、`directory-layout.ts`、ID contract |
| [wi-lifecycle.md](wi-lifecycle.md) | 当前 Work Item 状态与关键门禁摘要 | SPS §6、Workflow Runtime state machine |
| [workflow-types.md](workflow-types.md) | 当前启用工作流及旧名称处理 | SPS §6、`sf-orchestrator` |
| [agent-roles.md](agent-roles.md) | 已部署 Agent 的职责边界 | `setup/userlevel-opencode/agents/` |
| [glossary.md](glossary.md) | 当前术语简表 | SPS 与当前 Contract |
| [meta-json-spec.md](meta-json-spec.md) | 说明旧 `_meta.json` 已退役及当前 metadata owner | current schema contract |

变更顺序：产品决定 → SPS/Registry → ADR 或从属 Contract（如需要）→ 实现合同 → 本目录派生说明 → 测试。
