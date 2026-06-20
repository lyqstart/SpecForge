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
  Write-Host "running install/deployment consistency test"
  Push-Location (Join-Path $Repo "packages\daemon-core")
  try {
    & bun run test -- tests/v11-install-deployment-consistency.test.ts
    if ($LASTEXITCODE -ne 0) {
      Fail "v11-install-deployment-consistency.test.ts failed." "Inspect Vitest output and fix setup/installer/schema consistency."
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

  Write-Host "running userlevel installer upgrade --force"
  & bun scripts/sf-installer.ts upgrade --force
  if ($LASTEXITCODE -ne 0) {
    Fail "userlevel installer upgrade --force failed." "Inspect installer output."
  }

  Write-Host "syncing userlevel template library including hidden templates"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo "scripts\sync-userlevel-template-library.ps1")
  if ($LASTEXITCODE -ne 0) {
    Fail "template library sync failed." "Inspect template sync output."
  }

  Write-Host "cleaning unmanaged legacy userlevel components"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo "scripts\cleanup-userlevel-legacy-components.ps1")
  if ($LASTEXITCODE -ne 0) {
    Fail "legacy userlevel cleanup failed." "Inspect cleanup output."
  }

  Write-Host "running userlevel installer verify"
  & bun scripts/sf-installer.ts verify
  if ($LASTEXITCODE -ne 0) {
    Fail "userlevel installer verify failed." "Inspect installer verification output."
  }

  Write-Host "running setup/live SHA256 consistency check"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo "scripts\check-userlevel-live-consistency.ps1")
  if ($LASTEXITCODE -ne 0) {
    Fail "setup/live userlevel consistency check failed." "Inspect missing/mismatch file list."
  }

  Write-Host "RESULT: INSTALL_DEPLOYMENT_CONSISTENCY_PASSED"
  Write-Host "CAUSE: setup source, installer upgrade/verify, hidden template sync, legacy cleanup, live userlevel SHA256 check, targeted test, and build all passed."
  Write-Host "NEXT ACTION: git status --short, commit, push."
}
finally {
  Pop-Location
}
