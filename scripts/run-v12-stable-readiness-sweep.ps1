$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = 'D:\code\temp\SpecForge'
$expectedBranches = @('main', 'hardening/v1.2-stable-readiness-sweep')

function Fail {
  param([Parameter(Mandatory=$true)][string]$Cause, [int]$Code = 1)
  Write-Host 'RESULT: V1_2_STABLE_READINESS_SWEEP_FAILED'
  Write-Host "CAUSE: $Cause"
  exit $Code
}

if (-not (Test-Path -LiteralPath $repo)) {
  Fail 'repository path not found: D:\code\temp\SpecForge'
}

Set-Location -LiteralPath $repo

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][scriptblock]$Command
  )
  Write-Host "=== $Label ==="
  & $Command
  if ($LASTEXITCODE -ne 0) {
    Fail "command failed: $Label" $LASTEXITCODE
  }
}

$branch = (& git branch --show-current).Trim()
if ($expectedBranches -notcontains $branch) {
  Fail "expected branch main or hardening/v1.2-stable-readiness-sweep, got $branch"
}

$status = (& git status --short) -join "`n"
if (-not [string]::IsNullOrWhiteSpace($status)) {
  Write-Host 'RESULT: V1_2_STABLE_READINESS_SWEEP_FAILED'
  Write-Host 'CAUSE: working tree is not clean before validation.'
  Write-Host $status
  exit 1
}

Invoke-CheckedCommand 'hardstop scope regression' {
  Set-Location -LiteralPath (Join-Path $repo 'packages\daemon-core')
  bun run test -- tests/v12-hardstop-scope-regression.test.ts
}

Invoke-CheckedCommand 'empty WI hardstop regression' {
  Set-Location -LiteralPath (Join-Path $repo 'packages\daemon-core')
  bun run test -- tests/v12-empty-wi-hardstop-regression.test.ts
}

Invoke-CheckedCommand 'report path write guard regression' {
  Set-Location -LiteralPath (Join-Path $repo 'packages\daemon-core')
  bun run test -- tests/v12-report-path-write-guard-regression.test.ts
}

Invoke-CheckedCommand 'write guard control plane hardening regression' {
  Set-Location -LiteralPath (Join-Path $repo 'packages\daemon-core')
  bun run test -- tests/v12-write-guard-control-plane-hardening.test.ts
}

Invoke-CheckedCommand 'workspace build' {
  Set-Location -LiteralPath $repo
  bun run build
}

Invoke-CheckedCommand 'installer deployment consistency' {
  Set-Location -LiteralPath $repo
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-install-deployment-consistency.ps1
}

Set-Location -LiteralPath $repo
$statusAfter = (& git status --short) -join "`n"
if (-not [string]::IsNullOrWhiteSpace($statusAfter)) {
  Write-Host 'RESULT: V1_2_STABLE_READINESS_SWEEP_FAILED'
  Write-Host 'CAUSE: validation left working tree dirty.'
  Write-Host $statusAfter
  exit 1
}

Write-Host 'RESULT: V1_2_STABLE_READINESS_SWEEP_PASSED'
