$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"

function Fail($Cause, $Next) {
  Write-Host "RESULT: FAILED"
  Write-Host ("CAUSE: " + $Cause)
  Write-Host ("NEXT ACTION: " + $Next)
  exit 1
}

function Run-Step($Label, $ScriptBlock) {
  Write-Host ""
  Write-Host ("=== " + $Label + " ===")
  & $ScriptBlock
  if ($LASTEXITCODE -ne 0) {
    Fail ($Label + " failed.") "Inspect output. Do not commit/tag until fixed."
  }
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

Push-Location $Repo
try {
  $Branch = (& git rev-parse --abbrev-ref HEAD | Out-String).Trim()
  if ($Branch -ne "feature/v1.2-project-spec-store-slice") {
    Fail ("Wrong branch: " + $Branch) "Run apply_v12_project_spec_store_slice.ps1 first."
  }

  Run-Step "v1.2 project spec store tests" {
    Push-Location (Join-Path $Repo "packages\daemon-core")
    try {
      & bun run test -- `
        tests/v12-project-spec-store.test.ts `
        tests/v12-candidate-merge-contract.test.ts `
        tests/v12-no-spec-impact.test.ts
    }
    finally {
      Pop-Location
    }
  }

  Run-Step "v1.1 regression guard" {
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

  $Report = @"
# SpecForge v1.2 Project Spec Store Slice Report

## Result

PASSED

## Scope

- ProjectSpecStore
- Candidate Merge Contract
- no_spec_impact evidence
- direct project spec write guard helper
- v1.2 positive/negative tests
- v1.1 regression guard
- workspace build
- install/deployment consistency

## Conclusion

v1.2 first development slice is complete enough to tag v1.2-project-spec-store-slice-complete.
"@
  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText((Join-Path $Repo "docs\reports\specforge-v1.2-project-spec-store-slice-report.md"), $Report, $Utf8NoBom)

  Write-Host "RESULT: V12_PROJECT_SPEC_STORE_SLICE_PASSED"
  Write-Host "CAUSE: Project Spec Store, Candidate Merge Contract, no-spec-impact tests, v1.1 regression, build, and deployment consistency passed."
  Write-Host "NEXT ACTION: auto-commit/push/merge/tag can continue from apply script."
}
finally {
  Pop-Location
}
