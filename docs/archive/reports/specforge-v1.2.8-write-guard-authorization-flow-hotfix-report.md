# SpecForge v1.2.8 Hotfix Report — Write Guard Authorization Flow

## 1. 背景

真实项目 fj1 连续暴露了两类问题：

1. WI-0003 中，`ssh lg "cp -a /var/lib/pgsql/data ..."` 的远程路径曾被 Write Guard 误判为本地项目外写入；后续 v1.2.5/v1.2.7 已分别修复远程边界和 audit resolution 读取。
2. WI-0012 中，Android APK 构建阶段暴露新的误判：`mv fjtmp fjandroid` 被联想到 `/tmp/fjtmp`，Docker `-v host:container` / `--mount` 被误判为越权写入或删除操作，导致同类命令反复 hard_stop。

这说明当前 hard_stop 只能解除当前锁，不能表达“用户已授权当前项目/当前 WI 内同类操作继续执行”。

## 2. 设计结论

本次修复把概念拆分为两层：

- `hard_stop_resolution.jsonl`：解释过去这一次 hard_stop 为什么可以解除。
- `.specforge/project/policies/write_guard_authorizations.jsonl`：项目级策略事实，记录未来同类操作在限定范围内可以继续执行。

用户选择“仅解除本次阻断”时，只调用 `sf_hard_stop_resolve`。

用户选择“授权同类继续”时，系统执行：

```text
sf_hard_stop_resolve + project-level write_guard_authorization
```

## 3. 修改内容

- 新增 `write-guard-authorization-log.ts`：读写项目级授权日志，并匹配 Docker / SSH 等命令族。
- 修改 `sf_hard_stop_resolve`：支持可选 `install_authorization`，在解除 hard_stop 后安装项目级授权。
- 修改 `sf_safe_bash`：执行前先检查当前 WI 是否已有匹配授权；匹配后允许执行，并返回授权信息。
- 修改 `sf_changed_files_audit` / `blocked-write-classification`：审计时读取 project-level authorization，将匹配的历史 blocked attempt 分类为 `write_guard_authorization_resolved`。
- 更新 user-level `sf_hard_stop_resolve.ts` schema，暴露授权参数。

## 4. 安全边界

授权不是全局无限放行。每条授权必须包含 scope、work_item_id、command_family、host_path_prefix、container_targets、image 等限制。

危险命令例如 `docker -v /:/host`、`--privileged`、`rm -rf /` 不应因普通授权而绕过 hard_stop。

## 5. 验收项

- 项目级授权写入 `.specforge/project/policies/write_guard_authorizations.jsonl`。
- Docker build 授权在同一 WI 内匹配，不影响其他 WI。
- 已授权的 blocked attempt 在 changed_files_audit 中分类为 `write_guard_authorization_resolved`。
- 未授权的项目外写入仍分类为 `unresolved_blocked_attempt`。
