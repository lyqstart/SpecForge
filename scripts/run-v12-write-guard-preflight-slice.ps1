$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"
$FeatureBranch = "feature/v1.2-write-guard-preflight-slice"
$TagName = "v1.2-write-guard-preflight-slice-complete"

function Fail($Cause, $Next) {
  Write-Host "RESULT: FAILED"
  Write-Host ("CAUSE: " + $Cause)
  Write-Host ("NEXT ACTION: " + $Next)
  exit 1
}

function GitOutput($ArgsArray) {
  $Output = & git @ArgsArray 2>$null
  if ($null -eq $Output) { return "" }
  return (($Output | Out-String).Trim())
}

function WriteUtf8($Path, $Text) {
  $Parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $Parent | Out-Null
  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

function Run-Step($Label, $ScriptBlock) {
  Write-Host ""
  Write-Host ("=== " + $Label + " ===")
  & $ScriptBlock
  if ($LASTEXITCODE -ne 0) {
    Fail ($Label + " failed.") "Inspect output. This fix stops on first failed invariant."
  }
}

function EnsureRegistryIncludesWriteGuard() {
  $RegistryPath = Join-Path $Repo "scripts\lib\registry.ts"
  if (!(Test-Path $RegistryPath)) {
    Fail "scripts/lib/registry.ts not found." "Check repository layout."
  }

  $Text = [System.IO.File]::ReadAllText($RegistryPath)
  if ($Text -like "*tools/sf_write_guard_preflight.ts*") {
    Write-Host "registry already contains tools/sf_write_guard_preflight.ts"
    return
  }

  $Needle = '{ path: "tools/sf_close_gate.ts", type: "tool" },'
  if ($Text -notlike ("*" + $Needle + "*")) {
    Fail "Could not find sf_close_gate registry anchor." "Add tools/sf_write_guard_preflight.ts to SHARED_COMPONENT_REGISTRY manually."
  }

  $Replacement = $Needle + "`n  { path: ""tools/sf_write_guard_preflight.ts"", type: ""tool"" },"
  $Text = $Text.Replace($Needle, $Replacement)
  WriteUtf8 $RegistryPath $Text
  Write-Host "patched: scripts/lib/registry.ts includes tools/sf_write_guard_preflight.ts"
}

function AssertRequiredSliceFiles() {
  $Required = @(
    "packages\daemon-core\src\tools\lib\write-guard-preflight-v12.ts",
    "packages\daemon-core\tests\v12-write-guard-preflight.test.ts",
    "packages\daemon-core\tests\v12-write-guard-preflight-contract.test.ts",
    "setup\userlevel-opencode\tools\sf_write_guard_preflight.ts"
  )

  foreach ($Rel in $Required) {
    $Path = Join-Path $Repo $Rel
    if (!(Test-Path $Path)) {
      Fail ("Missing slice file: " + $Rel) "Run the original v1.2 Write Guard preflight package first, then apply fix01."
    }
  }
}

function UpdateReport($Status) {
  $ReportPath = Join-Path $Repo "docs\reports\specforge-v1.2-write-guard-preflight-slice-report.md"
  $Content = @"
# SpecForge v1.2 Write Guard Preflight Slice Report

## Result

$Status

## Implemented

- sfWriteGuardPreflight
- classifyShellWriteRisk
- checkCloseGateWriteGuard
- SF_WRITE_GUARD_PREFLIGHT_V12_CONTRACT
- positive/negative v1.2 tests
- daemon-core exports
- userlevel sf_write_guard_preflight wrapper
- installer registry entry in SHARED_COMPONENT_REGISTRY

## Positive evidence

- allowed file write passes during implementation_running
- read-only verification shell command passes
- allowed directory write passes
- project spec write passes only through sf_project_spec_merge

## Negative evidence

- non-implementation_running write is denied
- disabled code permission write is denied
- revoked code permission write is denied
- out-of-scope write is denied
- direct .specforge/project/** write is denied
- shell write risk is detected and denied when out of scope
- close gate helper blocks when blocked_write_attempts > 0

## Deployment evidence

- tools/sf_write_guard_preflight.ts is included in scripts/lib/registry.ts
- installer upgrade deploys the wrapper to live userlevel directory
- setup/live SHA256 consistency passes

## Verification

- v1.2 write guard tests passed
- v1.1 final governance regression passed
- workspace build passed
- install/deployment consistency passed

## Tag

$TagName
"@
  WriteUtf8 $ReportPath $Content
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

Push-Location $Repo
try {
  $Branch = GitOutput @("rev-parse", "--abbrev-ref", "HEAD")
  if ($Branch -ne $FeatureBranch) {
    Fail ("Wrong branch: " + $Branch) ("Checkout " + $FeatureBranch + " before running fix01.")
  }

  $StableTag = GitOutput @("tag", "--list", "v1.1-stable")
  if (-not $StableTag) {
    Fail "Missing v1.1-stable tag." "Finish v1.1-stable before v1.2 slice development."
  }

  $ProjectSpecTag = GitOutput @("tag", "--list", "v1.2-project-spec-store-slice-complete")
  if (-not $ProjectSpecTag) {
    Fail "Missing v1.2-project-spec-store-slice-complete tag." "Finish the first v1.2 slice before Write Guard preflight slice."
  }

  & git restore packages/daemon-core/.specforge/logs/telemetry.jsonl 2>$null

  AssertRequiredSliceFiles
  EnsureRegistryIncludesWriteGuard
  UpdateReport "IN_PROGRESS"

  Run-Step "v1.2 write guard preflight tests" {
    Push-Location (Join-Path $Repo "packages\daemon-core")
    try {
      & bun run test -- `
        tests/v12-write-guard-preflight.test.ts `
        tests/v12-write-guard-preflight-contract.test.ts
    }
    finally {
      Pop-Location
    }
  }

  Run-Step "v1.1 final governance regression" {
    Push-Location (Join-Path $Repo "packages\daemon-core")
    try {
      & bun run test -- tests/v11-final-governance-regression.test.ts
    }
    finally {
      Pop-Location
    }
  }

  Run-Step "workspace build" {
    & bun run build
  }

  if (Test-Path (Join-Path $Repo "scripts\run-install-deployment-consistency.ps1")) {
    Run-Step "install/deployment consistency" {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo "scripts\run-install-deployment-consistency.ps1")
    }
  }

  UpdateReport "PASSED"

  Write-Host "RESULT: V12_WRITE_GUARD_PREFLIGHT_SLICE_FIX01_PASSED"
  Write-Host "CAUSE: sf_write_guard_preflight was added to SHARED_COMPONENT_REGISTRY and install/deployment consistency passed."
  Write-Host "NEXT ACTION: fix01 driver will commit, push, merge main, and tag."
}
finally {
  Pop-Location
}
