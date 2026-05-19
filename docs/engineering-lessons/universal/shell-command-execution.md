---
id: shell-command-execution
scope: universal
roles: [executor, orchestrator, debugger, architect]
severity: high
tags: [shell, command-execution, cross-platform, encoding, timeout, security]
created: 2026-05-19
updated: 2026-05-19
related: [host-environment-detection, async-resource-lifecycle, kiro-execute-pwsh-constraints]
---

# Shell 命令执行规范（跨平台 + 安全 + 可观测）

> **来源**：SpecForge V6 中 agent 调用 shell 频繁出错（cd 不被支持、命令卡死、中文乱码、找不到工具）的根因抽象。
> **适用范围**：所有需要 AI agent 执行 shell 命令的项目，不限工具（Kiro / OpenCode / Cursor / Cline / Codex 等）。
> **与 [kiro-execute-pwsh-constraints](../ai-tools/kiro/execute-pwsh-constraints.md) 关系**：本文是更上层的通用规则；Kiro 那篇是具体工具实现层的约束。本文给出"应该怎么设计 shell 工具"，对方给出"碰到 Kiro 的工具该怎么用"。
> **与 [host-environment-detection](host-environment-detection.md) 关系**：本文规定**怎么执行命令**，对方规定**怎么探测环境**。两者一起用：先探测、写入档案，本工具读档案后按档案执行。

---

## 症状

### 场景 1：跨平台命令翻车

```
Agent 在 Mac 上写命令：grep "TODO" src/
搬到 Windows 跑 → "grep is not recognized"
```

```
Agent 在 Linux 写：rm -rf node_modules/
搬到 Windows pwsh 跑 → 部分目录删不掉（占用句柄）
```

### 场景 2：中文输出乱码

```powershell
# Windows PowerShell 5.1（默认 GBK 编码）
PS> bun run build
鉂?error: cannot find module 'D:\项目\src\index.ts'
锛堟枃鏈ㄥ嚭浜?GBK ？UTF-8 杞崲澶辫触锛?
```

### 场景 3：命令卡死整条会话

```
Agent 调用 bash("bun test packages/foo")
↓
foo 包有资源泄漏，bun test 不退出
↓
bash 工具死等子进程
↓
Agent 死等 bash 工具
↓
[30 分钟过去，对话框转圈，没动静]
```

### 场景 4：危险命令意外执行

```
Agent 帮用户清理 logs：
  rm -rf ~/.specforge/logs/*

但 ~ 解析失败返回空字符串：
  rm -rf /logs/*
  
执行成功，agent 报告"清理完成"，但用户其实丢了系统文件。
```

### 场景 5：路径有空格直接断命令

```
Agent 在 "C:\Program Files\项目" 下跑：
  cmd: bun run build
  cwd: C:\Program Files\项目

shell 报错：'Files\项目' 不是内部或外部命令
```

---

## 根因

### 一、跨平台 shell 不一致是结构性问题

不同平台默认 shell 完全不同，工具集也不一样：

