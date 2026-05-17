# OpenClaw Integration Guide

**Version**: 1.0  
**Last Updated**: 2026-05-16  
**Scope**: SpecForge CLI machine-friendly integration with OpenClaw automation platform

## Overview

This guide explains how to integrate SpecForge CLI with OpenClaw, a workflow automation platform. The CLI provides machine-friendly JSON output mode (`--json` flag) designed specifically for programmatic consumption by automation tools like OpenClaw.

### Key Features for OpenClaw Integration

- **Machine-friendly JSON output**: Stable, parseable, structured responses
- **Async command support**: Long-running operations return immediate job IDs for polling
- **Webhook integration**: Real-time event notifications for workflow triggers
- **Error codes**: Stable error codes for programmatic error handling
- **Payload size handling**: Automatic blob reference conversion for large content

---

## 1. OpenClaw Connection Configuration

### 1.1 Prerequisites

Before integrating with OpenClaw, ensure:

1. **SpecForge Daemon is running**:
   ```bash
   specforge daemon start --detach
   ```

2. **Daemon is accessible** from OpenClaw's network:
   - Default: `http://127.0.0.1:3000`
   - Configurable via: `specforge daemon config --bind <addr>`

3. **Authentication token is available**:
   - Located at: `~/.specforge/runtime/daemon.sock.json`
   - Contains: `token`, `port`, `pid`, `bound_to`

### 1.2 OpenClaw Configuration

In OpenClaw, configure a new SpecForge integration:

```yaml
# openclaw-config.yaml
integrations:
  specforge:
    type: "cli"
    daemon_url: "http://127.0.0.1:3000"
    cli_path: "/usr/local/bin/specforge"  # or full path to CLI binary
    auth_token_file: "~/.specforge/runtime/daemon.sock.json"
    timeout_seconds: 30
    retry_policy:
      max_attempts: 3
      backoff_multiplier: 2
      initial_delay_ms: 100
```

### 1.3 Daemon Configuration for OpenClaw

If OpenClaw runs on a different machine, configure Daemon to accept remote connections:

```bash
# Allow OpenClaw to connect from specific IP
specforge daemon config --bind 0.0.0.0 --require-auth

# Verify configuration
specforge daemon config
```

**Output (JSON mode)**:
```json
{
  "daemon": {
    "pid": 12345,
    "port": 3000,
    "bound_to": "0.0.0.0",
    "require_auth": true,
    "schema_version": "1.0"
  }
}
```

---

## 2. Authentication

### 2.1 API Key / Bearer Token

SpecForge uses Bearer token authentication. The token is automatically read from the handshake file:

```bash
# Token is automatically included in all CLI requests
specforge spec list --json
```

### 2.2 Two-Factor Confirmation (if enabled)

If Daemon requires two-factor confirmation:

```bash
# CLI will prompt for confirmation code
specforge spec start --spec-id my-spec

# In OpenClaw, handle the prompt:
# 1. Catch the "requires_confirmation" error
# 2. Prompt user for confirmation code
# 3. Retry with --confirmation-code flag
specforge spec start --spec-id my-spec --confirmation-code 123456 --json
```

**Error response (JSON mode)**:
```json
{
  "error": "requires_confirmation",
  "message": "Two-factor confirmation required",
  "confirmation_id": "conf_abc123",
  "hint": "Use --confirmation-code flag with the code sent to your device"
}
```

### 2.3 Token Refresh

Tokens are automatically refreshed by the CLI. If a token expires:

```bash
# CLI automatically refreshes and retries
# No manual intervention needed
specforge workflow list --json
```

If manual refresh is needed:

```bash
# Force token refresh
specforge auth refresh --json
```

---

## 3. Common Integration Scenarios

### 3.1 Creating a Spec (Async)

**Scenario**: OpenClaw needs to create a new spec and track its progress.

