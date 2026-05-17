---
id: kiro-execute-pwsh-constraints
scope: tool-specific
tool: kiro
roles: [executor, orchestrator, debugger]
severity: high
tags: [shell, command-execution, kiro-tool]
created: 2026-05-16
updated: 2026-05-16
---

# Kiro `execute_pwsh` 受控壳的硬约束

## 症状

sub-agent 跑命令时频繁遇到以下错误，且**无论重试多少次都失败**：

| 错误命令 | 错误现象 |
|---------|---------|
| `cd packages/cli && bun run build` | "The 'cd' command is not supported and will fail" |
| `cat << EOF\n...\nEOF` | 命令解析失败 / 多行被截断 |
| `python -c "import x;\nx.foo()"` | 多行内联报错 |
| `grep "!important" file.css` | bash 历史扩展把 `!important` 吃了 |
| `find . -name '*.ts'` | 工具规则禁用，应该用 `file_search` |
| `cat foo.txt` | 工具规则禁用，应该用 `read_file` |

sub-agent 看到错误后，常见错误反应：
- 把命令拆成两步重试（仍然失败）
- 改用其他写法绕（可能踩到下一个约束）
- 误判为"环境有问题"，浪费回合数

## 根因

Kiro 的 `execute_pwsh` 工具**不是直接调用系统 PowerShell**，而是 Kiro 主进程内的**受控壳**。它有以下硬约束（写在工具描述里，但 sub-agent 容易忽视）：

1. **禁用 `cd` 命令**——Kiro 用工具参数 `cwd` 指定工作目录，让 cd 容易和 cwd 冲突，索性禁用
2. **禁用 heredoc**（`cat << EOF`）——多行重定向解析复杂，禁用避免 race
3. **单行限制**——内联解释器（`python -c` / `node -e` / `bash -c`）只能单行，多行需要写成临时脚本文件
4. **bash 历史扩展生效**——双引号字符串里的 `!` 会被 history expansion 处理，要用单引号或转义
5. **工具替代优先**——能用专用工具（`read_file` / `file_search` / `grep_search` / `fs_write`）就**禁止**用对应的 shell 命令（`cat` / `find` / `grep` / `mkdir`）
6. **默认无 hard timeout**——长跑命令会一直挂住，必须显式 timeout 或外层 `Start-Job + Wait-Job -Timeout`

## 解决方案

### 替代规则速查表

| 错误用法 | 正确用法 |
|---------|---------|
| `cd <dir> && <cmd>` | `execute_pwsh(command="<cmd>", cwd="<dir>")` |
| `cat foo.txt` | `read_file(path="foo.txt")` |
| `find . -name '*.ts'` | `file_search(query="*.ts")` |
| `grep "pattern" file.txt` | `grep_search(query="pattern", includePattern="file.txt")` |
| `mkdir -p dir/sub` | `fs_write(path="dir/sub/.gitkeep", text="")`（或工具自动创目录） |
| `echo "content" > file` | `fs_write(path="file", text="content")` |
| `cat << EOF\n...\nEOF` | 写到临时文件用 `fs_write`，再 `bun run` 临时文件 |
| `python -c "import x\nx()"` | 多行写到 `tmp.py`，再 `python tmp.py` |
| `grep "!important"` | `grep "'!important'"`（单引号包裹） |
| `bun test path/to/file.test.ts`（裸跑） | 见下方"长跑命令必须 timeout" |

### 长跑命令必须 OS 级 timeout

任何可能跑 ≥ 1 分钟的命令（特别是 `bun test`），必须用 PowerShell `Start-Job + Wait-Job` 包裹，避免卡死整个 orchestrator：

✅ 正确写法：
```powershell
$job = Start-Job -ScriptBlock { Set-Location $using:PWD; bun test packages/foo/tests/bar.test.ts 2>&1 }
if (Wait-Job $job -Timeout 90) {
  Receive-Job $job
  Remove-Job $job
} else {
  Stop-Job $job
  Receive-Job $job
  Remove-Job $job -Force
  Write-Host "STILL_HUNG_AFTER_90s"
  exit 1
}
```

❌ 错误写法：
```bash
bun test packages/foo/tests/bar.test.ts   # 没有 timeout 包裹，可能卡死数小时
```

### 工作目录的正确传递

`execute_pwsh` 工具有专门的 `cwd` 参数。**永远用它**，不要在 command 里 `cd`：

✅ 正确：
```
execute_pwsh(
  command: "bun run build",
  cwd: "d:\\code\\temp\\SpecForge\\packages\\cli"
)
```

❌ 错误：
```
execute_pwsh(
  command: "cd packages/cli && bun run build"
)
```

注意：`cwd` 需要的是**相对仓库根**或**绝对路径**，不是相对当前 cwd。

## 预防机制

### 在 Kiro 注入点（适配器自动生成）

经验库适配器 `scripts/lessons/render-kiro-steering.ts` 应把这条经验渲染到 `.kiro/steering/lessons-injected.md`，使 Kiro 主 agent 和 sub-agent 都能在每次会话开头看到。

### 在 Kiro steering 手工注入（短期）

在 `.kiro/steering/v6-development-workflow.md` 的"禁止事项"小节加：

```
- ❌ 禁止在 execute_pwsh 的 command 里使用 cd（用 cwd 参数）
- ❌ 禁止用 cat/find/grep/mkdir 等系统命令（用 read_file/file_search/grep_search/fs_write）
- ❌ 禁止裸跑 bun test（要 Start-Job + Wait-Job -Timeout 90 包裹）
```

### 在派单 prompt 里强调

orchestrator 派 sub-agent 时，prompt 里包含一段：

```
## 命令执行规则（Kiro execute_pwsh 受控壳）

不要在 command 里用 cd，用 cwd 参数。
不要用 cat/find/grep/mkdir，用专用工具（read_file/file_search/grep_search/fs_write）。
不要裸跑 bun test，用 Start-Job + Wait-Job -Timeout 90 包裹。
```

### 错误反馈闭环

sub-agent 看到 `cd is not supported` / `command not allowed` 这类错误时**必须立刻停下报告**，不要换写法重试——重试常常踩另一个约束。

## 相关错误

同一受控壳约束派生出来的其他典型错误：

- **"failed to spawn process"**——多半是工具替代规则没遵守（用了被禁的 shell 命令）
- **"command timeout"**——长跑命令没 OS 级 timeout 包裹
- **"output truncated"**——多行 inline 命令被截
- **"unexpected token '!'"**——双引号 + `!` 触发 history expansion
- **"Move-Item: cannot find path"**——cd 失败了但下一步基于"已经 cd"的假设

## 参考

- Kiro `execute_pwsh` 工具的完整描述（含所有 ⚠️ Rules）见会话开头的工具定义
- `Start-Job + Wait-Job` 的完整模板见本文"长跑命令必须 OS 级 timeout"小节
- 资源泄漏导致 `bun test` 卡死的根因，见 [universal/async-resource-lifecycle.md](../../universal/async-resource-lifecycle.md)