| 平台 | 默认 shell | 默认编码 | 系统命令风格 | 路径分隔符 |
|------|-----------|---------|------------|----------|
| Windows 7-10 | cmd / powershell.exe (5.1) | GBK / CP936（中文 Windows） | 私有 cmdlet | `\` |
| Windows 11 (有 pwsh) | pwsh.exe (7+) | UTF-8 | cmdlet + Unix 化 | `\` 或 `/` |
| macOS | zsh | UTF-8 | BSD 风 | `/` |
| Linux | bash / dash | UTF-8 | GNU 风 | `/` |

**Agent 不知道自己跑在哪个平台**——它在生成命令时用训练数据里最常见的写法（多半是 bash），到了其他平台必然翻车。

### 二、shell 工具默认无 hard timeout

OpenCode 内置 bash、Kiro 的 execute_pwsh、Cursor 的 terminal——它们的 spawn 子进程都是**无限等**子进程退出。一个卡死的 `bun test` 会让 agent 等到天荒地老。Agent 上下文里看不到"正在等什么"，**用户也无法知道发生了什么**，只能强制中断。

### 三、AI 训练数据偏向 Linux

Agent 默认生成的命令是 GNU 风：`grep`、`find`、`cat`、`mkdir -p`、`cp -r`。这些在 Windows cmd 上根本没有，pwsh 上有别名但行为不完全相同。

### 四、命令是字符串拼接，路径含特殊字符直接炸

shell 命令本质是字符串，路径含空格 / 中文 / 引号 / `&` / `|` / `$` 都可能导致解析错误。Agent 拼字符串时几乎从不正确转义。

### 五、缺少机器档案，每次靠猜

Agent 不知道：
- pwsh 装了没？版本多少？
- bun 在哪？git 在哪？
- 系统语言是中文还是英文？时区是？
- 命令行最大长度限制？

每次都猜，猜错就翻车。

---

## 解决方案

核心思路：**把 shell 执行变成"读档案 + 规则引擎 + 强制超时"的工程问题**，而不是依赖 LLM 自己写对。

### 一、统一执行入口（sf_safe_bash 工具）

所有 shell 命令必须通过统一工具执行，**禁止 agent 直接用底层 bash**。这个工具负责：

1. 读取宿主机档案（host-profile）
2. 规则引擎检查命令
3. 选择正确的 shell（Windows 优先 pwsh）
4. 注入编码设置（强制 UTF-8）
5. spawn 子进程（带 OS 级 hard timeout）
6. 返回结构化结果（含诊断 hint）
7. 写审计日志

**Agent 永远只看到这一个工具**，复杂度被工具吃掉。

### 二、Shell 选择优先级（必须遵守）

| 平台 | 优先级 | 理由 |
|------|--------|------|
| Windows | **pwsh > powershell > cmd** | pwsh 默认 UTF-8，无中文乱码；powershell 5.1 GBK 编码会乱；cmd 命令贫弱 |
| macOS | **zsh > bash** | macOS Catalina+ 默认 zsh；bash 是后备 |
| Linux | **bash > sh** | bash 兼容性好；sh 在不同发行版指向不同实现，行为差异大 |

**强制规则**：sf_safe_bash 启动子进程前，按 host-profile 的 `shells[]` 顺序找第一个可用的。如果 Windows 上没装 pwsh，给用户**警告但不拒绝**，自动降级到 powershell.exe（同时加 GBK→UTF-8 编码转换）。

### 三、编码强制 UTF-8

#### Windows pwsh（推荐）

pwsh 默认就是 UTF-8，不需要额外配置。

#### Windows powershell.exe（降级方案）

每次 spawn 时**前置注入**编码设置：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null
```

把这段写进每次 spawn 的命令前缀。

#### Windows cmd（最后选择）

```cmd
chcp 65001 > nul
```

#### macOS / Linux

设置环境变量：

```bash
LC_ALL=en_US.UTF-8
LANG=en_US.UTF-8
```

在 spawn 时通过 `env` 字段传入，不污染父进程环境。

### 四、危险命令黑名单（必须代码层强制）

下列命令**直接拒绝执行**，不论 agent 怎么解释：

