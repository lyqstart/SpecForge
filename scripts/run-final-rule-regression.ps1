$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"

function Fail($Cause, $Next) {
  Write-Host "RESULT: FAILED"
  Write-Host ("CAUSE: " + $Cause)
  Write-Host ("NEXT ACTION: " + $Next)
  exit 1
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

Push-Location $Repo
try {
  Write-Host "running targeted final governance regression test"
  Push-Location (Join-Path $Repo "packages\daemon-core")
  try {
    & bun run test -- tests/v11-final-governance-regression.test.ts
    if ($LASTEXITCODE -ne 0) {
      Fail "v11-final-governance-regression.test.ts failed." "Inspect Vitest output and fix the rule regression gap."
    }
  }
  finally {
    Pop-Location
  }

  Write-Host "running workspace build"
  & bun run build
  if ($LASTEXITCODE -ne 0) {
    Fail "bun run build failed." "Inspect build output before committing."
  }

  Write-Host "RESULT: FINAL_RULE_REGRESSION_TESTS_PASSED"
  Write-Host "CAUSE: v1.1.3 final governance rules are covered by the new automated regression test and build passed."
  Write-Host "NEXT ACTION: git status --short, commit, push."
}
finally {
  Pop-Location
}