```bash
# Step 1: Start spec creation (returns immediately with jobId)
specforge spec start \
  --spec-id "my-feature" \
  --description "New feature implementation" \
  --json

# Response:
# {
#   "jobId": "job_abc123def456",
#   "status": "pending",
#   "command": "spec start",
#   "createdAt": 1715857200000
# }
```

**Step 2: Poll job status**:

```bash
# Poll until job reaches terminal state
specforge job job_abc123def456 --json

# Response (while running):
# {
#   "jobId": "job_abc123def456",
#   "status": "running",
#   "progress": 45,
#   "updatedAt": 1715857205000
# }

# Response (completed):
# {
#   "jobId": "job_abc123def456",
#   "status": "completed",
#   "result": {
#     "specId": "my-feature",
#     "createdAt": 1715857210000,
#     "url": "https://specforge.example.com/specs/my-feature"
#   },
#   "updatedAt": 1715857210000
# }
```

**Step 3: Handle terminal states**:

```typescript
// OpenClaw integration code
async function waitForSpecCreation(jobId: string, maxWaitMs = 300000) {
  const startTime = Date.now();
  const pollIntervalMs = 1000;
  
  while (Date.now() - startTime < maxWaitMs) {
    const response = await exec(`specforge job ${jobId} --json`);
    const status = JSON.parse(response);
    
    // Terminal states: completed, failed, blocked, cancelled
    if (['completed', 'failed', 'blocked', 'cancelled'].includes(status.status)) {
      return status;
    }
    
    await sleep(pollIntervalMs);
  }
  
  throw new Error(`Job ${jobId} did not complete within ${maxWaitMs}ms`);
}
```

### 3.2 Executing a Workflow

**Scenario**: OpenClaw needs to execute a workflow and wait for completion.

```bash
# Option A: Async execution (recommended for long workflows)
specforge workflow execute \
  --workflow-id "my-workflow" \
  --input '{"param1": "value1"}' \
  --json

# Response:
# {
#   "jobId": "job_xyz789",
#   "status": "pending"
# }

# Then poll with: specforge job job_xyz789 --json
```

```bash
# Option B: Synchronous execution with --wait (for short workflows)
specforge workflow execute \
  --workflow-id "my-workflow" \
  --input '{"param1": "value1"}' \
  --wait \
  --timeout 60 \
  --json

# Response (after completion):
# {
#   "jobId": "job_xyz789",
#   "status": "completed",
#   "result": {
#     "output": {...},
#     "executionTime": 5432
#   }
# }
```

### 3.3 Querying Results

**Scenario**: OpenClaw needs to fetch workflow results and handle large content.

```bash
# Query workflow results
specforge workflow result \
  --workflow-id "my-workflow" \
  --execution-id "exec_123" \
  --json

# Response (with automatic blob handling):
# {
#   "executionId": "exec_123",
#   "status": "completed",
#   "output": {
#     "largeContent": "blob://sha256:abc123...",  # >64 KiB content
#     "smallContent": "inline data"                # ≤64 KiB content
#   }
# }
```

**Resolving blob references**:

```bash
# Blob references are automatically resolved in interactive mode
# For JSON mode, use the blob resolution endpoint:
specforge blob resolve \
  --blob-ref "blob://sha256:abc123..." \
  --json

# Response:
# {
#   "blobRef": "blob://sha256:abc123...",
#   "content": "actual content here",
#   "size": 102400
# }
```

### 3.4 Webhook Setup for Event Monitoring

**Scenario**: OpenClaw needs real-time notifications when specs or workflows change.

```bash
# Register webhook
specforge webhook register \
  --url "https://openclaw.example.com/webhooks/specforge" \
  --events "spec.created,spec.updated,workflow.completed" \
  --secret "webhook_secret_key" \
  --json

# Response:
# {
#   "webhookId": "wh_abc123",
#   "url": "https://openclaw.example.com/webhooks/specforge",
#   "events": ["spec.created", "spec.updated", "workflow.completed"],
#   "enabled": true,
#   "createdAt": 1715857200000
# }
```

