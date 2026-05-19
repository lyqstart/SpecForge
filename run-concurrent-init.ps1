param(
    [string]$TempHome,
    [string]$CliPath,
    [string]$BunPath = "C:\Users\luo\AppData\Roaming\npm\node_modules\bun\bin\bun.exe"
)

$ErrorActionPreference = 'Continue'
$env:HOME = $TempHome
$env:USERPROFILE = $TempHome
$cliPath = $CliPath

# Convert paths to posix format for the script
$tempHomePosix = $TempHome -replace '\\', '/'
$cliPathPosix = $CliPath -replace '\\', '/'
$bunPathPosix = $BunPath -replace '\\', '/'

# Run init in background using cmd /c start
$proc1 = Start-Process -FilePath 'cmd' -ArgumentList '/c', 'specforge init' -NoNewWindow -PassThru -WorkingDirectory $tempHomePosix -RedirectStandardError "$env:TEMP/init1_err.txt"
$proc2 = Start-Process -FilePath 'cmd' -ArgumentList '/c', 'specforge init' -NoNewWindow -PassThru -WorkingDirectory $tempHomePosix -RedirectStandardError "$env:TEMP/init2_err.txt"

# Wait for both processes
$proc1 | Wait-Process -Timeout 60
$proc2 | Wait-Process -Timeout 60

# Get exit codes
$code1 = if ($proc1.HasExited) { $proc1.ExitCode } else { -1; Stop-Process $proc1.Id -Force }
$code2 = if ($proc2.HasExited) { $proc2.ExitCode } else { -1; Stop-Process $proc2.Id -Force }

Write-Output "EXIT_CODES:$code1,$code2"

# Get stderr
$err1 = if (Test-Path "$env:TEMP/init1_err.txt") { Get-Content "$env:TEMP/init1_err.txt" -Raw } else { "" }
$err2 = if (Test-Path "$env:TEMP/init2_err.txt") { Get-Content "$env:TEMP/init2_err.txt" -Raw } else { "" }
Write-Output "STDERR1:$($err1 -replace '\r?\n', ' ')"
Write-Output "STDERR2:$($err2 -replace '\r?\n', ' ')"

# Get lock file content if exists
$lockFile = Join-Path $tempHomePosix '.specforge/.init.lock'
if (Test-Path $lockFile) {
    Write-Output "LOCK_CONTENT:$(Get-Content $lockFile -Raw)"
}