| 命令模式 | 拦截原因 |
|---------|---------|
| `rm -rf /` / `rm -rf /*` | 删根目录 |
| `rm -rf ~` / `rm -rf $HOME` | 删用户主目录 |
| `Remove-Item -Recurse -Force C:\` | Windows 等价 |
| `format <drive>` | 格式化磁盘 |
| `dd if=... of=/dev/sd*` | 写设备 |
| `> /dev/sd*` | 重定向到设备 |
| `mkfs` / `fdisk` | 格式化 / 分区 |
| `chmod -R 777 /` | 全局权限破坏 |
| `:(){ :\|:& };:` | fork bomb |
| `curl ... \| sh` / `wget ... \| bash` | 下载执行不可信代码 |
| `sudo ` 开头的命令 | 提权（默认拒绝，用户级别命令不应需要 sudo） |
| `git push --force` 到 main / master / dev 分支 | 强制推主分支（默认拒绝） |
| `git reset --hard` 含 `origin/` 的远程引用 | 重置到远程分支会丢本地工作 |

**拦截后返回**：
```json
{
  "success": false,
  "rejected": true,
  "reason": "DANGEROUS_COMMAND",
  "rule": "rm-rf-root",
  "explanation": "命令模式 'rm -rf /' 在危险命令黑名单中，工具拒绝执行。",
  "originalCommand": "rm -rf /tmp",
  "suggestion": "如果你确实想清理临时文件，请明确指定路径并不带 -rf 通配符。"
}
```

### 五、命令重写规则（替代 GNU 命令）

Agent 经常生成 GNU 风命令，工具应**直接拒绝**并给出建议（不是自动改写——避免改错），让 agent 用专用工具：

| Agent 生成 | 工具响应 |
|-----------|---------|
| `cat foo.txt` | 拒绝，建议用 `read_file` |
| `find . -name "*.ts"` | 拒绝，建议用 `file_search` |
| `grep "pattern" file` | 拒绝，建议用 `grep_search` |
| `mkdir -p dir/sub` | 拒绝，建议用 `fs_write`（写文件时自动建目录）|
| `echo "x" > file` | 拒绝，建议用 `fs_write` |
| `cd <dir> && <cmd>` | 拒绝，建议用 `cwd` 参数 |
| `cat << EOF\n...\nEOF`（heredoc） | 拒绝，建议写临时文件再调用 |
| `<lang> -c "<multi-line>"` | 拒绝，建议写临时脚本文件 |

### 六、长跑命令的强制超时包装

任何**已知会跑超过 30 秒**的命令必须有 OS 级 timeout：

#### Windows pwsh

```powershell
$job = Start-Job -ScriptBlock { Set-Location $using:PWD; <ORIGINAL_COMMAND> 2>&1 }
if (Wait-Job $job -Timeout <TIMEOUT_SECONDS>) {
  Receive-Job $job
  Remove-Job $job
} else {
  Stop-Job $job
  Receive-Job $job
  Remove-Job $job -Force
  Write-Host "TIMEOUT_AFTER_<TIMEOUT_SECONDS>s"
  exit 1
}
```

#### macOS / Linux

```bash
timeout <TIMEOUT_SECONDS> bash -c '<ORIGINAL_COMMAND>'
# 退出码 124 = 超时被 SIGTERM
# 退出码 137 = SIGKILL（双保险）
```

#### sf_safe_bash 内部双层超时

```
工具级 hard timeout（process.kill SIGKILL）：必返回，agent 不死等
   ┌──────────────────────────────────────┐
   │ shell 级 timeout（Start-Job/timeout） │   ← 比工具级短 5-10 秒
   │   ┌──────────────────────────────────┐│
   │   │ 命令本身（bun test / npm install） ││
   │   └──────────────────────────────────┘│
   └──────────────────────────────────────┘
