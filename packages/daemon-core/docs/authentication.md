# Authentication

The Daemon Core uses Bearer Token authentication for all client communications. This document describes the authentication mechanism and how clients should interact with it.

## Overview

The Daemon uses a cryptographically secure random token that is:
- Generated on Daemon startup
- Written to a handshake file
- Validated on every HTTP request

## Handshake File

When the Daemon starts, it writes a handshake file to `~/.specforge/runtime/daemon.sock.json`:

```json
{
  "pid": 12345,
  "port": 8080,
  "token": "a1b2c3d4e5f6...",
  "startedAt": 1704067200000,
  "schemaVersion": "1.0"
}
```

### File Location

```
~/.specforge/runtime/daemon.sock.json
```

On Windows: `C:\Users\<username>\.specforge\runtime\daemon.sock.json`

### File Permissions

The handshake file is created with permissions `0600` (owner read/write only) to protect the token.

## Authentication Flow

### 1. Client Discovers Daemon

```javascript
import * as fs from 'fs';
import * as path from 'path';

async function discoverDaemon() {
  const handshakePath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.specforge',
    'runtime',
    'daemon.sock.json'
  );
  
  const content = fs.readFileSync(handshakePath, 'utf-8');
  const handshake = JSON.parse(content);
  
  return {
    pid: handshake.pid,
    port: handshake.port,
    token: handshake.token
  };
}
```

### 2. Client Connects with Token

Include the token in the `Authorization` header:

```javascript
const response = await fetch('http://127.0.0.1:8080/status', {
  headers: {
    'Authorization': `Bearer ${handshake.token}`
  }
});
```

### 3. Server Validates Token

The Daemon validates the token on every request:

```typescript
// Inside HTTPServer.ts
private validateToken(authHeader: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  return token === this.token;
}
```

### 4. Token Validation Response

**Success** (valid token):
```json
{
  "status": "running",
  "pid": 12345
}
```

**Failure** (invalid token):
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "UNAUTHORIZED",
  "reason": "Invalid token"
}
```

## Token Generation

Tokens are generated using Node.js crypto module:

```typescript
import { randomBytes } from 'crypto';

function generateToken(): string {
  // Generate 32 bytes (256 bits) of random data
  return randomBytes(32).toString('hex');
}
```

This produces a 64-character hexadecimal string (256 bits of entropy).

## Client Implementation Examples

### CLI Client

```typescript
import * as http from 'http';

class DaemonClient {
  private host: string;
  private port: number;
  private token: string;

  constructor(handshake: { port: number; token: string }) {
    this.host = '127.0.0.1';
    this.port = handshake.port;
    this.token = handshake.token;
  }

  private async request(path: string, options: http.RequestOptions = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: this.host,
        port: this.port,
        path,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        ...options
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(JSON.parse(data));
          }
        });
      });
      
      req.on('error', reject);
      req.end();
    });
  }

  async getStatus() {
    return this.request('/status');
  }

  async createSession(agentRole: string, workflowRole: string, workItemId: string) {
    return this.request('/session/create', {
      method: 'POST',
      body: JSON.stringify({ agentRole, workflowRole, workItemId })
    });
  }
}
```

### Browser Client (JavaScript)

```javascript
class DaemonClient {
  constructor(port, token) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.reason || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getStatus() {
    return this.request('/status');
  }

  async getSessions() {
    return this.request('/sessions');
  }
}

// Usage
const client = new DaemonClient(8080, 'a1b2c3d4e5f6...');
const status = await client.getStatus();
console.log('Daemon status:', status);
```

### EventSource (SSE) Client

```javascript
function connectToEventStream(port, token) {
  return new EventSource(`http://127.0.0.1:${port}/events`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
}

// Usage
const eventSource = connectToEventStream(8080, 'a1b2c3d4e5f6...');

eventSource.onopen = () => {
  console.log('Connected to event stream');
};

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data.action, data.payload);
};

eventSource.onerror = (error) => {
  console.error('EventSource error:', error);
  // Implement reconnection logic
};
```

## Security Considerations

### Token Security

1. **Random Generation**: Uses cryptographically secure random bytes
2. **File Permissions**: Handshake file is mode `0600` (owner-only)
3. **No Logging**: Tokens are never logged to console or files
4. **No URL Tokens**: Tokens only in Authorization header, not in URLs

### Token Validation

1. **Constant-Time Comparison**: Use constant-time comparison to prevent timing attacks
2. **Per-Request Validation**: Token validated on every request
3. **Permission Events**: Failed authentication triggers `permission.denied` event

### Best Practices

1. **Never hardcode tokens**: Always read from handshake file
2. **Validate handshake file**: Check `schemaVersion` field
3. **Handle missing file**: Daemon not running if handshake file missing
4. **Secure storage**: Don't store tokens in plain text files

## Error Handling

### Missing Handshake File

```javascript
try {
  const handshake = fs.readFileSync(handshakePath);
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('Daemon not running. Start with: specforge daemon start');
    process.exit(1);
  }
  throw error;
}
```

### Invalid Token

```javascript
try {
  const status = await client.getStatus();
} catch (error) {
  if (error.message.includes('401')) {
    // Token might be stale, re-read handshake file
    const handshake = readHandshakeFile();
    client = new DaemonClient(handshake.port, handshake.token);
    // Retry with new token
  }
  throw error;
}
```

### Token Rotation

In future versions, the Daemon may support token rotation. Clients should:

1. Handle 401 errors gracefully
2. Re-read handshake file on authentication failure
3. Implement retry with new token

## Testing Authentication

### Using curl

```bash
# Read token from handshake file
TOKEN=$(cat ~/.specforge/runtime/daemon.sock.json | jq -r '.token')

# Make authenticated request
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8080/status

# Test invalid token (should return 401)
curl -H "Authorization: Bearer invalid-token" http://127.0.0.1:8080/status

# Test missing token (should return 401)
curl http://127.0.0.1:8080/status
```

### Using Node.js

```javascript
const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 8080,
  path: '/status',
  headers: {
    'Authorization': 'Bearer a1b2c3d4e5f6...'
  }
};

http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
}).end();
```

## Future Enhancements

Planned authentication enhancements:
- Token expiration and rotation
- OAuth2 support for web UI
- Certificate-based authentication for machine-to-machine
- Multi-factor authentication