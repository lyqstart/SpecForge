# SpecForge v1.1 Stable Maintenance Baseline

## 1. 分支与 tag 策略

v1.1 稳定版完成后，建议采用以下策略：

```text
v1.1-stable tag：不可变正式稳定版基线
maintenance/v1.1-stable：只接收 v1.1 紧急修复
main：后续 v1.2 开发
```

## 2. maintenance/v1.1-stable 的使用边界

允许：

- v1.1 真实运行中发现的阻断性 bug；
- installer / live deployment 紧急修复；
- 明确不改变 v1.1 最终治理规则的修复；
- 文档错别字或验收报告补充；
- 兼容性脚本修复。

禁止：

- 引入 v1.2 新功能；
- 改变 final state set；
- 放宽 approval boundary；
- 绕过 `StateManager/events.jsonl`；
- 恢复旧状态机；
- 让 `work_item.json` 承载状态或审批权威；
- 为了“跑通”而跳过 `sf_merge_run`、`sf_code_permission`、`sf_changed_files_audit`、`sf_close_gate`。

## 3. 紧急修复流程

建议流程：

```powershell
cd D:\code\temp\SpecForge

git fetch yc
git checkout -b fix/v1.1-stable-<short-name> v1.1-stable

# 修改
bun run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-install-deployment-consistency.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-v11-stable-rc-closure.ps1

git commit -m "fix(v1.1): <summary>"
git push yc fix/v1.1-stable-<short-name>
```

修复通过后合并到：

```text
maintenance/v1.1-stable
```

是否 cherry-pick 到 `main`，按修复性质决定。

## 4. 发布补丁 tag

如果需要 v1.1 patch 版本，建议：

```text
v1.1.1-stable
v1.1.2-stable
...
```

不要复写 `v1.1-stable` tag。

## 5. 后续 v1.2 启动条件

只有在以下事项完成后，才建议启动 v1.2 设计开发：

1. v1.1 release notes 已固化；
2. v1.1 acceptance summary 已固化；
3. maintenance/v1.1-stable 分支已建立；
4. post-v1.1 repo hygiene 已规划；
5. v1.2 roadmap 已先写设计文档，而不是直接改代码。
