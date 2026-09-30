# SpecForge v1.2.5 Remote Ops Boundary and Hard Stop Resolution Hotfix Report

## 1. 背景

fj1 的 WI-0003 进入 ops_task 后，`sf_safe_bash` 执行：

```bash
ssh lg "cp -a /var/lib/pgsql/data /opt/pg13-backup-20260702/data"
```

Write Guard 静态分析把 ssh 远程命令里的 `/var/lib/pgsql/data`、`/opt/pg13-backup-20260702/data` 当成本地项目写入目标，触发 `WRITE_GUARD_RUNTIME_BLOCKED`，并持久化 work-item 级 hard_stop。随后即使最小 `ssh lg 'echo hello'` 和诊断 artifact 写入也被阻断。

## 2. 根因

SpecForge v1.2.4 前的 Write Guard 只抽取“写入痕迹”，没有区分：

- 本地项目写入；
- 本地重定向写入；
- ssh 远程命令内部写入；
- scp/rsync 远程传输；
- pre-execution false positive hard_stop。

因此 ops_task 的远程服务器路径被误判为本地项目写入。

## 3. 修复内容

v1.2.5 引入：

1. `shell-command-write-intent.ts`：识别 ssh quoted remote command body，并在本地 Write Guard 扫描前剥离远程命令体。
2. `sf_hard_stop_resolve`：提供结构化 hard_stop 解除工具，要求用户原话、解除类型、原因、证据，并将原 hard_stop 保存在 `hard_stop_resolution.jsonl`。
3. user-level `sf_hard_stop_resolve.ts`：让 OpenCode 可调用该 daemon 工具。
4. 回归测试：覆盖 ssh remote cp、ssh local redirection、ssh remote tee、scp local→remote 等场景。

## 4. 安全边界

本次修复不是跳过 Write Guard：

- ssh 远程命令内部路径不进入本地 `allowed_write_files` 审计；
- ssh 外层本地重定向仍进入本地 Write Guard；
- 本地 `cp/mv/rm/touch/tee/>` 仍按原规则审计；
- hard_stop 解除必须结构化留痕，不允许无痕删除。

## 5. 后续

v1.2.5 解决当前 fj1 真实阻塞。更完整的 Ops Guard 可在后续版本继续产品化，包括 remote_ops_targets、remote_ops_evidence、remote rollback evidence 等。