**Webhook payload format**:

```json
{
  "webhookId": "wh_abc123",
  "event": "spec.created",
  "timestamp": 1715857200000,
  "data": {
    "specId": "my-feature",
    "createdAt": 1715857200000,
    "creator": "user@example.com"
  },
  "signature": "sha256=abc123..."
}
```

**Verifying webhook signature** (in OpenClaw):

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## 4. Error Handling and Retry Strategy

### 4.1 Error Categories

| Error Code | HTTP Status | Meaning | Retry? |
|------------|-------------|---------|--------|
| `daemon_unreachable` | N/A | Daemon not running or network error | Yes (exponential backoff) |
| `auth_failed` | 401 | Invalid or expired token | Yes (refresh token) |
| `invalid_request` | 400 | Malformed command or arguments | No |
| `not_found` | 404 | Resource not found | No |
| `job_not_found` | 404 | Job ID doesn't exist | No |
| `job_failed` | 200 | Job completed with error | No (check job result) |
| `timeout` | 408 | Operation exceeded timeout | Yes (increase timeout) |
| `rate_limited` | 429 | Too many requests | Yes (exponential backoff) |
| `internal_error` | 500 | Daemon internal error | Yes (exponential backoff) |

### 4.2 Retry Strategy

**Recommended retry policy for OpenClaw**:

```typescript
interface RetryPolicy {
  maxAttempts: number;           // 3-5 attempts
  initialDelayMs: number;        // 100-500 ms
  maxDelayMs: number;            // 30000 ms (30 seconds)
  backoffMultiplier: number;     // 2.0
  jitterFactor: number;          // 0.1 (10% random jitter)
}

async function executeWithRetry(
  command: string,
  policy: RetryPolicy
): Promise<string> {
  let lastError: Error | null = null;
  let delayMs = policy.initialDelayMs;
  
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await exec(command);
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx)
      if (error.statusCode >= 400 && error.statusCode < 500) {
        throw error;
      }
      
      if (attempt < policy.maxAttempts) {
        // Add jitter to prevent thundering herd
        const jitter = delayMs * policy.jitterFactor * Math.random();
        const actualDelay = delayMs + jitter;
        
        console.log(`Retry attempt ${attempt}/${policy.maxAttempts} after ${actualDelay}ms`);
        await sleep(actualDelay);
        
        delayMs = Math.min(
          delayMs * policy.backoffMultiplier,
          policy.maxDelayMs
        );
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}
```

### 4.3 Error Response Format (JSON Mode)

```json
{
  "error": "daemon_unreachable",
  "message": "Failed to connect to Daemon at http://127.0.0.1:3000",
  "code": "ECONNREFUSED",
  "hint": "Is the Daemon running? Try 'specforge daemon start'",
  "timestamp": 1715857200000,
  "requestId": "req_abc123"
}
```

---

## 5. Performance Considerations

### 5.1 Payload Size Thresholding

The CLI automatically converts large content (>64 KiB) to blob references:

```bash
# Large content is automatically converted
specforge workflow result --workflow-id my-workflow --json

# Response:
# {
#   "output": {
#     "largeFile": "blob://sha256:abc123...",  # >64 KiB
#     "metadata": {...}                         # ≤64 KiB
#   }
# }
```

**Benefits for OpenClaw**:
- Reduced network bandwidth
- Faster JSON parsing
- Lazy loading of large content
- Automatic CAS deduplication

### 5.2 Timeout Configuration

**CLI-level timeout**:

```bash
# Set timeout for individual commands
specforge workflow execute \
  --workflow-id my-workflow \
  --timeout 60 \
  --json
```

**OpenClaw-level timeout** (recommended):

```typescript
// Set OS-level timeout to prevent hanging
const job = spawn('specforge', ['workflow', 'execute', '--json'], {
  timeout: 90000  // 90 seconds
});

job.on('error', (error) => {
  if (error.code === 'ETIMEDOUT') {
    console.error('Command timed out after 90 seconds');
  }
});
```

