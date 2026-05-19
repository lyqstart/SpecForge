---
id: host-environment-detection
scope: universal
roles: [executor, orchestrator, debugger, architect]
severity: high
tags: [host-profile, environment-scan, shell-detection, encoding, locale, cross-platform]
created: 2026-05-19
updated: 2026-05-19
related: [shell-command-execution]
---

# 宿主机环境探测与 host-profile 规范

> **来源**：SpecForge V6 中 agent 在不同机器上跑同一段命令出现完全不同结果（中文乱码、shell 不存在、工具找不到、路径分隔符错）的根因抽象。
> **适用范围**：所有需要在用户机器上执行命令、读写文件、调用外部工具的项目。
> **与 [shell-command-execution](shell-command-execution.md) 关系**：本文规定**怎么探测环境并写入档案**，对方规定**怎么按档案执行命令**。两者一起用：先探测、写档案，命令执行工具读档案后按档案规则跑。

---

## 症状

### 场景 1：同一段命令在不同机器表现不同

```
Agent 在开发者 A 的机器（Mac）写：
  grep -r "TODO" src/

复制到开发者 B 的机器（Windows）跑：
  → 'grep' 不是内部或外部命令
  
Agent 重写：
  Get-ChildItem src -Recurse | Select-String "TODO"

复制回开发者 A：
  → 'Get-ChildItem' command not found
```

### 场景 2：中文 Windows 用户的命令输出乱码

```
Agent 调用 bun run build：
  鉂?error TS2304: Cannot find name '锛佽妭鐐?

Agent 看不懂错误，反复重试，反复乱码。
```

### 场景 3：工具版本不匹配

```
Agent 写：
  bun test --bail

旧版 bun 不支持 --bail，报错。
但 agent 不知道用户装的是旧版，继续生成新语法的命令。
```

### 场景 4：时区导致 timestamp 比对失败

```
Agent 检查 cache 是否过期：
  if (cacheTime < Date.now() - 3600000) // 1 小时

但 agent 上次执行命令的 timestamp 是用户本地时间，
agent 当前推理用的是 UTC，差了 8 小时，永远判定为过期。
```

### 场景 5：找不到工具就直接装

```
Agent 发现 ripgrep 没装：
  npm install -g ripgrep

但其实用户已经通过 winget 装了 ripgrep，
agent 装了一份重复的，污染 PATH。
```

---

## 根因

### 一、Agent 不知道自己跑在哪

LLM 的训练数据偏向 Linux/Mac，默认假设：
- shell 是 bash
- PATH 里有 grep/find/cat/curl
- 编码是 UTF-8
- 路径用 `/` 分隔
- 时区是 UTC

但实际用户机器**几乎从来不满足所有假设**。

### 二、每次推理都靠猜，没有持久状态

Agent 在推理时不会主动跑 `uname` / `bun --version` 来探测——这要消耗 tool 调用回合，太昂贵。所以它**每次都按训练数据猜**，猜错就翻车，翻车就重试，重试还按训练数据再猜，**陷入死循环**。

### 三、shell 工具描述里没有环境信息

OpenCode 的 bash 工具描述只有"execute shell commands"，没说：
- 用什么 shell？
- 编码是？
- 哪些命令可用？
- 路径风格？

Agent 看到工具就**默认用 bash 风格**生成命令。

### 四、用户配置 PATH 不可预测

PATH 里有什么完全是用户决定的：
- 装了 git bash 的 Windows 用户有 Unix 化的 grep
- 装了 Cygwin 的可能有 Linux 风工具但行为奇怪
- 用 winget / scoop / chocolatey 装的工具路径各不相同
- macOS 用户可能用 brew 装的工具覆盖系统命令

### 五、工具版本差异隐藏 bug

`bun 1.2 vs 1.3` 部分 flag 不同；`git 2.20+` 才支持某些 subcommand；`pwsh 7.0 vs 7.4` 行为差异。Agent 不知道版本就盲目生成新语法。

