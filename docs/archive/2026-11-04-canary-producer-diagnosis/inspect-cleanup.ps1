$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
if (-not [Environment]::Is64BitProcess) { throw 'HOST_REGISTRY_VIEW_MUST_BE_64BIT' }
$names = @('4edb144f314a478b889b586fca979ea5','0c669834e068425692ebaa369ddcb7fd','fb750cfffd6b4ae2a3a47b996020604b')
$scope = [IO.Path]::GetFullPath((Join-Path (Get-Location) '.tmp/verification-lpac'))
$processes = @([Diagnostics.Process]::GetProcesses())
$ids = @{}
foreach ($process in $processes) { $ids[$process.Id] = $true }
$facts = @()
foreach ($name in $names) {
    $receipt = Get-Content -LiteralPath (Join-Path $PSScriptRoot ('attempts/'+$name+'/receipt.json')) -Encoding UTF8 -Raw | ConvertFrom-Json
    if ($receipt.moniker -ne ('specforge.regread.'+$name)) { throw 'PROFILE_OWNER_MISMATCH' }
    $profile = Join-Path $env:LOCALAPPDATA ('Packages/'+$receipt.moniker)
    if (Test-Path -LiteralPath $profile) { throw 'PROFILE_STILL_PRESENT' }
    $events = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot ('attempts/'+$name+'/events.jsonl')) -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json })
    $pids = @($events | Where-Object { $_.name -in @('process_created_suspended','control_created_suspended') } | ForEach-Object { [int]$_.data.pid })
    $pidFacts = @()
    foreach ($candidatePid in $pids) { if ($ids.ContainsKey($candidatePid)) { throw "OWNED_PID_PRESENT_REQUIRES_IDENTITY_RECONCILIATION:$candidatePid" }; $pidFacts += [pscustomobject]@{pid=$candidatePid;present=$false;query_succeeded=$true} }
    $key = 'Registry::HKEY_CURRENT_USER\Software\SpecForgeIsolationCanary-'+$name
    $keyPresent = Test-Path -LiteralPath $key
    if ($keyPresent) { throw 'CANARY_KEY_STILL_PRESENT' }
    $facts += [pscustomobject]@{attempt=$name;profile_present=$false;canary_key_present=$keyPresent;processes=$pidFacts;observed_utc=[DateTime]::UtcNow.ToString('o')}
}
$matching = @(); $unreadable = @()
foreach ($process in $processes) { try { $image=$process.MainModule.FileName; if ($image -and $image.StartsWith($scope+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { $matching += [pscustomobject]@{pid=$process.Id;path=$image} } elseif (-not $image) { $unreadable += $process.Id } } catch { $unreadable += $process.Id } }
if ($matching.Count -ne 0) { throw 'SYNTHETIC_IMAGE_REMAINS' }
$result = [pscustomobject]@{utc=[DateTime]::UtcNow.ToString('o');method='Successful host Process.GetProcesses inventory, exact owned PID lookup, profile and fake-key paths';attempts=$facts;matching_synthetic_images=$matching;unreadable_image_pids=$unreadable;limits='Unrelated protected images unreadable; owned PIDs absent in successful host inventory plus trusted Job active0. No general crash/descendant acceptance claimed.';inner_exit_code=0}
$outFile = Join-Path $PSScriptRoot 'independent-cleanup.json'
if (Test-Path -LiteralPath $outFile) { throw 'RECEIPT_EXISTS' }
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $outFile -Encoding utf8
[pscustomobject]@{attempts=$facts.Count;profiles_absent=$true;fake_keys_absent=$true;owned_pids_absent=$true;inner_exit_code=0} | ConvertTo-Json
exit 0
