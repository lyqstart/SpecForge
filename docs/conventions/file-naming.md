# 当前文件与 ID 命名约定

> Role: DERIVED REFERENCE。路径以 `packages/types/src/directory-layout.ts` 为实现合同。

- 项目治理根：`<project>/.specforge/`
- 用户级私有根：`<OpenCode config>/sf-user/`
- 安装 Manifest：`<OpenCode config>/specforge-manifest.json`
- Work Item ID：`WI-NNNN`，由 `sf_work_item_create` 分配，不由 Agent 手写。
- Requirement、Acceptance、Design、Task 等标识由当前 ID contract 与 owner 生成，禁止从旧文档复制格式作为新合同。

当前长期规格位于 `.specforge/project/`，事务产物位于 `.specforge/work-items/<WI-ID>/`，运行状态位于 `.specforge/runtime/`。新流程不得写 `.specforge/specs/`、根 `_meta.json`、用户主目录 `~/.specforge/` 或其他历史路径。

源代码中不得散布当前路径字面量；共享项目路径使用 `@specforge/types/directory-layout`，用户级路径使用 `@specforge/types/user-level-paths`。生成文档必须由实现合同重建并接受消费者测试。
