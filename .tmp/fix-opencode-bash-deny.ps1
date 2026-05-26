param(
  [string]$JsonPath = "$env:USERPROFILE\.config\opencode\opencode.json",
  [string[]]$KeepAllow = @('sf-orchestrator')  # 保留 allow 的 agent（紧急逃生）
)

# 读 JSON
$raw = Get-Content -Raw -Path $JsonPath -Encoding UTF8
$obj = $raw | ConvertFrom-Json

# 改字段
$changed = @()
$kept = @()
foreach ($name in $obj.agent.PSObject.Properties.Name) {
  $a = $obj.agent.$name
  if ($null -eq $a.permission) { continue }
  $cur = $a.permission.bash
  if ($KeepAllow -contains $name) {
    $kept += "$name (kept '$cur')"
    continue
  }
  if ($cur -ne 'deny') {
    $a.permission.bash = 'deny'
    $changed += "$name ($cur -> deny)"
  }
}

# 写回（保持 2 空格缩进）
$json = $obj | ConvertTo-Json -Depth 64
# PowerShell ConvertTo-Json 默认 4 空格，转换为 2 空格更接近原始风格
$json = ($json -split "`n" | ForEach-Object {
  $line = $_
  if ($line -match '^(\s+)') {
    $indent = $matches[1]
    # 4 空格 -> 2 空格
    $newIndent = $indent -replace '    ', '  '
    $line = $newIndent + $line.Substring($indent.Length)
  }
  $line
}) -join "`n"

Set-Content -Path $JsonPath -Value $json -Encoding UTF8 -NoNewline

# 报告
Write-Host "Changed:"
$changed | ForEach-Object { Write-Host "  $_" }
Write-Host "Kept allow:"
$kept | ForEach-Object { Write-Host "  $_" }
