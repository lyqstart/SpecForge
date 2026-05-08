# SpecForge 卸载重装脚本
# 在测试项目目录中执行：powershell -File <SpecForge路径>\scripts\reinstall.ps1
#
# 用法：
#   cd D:\code\temp\test1
#   powershell -File D:\code\temp\SpecForge\scripts\reinstall.ps1

param(
    [string]$Source = "",
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

# 自动检测 SpecForge 源目录
if ($Source -eq "") {
    $Source = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

$Target = Get-Location

Write-Host "================================================"
Write-Host "  SpecForge 卸载重装脚本"
Write-Host "================================================"
Write-Host "源目录: $Source"
Write-Host "目标目录: $Target"
if ($Clean) { Write-Host "模式: 全量清空（删除所有非 SpecForge 文件）" }
Write-Host ""

# === 第 0 步：全量清空（可选） ===
if ($Clean) {
    Write-Host "🧹 全量清空目标目录（保留 .git）..."
    Get-ChildItem -Path $Target -Exclude ".git","node_modules" | Remove-Item -Recurse -Force
    Write-Host ""
}

# === 第 1 步：卸载旧文件 ===
Write-Host "🗑️  卸载旧的 SpecForge 文件 ..."

$removeItems = @(
    ".opencode\agents",
    ".opencode\tools",
    ".opencode\plugins",
    ".opencode\skills",
    "specforge",
    "AGENTS.md",
    "opencode.json",
    "opencode.specforge.json",
    "package.specforge.json",
    "tsconfig.specforge.json"
)

foreach ($item in $removeItems) {
    $path = Join-Path $Target $item
    if (Test-Path $path) {
        Remove-Item -Recurse -Force $path
        Write-Host "  删除: $item"
    }
}

Write-Host ""

# === 第 2 步：调用安装脚本 ===
Write-Host "📦 重新安装 SpecForge ..."
& "$Source\scripts\install.ps1" -Target "$Target"

# === 第 3 步：安装依赖 ===
Write-Host ""
Write-Host "📦 安装依赖 ..."
if (Get-Command bun -ErrorAction SilentlyContinue) {
    bun install
} else {
    Write-Host "⚠️  未找到 bun，请手动执行: bun install"
}

Write-Host ""
Write-Host "================================================"
Write-Host "  ✅ SpecForge 卸载重装完成"
Write-Host "================================================"
Write-Host ""
Write-Host "启动: opencode"
Write-Host ""
