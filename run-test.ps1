$job = Start-Job -ScriptBlock { Set-Location 'd:\code\temp\SpecForge'; bun test tests/integration/distribution/init-concurrent-lock.test.ts 2>&1 }
if (Wait-Job $job -Timeout 120) {
    Receive-Job $job
    Remove-Job $job
} else {
    Stop-Job $job
    Receive-Job $job
    Remove-Job $job -Force
    Write-Host "STILL_HUNG_AFTER_120s"
    exit 1
}