# SpecForge v1.2 Write Guard Control Plane

## 1. 目标

v1.2 的 Write Guard 目标不是文档提醒，而是程序控制：

```text
AI 不能绕过 SpecForge 工作流直接写文件。
```

## 2. 写入能力边界

需要纳入控制的写入路径：

- OpenCode edit/write 类工具；
- bash / powershell / shell 写文件；
- SpecForge artifact write；
- installer / generator；
- agent 自己生成文件；
- 子 agent 写文件。

## 3. 权限来源

唯一合法写入权限来自：

```text
sf_code_permission
```

权限必须包含：

- work_item_id；
- allowed_write_files；
- allowed_write_dirs；
- denied_paths；
- expires_at 或 revoke 条件；
- grant evidence；
- requesting agent；
- approving tool。

## 4. 强制检查点

每次写入前必须检查：

1. 当前 WI 是否处于 `implementation_running`；
2. code permission 是否 enable；
3. 写入路径是否在 allowed list；
4. 写入路径是否不在 denied list；
5. 写入工具是否受控；
6. 写入事件是否记录。

## 5. 越权行为

越权行为包括：

- 写入 allowed list 之外文件；
- 在未 enable code permission 时写文件；
- 在 revoke 后写文件；
- 直接修改 `.specforge/work-items/**` 治理产物；
- 修改 project spec 但没有 candidate merge；
- 使用 shell 绕过 edit/write guard。

处理方式：

```text
fail-fast
record blocked_write_attempt
state -> blocked 或 gates_failed
close_gate 必须拒绝
```

## 6. 审计产物

changed files audit 至少包含：

- in_scope；
- out_of_scope；
- blocked_write_attempts；
- allowed_write_files；
- actual_changed_files；
- violations；
- audit result；
- evidence refs。

## 7. 验收项

v1.2 Write Guard 通过条件：

1. 未授权写文件被阻止；
2. shell 绕过写文件被阻止或记录为 blocked_write_attempt；
3. 授权路径写入通过；
4. 非授权路径写入失败；
5. revoke 后写入失败；
6. close_gate 对 blocked_write_attempts > 0 fail-fast。