### 5.3 Polling Optimization

**Exponential backoff for job polling**:

```typescript
async function pollJobWithBackoff(jobId: string) {
  let pollIntervalMs = 500;   // Start with 500ms
  const maxIntervalMs = 10000; // Cap at 10 seconds
  
  while (true) {
    const status = await getJobStatus(jobId);
    
    if (isTerminalState(status)) {
      return status;
    }
    
    await sleep(pollIntervalMs);
    pollIntervalMs = Math.min(pollIntervalMs * 1.5, maxIntervalMs);
  }
}
```

### 5.4 Batch Operations

For bulk operations, use batch endpoints when available:

```bash
# Batch query multiple workflows
specforge workflow list \
  --filter 'status=completed' \
  --limit 100 \
  --json

# Response:
# {
#   "workflows": [...],
#   "total": 250,
#   "hasMore": true,
#   "nextCursor": "cursor_abc123"
# }
```

---

## 6. Complete Integration Example

Here's a complete OpenClaw integration example:

```typescript
// openclaw-specforge-adapter.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SpecForgeConfig {
  daemonUrl: string;
  cliPath: string;
  authTokenFile: string;
  timeoutSeconds: number;
}

class SpecForgeAdapter {
  constructor(private config: SpecForgeConfig) {}

  /**
   * Execute a SpecForge CLI command
   */
  private async executeCommand(args: string[]): Promise<any> {
    const command = `${this.config.cliPath} ${args.join(' ')} --json`;
    
    try {
      const { stdout } = await execAsync(command, {
        timeout: this.config.timeoutSeconds * 1000,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });
      
      return JSON.parse(stdout);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create a new spec (async)
   */
  async createSpec(specId: string, description: string): Promise<string> {
    const result = await this.executeCommand([
      'spec', 'start',
      '--spec-id', specId,
      '--description', description,
    ]);
    
    return result.jobId;
  }

  /**
   * Wait for a job to complete
   */
  async waitForJob(jobId: string, maxWaitMs = 300000): Promise<any> {
    const startTime = Date.now();
    let pollIntervalMs = 500;
    
    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.executeCommand(['job', jobId]);
      
      if (this.isTerminalState(status.status)) {
        return status;
      }
      
      await this.sleep(pollIntervalMs);
      pollIntervalMs = Math.min(pollIntervalMs * 1.5, 10000);
    }
    
    throw new Error(`Job ${jobId} did not complete within ${maxWaitMs}ms`);
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowId: string,
    input: Record<string, any>,
    waitForCompletion = false
  ): Promise<any> {
    const args = [
      'workflow', 'execute',
      '--workflow-id', workflowId,
      '--input', JSON.stringify(input),
    ];
    
    if (waitForCompletion) {
      args.push('--wait', '--timeout', '300');
    }
    
    const result = await this.executeCommand(args);
    
    if (waitForCompletion) {
      return result;
    }
    
    // For async execution, wait for job
    return this.waitForJob(result.jobId);
  }

  /**
   * Resolve blob references
   */
  async resolveBlob(blobRef: string): Promise<string> {
    const result = await this.executeCommand([
      'blob', 'resolve',
      '--blob-ref', blobRef,
    ]);
    
    return result.content;
  }

  /**
   * Register webhook
   */
  async registerWebhook(
    url: string,
    events: string[],
    secret?: string
  ): Promise<string> {
    const args = [
      'webhook', 'register',
      '--url', url,
      '--events', events.join(','),
    ];
    
    if (secret) {
      args.push('--secret', secret);
    }
    
    const result = await this.executeCommand(args);
    return result.webhookId;
  }

  /**
   * Check if status is terminal
   */
  private isTerminalState(status: string): boolean {
    return ['completed', 'failed', 'blocked', 'cancelled'].includes(status);
  }

  /**
   * Handle errors
   */
  private handleError(error: any): Error {
    if (error.code === 'ETIMEDOUT') {
      return new Error(`Command timed out after ${this.config.timeoutSeconds}s`);
    }
    
    if (error.stderr) {
      try {
        const errorJson = JSON.parse(error.stderr);
        return new Error(`${errorJson.error}: ${errorJson.message}`);
      } catch {
        return new Error(error.stderr);
      }
    }
    
    return error;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage in OpenClaw
const adapter = new SpecForgeAdapter({
  daemonUrl: 'http://127.0.0.1:3000',
  cliPath: '/usr/local/bin/specforge',
  authTokenFile: '~/.specforge/runtime/daemon.sock.json',
  timeoutSeconds: 30,
});

// Create spec and wait for completion
const jobId = await adapter.createSpec('my-feature', 'New feature');
const result = await adapter.waitForJob(jobId);
console.log('Spec created:', result.result.specId);

// Execute workflow
const workflowResult = await adapter.executeWorkflow(
  'my-workflow',
  { param1: 'value1' },
  true // wait for completion
);
console.log('Workflow completed:', workflowResult.result);
```

