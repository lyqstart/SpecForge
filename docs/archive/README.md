# SpecForge 历史文档归档

`docs/archive/` 是 SpecForge 旧文档与历史证据的唯一归档根。这里的内容用于追溯“过去如何设计、实施、验证和裁决”，不定义当前产品行为，也不承载当前项目状态。

当前入口：

- 产品需求与产品架构：`docs/product-specification/specforge-product-specification.md`
- 文件角色与解释优先级：`docs/product-specification/authority-registry.md`
- 当前执行状态：`docs/project-status.md`
- 从属技术治理合同：`docs/design/SpecForge架构一致性治理最终实施方案.md`
- 新会话入口：仓库根 `AGENTS.md` → `scripts/project-session-bootstrap.mjs`

## 归档分类

| 目录 | 历史角色 | 当前消费者规则 |
|---|---|---|
| `kiro/` | 旧 Kiro specs、artifacts、同步工具与专属测试 | 只能用于历史取证；不得作为产品或发布输入 |
| `standards/` | fused standard 与 v1.3 标准候选 | 不再是当前标准；成熟结论必须先进入 SPS/登记合同 |
| `design/` | 被取代或阶段性的设计、roadmap 与实施报告 | 只能证明历史设计语境 |
| `implementation/` | P0、authority recovery、handoff 与收敛过程 | 只能证明当时状态；不得用于恢复当前会话 |
| `reports/`, `audit/`, `audits/`, `bootstrap/`, `validation/` | 验证、审计、发布与启动证据 | 保留不可丢失；不能反向决定当前产品 |
| `proposals/`, `prompts/`, `releases/`, `root/` | 旧提案、交接提示、发布记录与原 docs 根散落文档 | 历史参考，不是当前入口 |

关键快照：

- `design/SpecForge架构一致性治理最终实施方案.full-history-20261006.md`：当前精简合同建立前的完整 4462 行治理实施方案，原始 SHA-256 为 `25861569ced52f8017a68c7c9765c32c376b25afe70568e924db3eed5380b7d8`。

## 消费者分类

- `REAL_RUNTIME_CONSUMER`：不得读取本目录来决定当前运行行为。
- `TEST_CONSUMER`：只允许证明历史证据仍存在或复现历史缺陷；测试名称和断言不得把归档内容描述为当前权威。
- `HISTORICAL_REFERENCE`：文档链接或注释可以保留，但必须能从路径或上下文看出它是归档证据。

如果归档内容与当前 SPS、Authority Registry、登记技术合同、代码或测试冲突，应报告差异；不得直接修改上位产品决定以迁就归档内容。
