# SpecForge CLI Installation and Setup Guide

**Version**: 1.0  
**Last Updated**: 2026-05-16  
**Scope**: Complete installation and setup instructions for SpecForge CLI across all supported platforms

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation Methods](#installation-methods)
3. [Initial Configuration](#initial-configuration)
4. [Verification](#verification)
5. [Troubleshooting](#troubleshooting)
6. [Uninstallation](#uninstallation)

---

## System Requirements

### Supported Platforms

| Platform | Architecture | Status | Notes |
|----------|--------------|--------|-------|
| **Linux** | x64 (amd64) | ✅ Fully Supported | Ubuntu 18.04+, Debian 10+, CentOS 7+, Fedora 30+ |
| **Linux** | ARM64 (aarch64) | ✅ Fully Supported | Raspberry Pi 4+, AWS Graviton, Apple Silicon via Docker |
| **macOS** | x64 (Intel) | ✅ Fully Supported | macOS 10.15+ (Catalina and later) |
| **macOS** | ARM64 (Apple Silicon) | ✅ Fully Supported | macOS 11+ (Big Sur and later) |
| **Windows** | x64 | ✅ Fully Supported | Windows 10 Build 19041+, Windows 11 |
| **Windows** | ARM64 | ⚠️ Experimental | Windows 11 ARM64 (limited testing) |

### Runtime Requirements

#### Node.js / Bun

The CLI requires one of the following JavaScript runtimes:

| Runtime | Version | Recommended | Notes |
|---------|---------|-------------|-------|
| **Bun** | 1.0.0+ | ✅ **Recommended** | Faster startup, better performance |
| **Node.js** | 18.0.0+ | ✅ Supported | LTS versions recommended (18, 20, 22) |

**Why Bun is recommended**:
- Faster CLI startup time (< 100ms vs ~500ms with Node.js)
- Lower memory footprint
- Better TypeScript support out of the box
- Improved performance for I/O operations

#### System Dependencies

**Linux**:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y curl git

# CentOS/RHEL
sudo yum install -y curl git

# Fedora
sudo dnf install -y curl git
```

**macOS**:
```bash
# Install Xcode Command Line Tools (if not already installed)
xcode-select --install

# Or use Homebrew
brew install curl git
```

**Windows**:
- Git for Windows: https://git-scm.com/download/win
- PowerShell 5.0+ (included in Windows 10+)
- No additional dependencies required

### Disk Space

- **Installation**: ~150 MB (including dependencies)
- **Runtime**: ~50 MB (CLI binary + cache)
- **Recommended free space**: 500 MB

### Network Requirements

- **Outbound HTTPS**: Required for downloading CLI and dependencies
- **Localhost access**: Required for Daemon communication (default: `127.0.0.1:3847`)
- **Firewall**: May need to allow port 3847 if Daemon runs on different machine

---

## Installation Methods

### Method 1: NPM Package (Recommended for Most Users)

The easiest way to install SpecForge CLI is via npm.

#### Prerequisites

- Node.js 18+ or Bun 1.0+
- npm 8+ (comes with Node.js)

#### Installation Steps

**Step 1: Install via npm**

```bash
npm install -g @specforge/cli
```

**Step 2: Verify installation**

```bash
specforge --version
```

**Expected output**:
```
SpecForge CLI v0.1.0
Platform: linux (x64)
```

#### Updating to Latest Version

```bash
npm update -g @specforge/cli
```

#### Uninstalling

```bash
npm uninstall -g @specforge/cli
```

---

### Method 2: Bun Installation (Fastest)

If you prefer Bun for better performance:

#### Prerequisites

- Bun 1.0+

#### Installation Steps

**Step 1: Install via Bun**

```bash
bun install -g @specforge/cli
```

**Step 2: Verify installation**

```bash
specforge --version
```

#### Updating

```bash
bun update -g @specforge/cli
```

---

### Method 3: Build from Source

For developers or advanced users who want to build from source.

#### Prerequisites

- Node.js 18+ or Bun 1.0+
- Git
- TypeScript 5.0+

#### Installation Steps

**Step 1: Clone the repository**

```bash
git clone https://github.com/specforge/specforge.git
cd specforge
```

**Step 2: Install dependencies**

```bash
# Using Bun (recommended)
bun install

# Or using npm
npm install
```

**Step 3: Build the CLI**

```bash
# Using Bun
bun run build

# Or using npm
npm run build
```

**Step 4: Link CLI globally**

```bash
# Using Bun
bun link packages/cli

# Or using npm
npm link packages/cli
```

**Step 5: Verify installation**

```bash
specforge --version
```

#### Updating from Source

```bash
cd specforge
git pull origin main
bun install
bun run build
```

---

### Method 4: Docker Container

For containerized environments or CI/CD pipelines.

#### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+ (optional)

#### Installation Steps

**Step 1: Pull the Docker image**

```bash
docker pull specforge/cli:latest
```

**Step 2: Create an alias for convenience**

```bash
# Linux/macOS
alias specforge='docker run --rm -v ~/.specforge:/root/.specforge specforge/cli:latest'

# Windows PowerShell
function specforge { docker run --rm -v $env:USERPROFILE\.specforge:/root/.specforge specforge/cli:latest @args }
```

**Step 3: Verify installation**

```bash
specforge --version
```

#### Using Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  specforge-cli:
    image: specforge/cli:latest
    volumes:
      - ~/.specforge:/root/.specforge
    environment:
      - SPECFORGE_DEBUG=0
    command: specforge --help
```

Run with:

```bash
docker-compose run specforge-cli --version
```

---

### Method 5: Homebrew (macOS)

For macOS users who prefer Homebrew.

#### Prerequisites

- Homebrew 3.0+

#### Installation Steps

**Step 1: Add SpecForge tap**

```bash
brew tap specforge/cli
```

**Step 2: Install CLI**

```bash
brew install specforge-cli
```

**Step 3: Verify installation**

```bash
specforge --version
```

#### Updating

```bash
brew upgrade specforge-cli
```

#### Uninstalling

```bash
brew uninstall specforge-cli
brew untap specforge/cli
```

---

### Method 6: Chocolatey (Windows)

For Windows users who prefer Chocolatey.

#### Prerequisites

- Chocolatey 0.10+
- PowerShell 5.0+

#### Installation Steps

**Step 1: Install via Chocolatey**

```powershell
choco install specforge-cli
```

**Step 2: Verify installation**

```powershell
specforge --version
```

#### Updating

```powershell
choco upgrade specforge-cli
```

#### Uninstalling

```powershell
choco uninstall specforge-cli
```

---

## Initial Configuration

### Step 1: Start the Daemon

The CLI requires the SpecForge Daemon to be running.

#### Start Daemon in Foreground (Development)

```bash
specforge daemon start
```

**Expected output**:
```
✓ Daemon started successfully
PID: 12345
Port: 3847
Bound to: 127.0.0.1
```

#### Start Daemon in Background (Production)

```bash
# Linux/macOS
specforge daemon start --detach

# Windows PowerShell
specforge daemon start --detach
```

**Expected output**:
```
✓ Daemon started in background
PID: 12345
```

#### Verify Daemon is Running

```bash
specforge daemon status
```

**Expected output**:
```
✓ Daemon Status: healthy
Version: 0.1.0
Uptime: 2h 15m
Message: Daemon is running normally
```

### Step 2: Configure Daemon (Optional)

#### Bind to Specific Address

By default, Daemon binds to `127.0.0.1` (localhost only). To allow remote connections:

```bash
specforge daemon config --bind 0.0.0.0
```

**⚠️ Security Warning**: Binding to `0.0.0.0` exposes the Daemon to the network. Always use authentication and firewall rules in production.

#### Enable/Disable Authentication

```bash
# Enable authentication (default)
specforge daemon config --require-auth

# Disable authentication (not recommended)
specforge daemon config --no-require-auth
```

### Step 3: Verify Configuration

```bash
specforge config
```

**Expected output**:
```
SpecForge CLI Configuration

Daemon:
  Host: 127.0.0.1
  Port: 3847
  Authenticated: Yes

CLI:
  Version: 0.1.0
  Config Directory: /home/user/.specforge
  Runtime Directory: /home/user/.specforge/runtime

System:
  Platform: linux (x64)
  Home Directory: /home/user
```

### Step 4: Create Configuration Files (Optional)

Configuration files are automatically created in `~/.specforge/`:

```
~/.specforge/
├── config.json              # CLI configuration
├── runtime/
│   ├── daemon.sock.json     # Daemon connection info
│   └── daemon.log           # Daemon logs
└── webhooks/
    └── registered.json      # Registered webhooks
```

#### Manual Configuration

Create `~/.specforge/config.json`:

```json
{
  "schema_version": "1.0",
  "daemon": {
    "host": "127.0.0.1",
    "port": 3847,
    "timeout_seconds": 30
  },
  "cli": {
    "color_enabled": true,
    "default_mode": "interactive",
    "max_content_size_kib": 64
  }
}
```

---

## Verification

### Quick Verification

Run the following commands to verify your installation:

#### 1. Check CLI Version

```bash
specforge --version
```

**Expected output**:
```
SpecForge CLI v0.1.0
Platform: linux (x64)
```

#### 2. Check Daemon Status

```bash
specforge daemon status
```

**Expected output**:
```
✓ Daemon Status: healthy
Version: 0.1.0
Uptime: 2h 15m
Message: Daemon is running normally
```

#### 3. Check Configuration

```bash
specforge config
```

**Expected output**: Configuration details (see Step 3 above)

#### 4. Test JSON Output

```bash
specforge daemon status --json
```

**Expected output**:
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 8100000,
  "message": "Daemon is running normally"
}
```

### Comprehensive Verification Script

Create a verification script to test all components:

**Linux/macOS** (`verify-installation.sh`):

```bash
#!/bin/bash

echo "=== SpecForge CLI Installation Verification ==="
echo

# Check CLI version
echo "1. Checking CLI version..."
if specforge --version > /dev/null 2>&1; then
  specforge --version
  echo "✓ CLI is installed"
else
  echo "✗ CLI is not installed or not in PATH"
  exit 1
fi
echo

# Check Daemon status
echo "2. Checking Daemon status..."
if specforge daemon status > /dev/null 2>&1; then
  specforge daemon status
  echo "✓ Daemon is running"
else
  echo "✗ Daemon is not running"
  echo "  Start with: specforge daemon start --detach"
  exit 1
fi
echo

# Check configuration
echo "3. Checking configuration..."
specforge config
echo "✓ Configuration is valid"
echo

# Test JSON output
echo "4. Testing JSON output..."
if specforge daemon status --json | jq . > /dev/null 2>&1; then
  echo "✓ JSON output is valid"
else
  echo "✗ JSON output is invalid"
  exit 1
fi
echo

echo "=== All checks passed! ==="
```

**Windows PowerShell** (`verify-installation.ps1`):

```powershell
Write-Host "=== SpecForge CLI Installation Verification ===" -ForegroundColor Green
Write-Host

# Check CLI version
Write-Host "1. Checking CLI version..." -ForegroundColor Cyan
try {
  $version = & specforge --version
  Write-Host $version
  Write-Host "✓ CLI is installed" -ForegroundColor Green
} catch {
  Write-Host "✗ CLI is not installed or not in PATH" -ForegroundColor Red
  exit 1
}
Write-Host

# Check Daemon status
Write-Host "2. Checking Daemon status..." -ForegroundColor Cyan
try {
  $status = & specforge daemon status
  Write-Host $status
  Write-Host "✓ Daemon is running" -ForegroundColor Green
} catch {
  Write-Host "✗ Daemon is not running" -ForegroundColor Red
  Write-Host "  Start with: specforge daemon start --detach"
  exit 1
}
Write-Host

# Check configuration
Write-Host "3. Checking configuration..." -ForegroundColor Cyan
& specforge config
Write-Host "✓ Configuration is valid" -ForegroundColor Green
Write-Host

# Test JSON output
Write-Host "4. Testing JSON output..." -ForegroundColor Cyan
try {
  $json = & specforge daemon status --json | ConvertFrom-Json
  Write-Host "✓ JSON output is valid" -ForegroundColor Green
} catch {
  Write-Host "✗ JSON output is invalid" -ForegroundColor Red
  exit 1
}
Write-Host

Write-Host "=== All checks passed! ===" -ForegroundColor Green
```

Run the verification script:

```bash
# Linux/macOS
chmod +x verify-installation.sh
./verify-installation.sh

# Windows PowerShell
.\verify-installation.ps1
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: `specforge: command not found`

**Symptoms**:
```
bash: specforge: command not found
```

**Causes**:
- CLI is not installed
- CLI is installed but not in PATH
- Installation failed silently

**Solutions**:

1. **Verify installation**:
   ```bash
   npm list -g @specforge/cli
   ```

2. **Check PATH**:
   ```bash
   echo $PATH
   ```

3. **Reinstall CLI**:
   ```bash
   npm uninstall -g @specforge/cli
   npm install -g @specforge/cli
   ```

4. **Manual PATH configuration** (if needed):
   
   **Linux/macOS** (add to `~/.bashrc` or `~/.zshrc`):
   ```bash
   export PATH="$HOME/.npm-global/bin:$PATH"
   ```
   
   **Windows PowerShell** (add to profile):
   ```powershell
   $env:Path += ";$env:APPDATA\npm"
   ```

---

#### Issue 2: `Daemon unreachable`

**Symptoms**:
```
Error: Daemon unreachable
Hint: Is the Daemon running? Try 'specforge daemon start'
```

**Causes**:
- Daemon is not running
- Daemon is running on different port
- Network connectivity issue
- Firewall blocking connection

**Solutions**:

1. **Check if Daemon is running**:
   ```bash
   specforge daemon status
   ```

2. **Start Daemon**:
   ```bash
   specforge daemon start --detach
   ```

3. **Check Daemon logs**:
   ```bash
   tail -f ~/.specforge/runtime/daemon.log
   ```

4. **Verify port is not in use**:
   
   **Linux/macOS**:
   ```bash
   lsof -i :3847
   ```
   
   **Windows PowerShell**:
   ```powershell
   netstat -ano | findstr :3847
   ```

5. **Check firewall** (if Daemon on different machine):
   ```bash
   # Linux
   sudo ufw allow 3847
   
   # macOS
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /path/to/daemon
   ```

---

#### Issue 3: `Authentication failed`

**Symptoms**:
```
Error: Authentication failed
Message: Invalid or missing authentication token
```

**Causes**:
- Handshake file is corrupted
- Daemon was restarted
- Token has expired

**Solutions**:

1. **Check handshake file**:
   ```bash
   cat ~/.specforge/runtime/daemon.sock.json
   ```

2. **Restart Daemon**:
   ```bash
   specforge daemon stop
   specforge daemon start --detach
   ```

3. **Verify handshake file exists**:
   ```bash
   ls -la ~/.specforge/runtime/daemon.sock.json
   ```

4. **Check file permissions**:
   ```bash
   chmod 600 ~/.specforge/runtime/daemon.sock.json
   ```

---

#### Issue 4: `Port already in use`

**Symptoms**:
```
Error: Port 3847 is already in use
```

**Causes**:
- Daemon is already running
- Another process is using port 3847
- Daemon crashed but port still in use

**Solutions**:

1. **Check if Daemon is already running**:
   ```bash
   specforge daemon status
   ```

2. **Find process using port**:
   
   **Linux/macOS**:
   ```bash
   lsof -i :3847
   ```
   
   **Windows PowerShell**:
   ```powershell
   netstat -ano | findstr :3847
   ```

3. **Kill process** (if needed):
   
   **Linux/macOS**:
   ```bash
   kill -9 <PID>
   ```
   
   **Windows PowerShell**:
   ```powershell
   Stop-Process -Id <PID> -Force
   ```

4. **Use different port**:
   ```bash
   specforge daemon config --port 3848
   specforge daemon start --detach
   ```

---

#### Issue 5: `Permission denied`

**Symptoms**:
```
Error: Permission denied
Message: Cannot access ~/.specforge directory
```

**Causes**:
- Incorrect file permissions
- Running as different user
- SELinux or AppArmor restrictions

**Solutions**:

1. **Fix directory permissions**:
   ```bash
   chmod 700 ~/.specforge
   chmod 600 ~/.specforge/runtime/daemon.sock.json
   ```

2. **Check ownership**:
   ```bash
   ls -la ~/.specforge
   ```

3. **Fix ownership** (if needed):
   ```bash
   chown -R $USER:$USER ~/.specforge
   ```

4. **Check SELinux** (Linux):
   ```bash
   getenforce
   ```

---

#### Issue 6: `Out of memory`

**Symptoms**:
```
Error: Out of memory
Message: Cannot allocate memory
```

**Causes**:
- Large payload processing
- Memory leak in Daemon
- System running low on memory

**Solutions**:

1. **Check available memory**:
   
   **Linux/macOS**:
   ```bash
   free -h
   ```
   
   **Windows PowerShell**:
   ```powershell
   Get-ComputerInfo | Select-Object TotalPhysicalMemory, FreePhysicalMemory
   ```

2. **Increase Node.js memory limit**:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   specforge daemon start --detach
   ```

3. **Restart Daemon**:
   ```bash
   specforge daemon stop
   specforge daemon start --detach
   ```

4. **Check for memory leaks**:
   ```bash
   specforge daemon status --verbose
   ```

---

#### Issue 7: `JSON parsing error`

**Symptoms**:
```
Error: Invalid JSON
Message: Failed to parse JSON output
```

**Causes**:
- CLI output contains non-JSON data
- Daemon returned error instead of JSON
- Encoding issue

**Solutions**:

1. **Check raw output**:
   ```bash
   specforge daemon status --json 2>&1
   ```

2. **Verify JSON validity**:
   ```bash
   specforge daemon status --json | jq .
   ```

3. **Check for encoding issues**:
   ```bash
   file ~/.specforge/runtime/daemon.sock.json
   ```

4. **Enable debug mode**:
   ```bash
   export SPECFORGE_DEBUG=1
   specforge daemon status --json
   ```

---

### Platform-Specific Issues

#### macOS: `xcrun: error: unable to find utility`

**Symptoms**:
```
xcrun: error: unable to find utility "xcode-select"
```

**Solution**:
```bash
xcode-select --install
```

---

#### Windows: `PowerShell execution policy`

**Symptoms**:
```
PowerShell: File cannot be loaded because running scripts is disabled
```

**Solution**:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

#### Linux: `libc version mismatch`

**Symptoms**:
```
error while loading shared libraries: libc.so.6
```

**Solution**:
```bash
# Update system libraries
sudo apt-get update
sudo apt-get upgrade -y

# Or use Docker for compatibility
docker run specforge/cli:latest --version
```

---

### Getting Help

If you encounter issues not covered above:

1. **Check logs**:
   ```bash
   tail -f ~/.specforge/runtime/daemon.log
   ```

2. **Enable debug mode**:
   ```bash
   export SPECFORGE_DEBUG=1
   specforge <command>
   ```

3. **Collect system information**:
   ```bash
   specforge --version
   specforge config
   uname -a  # Linux/macOS
   systeminfo  # Windows
   ```

4. **Report issue** with:
   - CLI version
   - Platform and OS version
   - Error message and logs
   - Steps to reproduce

---

## Uninstallation

### Remove CLI

#### NPM

```bash
npm uninstall -g @specforge/cli
```

#### Bun

```bash
bun uninstall -g @specforge/cli
```

#### Homebrew (macOS)

```bash
brew uninstall specforge-cli
brew untap specforge/cli
```

#### Chocolatey (Windows)

```powershell
choco uninstall specforge-cli
```

#### From Source

```bash
npm unlink packages/cli
# or
bun unlink packages/cli
```

### Remove Configuration and Data

**⚠️ Warning**: This will delete all configuration, logs, and cached data.

```bash
# Linux/macOS
rm -rf ~/.specforge

# Windows PowerShell
Remove-Item -Recurse -Force $env:USERPROFILE\.specforge
```

### Stop Daemon

```bash
specforge daemon stop
```

---

## Next Steps

After successful installation and setup:

1. **Read the [Command Reference](./command-reference.md)** to learn available commands
2. **Review the [OpenClaw Integration Guide](./openclaw-integration.md)** for automation setup
3. **Check the [CLI Design Document](../cli/design.md)** for architecture details
4. **Explore example workflows** in the repository

---

## Support

For additional help:

- **Documentation**: https://specforge.dev/docs
- **GitHub Issues**: https://github.com/specforge/specforge/issues
- **Community Forum**: https://community.specforge.dev
- **Email Support**: support@specforge.dev

---

**Document Version**: 1.0  
**Last Updated**: 2026-05-16  
**Schema Version**: 1.0