---

## 7. Troubleshooting

### 7.1 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `daemon_unreachable` | Daemon not running | Run `specforge daemon start` |
| `auth_failed` | Invalid token | Check `~/.specforge/runtime/daemon.sock.json` |
| `timeout` | Operation too slow | Increase `--timeout` or use async mode |
| `job_not_found` | Job ID expired | Jobs expire after 24 hours |
| `rate_limited` | Too many requests | Implement exponential backoff |

### 7.2 Debugging

Enable debug logging:

```bash
# Set debug environment variable
export SPECFORGE_DEBUG=1

# Run command
specforge workflow execute --workflow-id my-workflow --json
```

Check Daemon logs:

```bash
# View Daemon logs
specforge daemon logs --tail 100

# Or directly
tail -f ~/.specforge/runtime/daemon.log
```

### 7.3 Performance Tuning

**Optimize polling**:
- Start with 500ms interval
- Increase by 1.5x each poll
- Cap at 10 seconds

**Optimize batch operations**:
- Use `--limit` to control response size
- Use `--filter` to reduce data transfer
- Use pagination with `--cursor`

---

## 8. API Reference

### Commands for OpenClaw Integration

```bash
# Spec management
specforge spec start --spec-id <id> --description <desc> --json
specforge spec list --json
specforge spec status --spec-id <id> --json

# Workflow execution
specforge workflow execute --workflow-id <id> --input <json> [--wait] --json
specforge workflow status --workflow-id <id> --json
specforge workflow result --workflow-id <id> --execution-id <id> --json

# Job tracking
specforge job <jobId> --json
specforge job list --json

# Blob handling
specforge blob resolve --blob-ref <ref> --json

# Webhook management
specforge webhook register --url <url> --events <events> --json
specforge webhook list --json
specforge webhook delete --webhook-id <id> --json

# Daemon management
specforge daemon start --detach
specforge daemon stop
specforge daemon status --json
specforge daemon config --bind <addr> --json
```

---

## 9. Best Practices

1. **Always use `--json` flag** for OpenClaw integration
2. **Implement exponential backoff** for retries
3. **Use async mode** for long-running operations
4. **Resolve blobs lazily** only when needed
5. **Validate webhook signatures** for security
6. **Set appropriate timeouts** to prevent hanging
7. **Monitor job status** with reasonable polling intervals
8. **Handle all error codes** programmatically
9. **Log request IDs** for debugging
10. **Test error scenarios** thoroughly

---

## 10. Support and Feedback

For issues or questions about OpenClaw integration:

1. Check the [SpecForge CLI documentation](../cli/)
2. Review [error codes](#41-error-categories)
3. Enable [debug logging](#72-debugging)
4. Contact SpecForge support with request ID from error response

---

**Document Version**: 1.0  
**Last Updated**: 2026-05-16  
**Schema Version**: 1.0
