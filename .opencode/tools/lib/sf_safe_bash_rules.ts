/**
 * sf_safe_bash 规则引擎（完整版）
 *
 * 三类规则：
 * 1. **拒绝规则（reject）**：命令违反硬约束，直接拦截
 *    - 危险命令黑名单（rm -rf / / format / fork bomb / dd 等）
 *    - cd 改工作目录
 *    - cat/find/grep/mkdir（应该用专用工具）
 *    - heredoc / 多行内联
 *
 * 2. **重写规则（rewrite）**：命令本身合法，但需要包装/调整
 *    - bun test / npm test 自动加 Start-Job + Wait-Job
 *    - npm install / bun install 调长 timeout
 *
 * 3. **环境感知拒绝（env-reject）**：基于 host-profile 拒绝调用不可用工具
 *
 * 详细规范见 docs/engineering-lessons/universal/shell-command-execution.md
 */

import type { RuleResult, RejectionResult, RewriteResult } from "./sf_safe_bash_types"
import type { HostProfile } from "./sf_safe_bash_core"

/**
 * 规则函数签名
 */
type Rule = (command: string, profile: HostProfile) => RuleResult

/**
 * 应用所有规则
 *
 * 命中第一个非 pass 规则即返回。规则按数组顺序短路评估。
 */
export function applyRules(command: string, profile: HostProfile): RuleResult {
  for (const rule of RULES) {
    const result = rule(command, profile)
    if (result.kind !== "pass") return result
  }
  return { kind: "pass" }
}

// 便捷构造函数
const reject = (rejection: RejectionResult): RuleResult => ({ kind: "reject", rejection })
const rewrite = (rewrite: RewriteResult): RuleResult => ({ kind: "rewrite", rewrite })
const pass: RuleResult = { kind: "pass" }

// ============================================================
// 规则 1：危险命令黑名单（最优先）
// ============================================================