---

## 解决方案

核心思路：**在系统启动时**（OpenCode 启动 / 工具首次调用）扫描宿主机环境，写入持久化档案，**所有 shell 命令执行时读档案决策**。

### 一、host-profile.json 数据模型

存储位置：`~/.specforge/host-profile.json`

完整结构（字段全必填，缺则走探测）：

```json
{
  "schema_version": "1.0",
  "scanned_at": "2026-05-19T10:30:00.000Z",
  "scanner_version": "6.0.0",
  
  "os": {
    "platform": "win32",
    "release": "10.0.26100",
    "version": "Windows 11 Pro 24H2",
    "arch": "x64",
    "totalmem_gb": 32,
    "cpu_count": 16
  },
  
  "locale": {
    "system_lang": "zh-CN",
    "console_codepage": 936,
    "encoding": "UTF-8",
    "timezone": "Asia/Shanghai",
    "tz_offset_minutes": 480,
    "datetime_now": "2026-05-19T10:30:00.000Z"
  },
  
  "shells": [
    {
      "name": "pwsh",
      "path": "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "version": "7.5.0",
      "default_encoding": "UTF-8",
      "available": true,
      "preferred": true
    },
    {
      "name": "powershell",
      "path": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "version": "5.1.26100.2152",
      "default_encoding": "UTF-16-LE",
      "needs_encoding_fix": true,
      "available": true,
      "preferred": false
    },
    {
      "name": "cmd",
      "path": "C:\\Windows\\System32\\cmd.exe",
      "version": "10.0.26100.2152",
      "default_encoding": "GBK",
      "needs_encoding_fix": true,
      "available": true,
      "preferred": false
    },
    {
      "name": "bash",
      "path": null,
      "version": null,
      "available": false,
      "preferred": false,
      "note": "Windows 上未安装 bash（git bash / WSL 都没装）"
    }
  ],
  
  "tools": {
    "git": { "available": true, "version": "2.45.0", "path": "C:\\Program Files\\Git\\cmd\\git.exe" },
    "bun": { "available": true, "version": "1.3.11", "path": "C:\\Users\\luo\\.bun\\bin\\bun.exe" },
    "node": { "available": true, "version": "22.5.1", "path": "C:\\Program Files\\nodejs\\node.exe" },
    "npm": { "available": true, "version": "10.8.0", "path": "C:\\Program Files\\nodejs\\npm.cmd" },
    "pnpm": { "available": false, "version": null, "path": null },
    "yarn": { "available": false, "version": null, "path": null },
    "rg": { "available": true, "version": "14.1.0", "path": "C:\\Users\\luo\\scoop\\shims\\rg.exe" },
    "curl": { "available": true, "version": "8.4.0", "path": "C:\\Windows\\System32\\curl.exe" },
    "wget": { "available": false, "version": null, "path": null },
    "python": { "available": true, "version": "3.12.4", "path": "C:\\Python312\\python.exe" },
    "docker": { "available": false, "version": null, "path": null }
  },
  
  "shell_rules": {
    "preferred_shell": "pwsh",
    "max_command_length": 32767,
    "encoding_setup_command": "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "path_separator": "\\",
    "path_quote_required_for_spaces": true,
    "supports_glob_in_shell": false,
    "ci_mode": false
  },
  
  "user": {
    "username": "luo",
    "home_dir": "C:\\Users\\luo",
    "shell_history_file": "C:\\Users\\luo\\AppData\\Roaming\\Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt"
  },
  
  "specforge": {
    "install_root": "C:\\Users\\luo\\.specforge",
    "logs_dir": "C:\\Users\\luo\\.specforge\\logs"
  }
}
```

### 二、扫描时机

**触发点 1：OpenCode 启动（plugin 自动）**

`.opencode/plugins/sf_specforge.ts` 在加载时检查 `~/.specforge/host-profile.json`：
- 不存在 → 完整扫描
- 存在但 `scanned_at` 超过 30 天 → 重新扫描
- 存在且新鲜 → 直接读取

