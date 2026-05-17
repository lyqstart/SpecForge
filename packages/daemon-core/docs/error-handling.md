# Error Handling Guide

This guide covers common error scenarios when integrating with the Daemon Core and how to handle them properly.

---

## Authentication Failures

### Handling 401 Unauthorized

The most common error scenario - missing or invalid authentication token.

```typescript
import * as http from 'http';

/**
 * Robust HTTP client with auth handling
 */
class DaemonClient {
  private port: number;
  private token: string;

  constructor(port: number, token: string) {
    this.port = port;
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: object): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: this.port,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          // Handle 401 - re-read handshake and retry once
          if (res.statusCode === 401) {
            this.handleAuthError(data)
              .then(() => this.request<T>(method, path, body))
              .then(resolve)
              .catch(reject);
            return;
          }

          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }

          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Handle authentication error by re-reading handshake file
   */
  private async handleAuthError(responseData: string): Promise<void> {
    try {
      const error = JSON.parse(responseData);
      
      if (error.error === 'INVALID_TOKEN') {
        console.warn('Token invalid, re-reading handshake file...');
        
        // Re-read handshake file
        const handshake = await readHandshakeFile();
        this.token = handshake.token;
        this.port = handshake.port;
        
        console.log(`Updated credentials: port=${this.port}`);
      } else if (error.error === 'UNAUTHORIZED') {
        // No token provided - get one
        console.warn('No token provided, reading handshake file...');
        const handshake = await readHandshakeFile();
        this.token = handshake.token;
        this.port = handshake.port;
      }
    } catch {
      // Response wasn't JSON, try reading handshake anyway
      const handshake = await readHandshakeFile();
      this.token = handshake.token;
      this.port = handshake.port;
    }
  }
}

/**
 * Read handshake file
 */
async function readHandshakeFile(): Promise<{ port: number; token: string }> {
  const handshakePath = `${process.env.HOME}/.specforge/runtime/daemon.sock.json`;
  const fs = await import('fs/promises');
  const content = await fs.readFile(handshakePath, 'utf-8');
  return JSON.parse(content);
}
```

### Handling Auth Errors in CLI (Bash)

```bash
#!/bin/bash
# Robust CLI request with auth retry

request() {
  local method=$1
  local url=$2
  local data=$3
  
  HANDSHAKE_FILE="$HOME/.specforge/runtime/daemon.sock.json"
  
  # Read credentials
  PORT=$(jq -r '.port' "$HANDSHAKE_FILE")
  TOKEN=$(jq -r '.token' "$HANDSHAKE_FILE")
  
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
  
  # Handle 401 - re-read handshake and retry once
  if [ "$http_code" = "401" ]; then
    echo "Auth error, re-reading handshake..." >&2
    
    # Re-read handshake
    PORT=$(jq -r '.port' "$HANDSHAKE_FILE")
    TOKEN=$(jq -r '.token' "$HANDSHAKE_FILE")
    
    # Retry request
    if [ -z "$data" ]; then
      response=$(curl -s -w "\n%{http_code}" -X "$method" "http://127.0.0.1:$PORT$url" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json")
    else
      response=$(curl -s -w "\n%{http_code}" -X "$method" "http://127.0.0.1:$PORT$url" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$data")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
  fi
  
  echo "$body"
  
  if [ "$http_code" -ge 400 ]; then
    return 1
  fi
  return 0
}
```

---

## Request Errors

### Handling 400 Bad Request

```typescript
/**
 * Handle 400 Bad Request errors
 */
async function handleBadRequest(error: Error): Promise<void> {
  try {
    const response = JSON.parse(error.message.replace(/^HTTP \d+: /, ''));
    
    switch (response.error) {
      case 'MISSING_FIELD':
        console.error(`Missing required field: ${response.details?.field}`);
        // Fix the missing field and retry
        break;
        
      case 'INVALID_FIELD':
        console.error(`Invalid field value: ${response.details?.field}`);
        console.error(`Expected: ${response.details?.expected}, got: ${response.details?.actual}`);
        // Fix the invalid field and retry
        break;
        
      case 'INVALID_JSON':
        console.error('Request body is not valid JSON');
        // Fix JSON syntax and retry
        break;
        
      case 'PAYLOAD_TOO_LARGE':
        console.error('Request exceeds 64KB limit, use CAS blob reference');
        // Implement CAS blob reference for large payloads
        break;
        
      default:
        console.error('Bad request:', response.reason);
    }
  } catch {
    console.error('Bad request (unable to parse response):', error.message);
  }
}
```