const ruleDangerousCommands: Rule = command => {
  const trimmed = command.trim()

  // rm -rf 根目录或 /*
  if (
    /\brm\s+-[rRf]+\s+\/(\s|$)/.test(trimmed) ||
    /\brm\s+-[rRf]+\s+\/\*/.test(trimmed)
  ) {
    return reject({
      rule: "dangerous-rm-rf-root",
      reason: "禁止 rm -rf 根目录或 /*。",
      suggestion: "如果你要清理具体目录，请用绝对路径并避免通配符：rm -rf /specific/path/。",
      hint: "这是不可逆操作。工具不会执行任何 rm -rf / 形式的命令。",
    })
  }

  // rm -rf ~ / $HOME
  if (/\brm\s+-[rRf]+\s+(~|\$HOME)(\s|\/|$)/.test(trimmed)) {
    return reject({
      rule: "dangerous-rm-rf-home",
      reason: "禁止 rm -rf ~ 或 $HOME。",
      suggestion: "如要清理 home 下特定目录，用绝对路径：rm -rf /Users/xxx/specific-dir。",
      hint: "误删整个 home 后果严重。工具拒绝执行。",
    })
  }

  // Windows: Remove-Item 删驱动器根
  if (/Remove-Item\s+.*-Recurse\s+.*-Force\s+\w:\\?(\s|$)/i.test(trimmed)) {
    return reject({
      rule: "dangerous-remove-item-drive-root",
      reason: "禁止 Remove-Item 删除驱动器根目录。",
      suggestion: "请指定具体子路径。",
      hint: "工具拒绝执行驱动器根目录的递归删除。",
    })
  }

  // sudo
  if (/^sudo\s+/.test(trimmed)) {
    return reject({
      rule: "dangerous-sudo",
      reason: "禁止使用 sudo。",
      suggestion: "用户级开发任务不应需要提权。如需修改系统级配置，请用户手动操作。",
      hint: "工具不允许 agent 提权操作，避免误改系统状态。",
    })
  }

  // curl/wget 管道执行
  if (/(curl|wget|fetch|iwr|invoke-webrequest)\s+.*\|\s*(sh|bash|zsh|pwsh|powershell|iex)/i.test(trimmed)) {
    return reject({
      rule: "dangerous-pipe-to-shell",
      reason: "禁止下载内容直接管道执行。",
      suggestion: "先下载到本地查看：curl -o /tmp/installer.sh URL，检查内容后再执行。",
      hint: "管道执行远程脚本是严重安全风险。",
    })
  }

  // 格式化磁盘
  if (/\b(format|mkfs(\.\w+)?|fdisk|diskpart|wipefs)\s/i.test(trimmed)) {
    return reject({
      rule: "dangerous-disk-format",
      reason: "禁止格式化或分区操作。",
      suggestion: "磁盘管理操作请用户手动执行。",
      hint: "工具拒绝任何磁盘破坏性操作。",
    })
  }

  // dd 写设备
  if (/\bdd\s+.*\b(of=\/dev\/(sd|nvme|hd|disk|mmcblk))/i.test(trimmed)) {
    return reject({
      rule: "dangerous-dd-to-device",
      reason: "禁止 dd 写入设备文件。",
      suggestion: "如需写入磁盘镜像或设备，请用户手动执行并加 sudo。",
      hint: "dd 写错设备会瞬间销毁整个磁盘。工具拒绝任何 of=/dev/* 形式的命令。",
    })
  }

  // 重定向到设备文件
  if (/>\s*\/dev\/(sd|nvme|hd|disk|mmcblk)/.test(trimmed)) {
    return reject({
      rule: "dangerous-redirect-to-device",
      reason: "禁止重定向到设备文件。",
      suggestion: "如需写入设备，请用户手动执行。",
      hint: "重定向到 /dev/sd* 等会破坏磁盘数据。",
    })
  }

  // chmod -R 777 / 或 //
  if (/\bchmod\s+-R\s+777\s+\/(\s|$)/.test(trimmed)) {
    return reject({
      rule: "dangerous-chmod-777-root",
      reason: "禁止 chmod -R 777 根目录。",
      suggestion: "请指定具体目录：chmod -R 777 /your/specific/path。",
      hint: "全局放开权限会破坏系统安全。",
    })
  }

  // fork bomb
  if (/:\(\)\s*\{\s*:\|:&?\s*\}\s*;\s*:/.test(trimmed)) {
    return reject({
      rule: "dangerous-fork-bomb",
      reason: "检测到 fork bomb 模式。",
      suggestion: "工具拒绝执行任何 fork bomb 形式的命令。",
      hint: "fork bomb 会瞬间耗尽系统资源。",
    })
  }

  // git push --force（不带 --force-with-lease）
  if (
    /git\s+push\s+(--force|-f)(\s|$)/.test(trimmed) &&
    !/--force-with-lease/.test(trimmed)
  ) {
    return reject({
      rule: "dangerous-git-push-force",
      reason: "禁止 git push --force（不带 --force-with-lease）。",
      suggestion: "用 git push --force-with-lease 替代。它会在远程被改时失败，更安全。",
      hint: "--force 会无条件覆盖远程分支，可能导致他人工作丢失。--force-with-lease 在远程被改时会失败，更安全。",
    })
  }

  // git reset --hard origin/...（重置到远程分支会丢本地工作）
  if (/git\s+reset\s+--hard\s+origin\//.test(trimmed)) {
    return reject({
      rule: "dangerous-git-reset-hard-origin",
      reason: "禁止 git reset --hard 到远程分支引用。",
      suggestion: "如确实想丢弃本地工作，先备份当前分支：git branch backup-$(date +%s)，然后执行 reset。",
      hint: "git reset --hard origin/main 会无条件丢弃所有本地未提交的修改。",
    })
  }

  return pass
}

// ============================================================
// 规则 2：cd 改工作目录拦截
// ============================================================

const ruleNoCdInCommand: Rule = command => {
  // 匹配开头 / ; / && / & / 换行后的 cd
  if (/(^|[;&\n]|&&)\s*cd\s+\S/.test(command)) {
    return reject({
      rule: "no-cd-in-command",
      reason: "禁止在命令里使用 cd 改变工作目录。",
      suggestion: "请用 cwd 参数指定工作目录：sf_safe_bash(command='your-cmd', cwd='target-dir')。",
      hint: "cd 在命令拼接中常见但脆弱：路径含特殊字符会断、cd 失败时后续命令仍执行、跨平台行为不一致。cwd 参数由工具层处理这些边界情况。",
    })
  }
  return pass
}