```

**内层短于外层**，让最具体的错误先返回。

### 七、自动包装规则

某些命令工具**自动**加超时包装（agent 不需要记）：

| 命令模式 | 自动包装 |
|---------|---------|
| `bun test` | 90 秒 timeout（Start-Job） |
| `bun run test` | 90 秒 timeout |
| `npm test` / `pnpm test` / `yarn test` | 90 秒 timeout |
| `npm install` / `pnpm install` | 5 分钟 timeout |
| `bun install` | 3 分钟 timeout |
| `bun run build` / `npm run build` | 3 分钟 timeout |
| `cargo build` / `cargo test` | 5 分钟 timeout |
| `git clone` | 5 分钟 timeout |
| `docker build` | 10 分钟 timeout |

任何在工具的 `args.timeoutMs` 显式指定的 timeout 优先于自动包装。

### 八、stdout/stderr 必须分离

**禁止合并到 stdout**（即不要 `2>&1`），原因：
- agent 需要区分"警告但成功"vs"真失败"
- 编译器警告通常在 stderr，错误也在 stderr，但是用 exitCode === 0 区分

工具返回结构必须分开：

```json
{
  "stdout": "Built 5 files in 1.2s\n",
  "stderr": "warning: deprecated API\n",
  "exitCode": 0,
  "durationMs": 1200
}
```

### 九、退出码语义统一

| exitCode | 含义 | agent 该做什么 |
|----------|------|--------------|
| 0 | 成功 | 继续 |
| 1 | 通用错误 | 看 stderr 决定怎么修 |
| 2 | 误用（参数错误） | 检查命令语法 |
| 124 | 超时（Linux timeout 命令） | 检查是否资源泄漏，加 Start-Job |
| 126 | 命令找不到（不可执行） | 检查工具是否在 PATH |
| 127 | 命令找不到 | 同上 |
| 130 | Ctrl+C 中断 | 通常是用户主动终止 |
| 137 | SIGKILL（被强杀） | 内存超限或工具级 timeout 触发 |
| -1 / null | 子进程异常死亡（spawn 失败） | 工具级问题，检查 spawn 参数 |

工具返回时**不**改写 exitCode，原样传给 agent，agent 看 hint 字段决定怎么办。

### 十、路径处理跨平台规则

#### 必须做的

1. **路径含空格强制引号**：
   ```powershell
   bun build --out 'C:\Program Files\out'  # ✅
   bun build --out C:\Program Files\out    # ❌ 断成两个参数
   ```

2. **使用 `cwd` 参数而不是 `cd <dir>`**：
   ```
   sf_safe_bash(command="bun build", cwd="C:\\Program Files\\项目")
   ```

3. **避免反斜杠转义陷阱**：
   - pwsh：双引号字符串里反斜杠**不**转义（`"C:\foo\bar"` OK）
   - bash：双引号字符串里反斜杠**会**转义（必须 `"C:\\foo\\bar"`）
   - **建议**：传给工具时统一用 `\` 或 `/`，由工具内部处理

4. **`~` 解析必须在工具层做**：
   ```typescript
   if (cwd.startsWith('~')) {
     cwd = path.join(os.homedir(), cwd.slice(1));
   }
   ```
   不要把 `~` 传给 shell，因为 cmd 不识别。

#### 必须拒绝的

- 包含未转义的 `$VAR` 或 `${VAR}`（除非显式声明使用环境变量）
- 包含未转义的 `\`` 反引号
- 包含未匹配的引号
- 路径出现 `..` 试图逃出工作目录（除非显式 allow）

### 十一、并发执行规则

| 维度 | 规则 |
|------|------|
| 不同 agent 之间 | 完全独立，**默认无并发限制**（每个调用独立子进程） |
| 同一 agent 内顺序调用 | 串行执行（agent 在 LLM 推理时一次出一个 tool_call） |
| 同一 agent 内 task 派多个 subagent | subagent 内部各自调用 sf_safe_bash，**真正并发** |
| **重命令并发限制** | 全局 semaphore，最多 N 个同时跑。N 默认 = CPU 核数 |

**重命令清单**：`bun install`、`npm install`、`pnpm install`、`bun run build`、`bun test`、`cargo build` —— 这些会大量占 CPU/磁盘 IO，并发跑会互相拖垮。

### 十二、命令审计日志

每次 sf_safe_bash 调用**异步**追加一行 JSON 到 `~/.specforge/logs/shell-history.jsonl`：