### Handling 409 Conflict

```typescript
/**
 * Handle 409 Conflict errors with retry logic
 */
async function handleConflict<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (!isConflictError(error)) {
        throw error;
      }
      
      attempt++;
      const errorInfo = parseConflictError(error);
      
      switch (errorInfo.error) {
        case 'SESSION_ACTIVE':
          console.warn('Session already active, waiting...');
          await sleep(2000); // Wait 2 seconds
          break;
          
        case 'PROJECT_LOCKED':
          console.warn(`Project locked by ${errorInfo.details?.lockedBy}, waiting for lock...`);
          await sleep(3000); // Wait 3 seconds for lock release
          break;
          
        case 'SPAWN_MISMATCH':
          console.error('Spawn intent ID mismatch, cannot retry');
          throw error;
          
        default:
          console.warn('Conflict, retrying...');
          await sleep(1000 * attempt);
      }
    }
  }
  
  throw new Error(`Max retries (${maxRetries}) exceeded for conflict`);
}

function isConflictError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('409');
}

function parseConflictError(error: unknown): { error: string; details?: any } {
  const message = error instanceof Error ? error.message : String(error);
  const jsonMatch = message.match(/HTTP 409: ({.*})/);
  
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }
  
  return { error: 'CONFLICT' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

---

## Daemon Not Running

### Handling Connection Errors

```typescript
/**
 * Handle daemon not running scenario
 */
class DaemonConnectionManager {
  private handshakePath: string;
  private maxWaitTime = 30000; // 30 seconds
  private pollInterval = 500; // 500ms

  constructor() {
    this.handshakePath = `${process.env.HOME}/.specforge/runtime/daemon.sock.json`;
  }