// ============================================================
// 规则 3：heredoc / 多行内联
// ============================================================

const ruleNoHeredoc: Rule = command => {
  if (/<<\s*['"]?[A-Z_]+['"]?/.test(command)) {
    return reject({
      rule: "no-heredoc",
      reason: "禁止使用 heredoc 语法（<<EOF）。",
      suggestion:
        "把多行内容写到临时文件，再用命令调用：fs_write(path='/tmp/script.sh', text='...') + sf_safe_bash(command='bash /tmp/script.sh')。",
      hint: "heredoc 在受控壳中解析复杂，跨平台不兼容。",
    })
  }

  if (/-c\s+["'][^"']*\n/.test(command)) {
    return reject({
      rule: "no-multiline-inline",
      reason: "禁止使用 -c 跑多行内联代码。",
      suggestion:
        "把代码写到临时文件，再调用：fs_write(path='/tmp/script.py', text='...') + sf_safe_bash(command='python /tmp/script.py')。",
      hint: "多行 -c 在 Windows / 受控壳里会被截断或解析错。",
    })
  }

  return pass
}

// ============================================================
// 规则 4：用专用工具替代系统命令
// ============================================================

const ruleUseDedicatedTools: Rule = command => {
  const trimmed = command.trim()

  // cat foo.txt（不是 cat << EOF，那个独立规则处理）
  // 排除 cat | xxx（管道场景，agent 可能在用 cat 拼接）
  if (/^cat\s+[^<|]/.test(trimmed) && !trimmed.includes("|")) {
    return reject({
      rule: "use-read-file-instead-of-cat",
      reason: "不要用 cat 读文件。",
      suggestion: "使用 read_file 工具读取文件内容：read_file(path='your-file')。",
      hint: "cat 在 Windows cmd 上不存在。read_file 跨平台、支持行号范围、有内置截断。",
    })
  }

  // find . -name 这种
  if (/^find\s+\S+\s+(-name|-type|-path|-iname)/.test(trimmed)) {
    return reject({
      rule: "use-file-search-instead-of-find",
      reason: "不要用 find 搜索文件。",
      suggestion: "使用 file_search 工具：file_search(query='*.ts', includePattern='src/**')。",
      hint: "find 在 Windows 上语法不同（没有 GNU find）。file_search 跨平台、底层用 ripgrep 更快。",
    })
  }

  // grep "pattern" file（但允许 ... | grep 这种管道用法）
  if (/^grep\s+/.test(trimmed)) {
    return reject({
      rule: "use-grep-search-instead-of-grep",
      reason: "不要用 grep 搜索内容。",
      suggestion: "使用 grep_search 工具：grep_search(query='pattern', includePattern='**/*.ts')。",
      hint: "grep 在 Windows cmd 上不存在。grep_search 用 ripgrep，跨平台 + 更快 + 自动尊重 .gitignore。",
    })
  }

  // mkdir -p ...
  if (/^mkdir\s+(-p\s+)?\S/.test(trimmed)) {
    return reject({
      rule: "use-fs-write-instead-of-mkdir",
      reason: "不要用 mkdir 单独创建目录。",
      suggestion: "使用 fs_write 工具创建文件时会自动建目录：fs_write(path='dir/sub/file.txt', text='...')。",
      hint: "如果只需要空目录占位，写一个 .gitkeep 文件即可。",
    })
  }

  // echo "..." > file
  if (/^echo\s+.+\s*>\s*\S/.test(trimmed)) {
    return reject({
      rule: "use-fs-write-instead-of-echo-redirect",
      reason: "不要用 echo + > 写文件。",
      suggestion: "使用 fs_write 工具：fs_write(path='your-file', text='content')。",
      hint: "echo 在 Windows cmd 上对引号转义处理不同；fs_write 跨平台。",
    })
  }

  return pass
}

// ============================================================
// 规则 5：自动包装长跑命令（rewrite）
// ============================================================

/**
 * 长跑命令清单 + 推荐 timeout
 *
 * 这些命令会被自动包装成 PowerShell Start-Job + Wait-Job 形式（仅 Windows pwsh/powershell）。
 * 在 Unix 上目前不做包装（bash 自身有 timeout 命令但跨发行版不一定可用，依赖工具级 timeout 兜底）。
 */
const LONG_RUNNING_PATTERNS: Array<{ pattern: RegExp; timeoutSec: number; name: string }> = [
  { pattern: /^bun\s+(run\s+)?test(\s|$)/, timeoutSec: 90, name: "bun test" },
  { pattern: /^bun\s+(run\s+)?build(\s|$)/, timeoutSec: 180, name: "bun run build" },
  { pattern: /^bun\s+install(\s|$)/, timeoutSec: 180, name: "bun install" },
  { pattern: /^npm\s+test(\s|$)/, timeoutSec: 90, name: "npm test" },
  { pattern: /^pnpm\s+test(\s|$)/, timeoutSec: 90, name: "pnpm test" },
  { pattern: /^yarn\s+test(\s|$)/, timeoutSec: 90, name: "yarn test" },
  { pattern: /^npm\s+install(\s|$)/, timeoutSec: 300, name: "npm install" },
  { pattern: /^pnpm\s+install(\s|$)/, timeoutSec: 300, name: "pnpm install" },
  { pattern: /^npm\s+run\s+build(\s|$)/, timeoutSec: 180, name: "npm run build" },
  { pattern: /^pnpm\s+run\s+build(\s|$)/, timeoutSec: 180, name: "pnpm run build" },
  { pattern: /^cargo\s+(test|build|run)(\s|$)/, timeoutSec: 300, name: "cargo build/test" },
  { pattern: /^git\s+clone(\s|$)/, timeoutSec: 300, name: "git clone" },
  { pattern: /^docker\s+build(\s|$)/, timeoutSec: 600, name: "docker build" },
]

/**
 * 自动包装规则
 *
 * - 仅对 Windows pwsh/powershell shell 生效（cmd 的 Start-Job 太弱不实用）
 * - 仅当命令开头匹配 LONG_RUNNING_PATTERNS 时触发
 * - 已经被 Start-Job 包裹的命令不再二次包装
 */
const ruleAutoWrap: Rule = (command, profile) => {
  const shell = profile.shell_rules.preferred_shell
  if (shell !== "pwsh" && shell !== "powershell") return pass

  // 命令已经被 Start-Job 包裹，不再处理
  if (/Start-Job\s+/i.test(command)) return pass

  const trimmed = command.trim()
  const match = LONG_RUNNING_PATTERNS.find(p => p.pattern.test(trimmed))
  if (!match) return pass

  const wrappedCommand = wrapWithStartJob(trimmed, match.timeoutSec)

  return rewrite({
    rule: "auto-wrap-long-running",
    rewrittenCommand: wrappedCommand,
    // 工具级 timeout 比 shell 级多 10s，确保 shell 级先触发，给出精确错误
    adjustedTimeoutMs: (match.timeoutSec + 10) * 1000,
    explanation: `检测到长跑命令 ${match.name}，已自动用 Start-Job + Wait-Job ${match.timeoutSec}s 包裹，避免命令卡死整个会话。如需调整超时，请显式传 timeoutMs 参数。`,
  })
}

/**
 * 把命令包装成 Start-Job + Wait-Job 形式
 */
function wrapWithStartJob(command: string, timeoutSec: number): string {
  // 转义命令中的单引号（PowerShell 单引号字符串只需要把单引号写成 ''）
  const escaped = command.replace(/'/g, "''")
  return [
    `$job = Start-Job -ScriptBlock { Set-Location $using:PWD; ${command} 2>&1 }`,
    `if (Wait-Job $job -Timeout ${timeoutSec}) {`,
    `  Receive-Job $job`,
    `  $exitCode = if ($job.State -eq 'Completed') { 0 } else { 1 }`,
    `  Remove-Job $job`,
    `  exit $exitCode`,
    `} else {`,
    `  Stop-Job $job`,
    `  Receive-Job $job`,
    `  Remove-Job $job -Force`,
    `  Write-Error "TIMEOUT_AFTER_${timeoutSec}s: ${escaped.replace(/"/g, '\\"')}"`,
    `  exit 124`,
    `}`,
  ].join("\n")
}

// ============================================================
// 规则 6：不可用工具拦截（基于 host-profile）
// ============================================================

/**
 * 命令开头是不可用工具时拦截。
 *
 * 这条规则**不会**因为 host-profile 探测漏掉某个工具就误拦截：
 * - 只检查 STANDARD_TOOLS 中明确探测过的工具
 * - 探测过且 available=false 才拦截
 * - host-profile 没有这个工具的记录时（例如 perl、sed 等没在标准列表里）→ pass
 */
const ruleUnavailableTool: Rule = (command, profile) => {
  // 提取命令第一个 token（去掉前缀变量赋值、引号等）
  const trimmed = command.trim()

  // 提取第一个非空 word 作为工具名候选
  // 注意：跳过 PowerShell 特有的 cmdlet（含 - 的，如 Get-CimInstance）
  const firstToken = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*)/)?.[1]
  if (!firstToken) return pass

  // PowerShell cmdlet 跳过（含 - 且首字母大写）
  if (firstToken.includes("-") && /^[A-Z]/.test(firstToken)) return pass

  // 在 host-profile 工具表中查找
  const toolInfo = profile.tools[firstToken.toLowerCase()]
  if (!toolInfo) return pass // 没探测过这个工具，不干预
  if (toolInfo.available) return pass

  // 探测过 + 不可用 → 拒绝
  return reject({
    rule: "tool-not-available",
    reason: `命令依赖的工具 '${firstToken}' 在当前机器不可用。`,
    suggestion: getInstallSuggestion(firstToken, profile.os.platform),
    hint: `host-profile 显示该工具未安装：${toolInfo.note || "(未安装)"}`,
  })
}

/**
 * 给常见工具的安装建议
 */
function getInstallSuggestion(tool: string, platform: NodeJS.Platform): string {
  const lc = tool.toLowerCase()

  if (platform === "win32") {
    const winInstall: Record<string, string> = {
      bun: "安装 bun: powershell -c \"irm bun.sh/install.ps1 | iex\" 或 npm install -g bun",
      node: "从 https://nodejs.org 下载安装",
      git: "从 https://git-scm.com/download/win 下载安装",
      pnpm: "npm install -g pnpm",
      yarn: "npm install -g yarn",
      rg: "scoop install ripgrep / winget install BurntSushi.ripgrep.MSVC",
      python: "从 https://python.org 下载安装",
      docker: "从 https://docker.com/products/docker-desktop 下载安装",
      jq: "scoop install jq / winget install jqlang.jq",
      gh: "scoop install gh / winget install GitHub.cli",
    }
    if (lc in winInstall) return winInstall[lc]
    return `请安装 ${tool}（参考 https://winget.run 搜索）。安装后运行 'bun run scripts/scan-host-profile.ts --force' 刷新档案。`
  }

  if (platform === "darwin") {
    return `请用 brew 安装：brew install ${tool}。安装后运行 'bun run scripts/scan-host-profile.ts --force' 刷新档案。`
  }

  // linux
  return `请用包管理器安装 ${tool}（apt/yum/dnf）。安装后运行 'bun run scripts/scan-host-profile.ts --force' 刷新档案。`
}

// ============================================================
// 规则列表（按优先级排序）
// ============================================================

const RULES: Rule[] = [
  // 1. 危险命令最优先（即使工具不可用也要先检测危险性）
  ruleDangerousCommands,
  // 2. cd 拦截
  ruleNoCdInCommand,
  // 3. heredoc / 多行内联
  ruleNoHeredoc,
  // 4. 工具替代
  ruleUseDedicatedTools,
  // 5. 不可用工具拦截（在重写前检查，避免给不可用工具加包装）
  ruleUnavailableTool,
  // 6. 自动包装长跑命令（最后，因为它会改写命令）
  ruleAutoWrap,
]
