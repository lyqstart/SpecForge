# Work Item Metadata 合同说明

> Role: DERIVED REFERENCE。

旧版 Work Item `_meta.json` 及其多工作流 Zod schema 已退出当前产品，不是当前权威，也不提供兼容写入。

当前 Work Item metadata 文件为：

```text
<project>/.specforge/work-items/<WI-ID>/work_item.json
```

当前验证 owner 是 `@specforge/types/work-item-metadata-contract` 与 `@specforge/types/schema-contract`；Daemon 的读写入口必须通过该合同。Agent 不得手工构造或修补 `work_item.json`，创建 Work Item 必须调用 `sf_work_item_create`，状态变更必须由 Runtime owner 追加事件并更新 projection。

需要字段级定义时直接查看当前 schema descriptor 和对应测试，不得把本页、旧 `_meta.json` 示例或归档标准当作可执行 schema。