  /**
   * Wait for daemon to be available
   */
  async waitForDaemon(): Promise<{ port: number; token: string }> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.maxWaitTime) {
      try {
        const handshake = await this.readHandshakeFile();
        
        // Test connection
        await this.testConnection(handshake.port, handshake.token);
        
        return handshake;
      } catch {
        // Daemon not ready, wait and retry
        await this.sleep(this.pollInterval);
      }
    }
    
    throw new Error(`Daemon not available after ${this.maxWaitTime}ms`);
  }

  /**
   * Read handshake file
   */
  private async readHandshakeFile(): Promise<{ port: number; token: string }> {
    const fs = await import('fs/promises');
    
    try {
      const content = await fs.readFile(this.handshakePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error('Handshake file not found');
    }
  }

  /**
   * Test connection to daemon
   */
  private async testConnection(port: number, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/',
          method: 'GET',
          timeout: 2000,
        },
        (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timeout'));
      });

      req.end();
    });
  }

  /**
   * Start daemon if not running
   */
  async ensureDaemonRunning(): Promise<void> {
    // Check if daemon is already running
    if (await this.isDaemonRunning()) {
      return;
    }

    console.log('Daemon not running, starting...');
    
    // Start daemon in background
    const { spawn } = await import('child_process');
    const daemonProcess = spawn('bun', ['run', 'packages/daemon-core/src/index.ts'], {
      detached: true,
      stdio: 'ignore',
    });
    
    daemonProcess.unref();
    
    // Wait for daemon to be ready
    await this.waitForDaemon();
    
    console.log('Daemon started successfully');
  }

  /**
   * Check if daemon is running
   */
  private async isDaemonRunning(): Promise<boolean> {
    try {
      const handshake = await this.readHandshakeFile();
      await this.testConnection(handshake.port, handshake.token);
      return true;
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

## Recovery Scenarios

### Handling State Inconsistencies

```typescript
/**
 * Handle daemon recovery scenarios
 */
class RecoveryHandler {
  private client: DaemonClient;

  constructor(port: number, token: string) {
    this.client = new DaemonClient(port, token);
  }

  /**
   * Subscribe to recovery events
   */
  subscribeToRecoveryEvents(
    onRepairStarted: (details: any) => void,
    onRepairCompleted: (details: any) => void,
    onError: (error: Error) => void
  ): void {
    const eventSource = new EventSource(`http://127.0.0.1:${this.client.port}/events`, {
      headers: {
        'Authorization': `Bearer ${this.client.token}`,
      },
    });

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.action) {
        case 'recovery.started':
          onRepairStarted(data.payload);
          break;

        case 'recovery.repaired':
          onRepairCompleted(data.payload);
          break;
      }
    };

    eventSource.onerror = (error) => {
      onError(new Error('SSE connection error'));
    };
  }

  /**
   * Check daemon status and handle recovery state
   */
  async checkAndHandleRecovery(): Promise<void> {
    try {
      const status = await this.client.getStatus();
      
      if (status.recovering) {
        console.log('Daemon is recovering from inconsistent state...');
        console.log('Recovery progress:', status.recoveryProgress);
        
        // Wait for recovery to complete
        await this.waitForRecoveryComplete();
      }
    } catch (error) {
      console.error('Error checking recovery status:', error);
    }
  }

  /**
   * Wait for recovery to complete
   */
  private async waitForRecoveryComplete(): Promise<void> {
    while (true) {
      const status = await this.client.getStatus();
      
      if (!status.recovering) {
        console.log('Recovery completed');
        return;
      }
      
      await this.sleep(1000);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

## Circuit Breaker Pattern

### Implementing Circuit Breaker

```typescript
/**
 * Circuit breaker for Daemon API calls
 */
class DaemonCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  private readonly failureThreshold = 5;
  private readonly recoveryTimeout = 30000; // 30 seconds
  private readonly halfOpenMaxCalls = 3;

  constructor(
    private operation: () => Promise<any>
  ) {}

  async execute<T>(): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'half-open';
        console.log('Circuit breaker: entering half-open state');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await this.operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.state = 'closed';
      console.log('Circuit breaker: closed');
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      console.log('Circuit breaker: opened');
    }
  }

  getState(): string {
    return this.state;
  }
}

/**
 * Usage with circuit breaker
 */
async function makeResilientRequest<T>(
  request: () => Promise<T>
): Promise<T> {
  const breaker = new DaemonCircuitBreaker(request);
  return breaker.execute();
}

// Usage
const result = await makeResilientRequest(() =>
  client.request('POST', '/session/create', { ... })
);
```

---

## Complete Error Handling Example

```typescript
import * as http from 'http';
import * as fs from 'fs/promises';

/**
 * Complete error handling implementation
 */
class RobustDaemonClient {
  private port: number;
  private token: string;
  private handshakePath: string;

  constructor() {
    this.handshakePath = `${process.env.HOME}/.specforge/runtime/daemon.sock.json`;
    this.port = 0;
    this.token = '';
  }

  /**
   * Initialize: Read handshake and verify connection
   */
  async initialize(): Promise<void> {
    await this.refreshCredentials();
    await this.verifyConnection();
  }

  /**
   * Refresh credentials from handshake file
   */
  async refreshCredentials(): Promise<void> {
    try {
      const content = await fs.readFile(this.handshakePath, 'utf-8');
      const handshake = JSON.parse(content);
      this.port = handshake.port;
      this.token = handshake.token;
    } catch (error) {
      throw new Error('Failed to read handshake file: ' + (error as Error).message);
    }
  }

  /**
   * Verify connection to daemon
   */
  async verifyConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path: '/',
          method: 'GET',
          timeout: 5000,
        },
        (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Unexpected status: ${res.statusCode}`));
          }
        }
      );

      req.on('error', (error) => {
        reject(new Error('Connection failed: ' + error.message));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timeout'));
      });

      req.end();
    });
  }

  /**
   * Make request with full error handling
   */
  async request<T>(
    method: string,
    path: string,
    body?: object,
    options: { retries?: number; retryAuth?: boolean } = {}
  ): Promise<T> {
    const { retries = 3, retryAuth = true } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await this.doRequest<T>(method, path, body);
      } catch (error) {
        lastError = error as Error;

        // Handle specific error types
        if (error instanceof HttpError) {
          // Auth error - refresh credentials and retry
          if (error.statusCode === 401 && retryAuth && attempt < retries - 1) {
            console.warn(`Auth error on attempt ${attempt + 1}, refreshing credentials...`);
            await this.refreshCredentials();
            continue;
          }

          // Conflict error - wait and retry
          if (error.statusCode === 409 && attempt < retries - 1) {
            console.warn(`Conflict on attempt ${attempt + 1}, waiting...`);
            await this.sleep(1000 * (attempt + 1));
            continue;
          }

          // Client error - don't retry
          if (error.statusCode >= 400 && error.statusCode < 500) {
            throw error;
          }
        }

        // Server error or network error - retry
        if (attempt < retries - 1) {
          console.warn(`Request failed on attempt ${attempt + 1}, retrying...`);
          await this.sleep(1000 * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute HTTP request
   */
  private doRequest<T>(method: string, path: string, body?: object): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: this.port,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new HttpError(res.statusCode, data));
            return;
          }

          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Custom error class for HTTP errors
 */
class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}
```

---

## CLI Error Handling Example

```bash
#!/bin/bash
# Complete CLI error handling example

