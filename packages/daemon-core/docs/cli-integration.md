# CLI Integration Guide

This guide covers how to integrate with the Daemon Core from command-line tools and scripts.

## Starting the Daemon

### Basic Startup (Thin Plugin Mode)

The daemon starts in thin plugin mode by default, which exits after 30 seconds of idle time:

```bash
# Start as thin plugin
bun run packages/daemon-core/src/index.ts
```

The daemon will:
1. Check for existing instance (single instance enforcement)
2. Generate a random bearer token
3. Write handshake file to `~/.specforge/runtime/daemon.sock.json`
4. Start HTTP server on a dynamic port
5. Exit after 30 seconds of inactivity

### Detached Mode (Persistent)

For long-running daemon instances:

```bash
# Start in detached mode
bun run packages/daemon-core/src/index.ts --detach
```

The daemon will:
1. Run in background
2. Not exit on idle (no timeout)
3. Remain running until explicitly stopped

### With Custom Runtime Directory

```bash
# Use custom runtime directory
SPECFORGE_RUNTIME_DIR=/tmp/specforge-runtime bun run packages/daemon-core/src/index.ts --detach
```

---

## Reading Handshake File

Before making any API requests, clients must read the handshake file to get connection details:

```bash
# Read handshake file (Unix)
cat ~/.specforge/runtime/daemon.sock.json

# Read handshake file (PowerShell)
Get-Content ~/.specforge/runtime/daemon.sock.json | ConvertFrom-Json
```

**Handshake file format:**

```json
{
  "port": 38472,
  "token": "a1b2c3d4e5f6g7h8i9j0",
  "pid": 12345,
  "schemaVersion": "1.0"
}
```

### Example: Bash Script to Read Handshake

```bash
#!/bin/bash

HANDSHAKE_FILE="$HOME/.specforge/runtime/daemon.sock.json"

# Wait for daemon to start (if needed)
for i in {1..30}; do
  if [ -f "$HANDSHAKE_FILE" ]; then
    break
  fi
  sleep 0.5
done

if [ ! -f "$HANDSHAKE_FILE" ]; then
  echo "Error: Daemon handshake file not found"
  exit 1
fi

# Extract values using jq
PORT=$(jq -r '.port' "$HANDSHAKE_FILE")
TOKEN=$(jq -r '.token' "$HANDSHAKE_FILE")

echo "Connecting to port $PORT with token $TOKEN"
```

### Example: PowerShell Script to Read Handshake

```powershell
$handshakePath = Join-Path $env:USERPROFILE ".specforge\runtime\daemon.sock.json"

# Wait for daemon to start (if needed)
$timeout = 15
$elapsed = 0
while (-not (Test-Path $handshakePath) -and $elapsed -lt $timeout) {
    Start-Sleep -Milliseconds 500
    $elapsed += 0.5
}

if (-not (Test-Path $handshakePath)) {
    Write-Error "Daemon handshake file not found"
    exit 1
}

$handshake = Get-Content $handshakePath | ConvertFrom-Json
$port = $handshake.port
$token = $handshake.token

Write-Host "Connecting to port $port with token $token"
```

---

## Making API Requests

### Health Check (No Auth Required)

```bash
# Get port and make health check request
PORT=$(jq -r '.port' ~/.specforge/runtime/daemon.sock.json)
curl "http://127.0.0.1:$PORT/"
```

Response:
```json
{
  "status": "ok",
  "service": "daemon-core"
}
```

### Authenticated Request (All Other Endpoints)

```bash
# Extract credentials
PORT=$(jq -r '.port' ~/.specforge/runtime/daemon.sock.json)
TOKEN=$(jq -r '.token' ~/.specforge/runtime/daemon.sock.json)

# Create a session
curl -X POST "http://127.0.0.1:$PORT/session/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentRole": "sf-orchestrator",
    "workflowRole": "requirements-phase-executor",
    "workItemId": "task-123",
    "spawnIntentId": "intent-abc"
  }'
```

---

## Complete Example: Session Lifecycle

```bash
#!/bin/bash
# Complete session lifecycle example

set -e

# Read handshake
HANDSHAKE_FILE="$HOME/.specforge/runtime/daemon.sock.json"
PORT=$(jq -r '.port' "$HANDSHAKE_FILE")
TOKEN=$(jq -r '.token' "$HANDSHAKE_FILE")
BASE_URL="http://127.0.0.1:$PORT"

echo "=== Step 1: Health Check ==="
curl -s "$BASE_URL/" | jq .

echo ""
echo "=== Step 2: Create Session ==="
SESSION_RESPONSE=$(curl -s -X POST "$BASE_URL/session/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentRole": "sf-orchestrator",
    "workflowRole": "requirements-phase-executor",
    "workItemId": "task-123",
    "spawnIntentId": "intent-abc"
  }')
echo "$SESSION_RESPONSE" | jq .

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.session.sessionId')
echo "Created session: $SESSION_ID"

echo ""
echo "=== Step 3: Activate Session ==="
curl -s -X POST "$BASE_URL/session/activate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"spawnIntentId\": \"intent-abc\"}" | jq .

echo ""
echo "=== Step 4: Get Session Details ==="
curl -s "$BASE_URL/session/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "=== Step 5: Terminate Session ==="
curl -s -X POST "$BASE_URL/session/terminate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\"}" | jq .

echo ""
echo "=== Session lifecycle complete ==="
```

---

## Complete Example: PowerShell

