# SpecForge 权威体系恢复：当前决策与接续状态

> **文件性质**：动态任务状态与证据索引，不是产品需求、产品架构或全局 authority registry。
> **稳定决策依据**：[`ADR-014-authority-model-recovery-freeze.md`](../../adr/ADR-014-authority-model-recovery-freeze.md)。
> **更新时间**：2026-09-15。

## 新会话必须先做什么

1. 读取 `AGENTS.md`、错误台账第三/四部分、本文件、ADR-014，并实时读取 Git `main` HEAD。
2. 只读完成规格与消费者矩阵；将每个文件分类为正式候选、ADR、治理设计、实施计划、动态状态、Kiro 工作规格、历史证据或待裁决冲突。
3. 向产品负责人提交冲突和处置建议；在裁决前不移动、删除或建立替代产品规格文件。

## 已确认事实

- 产品负责人已明确 `.kiro/` 不是产品权威目录。
- ADR-013、治理实施方案、发布预检和多组测试仍把 V6 Kiro 文件当作权威，属于待修复消费者或被覆盖的历史边界。
- ADR-010/011 与实际 `~/.specforge` 用户级写入冲突；ADR-009 与 Plugin 自动启动 daemon 冲突。
- `docs/standards/fused_standard.md`、`docs/standards/v1.3/` 与其他治理材料的规范地位尚未完成统一裁决。

## 当前状态

```text
CURRENT_PHASE=AUTHORITY_MODEL_RECOVERY_INVENTORY
CURRENT_BLOCKER=PRODUCT_AUTHORITY_ROOT_AND_DOCUMENT_PRECEDENCE_NOT_YET_DECIDED
OPEN_ERRORS=NONE
CLOSED_ERRORS=ERR-1537,ERR-1538,ERR-1539,ERR-1540,ERR-1541,ERR-1542,ERR-1543,ERR-1544,ERR-1545
NEXT_LEGAL_ACTION=BUILD_AUTHORITY_CONSUMER_CONFLICT_MATRIX_AND_REQUEST_PRODUCT_OWNER_DECISIONS
```

## 禁止事项

- 不得重新把 `.kiro` 设为产品权威，或以其单独决定产品范围。
- 不得因旧测试或历史标准仍存在而恢复旧路径、旧兼容或旧 daemon 生命周期。
- 不得删除历史 ADR、ERR、审计证据或报告。
