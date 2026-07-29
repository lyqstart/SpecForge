[CmdletBinding()]
param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$KeepArtifacts
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Invoke-Installer {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    Write-Host ""
    Write-Host ("=== bun scripts/sf-installer.ts " + ($Arguments -join " ") + " ===")

    & bun (Join-Path $RepoRoot "scripts\sf-installer.ts") @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Installer command failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
    }
}

function Get-PathSnapshot {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return [ordered]@{
            exists = $false
            entries = @()
        }
    }

    $Entries = @(
        Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction Stop |
            Sort-Object FullName |
            ForEach-Object {
                [ordered]@{
                    full_name = $_.FullName
                    is_directory = $_.PSIsContainer
                    length = if ($_.PSIsContainer) { $null } else { $_.Length }
                    last_write_time_utc = $_.LastWriteTimeUtc.ToString("o")
                }
            }
    )

    return [ordered]@{
        exists = $true
        entries = $Entries
    }
}

function Restore-EnvironmentVariable {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowNull()][string]$Value
    )

    if ($null -eq $Value) {
        Remove-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue
    } else {
        Set-Item -LiteralPath "Env:$Name" -Value $Value
    }
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$InstallerPath = Join-Path $RepoRoot "scripts\sf-installer.ts"
Assert-True (Test-Path -LiteralPath $InstallerPath -PathType Leaf) "Installer not found: $InstallerPath"

$BunCommand = Get-Command bun -ErrorAction Stop
Write-Host "Bun: $($BunCommand.Source)"
Write-Host "Repo: $RepoRoot"

$OriginalOpenCodeConfigDir = $env:OPENCODE_CONFIG_DIR
$OriginalXdgConfigHome = $env:XDG_CONFIG_HOME
$OriginalUserProfile = $env:USERPROFILE
$OriginalHome = $env:HOME

$RealLegacyRoot = Join-Path $HOME ".specforge"
$RealLegacySnapshotBefore = Get-PathSnapshot -Path $RealLegacyRoot

$RunId = [Guid]::NewGuid().ToString("N")
$AcceptanceRoot = Join-Path ([System.IO.Path]::GetTempPath()) "specforge-installer-lifecycle-$RunId"
$FakeHome = Join-Path $AcceptanceRoot "home"
$OpenCodeRoot = Join-Path $AcceptanceRoot "opencode"
$FakeLegacyRoot = Join-Path $FakeHome ".specforge"
$ManifestPath = Join-Path $OpenCodeRoot "specforge-manifest.json"
$SfUserRoot = Join-Path $OpenCodeRoot "sf-user"
$SfUserManifestPath = Join-Path $SfUserRoot "specforge-manifest.json"
$RuntimeMarkerPath = Join-Path $SfUserRoot "runtime\acceptance-user-data.txt"
$UnrelatedFilePath = Join-Path $OpenCodeRoot "unrelated-user-file.txt"
$OpenCodeJsonPath = Join-Path $OpenCodeRoot "opencode.json"
$ReportPath = Join-Path $AcceptanceRoot "acceptance-report.json"
$Succeeded = $false
$ManagedPaths = @()

