$env:HOME = 'C:\Users\luo\AppData\Local\Temp\test-specforge-home'
New-Item -ItemType Directory -Force -Path $env:HOME | Out-Null
specforge init --force 2>&1