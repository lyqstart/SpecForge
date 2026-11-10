$ErrorActionPreference='Stop'
function SaveNew([string]$file,[object]$value){
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($value | ConvertTo-Json -Depth 8)+[Environment]::NewLine)
  $stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
$record=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'candidate-full-a03.command.json') | ConvertFrom-Json
$items=@(Get-CimInstance Win32_Process -Filter "Name='node.exe' AND CommandLine LIKE '%qualify.cjs%patched%full%a03%'")
$items=@($items | Where-Object { $_.CommandLine -notmatch 'run\.cjs' -and $_.CommandLine -match 'qualify\.cjs"?\s+patched\s+full\s+a03\s*$' })
if($items.Count -ne 1){throw 'OWNED_VALIDATION_IDENTITY_NOT_UNIQUE'}
$owned=$items[0]
if($owned.ExecutablePath -ne 'C:\Program Files\nodejs\node.exe' -or $owned.CreationDate.ToUniversalTime() -lt [DateTime]::Parse($record.utc).ToUniversalTime()){throw 'OWNED_VALIDATION_IDENTITY_MISMATCH'}
$before=@{utc=[DateTime]::UtcNow.ToString('o');pid=$owned.ProcessId;parent_pid=$owned.ParentProcessId;image=$owned.ExecutablePath;creation_utc=$owned.CreationDate.ToUniversalTime().ToString('o');purpose='Stop only owned unqualified validation tree; real daemon/OpenCode not targets';original_command_receipt_sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'candidate-full-a03.command.json') -Algorithm SHA256).Hash.ToLowerInvariant()}
SaveNew (Join-Path $PSScriptRoot 'unqualified-stop-intent.json') $before
& "$env:SystemRoot\System32\taskkill.exe" /PID $owned.ProcessId /T /F
$inner=$LASTEXITCODE
if($inner -ne 0){throw "OWNED_STOP_FAILED_$inner"}
$still=@(Get-CimInstance Win32_Process -Filter "ProcessId=$($owned.ProcessId)")
if($still.Count -gt 0 -and $still[0].CreationDate -eq $owned.CreationDate){throw 'OWNED_PROCESS_STILL_PRESENT'}
SaveNew (Join-Path $PSScriptRoot 'unqualified-stop-result.json') @{utc=[DateTime]::UtcNow.ToString('o');exit_code=0;taskkill_exit=$inner;original_pid=$owned.ProcessId;original_identity_ended=$true;product_processes_targeted=$false}