try {
    New-Item -ItemType Directory -Force -Path $FakeHome | Out-Null
    New-Item -ItemType Directory -Force -Path $OpenCodeRoot | Out-Null

    Set-Content -LiteralPath $UnrelatedFilePath -Encoding UTF8 -Value "preserve-me"
    [System.IO.File]::WriteAllText(
        $OpenCodeJsonPath,
        "{}",
        [System.Text.UTF8Encoding]::new($false)
    )

    $env:OPENCODE_CONFIG_DIR = $OpenCodeRoot
    $env:USERPROFILE = $FakeHome
    $env:HOME = $FakeHome
    Remove-Item -LiteralPath "Env:XDG_CONFIG_HOME" -ErrorAction SilentlyContinue

    Invoke-Installer -Arguments @("install")

    Assert-True (Test-Path -LiteralPath $ManifestPath -PathType Leaf) "Canonical manifest was not created: $ManifestPath"
    Assert-True (-not (Test-Path -LiteralPath $SfUserManifestPath)) "Manifest was incorrectly written under sf-user: $SfUserManifestPath"
    Assert-True (Test-Path -LiteralPath $SfUserRoot -PathType Container) "sf-user root was not created: $SfUserRoot"
    Assert-True (-not (Test-Path -LiteralPath $FakeLegacyRoot)) "Installer created the legacy user root: $FakeLegacyRoot"

    $Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    $ManagedPaths = @($Manifest.files.PSObject.Properties.Name)
    Assert-True ($ManagedPaths.Count -gt 0) "Manifest contains no managed files"

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $RuntimeMarkerPath) | Out-Null
    Set-Content -LiteralPath $RuntimeMarkerPath -Encoding UTF8 -Value "preserve-user-runtime-data"

    Invoke-Installer -Arguments @("verify")
    Invoke-Installer -Arguments @("upgrade")
    Assert-True (Test-Path -LiteralPath $ManifestPath -PathType Leaf) "Manifest disappeared after upgrade"
    Assert-True (-not (Test-Path -LiteralPath $FakeLegacyRoot)) "Upgrade created the legacy user root: $FakeLegacyRoot"
    Invoke-Installer -Arguments @("verify")

    Invoke-Installer -Arguments @("upgrade", "--force")
    Assert-True (Test-Path -LiteralPath $ManifestPath -PathType Leaf) "Manifest disappeared after force upgrade"
    Assert-True (-not (Test-Path -LiteralPath $FakeLegacyRoot)) "Force upgrade created the legacy user root: $FakeLegacyRoot"
    Invoke-Installer -Arguments @("verify")

    Invoke-Installer -Arguments @("--version")
    Invoke-Installer -Arguments @("uninstall")

    Assert-True (-not (Test-Path -LiteralPath $ManifestPath)) "Manifest remained after uninstall: $ManifestPath"
    Assert-True (Test-Path -LiteralPath $UnrelatedFilePath -PathType Leaf) "Unrelated user file was removed by uninstall"
    Assert-True (Test-Path -LiteralPath $OpenCodeJsonPath -PathType Leaf) "opencode.json was removed by uninstall"
    Assert-True (Test-Path -LiteralPath $RuntimeMarkerPath -PathType Leaf) "User runtime data was removed by shared-component uninstall"
    Assert-True (-not (Test-Path -LiteralPath $FakeLegacyRoot)) "Uninstall created the legacy user root: $FakeLegacyRoot"

    $RemainingManagedFiles = @()
    foreach ($RelativePath in $ManagedPaths) {
        $NativeRelativePath = $RelativePath -replace "/", [System.IO.Path]::DirectorySeparatorChar
        $FullPath = Join-Path $OpenCodeRoot $NativeRelativePath
        if (Test-Path -LiteralPath $FullPath -PathType Leaf) {
            $RemainingManagedFiles += $RelativePath
        }
    }
    Assert-True ($RemainingManagedFiles.Count -eq 0) ("Managed files remained after uninstall: " + ($RemainingManagedFiles -join ", "))

    $RealLegacySnapshotAfter = Get-PathSnapshot -Path $RealLegacyRoot
    $BeforeJson = $RealLegacySnapshotBefore | ConvertTo-Json -Depth 8 -Compress
    $AfterJson = $RealLegacySnapshotAfter | ConvertTo-Json -Depth 8 -Compress
    Assert-True ($BeforeJson -eq $AfterJson) "Real legacy user root changed during isolated acceptance: $RealLegacyRoot"

    $Report = [ordered]@{
        status = "PASS"
        repo_root = $RepoRoot
        acceptance_root = $AcceptanceRoot
        isolated_home = $FakeHome
        opencode_config_root = $OpenCodeRoot
        canonical_manifest = $ManifestPath
        sf_user_root = $SfUserRoot
        managed_file_count = $ManagedPaths.Count
        unrelated_file_preserved = $true
        user_runtime_data_preserved = $true
        fake_legacy_root_absent = $true
        real_legacy_root = $RealLegacyRoot
        real_legacy_root_unchanged = $true
        completed_at = (Get-Date).ToString("o")
    }

    $Report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8

    Write-Host ""
    Write-Host "=== USERLEVEL INSTALLER LIFECYCLE ACCEPTANCE ==="
    $Report | Format-List
    Write-Host "Report: $ReportPath"
    Write-Host "RESULT: PASS"

    $Succeeded = $true
}
catch {
    Write-Host ""
    Write-Host "=== USERLEVEL INSTALLER LIFECYCLE ACCEPTANCE ==="
    Write-Host "RESULT: FAIL"
    Write-Host "CAUSE: $($_.Exception.Message)"
    Write-Host "Artifacts: $AcceptanceRoot"
    throw
}
finally {
    Restore-EnvironmentVariable -Name "OPENCODE_CONFIG_DIR" -Value $OriginalOpenCodeConfigDir
    Restore-EnvironmentVariable -Name "XDG_CONFIG_HOME" -Value $OriginalXdgConfigHome
    Restore-EnvironmentVariable -Name "USERPROFILE" -Value $OriginalUserProfile
    Restore-EnvironmentVariable -Name "HOME" -Value $OriginalHome

    if ($Succeeded -and -not $KeepArtifacts -and (Test-Path -LiteralPath $AcceptanceRoot)) {
        Remove-Item -LiteralPath $AcceptanceRoot -Recurse -Force
        Write-Host "Temporary acceptance directory removed."
    }
}