**触发点 2：sf_safe_bash 首次调用**

工具自身也做兜底——如果 plugin 没初始化（用户禁用了 plugin），首次调用工具时同步触发扫描。

**触发点 3：用户手动触发**

```bash
specforge env scan
specforge env scan --force   # 忽略缓存
specforge env show           # 只显示，不扫描
```

**触发点 4：检测到环境变化**

某些信号说明环境变了，需要重新扫描：
- 上次扫描在不同机器（hostname 变化）
- 关键工具突然报"找不到"（PATH 变了或工具卸载）
- shell 报版本不一致（pwsh 升级）

### 三、扫描逻辑

#### OS 信息（最简单）

```typescript
const os = await import('node:os')
const profile = {
  platform: os.platform(),  // 'win32' | 'darwin' | 'linux'
  release: os.release(),
  arch: os.arch(),
  totalmem_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
  cpu_count: os.cpus().length
}
```

#### Locale 信息

Windows：
```typescript
// 系统语言
const lang = process.env.LANG || (await spawn('powershell', '-Command', '(Get-Culture).Name'))
// 控制台代码页
const codepage = (await spawn('cmd', '/c', 'chcp')).match(/(\d+)/)?.[1]
// 时区
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
const offset = -new Date().getTimezoneOffset()
```

macOS / Linux：
```typescript
const lang = process.env.LANG || process.env.LC_ALL
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
```

#### Shell 探测

```typescript
const candidates = process.platform === 'win32'
  ? ['pwsh', 'powershell', 'cmd', 'bash']
  : process.platform === 'darwin'
  ? ['zsh', 'bash', 'sh']
  : ['bash', 'zsh', 'sh', 'dash']

for (const shell of candidates) {
  const path = await which(shell)              // 找绝对路径
  const version = await getShellVersion(shell, path)  // 跑 -Version 或 --version
  const encoding = inferDefaultEncoding(shell, path)  // pwsh=UTF-8, powershell=UTF-16LE, cmd=GBK
  
  shells.push({ name: shell, path, version, default_encoding: encoding, available: !!path })
}

// 标记 preferred
const preferOrder = process.platform === 'win32' ? ['pwsh', 'powershell', 'cmd'] : ...
for (const name of preferOrder) {
  const found = shells.find(s => s.name === name && s.available)
  if (found) { found.preferred = true; break }
}
```

#### 工具探测

```typescript
const tools = ['git', 'bun', 'node', 'npm', 'pnpm', 'yarn', 'rg', 'curl', 'wget', 'python', 'docker', 'jq']

for (const tool of tools) {
  const path = await which(tool)
  if (path) {
    const version = await spawn(path, '--version')
    profile.tools[tool] = { available: true, version: extractVersion(version), path }
  } else {
    profile.tools[tool] = { available: false, version: null, path: null }
  }
}
```

每个工具用 `--version` 拿版本（多数工具支持，bun/node/npm/git 都支持），用 `which`/`where` 拿绝对路径。

#### CI 检测

```typescript
const ci_mode = !!(
  process.env.CI ||
  process.env.GITHUB_ACTIONS ||
  process.env.GITLAB_CI ||
  process.env.CIRCLECI ||
  process.env.TRAVIS ||
  process.env.JENKINS_HOME
)
```

CI 环境特殊：
- 通常没有交互式 pwsh
- 多半 UTF-8（CI 服务器）
- 工具集相对干净
- 应该用更短的 timeout（CI 任务通常有自己的超时）

### 四、扫描脚本必须满足的约束

#### 1. 探测命令必须有超时

每个 spawn 限制在 5 秒内完成。某个命令卡住不能拖累整个扫描。

```typescript
const result = await Promise.race([
  spawn(cmd, args),
  new Promise((_, rej) => setTimeout(() => rej(new Error('PROBE_TIMEOUT')), 5000))
])
```

