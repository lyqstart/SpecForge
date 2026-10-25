param([string]$Id, [string]$WorkingDirectory, [string[]]$BunArguments)
$ErrorActionPreference = 'Stop'
$evidence = $PSScriptRoot
$prefix = Join-Path $evidence $Id
if (Test-Path -LiteralPath "$prefix.result.json") { throw 'EVIDENCE_COLLISION' }
$record = [ordered]@{ run_id='CODEX-SF-20261024-SPS-AUDIT-A01'; command='bun'; arguments=$BunArguments; cwd=$WorkingDirectory; started_utc=[DateTime]::UtcNow.ToString('o'); purpose='SPS conformance evidence'; expected_writes='Evidence files; test temporary fixtures/cache only'; inner_exit_code=$null }
$record | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 "$prefix.command.txt"
Push-Location -LiteralPath $WorkingDirectory
try {
  & 'C:/Users/lyq/AppData/Roaming/npm/node_modules/bun/bin/bun.exe' @BunArguments 1> "$prefix.stdout.txt" 2> "$prefix.stderr.txt"
  $record.inner_exit_code = [int]$LASTEXITCODE
} finally { Pop-Location }
$record.finished_utc = [DateTime]::UtcNow.ToString('o')
$record | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 "$prefix.result.json"
Get-Content -LiteralPath "$prefix.stdout.txt" -Tail 18
Get-Content -LiteralPath "$prefix.stderr.txt" -Tail 8
Write-Output "INNER_EXIT_CODE=$($record.inner_exit_code)"
exit $record.inner_exit_code
