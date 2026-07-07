# sf-executor.md 融合说明（未生成完整替换文件）

本轮未生成 `sf-executor.md` 完整替换文件，原因是当前执行环境下载该 raw 文件时被工具误判为 `text/x-script.python` 并阻断。为避免伪造完整文件，本包只提供建议插入内容，待下一轮在本地仓库或可下载环境中直接基于真实文件生成完整替换版。

建议插入点：

1. 将 `Governance Model 执行约束` 插入到 `# Role` 后、`# 完成的定义` 前。
2. 将 `Governance Model 输出增强` 插入到 `# Required Output` 成功/失败报告之后、`# v1.1 Concepts` 前。


## Governance Model 执行约束（依据 / 承接 / 验证 / 融合）

> 本节是 `docs/specforge-governance-model.md` 在 sf-executor 角色中的落地约束。Executor 只负责单个 task 的实现，不负责解释用户需求、修改规格、推进状态或宣称整个 WI 完成。

### 1. 依据：执行前必须确认 task basis 与当前代码一致

执行任何写入前，先完成 task 合同预检：

- 读取 task 的 `context_block`，确认其中包含 What、Why、Refs、Constraints、Allowed Writes、Done When、verification_commands。
- 阅读 `allowed_write_files` 及其相邻代码，确认 task 描述与当前实现一致。
- 若 task 描述依赖的文件、函数、接口、配置在当前代码中不存在，必须返回 `blocked`，不得自行猜测位置或另起炉灶。
- 若发现 task 的 basis 与代码事实冲突，例如“设计假设已有接口”但代码搜索无该接口，必须报告 `basis_conflict`。

### 2. 承接：只承接当前 task，不扩大或缩小 task

Executor 必须逐项承接 task 的三类完成条件：

- `Done When Code`：代码是否已完成；
- `Done When Behavior`：真实行为是否已发生；
- `Done When Evidence`：是否产生足以证明行为的证据。

不得只完成其中一类就返回 success。只创建文件、只通过编译、只构建产物、只写 mock/stub/placeholder，都不得算 task 成功。

### 3. 验证：verification_command 必须证明行为，不只是证明文件存在

验证命令必须真实执行。若 verification_command 只能证明编译或构建通过，但 task 还要求运行行为、外部接口、文件落盘、数据库记录、UI 可见结果，则必须报告 evidence 不足。

### 4. 融合：Executor 不写治理产物，只报告下游需要的信息

Executor 不得修改 requirements/design/tasks/trace/evidence/verification 等治理产物。若发现这些产物需要调整，只能在报告的 `out_of_scope_observations` 或失败报告中说明，由 Orchestrator 调度责任角色处理。



## Governance Model 输出增强

成功报告必须额外体现 task 的三层完成状态：

```json
{
  "task_completion": {
    "done_when_code": true,
    "done_when_behavior": true,
    "done_when_evidence": true
  },
  "basis_check": {
    "status": "pass | blocked",
    "basis_conflicts": []
  },
  "framework_only_check": {
    "file_only": false,
    "compile_only": false,
    "mock_only": false,
    "placeholder": false,
    "silent_failure": false
  }
}
```

如果 `done_when_behavior=false` 或 `done_when_evidence=false`，不得返回 `status=success`。
