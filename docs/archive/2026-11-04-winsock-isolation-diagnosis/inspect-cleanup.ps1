$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$phaseRoot = Join-Path $PSScriptRoot 'attempts'
$attemptBase = [IO.Path]::GetFullPath((Join-Path (Get-Location) '.tmp/verification-lpac'))
$names = @('3a0a361db28c4b72a0f8d979d39413f5','dcab7f35f12547038f7baa18969571ae','a102d98644fe44feb6641ab3b023f613')
$observations = @()
foreach ($name in $names) {
    $attemptPath = Join-Path $attemptBase $name
    if ([IO.Path]::GetDirectoryName($attemptPath) -ne $attemptBase) { throw 'PATH_ESCAPE' }
    $events = @(Get-Content -LiteralPath (Join-Path $attemptPath 'events.jsonl') -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json })
    $pids = @($events | Where-Object { $_.name -in @('process_created_suspended','control_created_suspended') } | ForEach-Object { [int]$_.data.pid })
    $pidFacts = @()
    foreach ($candidatePid in $pids) {
        $process = Get-Process -Id $candidatePid -ErrorAction SilentlyContinue
        if ($null -eq $process) { $pidFacts += [pscustomobject]@{pid=$candidatePid;query_succeeded=$true;present=$false} }
        else {
            $pidFacts += [pscustomobject]@{pid=$candidatePid;query_succeeded=$true;present=$true;path=$process.Path;start_utc=$process.StartTime.ToUniversalTime().ToString('o')}
            throw "PID_PRESENT_REQUIRES_IDENTITY_RECONCILIATION:$candidatePid"
        }
    }
    $profile = Join-Path $env:LOCALAPPDATA ('Packages/specforge.poc.'+$name)
    $profilePresent = Test-Path -LiteralPath $profile
    if ($profilePresent) { throw "PROFILE_REMAINS:$name" }
    $observations += [pscustomobject]@{attempt=$name;profile_present=$profilePresent;processes=$pidFacts;observed_utc=[DateTime]::UtcNow.ToString('o')}
}
# Full process inventory under host permissions; inaccessible executable paths are explicit.
$matching = @(); $unreadable = @()
foreach ($process in (Get-Process)) {
    try {
        $image = $process.Path
        if ($image -and $image.StartsWith($attemptBase+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
            $matching += [pscustomobject]@{pid=$process.Id;path=$image}
        }
        elseif (-not $image) { $unreadable += $process.Id }
    } catch { $unreadable += $process.Id }
}
if ($matching.Count -ne 0) { throw 'SYNTHETIC_PROCESS_REMAINS' }
$result = [pscustomobject]@{utc=[DateTime]::UtcNow.ToString('o');method='Host Get-Process exact PIDs and full executable-path inventory; no CIM';attempts=$observations;matching_synthetic_images=$matching;unreadable_image_pids=$unreadable;limits='Unrelated protected process images may be unreadable; exact owned PIDs absent and trusted Job accounting active0 independently corroborate cleanup. No general process-tree or crash acceptance claimed.';inner_exit_code=0}
$outFile = Join-Path $PSScriptRoot 'independent-cleanup.json'
if (Test-Path -LiteralPath $outFile) { throw 'RECEIPT_EXISTS' }
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $outFile -Encoding utf8
[pscustomobject]@{attempts=$observations.Count;matching_synthetic_images=$matching.Count;owned_pids_absent=$true;profiles_absent=$true;inner_exit_code=0} | ConvertTo-Json
exit 0
