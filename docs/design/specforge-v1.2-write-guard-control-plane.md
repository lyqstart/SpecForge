# SpecForge v1.2 Write Guard Control Plane

<!-- SF_V12_WRITE_GUARD_CONTROL_PLANE -->

## 1. 核心目标

v1.2 的 Write Guard 必须从事后审计升级为写入前控制。

```text
任何写入文件的动作，都必须先经过 SpecForge 写入控制面。
```

## 2. 控制对象

必须纳入控制：

- OpenCode edit/write；
- bash / powershell / shell；
- artifact write；
- generator；
- installer；
- project spec 写入；
- extension registry 写入；
- 子 agent 间接写入。

## 3. 权限来源

唯一合法写入权限来自：

```text
sf_code_permission
```

权限对象应包含：

```json
{
  "schema_version": "1.2",
  "work_item_id": "WI-0001",
  "grant_id": "CP-WI-0001-001",
  "state_required": "implementation_running",
  "allowed_write_files": ["src/a.ts"],
  "allowed_write_dirs": [],
  "denied_paths": [".specforge/work-items/**"],
  "project_spec_write": false,
  "expires_on_state_exit": true
}
```

## 4. 写入前检查

新增控制点：

```text
sf_write_guard_preflight
```

输入：

- work_item_id；
- tool_name；
- operation；
- target_paths；
- command；
- current_state；
- reason。

输出：

- allowed；
- denied；
- violations；
- normalized_paths；
- audit_event_id。

## 5. shell 写入控制

以下命令属于明确写入风险：

```text
>
>>
Set-Content
Out-File
New-Item -ItemType File
Copy-Item
Move-Item
Remove-Item
python -c open(..., "w")
node -e fs.writeFileSync(...)
```

不能静态判断时，默认拒绝，除非它是 allowlisted read-only verification command。

## 6. project spec 写入规则

`sf_artifact_write` 只能写 WI 过程产物，不能直接写 `.specforge/project/**`。

写 project spec 主线必须通过：

```text
sf_project_spec_merge
```

直接写入 project spec 必须拒绝。

## 7. 事件记录

每次 preflight 必须写事件：

```json
{
  "type": "write_guard.preflight",
  "work_item_id": "WI-0001",
  "allowed": true,
  "target_paths": ["src/a.ts"],
  "tool_name": "edit",
  "state": "implementation_running"
}
```

拒绝时必须写：

```json
{
  "type": "write_guard.violation",
  "work_item_id": "WI-0001",
  "violation_type": "OUT_OF_SCOPE_WRITE",
  "target_paths": ["src/b.ts"]
}
```

## 8. 状态联动

- 非 `implementation_running` 禁止代码写入；
- revoke 后禁止写入；
- violation 出现后进入 blocked 或 gates_failed；
- close_gate 必须检查 blocked_write_attempts；
- verification read-only 命令可放行。

## 9. 验收项

正向：

- allowed file 写入通过；
- read-only verification command 通过；
- project spec merge 专用工具写入通过。

负向：

- 未 enable code permission 写入失败；
- 非 implementation_running 写入失败；
- shell 写 out_of_scope 文件失败；
- revoke 后写入失败；
- blocked_write_attempts > 0 时 close_gate fail-fast。
