# SpecForge v1.2.8 Design — hard_stop 与 Write Guard 授权流程

## 1. 发生的问题

v1.2.5 至 v1.2.7 修复了 ssh 远程路径误判、hard_stop resolver 死锁、changed_files_audit 不识别 resolution 的问题。但 WI-0012 Android APK 构建继续暴露出更深层问题：Write Guard 对 Docker volume mount、相对路径重命名、`/tmp` 字符串等静态分析过于自信。

典型误判：

```text
mv fjtmp fjandroid → 被联想到 /tmp/fjtmp
docker run -v /mnt/.../fj-android:/workspace → 被误判为越权写入或删除
```

## 2. hard_stop 的正确定位

`hard_stop` 是紧急刹车，不是最终审判。它应该用于高置信风险或必须人工复核的风险，而不是把所有静态分析不确定都永久视为违规。

## 3. 用户交互模型

系统检测到风险后，应向用户展示选项：

- A：授权当前 WI 内同类操作继续执行；
- B：仅解除本次阻断；
- C：改为用户手工执行；
- D：拒绝执行。

用户选择 A：系统调用 `sf_hard_stop_resolve` 并写入 project-level `write_guard_authorization`。

用户选择 B：系统只调用 `sf_hard_stop_resolve`。

## 4. 为什么授权是项目级文件

`write_guard_authorization` 是项目安全策略事实，不是单个 WI 的过程产物。因此存储在：

```text
.specforge/project/policies/write_guard_authorizations.jsonl
```

每条记录再通过 `scope`、`work_item_id`、`expires_when` 控制生效范围。

## 5. 审计模型

`sf_changed_files_audit` 必须同时读取：

```text
write_guard_log.jsonl
hard_stop_resolution.jsonl
.specforge/project/policies/write_guard_authorizations.jsonl
```

最终分类包括：

- unresolved_blocked_attempt
- hard_stop_resolution_resolved
- write_guard_authorization_resolved
- historical_blocked_discovery_resolved
- historical_blocked_no_effect

## 6. 关键原则

```text
resolution = 解释过去为什么解除
authorization = 控制未来哪些同类操作可继续
```

用户确认一次后，同一 WI 内严格匹配的同类命令不再反复 hard_stop；但高危变形命令仍必须继续拦截。
