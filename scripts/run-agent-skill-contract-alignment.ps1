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
  Write-Host "running targeted Agent/Skill contract alignment test"
  Push-Location (Join-Path $Repo "packages\daemon-core")
  try {
    & bun run test -- tests/v11-agent-skill-contract-alignment.test.ts
    if ($LASTEXITCODE -ne 0) {
      Fail "v11-agent-skill-contract-alignment.test.ts failed." "Inspect Vitest output and fix the Agent/Skill contract gap."
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

  Write-Host "RESULT: AGENT_SKILL_CONTRACT_ALIGNMENT_TESTS_PASSED"
  Write-Host "CAUSE: Agent/Skill final governance contract alignment test and build passed."
  Write-Host "NEXT ACTION: git status --short, commit, push."
}
finally {
  Pop-Location
}