```powershell
# Complete session lifecycle example (PowerShell)

$handshakePath = Join-Path $env:USERPROFILE ".specforge\runtime\daemon.sock.json"
$handshake = Get-Content $handshakePath | ConvertFrom-Json

$port = $handshake.port
$token = $handshake.token
$baseUrl = "http://127.0.0.1:$port"
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "=== Step 1: Health Check ==="
Invoke-RestMethod -Uri "$baseUrl/" | ConvertTo-Json

Write-Host "`n=== Step 2: Create Session ==="
$createBody = @{
    agentRole = "sf-orchestrator"
    workflowRole = "requirements-phase-executor"
    workItemId = "task-123"
    spawnIntentId = "intent-abc"
} | ConvertTo-Json

$sessionResponse = Invoke-RestMethod -Uri "$baseUrl/session/create" `
    -Method Post `
    -Headers $headers `
    -Body $createBody

$sessionResponse | ConvertTo-Json
$sessionId = $sessionResponse.session.sessionId
Write-Host "Created session: $sessionId"

Write-Host "`n=== Step 3: Activate Session ==="
$activateBody = @{
    sessionId = $sessionId
    spawnIntentId = "intent-abc"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/session/activate" `
    -Method Post `
    -Headers $headers `
    -Body $activateBody | ConvertTo-Json

Write-Host "`n=== Step 4: Get Session Details ==="
Invoke-RestMethod -Uri "$baseUrl/session/$sessionId" `
    -Headers $headers | ConvertTo-Json

Write-Host "`n=== Step 5: Terminate Session ==="
$terminateBody = @{
    sessionId = $sessionId
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/session/terminate" `
    -Method Post `
    -Headers $headers `
    -Body $terminateBody | ConvertTo-Json

Write-Host "`n=== Session lifecycle complete ==="
```

---

## Daemon Control Commands

### Stop the Daemon Gracefully

```bash
PORT=$(jq -r '.port' ~/.specforge/runtime/daemon.sock.json)
TOKEN=$(jq -r '.token' ~/.specforge/runtime/daemon.sock.json)

curl -X POST "http://127.0.0.1:$PORT/daemon/stop" \
  -H "Authorization: Bearer $TOKEN"
```

Response:
```json
{
  "success": true,
  "message": "Daemon stopped gracefully"
}
```

### Get Daemon Status

```bash
PORT=$(jq -r '.port' ~/.specforge/runtime/daemon.sock.json)
TOKEN=$(jq -r '.token' ~/.specforge/runtime/daemon.sock.json)

curl -s "http://127.0.0.1:$PORT/status" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Response:
```json
{
  "status": "running",
  "pid": 12345,
  "startedAt": 1704067200000,
  "uptime": 3600000,
  "activeProjects": 2,
  "activeSessions": 5
}
```

---

## Using curl with Error Handling

```bash
#!/bin/bash
# Robust curl wrapper with error handling

request() {
  local method=$1
  local url=$2
  local data=$3
  
  # Read credentials
  HANDSHAKE_FILE="$HOME/.specforge/runtime/daemon.sock.json"
  PORT=$(jq -r '.port' "$HANDSHAKE_FILE" 2>/dev/null)
  TOKEN=$(jq -r '.token' "$HANDSHAKE_FILE" 2>/dev/null)
  
  if [ -z "$PORT" ] || [ -z "$TOKEN" ]; then
    echo "Error: Could not read handshake file" >&2
    return 1
  fi
  
  local fullUrl="http://127.0.0.1:$PORT$url"
  local authHeader="Authorization: Bearer $TOKEN"
  
  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$fullUrl" \
      -H "$authHeader" \
      -H "Content-Type: application/json")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$fullUrl" \
      -H "$authHeader" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi
  
  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | sed '$d')
  
  echo "$body" | jq . 2>/dev/null || echo "$body"
  
  if [ "$http_code" -ge 400 ]; then
    return 1
  fi
  return 0
}

# Usage examples
# request GET "/"
# request POST "/session/create" '{"agentRole": "sf-orchestrator", ...}'
```

---

## Common CLI Patterns

### Wait for Daemon to be Ready

```bash
#!/bin/bash
# Wait for daemon to start and be ready

HANDSHAKE_FILE="$HOME/.specforge/runtime/daemon.sock.json"
MAX_WAIT=30

for i in $(seq 1 $MAX_WAIT); do
  if [ -f "$HANDSHAKE_FILE" ]; then
    PORT=$(jq -r '.port' "$HANDSHAKE_FILE" 2>/dev/null)
    if [ -n "$PORT" ]; then
      # Try health check
      if curl -s "http://127.0.0.1:$PORT/" > /dev/null 2>&1; then
        echo "Daemon ready on port $PORT"
        exit 0
      fi
    fi
  fi
  sleep 1
done

echo "Timeout waiting for daemon"
exit 1
```

### Retry with Exponential Backoff

```bash
#!/bin/bash
# Retry request with exponential backoff

retry_request() {
  local max_retries=5
  local delay=1
  local attempt=0
  
  while [ $attempt -lt $max_retries ]; do
    attempt=$((attempt + 1))
    
    if curl -s -o /dev/null -w "%{http_code}" "$@" | grep -q "^[23]"; then
      return 0
    fi
    
    echo "Attempt $attempt failed, retrying in ${delay}s..."
    sleep $delay
    delay=$((delay * 2))
  done
  
  echo "All $max_retries attempts failed"
  return 1
}

# Usage
retry_request -X POST "http://127.0.0.1:$PORT/session/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentRole": "sf-orchestrator"}'
```