参考 [async-resource-lifecycle.md A1](async-resource-lifecycle.md) 的败者清理原则——超时后必须 kill 子进程。

#### 2. 扫描必须并行

10 个工具串行扫描（每个 1-2 秒）= 20 秒。并行 = 2 秒。

```typescript
const probes = tools.map(tool => probeTool(tool))
const results = await Promise.allSettled(probes)
```

用 `allSettled` 不用 `all`，单个失败不影响其他。

#### 3. 失败工具不抛错，标记为 available: false

某个工具不存在不是错——是有效信息。`spawn` 返回 ENOENT 时标记不可用。

#### 4. 写入文件必须原子

```typescript
const tmpPath = profilePath + '.tmp.' + crypto.randomUUID()
await fs.writeFile(tmpPath, JSON.stringify(profile, null, 2))
await fs.rename(tmpPath, profilePath)
```

避免扫描中途崩溃留下残缺文件。

#### 5. 扫描日志写到 stderr

```typescript
console.error('[host-profile] scanning OS info...')
console.error('[host-profile] probing shells: pwsh, powershell, cmd...')
console.error('[host-profile] probing tools: git, bun, node...')
console.error('[host-profile] saved to ~/.specforge/host-profile.json (47 entries)')
```

写 stderr 不污染 stdout，方便调用方区分扫描日志和实际命令输出。

### 五、敏感信息保护

host-profile **不应**包含敏感信息：

❌ **禁止**记录：
- 用户密码 / API key（即使在 PATH 里发现）
- 私钥路径（不扫描 `.ssh/id_rsa` 等）
- 数据库连接字符串
- 公司内部域名 / IP

✅ **可以**记录：
- 用户名（os.userInfo().username）
- home 目录路径
- 已安装的开源工具列表和版本
- 公开的环境变量（PATH、LANG、TZ）

### 六、agent 怎么用 host-profile

#### 方式 1：注入到 system prompt（推荐）

在 OpenCode AGENTS.md 用变量引用：

```markdown
## 当前宿主机环境

操作系统：{host.os.platform} {host.os.version}
首选 shell：{host.shell_rules.preferred_shell}
系统语言：{host.locale.system_lang}
时区：{host.locale.timezone}

可用工具：{host.tools.available_list}
不可用工具：{host.tools.unavailable_list}

执行命令时必须遵守上述环境特征。
不要尝试调用 unavailable_list 中的工具。
路径分隔符使用 {host.shell_rules.path_separator}。
```

OpenCode 加载 AGENTS.md 时，把 `{host.xxx}` 替换为 host-profile 的实际值。

#### 方式 2：sf_safe_bash 工具内部使用（必做）

工具自身读 host-profile 决定：
- 用哪个 shell spawn
- 是否注入编码设置
- 是否拦截 unavailable 工具的命令
- 路径标准化怎么做

#### 方式 3：sf_doctor 工具暴露（建议）

```typescript
// .opencode/tools/sf_doctor.ts 增加查询能力
sf_doctor(check: 'host')
  → 返回 host-profile 摘要给 agent
```

Agent 怀疑环境问题时主动调用查询。

---

## 错误场景与降级

### 1. host-profile.json 不存在

工具首次调用时同步扫描（首次会慢 2-3 秒），扫描完写入。

### 2. host-profile.json 解析失败（损坏）

立即重新扫描，覆盖文件。

### 3. 探测某个工具时该工具卡死（罕见）

每个探测有 5 秒超时，超时标记 `available: false` 并加 note：`"探测超时，标记为不可用"`。

### 4. 用户手动改了 host-profile.json 后命令出错

工具发现命令实际行为和档案不一致（比如档案说有 git，实际报 ENOENT）：
- 单次失败 → 不重扫描（可能是临时问题）
- 连续 3 次同类工具 ENOENT → 标记档案过期，下次启动强制重扫

### 5. 用户在容器里跑（虽然你说很少）