```json
{
  "schema_version": "1.0",
  "ts": "2026-05-19T10:30:45.123Z",
  "agent": "sf-executor",
  "session_id": "WI-001-sf-executor-3",
  "command": "bun test packages/cli/tests/foo.test.ts",
  "cwd": "D:\\code\\temp\\SpecForge",
  "shell": "pwsh",
  "exitCode": 0,
  "durationMs": 2300,
  "rejected": false,
  "timeout": false,
  "stdout_size": 1024,
  "stderr_size": 0
}
```

**好处**：
- 调试时能看到"agent 跑过哪些命令"
- 性能分析（哪个命令最慢）
- 审计敏感操作

**异步写入**：不阻塞主流程，写失败仅打 warning 不影响命令执行。

---

## 错误返回格式（agent 必须能看懂）

所有 sf_safe_bash 返回的 JSON 都遵守同一 schema：

### 字段定义

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | true = exitCode 0 且未被拦截；false = 失败 |
| `exitCode` | number \| null | 子进程退出码 |
| `stdout` | string | 标准输出（截断到 4KB，超长部分写文件并给路径） |
| `stderr` | string | 标准错误（同上） |
| `durationMs` | number | 执行耗时 |
| `command` | string | 实际执行的命令（含自动包装） |
| `cwd` | string | 实际工作目录 |
| `shell` | string | 使用的 shell 名 |
| `rejected` | boolean | true = 被规则引擎拒绝（未真正执行） |
| `timeout` | boolean | true = 超时被强杀 |
| `rule` | string | rejected=true 时填命中的规则 ID |
| `suggestion` | string | rejected/timeout 时填可操作建议 |
| `hint` | string | 排错提示（不一定有，但失败时尽量给） |

### 典型返回

**正常成功**：
```json
{
  "success": true,
  "exitCode": 0,
  "stdout": "Built 5 files\n",
  "stderr": "",
  "durationMs": 1234,
  "command": "bun run build",
  "cwd": "D:\\code\\temp\\SpecForge\\packages\\cli",
  "shell": "pwsh",
  "rejected": false,
  "timeout": false
}
```

**业务失败**：
```json
{
  "success": false,
  "exitCode": 1,
  "stdout": "",
  "stderr": "TypeError: Cannot read property 'foo' of undefined\n",
  "durationMs": 450,
  "command": "bun test packages/cli/tests/foo.test.ts",
  "cwd": "D:\\code\\temp\\SpecForge",
  "shell": "pwsh",
  "rejected": false,
  "timeout": false,
  "hint": "测试失败。检查 stderr 中的错误堆栈。"
}
```

**超时**：
```json
{
  "success": false,
  "exitCode": null,
  "stdout": "PASS tests/foo.test.ts (5/30)\n",
  "stderr": "",
  "durationMs": 90000,
  "command": "bun test packages/cli",
  "cwd": "D:\\code\\temp\\SpecForge",
  "shell": "pwsh",
  "rejected": false,
  "timeout": true,
  "timeoutMs": 90000,
  "hint": "命令在 90 秒内未完成已被 SIGKILL 强制终止。可能原因：(1) 测试代码有异步资源泄漏导致进程不退出 (2) 死锁 (3) 网络请求挂起。建议：检查 vitest.config.ts 是否含 pool: 'forks'；如有泄漏问题参见 docs/engineering-lessons/universal/javascript-explicit-resource-management.md。"
}
```

**规则拒绝**：
```json
{
  "success": false,
  "exitCode": null,
  "stdout": "",
  "stderr": "",
  "durationMs": 0,
  "command": "cd packages/cli && bun run build",
  "cwd": null,
  "shell": null,
  "rejected": true,
  "rule": "no-cd-in-command",
  "suggestion": "请用 cwd 参数：sf_safe_bash(command='bun run build', cwd='packages/cli')。"
}
```

