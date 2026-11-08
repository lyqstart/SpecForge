# Work Item Metadata 合同说明

> Role: DERIVED REFERENCE。

旧版 Work Item `_meta.json` 及其多工作流 Zod schema 已退出当前产品，不是当前权威，也不提供兼容写入。

当前 Work Item metadata 文件为：

```text
<project>/.specforge/work-items/<WI-ID>/work_item.json
```

当前验证 owner 是 `@specforge/types/work-item-metadata-contract` 与 `@specforge/types/schema-contract`；Daemon 的读写入口必须通过该合同。Agent 不得手工构造或修补 `work_item.json`，创建 Work Item 必须调用 `sf_work_item_create`，状态变更必须由 Runtime owner 追加事件并更新 projection。

`sf_artifact_write` 不接受 `work_item` / `work_item.json`；不会替 Agent 合并、修补或重写元数据、工作流身份与代码权限。代码权限必须使用 `sf_code_permission`，不能通过通用产物写入增加允许路径或撤销撤权记录。`merge_report` 同样只由 Merge Runner 事务生成。

需要字段级定义时直接查看当前 schema descriptor 和对应测试，不得把本页、旧 `_meta.json` 示例或归档标准当作可执行 schema。

全局知识库由 `sf_knowledge_base` 的存储 owner 管理，沿用独立的 `version: "1.0"` 格式，和产品版本、Work Item metadata 的 schema 无关。读写前都校验当前格式；未知版本、缺失版本、损坏或不完整文件保持阻断，不能用有效的新对象覆盖未知旧文件来实现隐式迁移。`remove` 归档条目而不物理删除。Agent 不得直接编辑或删除 `insights.json`。
