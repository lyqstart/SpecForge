# SpecForge User-Level Agent Rules

> 本文件是用户级 OpenCode 配置的全局规则，所有 SpecForge agent（包括 sub-agent）都会读到这些规则。
> 工作区级 `AGENTS.md` 会叠加在本文件之上。
> 项目特定细节请改 `AGENTS.md`，全局硬性约束写本文件。

---

## Shell 命令执行硬规则（所有 agent 必读）

**所有需要运行 shell 命令的场景，必须使用 `sf_safe_bash` 工具。OpenCode 内置的 `bash` 工具已对所有 sub-agent 禁用（permission.bash = deny）。**

`sf_safe_bash` 由 SpecForge daemon 提供，自动完成：

- **正确选择 shell**：Windows 优先 pwsh > powershell > cmd；macOS/Linux 优先 bash > zsh
- **强制 UTF-8 编码**：解决 Windows 中文乱码（chcp 65001 + Console.OutputEncoding）
- **危险命令拦截**：`rm -rf /`、`sudo`、`curl ... | sh`、`format` 等直接拒绝执行
- **禁用 cd / cat / find / grep / mkdir 等系统命令**：拒绝并给出替代建议（用 cwd 参数 / read_file / file_search / grep_search / fs_write）
- **OS 级 hard timeout**：默认 60s，超时 SIGKILL 必返回，agent 不死等
- **stdout/stderr 分离 + 截断到 4 KB**：避免上下文炸
- **审计日志**：写入 `.specforge/logs/shell-history.jsonl`，便于排查

### 工具替代速查（违反将被 sf_safe_bash 拒绝）

| 错误用法 | 正确用法 |
|---|---|
| `cd <dir> && <cmd>` | 调用 sf_safe_bash 时传 `cwd: "<dir>"` 参数 |
| `cat foo.txt` | 用 `read_file` 工具 |
| `find . -name "*.ts"` | 用 `file_search` 工具 |
| `grep "pattern" file.txt` | 用 `grep_search` 工具 |
| `mkdir -p dir/sub` | 用 `fs_write` 写文件（自动建目录） |
| `echo "x" > file` | 用 `fs_write` 工具 |
| `cat << EOF\n...\nEOF`（heredoc） | 写到临时文件再调用 |
| `python -c "import x\nx()"`（多行 -c） | 写到 `tmp.py` 再 `python tmp.py` |
| `bash -c "long script"` | 写到 `tmp.sh` 再 `bash tmp.sh` |

### 失败处理

`sf_safe_bash` 返回 JSON 含 `success` / `exitCode` / `stdout` / `stderr` / `rejected` / `hint` / `suggestion` 字段：

- `rejected: true` → **不要重试同样的命令**，按 `suggestion` 字段调整后再调用（直接换写法重试常常踩另一个约束）
- `timeout: true` → 命令在限定时间内未完成，被 SIGKILL；检查是否资源泄漏 / 网络挂起 / 死锁
- `exitCode != 0` 且 `success: false` → 业务失败，看 `stderr` 和 `hint` 决定下一步

### 紧急逃生通道

只有 `sf-orchestrator` 保留 `bash: allow`，作为 sf_safe_bash 不可用（daemon 异常）时的应急通道。**普通工作流不应使用 orchestrator 的 bash 权限**。

---

## SpecForge 框架核心规则

1. 所有 agent 必须遵守 `~/.config/opencode/agents/_AGENT_BASE.md` 的底线规则
2. 状态流转必须通过 `sf_state_transition` 工具（仅 Orchestrator 可调用）
3. Gate 检查（requirements / design / tasks / verification）不得绕过
4. Sub-agent 不得调度其他 agent，只有 Orchestrator 可以
5. Sub-agent 不得直接向用户提问，遇到无法决策的情况通过升级条件向 Orchestrator 报告

## 标准 Feature Spec 工作流

```
intake → requirements → design → tasks → development → review → verification → completed
```

每个阶段切换需要通过对应的 quality gate。

---

## 参考

- 完整 Shell 命令执行规范：`docs/engineering-lessons/universal/shell-command-execution.md`
- 异步资源管理规范：`docs/engineering-lessons/universal/async-resource-lifecycle.md`
- Kiro execute_pwsh 受控壳约束：`docs/engineering-lessons/ai-tools/kiro/execute-pwsh-constraints.md`