**危险命令拦截**：
```json
{
  "success": false,
  "rejected": true,
  "rule": "dangerous-rm-rf",
  "explanation": "命令模式 'rm -rf' 配合 '/' 或 '~' 在危险命令黑名单中。",
  "originalCommand": "rm -rf ~/some-dir",
  "suggestion": "如果你确实要删除该目录，请使用绝对路径并加 --confirm 参数（暂未实现，需要先在工具层批准这条命令）。"
}
```

---

## 预防机制

### 项目层

#### 步骤 1（必做）：实现 sf_safe_bash 工具

按本文规则实现 `.opencode/tools/sf_safe_bash.ts`，包含：
- host-profile 读取
- 规则引擎（危险命令、命令重写、heredoc 拦截、cd 拦截）
- shell 选择（pwsh 优先）
- 编码注入（UTF-8）
- 双层 timeout
- 结构化返回
- 审计日志

#### 步骤 2（必做）：禁用所有 agent 的 bash 权限

每个 agent.md 改：
```yaml
permission:
  bash: deny      # ← 禁用 OpenCode 内置 bash
  # sf_safe_bash 是自定义工具，默认所有 agent 可用，不需要显式列出
```

唯一例外：sf_safe_bash 工具自身实现里 spawn 子进程时**不**走 OpenCode bash，所以这个限制不影响功能。

#### 步骤 3（必做）：注入硬规则到 OpenCode AGENTS.md

在 `~/.config/opencode/AGENTS.md` 加一段：

```markdown
## Shell 命令执行硬规则

执行任何 shell 命令必须使用 sf_safe_bash 工具。

绝对禁止：
- 试图找别的方式执行 shell（OpenCode 内置 bash 已禁用）
- 在命令里使用 cd（用 cwd 参数）
- 使用 cat/find/grep/mkdir 系统命令（用对应专用工具）
- 裸跑 bun test / npm install 等长跑命令（工具会自动包装超时）

工具返回 JSON，含 success/exitCode/stdout/stderr/hint。
失败时看 hint 字段决定下一步。
被 rejected 时按 suggestion 字段调整后重试。
```

#### 步骤 4（推荐）：审计 agent prompt 是否有"用 cd"等错误示例

```bash
grep -rn "cd\s\+.*&&\|cd\s\+.*;" .opencode/agents/ .kiro/steering/
```

发现就改成 cwd 参数示例。

### 工具层

工具自身的代码层强制规则比 prompt 注入更可靠：

- 危险命令黑名单 → 代码层匹配（regex）
- 命令重写建议 → 代码层匹配
- timeout → 代码层 race
- 编码 → 代码层 spawn 时注入

prompt 是辅助提醒，**真正不让 agent 翻车的是代码**。

---

## 相关错误

同根因可能撞到的其他症状：

| 症状 | 解决参考 |
|------|---------|
| Kiro execute_pwsh 报"cd is not supported" | [kiro-execute-pwsh-constraints](../ai-tools/kiro/execute-pwsh-constraints.md) |
| `bun test` 卡死不返回 | 本文 + [async-resource-lifecycle](async-resource-lifecycle.md) D2 |
| 中文输出乱码 | 本文"编码强制 UTF-8" |
| 找不到 git/bun 等命令 | 本文 + [host-environment-detection](host-environment-detection.md) |
| 路径有空格命令断开 | 本文"路径处理跨平台规则" |
| 跨平台 grep/find 不工作 | 本文"命令重写规则" |
| 命令产生大量输出导致上下文炸 | stdout/stderr 截断到 4KB（本文返回字段） |

---

## 参考

- 互补经验：[host-environment-detection](host-environment-detection.md) — 规定如何探测和写入 host-profile
- 互补经验：[async-resource-lifecycle](async-resource-lifecycle.md) — 资源泄漏导致 bun test 卡死的根因
- 工具实现：`.opencode/tools/sf_safe_bash.ts`
- 配置文件：`~/.specforge/host-profile.json`、`~/.specforge/shell-config.json`
- 审计日志：`~/.specforge/logs/shell-history.jsonl`