set -e

# Configuration
HANDSHAKE_FILE="$HOME/.specforge/runtime/daemon.sock.json"
MAX_RETRIES=3
RETRY_DELAY=2

# Function to read credentials
read_credentials() {
  if [ ! -f "$HANDSHAKE_FILE" ]; then
    echo "Error: Handshake file not found. Is daemon running?" >&2
    exit 1
  fi
  
  PORT=$(jq -r '.port' "$HANDSHAKE_FILE")
  TOKEN=$(jq -r '.token' "$HANDSHAKE_FILE")
  
  if [ -z "$PORT" ] || [ -z "$TOKEN" ]; then
    echo "Error: Invalid handshake file" >&2
    exit 1
  fi
}

# Function to make request with error handling
request() {
  local method=$1
  local path=$2
  local data=$3
  local attempt=${4:-1}
  
  read_credentials
  local fullUrl="http://127.0.0.1:$PORT$path"
  
  local response
  local http_code
  
  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$fullUrl" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$fullUrl" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | sed '$d')
  
  # Handle different status codes
  case $http_code in
    200|201)
      echo "$body"
      return 0
      ;;
    401)
      echo "Error: Authentication failed (401)" >&2
      echo "$body" | jq . 2>/dev/null || echo "$body" >&2
      # Try refreshing credentials once
      if [ $attempt -eq 1 ]; then
        echo "Retrying with refreshed credentials..." >&2
        sleep $RETRY_DELAY
        request "$method" "$path" "$data" 2
        return $?
      fi
      return 1
      ;;
    404)
      echo "Error: Resource not found (404)" >&2
      echo "$body" | jq . 2>/dev/null || echo "$body" >&2
      return 1
      ;;
    409)
      echo "Error: Conflict (409)" >&2
      echo "$body" | jq . 2>/dev/null || echo "$body" >&2
      # Retry with backoff
      if [ $attempt -lt $MAX_RETRIES ]; then
        echo "Retrying in $((RETRY_DELAY * attempt))s..." >&2
        sleep $((RETRY_DELAY * attempt))
        request "$method" "$path" "$data" $((attempt + 1))
        return $?
      fi
      return 1
      ;;
    5*)
      echo "Error: Server error ($http_code)" >&2
      echo "$body" | jq . 2>/dev/null || echo "$body" >&2
      # Retry with backoff
      if [ $attempt -lt $MAX_RETRIES ]; then
        echo "Retrying in $((RETRY_DELAY * attempt))s..." >&2
        sleep $((RETRY_DELAY * attempt))
        request "$method" "$path" "$data" $((attempt + 1))
        return $?
      fi
      return 1
      ;;
    *)
      echo "Error: Unexpected response ($http_code)" >&2
      echo "$body" >&2
      return 1
      ;;
  esac
}

# Example usage
echo "=== Creating session ==="
request POST "/session/create" '{"agentRole":"sf-orchestrator","workflowRole":"requirements-phase-executor","workItemId":"task-123","spawnIntentId":"intent-abc"}' | jq .

echo "=== Activating session ==="
SESSION_ID=$(request POST "/session/create" '...' | jq -r '.session.sessionId')
request POST "/session/activate" "{\"sessionId\":\"$SESSION_ID\",\"spawnIntentId\":\"intent-abc\"}" | jq .

echo "=== Session lifecycle complete ==="
```

---

## Logging and Monitoring

### Structured Error Logging

```typescript
/**
 * Structured error logging for debugging
 */
function logError(
  context: string,
  error: unknown,
  details?: Record<string, any>
): void {
  const timestamp = new Date().toISOString();
  const errorObj = {
    timestamp,
    context,
    error: {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
    details,
  };

  console.error(JSON.stringify(errorObj, null, 2));
}

// Usage
try {
  await client.createSession({ ... });
} catch (error) {
  logError('session.create', error, {
    agentRole: 'sf-orchestrator',
    workflowRole: 'requirements-phase-executor',
  });
}
```

---

## Best Practices Summary

1. **Always handle 401 errors** - Re-read handshake file and retry
2. **Implement retry with backoff** - For 5xx and transient errors
3. **Don't retry client errors (4xx)** - Except 409 Conflict with proper handling
4. **Use circuit breaker** - To prevent cascading failures
5. **Log structured errors** - For debugging and monitoring
6. **Implement connection verification** - Before making requests
7. **Handle daemon not running** - Start daemon or wait for it
8. **Subscribe to recovery events** - To handle state inconsistencies