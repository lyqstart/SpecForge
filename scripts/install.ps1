# SpecForge 安装脚本 (PowerShell)
# 用法: .\scripts\install.ps1 -Target "D:\code\temp\test1"

param(
    [Parameter(Mandatory=$true)]
    [string]$Target
)

$ErrorActionPreference = "Stop"
$SpecForgeDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "================================================"
Write-Host "  SpecForge 安装脚本"
Write-Host "================================================"
Write-Host "源目录: $SpecForgeDir"
Write-Host "目标目录: $Target"
Write-Host ""

# 创建目录结构
$dirs = @(
    ".opencode\agents",
    ".opencode\tools\lib",
    ".opencode\plugins",
    ".opencode\skills\superpowers-brainstorming",
    ".opencode\skills\superpowers-verification-before-completion",
    ".opencode\skills\sf-workflow-feature-spec",
    ".opencode\skills\sf-workflow-bugfix-spec",
    ".opencode\skills\sf-workflow-design-first",
    ".opencode\skills\sf-workflow-quick-change",
    "specforge\agents\contracts",
    "specforge\config",
    "specforge\specs",
    "specforge\runtime\checkpoints",
    "specforge\sessions",
    "specforge\archive\agent_runs",
    "specforge\logs"
)

Write-Host "📁 创建目录结构 ..."
foreach ($dir in $dirs) {
    $fullPath = Join-Path $Target $dir
    New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
}

# 复制 Agent 定义文件
Write-Host "📁 复制 Agent 定义文件 ..."
Copy-Item "$SpecForgeDir\.opencode\agents\*.md" "$Target\.opencode\agents\" -Force

# 复制 Custom Tools
Write-Host "📁 复制 Custom Tools ..."
Copy-Item "$SpecForgeDir\.opencode\tools\*.ts" "$Target\.opencode\tools\" -Force
Copy-Item "$SpecForgeDir\.opencode\tools\lib\*.ts" "$Target\.opencode\tools\lib\" -Force

# 复制 Plugin
Write-Host "📁 复制 Plugin ..."
Copy-Item "$SpecForgeDir\.opencode\plugins\*.ts" "$Target\.opencode\plugins\" -Force

# 复制 Skills（所有 Skill 目录）
Write-Host "📁 复制 Skills ..."
$skillDirs = Get-ChildItem "$SpecForgeDir\.opencode\skills" -Directory
foreach ($skillDir in $skillDirs) {
    $targetSkillDir = Join-Path $Target ".opencode\skills\$($skillDir.Name)"
    New-Item -ItemType Directory -Path $targetSkillDir -Force | Out-Null
    Copy-Item "$($skillDir.FullName)\SKILL.md" "$targetSkillDir\" -Force -ErrorAction SilentlyContinue
}

# 复制 specforge 目录
Write-Host "📁 复制 specforge 配置 ..."
Copy-Item "$SpecForgeDir\specforge\agents\AGENT_CONSTITUTION.md" "$Target\specforge\agents\" -Force
Copy-Item "$SpecForgeDir\specforge\agents\contracts\*.md" "$Target\specforge\agents\contracts\" -Force
Copy-Item "$SpecForgeDir\specforge\config\*.json" "$Target\specforge\config\" -Force
Copy-Item "$SpecForgeDir\specforge\runtime\state.json" "$Target\specforge\runtime\" -Force
Copy-Item "$SpecForgeDir\specforge\runtime\events.jsonl" "$Target\specforge\runtime\" -Force

# 创建空日志文件
Write-Host "📁 创建日志文件 ..."
$logFiles = @("app.log", "error.log", "gate.log", "trace.jsonl")
foreach ($f in $logFiles) {
    $logPath = Join-Path $Target "specforge\logs\$f"
    if (-not (Test-Path $logPath)) {
        New-Item -ItemType File -Path $logPath -Force | Out-Null
    }
}

# 复制根目录文件
Write-Host "📁 复制配置文件 ..."
Copy-Item "$SpecForgeDir\AGENTS.md" "$Target\" -Force

# opencode.json
$targetOpencode = Join-Path $Target "opencode.json"
if (Test-Path $targetOpencode) {
    Write-Host "⚠️  目标已有 opencode.json，SpecForge 配置保存为 opencode.specforge.json"
    Write-Host "    请手动将 agent 配置段合并到你的 opencode.json"
    Copy-Item "$SpecForgeDir\opencode.json" "$Target\opencode.specforge.json" -Force
} else {
    Copy-Item "$SpecForgeDir\opencode.json" "$Target\" -Force
}

# package.json
$targetPkg = Join-Path $Target "package.json"
if (Test-Path $targetPkg) {
    Write-Host "⚠️  目标已有 package.json，SpecForge 依赖保存为 package.specforge.json"
    Copy-Item "$SpecForgeDir\package.json" "$Target\package.specforge.json" -Force
} else {
    Copy-Item "$SpecForgeDir\package.json" "$Target\" -Force
}

# tsconfig.json
$targetTs = Join-Path $Target "tsconfig.json"
if (Test-Path $targetTs) {
    Write-Host "⚠️  目标已有 tsconfig.json，SpecForge 配置保存为 tsconfig.specforge.json"
    Copy-Item "$SpecForgeDir\tsconfig.json" "$Target\tsconfig.specforge.json" -Force
} else {
    Copy-Item "$SpecForgeDir\tsconfig.json" "$Target\" -Force
}

Write-Host ""
Write-Host "================================================"
Write-Host "  ✅ SpecForge 文件复制完成"
Write-Host "================================================"
Write-Host ""

# ============================================================
# 写入 OpenCode 全局配置（compaction）
# ============================================================

Write-Host "📁 配置 OpenCode 全局自动压缩 ..."

$globalConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
$globalConfigPath = Join-Path $globalConfigDir "opencode.json"

# 确保目录存在
New-Item -ItemType Directory -Path $globalConfigDir -Force | Out-Null

# 读取现有全局配置（如存在）
$globalConfig = @{}
if (Test-Path $globalConfigPath) {
    try {
        $globalConfig = Get-Content $globalConfigPath -Raw | ConvertFrom-Json -AsHashtable
    } catch {
        Write-Host "⚠️  现有全局配置解析失败，将创建新配置"
        $globalConfig = @{}
    }
}

# 设置 compaction 配置（OpenCode 官方 schema 确认的合法顶层字段）
$globalConfig["compaction"] = @{
    "auto" = $true
    "prune" = $true
    "reserved" = 20000
}

# 写回全局配置
try {
    $globalConfig | ConvertTo-Json -Depth 10 | Set-Content $globalConfigPath -Encoding UTF8
    Write-Host "✅ OpenCode 全局配置已更新: $globalConfigPath"
    Write-Host "   compaction: auto=true, prune=true, reserved=20000"
} catch {
    Write-Host "⚠️  全局配置写入失败: $_"
    Write-Host "    请手动配置 $globalConfigPath"
}

Write-Host ""
Write-Host "后续步骤:"
Write-Host "  1. cd $Target"
Write-Host "  2. bun install          # 安装依赖"
Write-Host "  3. opencode             # 启动 OpenCode"
Write-Host "  4. 按 Tab 切换到 sf-orchestrator agent"
Write-Host "  5. 输入: 请运行 sf_doctor 检查安装状态"
Write-Host ""