CI 检测会触发，标记 `ci_mode: true`，但扫描照常进行。容器特殊路径（`/proc/1/cgroup` 包含 docker）可以加额外字段 `os.runtime: 'container'`，但 V6.0 不做。

---

## 预防机制

### 项目层

#### 步骤 1（必做）：实现扫描脚本

`scripts/lessons/scan-host-profile.ts`，按本文规则实现。

CLI 入口：
```bash
bun run scripts/scan-host-profile.ts            # 增量扫描（30 天缓存）
bun run scripts/scan-host-profile.ts --force    # 强制扫描
bun run scripts/scan-host-profile.ts --show     # 只打印当前档案
```

#### 步骤 2（必做）：plugin 启动钩子

修改 `.opencode/plugins/sf_specforge.ts`，启动时检查并触发扫描：

```typescript
async function ensureHostProfile() {
  const profilePath = join(homedir(), '.specforge', 'host-profile.json')
  
  if (!await exists(profilePath)) {
    await runHostScan()
    return
  }
  
  const profile = JSON.parse(await readFile(profilePath, 'utf-8'))
  const ageMs = Date.now() - new Date(profile.scanned_at).getTime()
  if (ageMs > 30 * 24 * 60 * 60 * 1000) {
    await runHostScan()
  }
}
```

#### 步骤 3（必做）：sf_safe_bash 读档案

工具自身在 execute() 开头读档案，决策 shell / 编码 / 工具可用性。档案不可读则降级到内置默认值（pwsh 优先 + UTF-8）。

#### 步骤 4（推荐）：sf_doctor 增加 host 检查

```bash
specforge doctor host    # 显示当前档案 + 检查关键工具
```

输出形如：
```
✅ OS: win32 (Windows 11 Pro 24H2)
✅ Locale: zh-CN, UTF-8, Asia/Shanghai
✅ Preferred shell: pwsh 7.5.0
✅ Required tools:
   ✅ git 2.45.0
   ✅ bun 1.3.11
   ✅ node 22.5.1
⚠️  Optional tools:
   ❌ python (not found)
   ❌ docker (not found)
```

#### 步骤 5（推荐）：CI 自动跑 scan

`.github/workflows/*.yml` 加：
```yaml
- name: Scan host profile
  run: bun run scripts/scan-host-profile.ts --force
- name: Show profile
  run: cat ~/.specforge/host-profile.json
```

CI 日志能看到每次跑的环境，调试 CI 问题时有据可查。

### 工具层

让 sf_safe_bash 在拦截规则里使用档案：

```typescript
// 拒绝调用不可用工具
if (command starts with toolName && !profile.tools[toolName].available) {
  return reject({
    rule: 'tool-not-available',
    suggestion: `${toolName} 在当前机器未安装。host-profile.json 显示该工具不可用。`
  })
}
```

---

## 相关错误

| 症状 | 解决参考 |
|------|---------|
| 中文输出乱码 | [shell-command-execution](shell-command-execution.md) "编码强制 UTF-8" |
| 找不到 grep / find / cat | 本文 + [shell-command-execution](shell-command-execution.md) "命令重写规则" |
| Mac/Win 命令风格不一致 | 本文（host-profile 区分平台）+ [shell-command-execution](shell-command-execution.md) "Shell 选择优先级" |
| 工具版本太旧不支持新 flag | 本文（host-profile 记录版本，agent 看 prompt 知道版本，避免用新 flag） |
| timestamp 时区不一致 | 本文（host-profile.locale.timezone）|

---

## 参考

- 互补经验：[shell-command-execution](shell-command-execution.md) — 规定如何按档案执行命令
- 扫描脚本：`scripts/lessons/scan-host-profile.ts`
- 配置文件：`~/.specforge/host-profile.json`
- 自动触发：`.opencode/plugins/sf_specforge.ts` 启动钩子
- 用户工具：`specforge env scan` / `specforge doctor host`
