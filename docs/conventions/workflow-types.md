# 当前工作流类型

> Role: DERIVED REFERENCE。

当前发布只启用：

```text
workflow_type=feature_spec
workflow_path=<fact-derived route>
```

新 Work Item 可依据事实分类进入 `requirement_change_path`、`design_change_path`、`architecture_change_path`、`task_change_path`、`code_only_fast_path` 或 `contract_change_path`；这些 route 都不创造第二个 workflow identity。`requirement_changed`、`acceptance_criteria_changed`、`design_changed`、`architecture_changed`、`data_model_changed` 等事实决定 Candidate、专业 Agent、Gate 和验证深度；不得用另一个 workflow 名称绕开治理。

`quick_change`、`bugfix_spec`、`refactor`、`investigation`、`ops_task`、`feature_spec_design_first` 等旧名称即使仍出现在历史报告、fixture 或实现版本标识中，也不是当前可创建的产品工作流。正式入口遇到它们必须报告 `UNSUPPORTED_CURRENT_RELEASE_WORKFLOW` 并失败关闭，而不是自动转换或兼容写入。
