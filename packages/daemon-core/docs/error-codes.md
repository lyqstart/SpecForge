# Error Codes

The Daemon Core defines a comprehensive set of error codes for different failure scenarios. All error responses follow a consistent JSON format.

## Error Response Format

```json
{
  "error": "ErrorCode",
  "reason": "Human-readable description",
  "details": { }  // Optional additional context
}
```

## Error Categories

### Authentication Errors (4xx - Auth)

| Error Code | HTTP Status | Description | Resolution |
|------------|-------------|-------------|------------|
| `UNAUTHORIZED` | 401 | Missing or invalid Authorization header | Include valid `Authorization: Bearer <token>` header |
| `INVALID_TOKEN` | 401 | Token does not match server token | Re-read handshake file for current token |
| `TOKEN_EXPIRED` | 401 | Token has expired (future feature) | Restart daemon to get new token |

**Example**:
```json
{
  "error": "UNAUTHORIZED",
  "reason": "Missing or invalid Authorization header"
}
```

---

### Request Errors (4xx - Request)

| Error Code | HTTP Status | Description | Resolution |
|------------|-------------|-------------|------------|
| `BAD_REQUEST` | 400 | Invalid request body or parameters | Check request format and required fields |
| `INVALID_JSON` | 400 | Request body is not valid JSON | Ensure request body is valid JSON |
| `MISSING_FIELD` | 400 | Required field is missing | Include all required fields |
| `INVALID_FIELD` | 400 | Field has invalid value | Check field value format and constraints |
| `PAYLOAD_TOO_LARGE` | 413 | Request body exceeds 64 KiB limit | Use CAS blob reference for large payloads |

**Example**:
```json
{
  "error": "MISSING_FIELD",
  "reason": "Required field 'sessionId' is missing",
  "details": {
    "field": "sessionId"
  }
}
```

---

### Resource Errors (4xx - Resource)

| Error Code | HTTP Status | Description | Resolution |
|------------|-------------|-------------|------------|
| `NOT_FOUND` | 404 | Requested resource does not exist | Check resource ID and try again |
| `SESSION_NOT_FOUND` | 404 | Session ID not found | Verify session ID is correct |
| `PROJECT_NOT_FOUND` | 404 | Project not found | Verify project path is correct |
| `LOCK_NOT_FOUND` | 404 | Lock ID not found | Verify lock ID is correct |

**Example**:
```json
{
  "error": "SESSION_NOT_FOUND",
  "reason": "Session 'session-xyz' not found",
  "details": {
    "sessionId": "session-xyz"
  }
}
```

---

### Conflict Errors (4xx - Conflict)

| Error Code | HTTP Status | Description | Resolution |
|------------|-------------|-------------|------------|
| `CONFLICT` | 409 | Resource state conflict | Resolve conflict and retry |
| `SESSION_ACTIVE` | 409 | Session already active | Wait for session to complete or terminate |
| `PROJECT_LOCKED` | 409 | Project is locked by another session | Wait for lock to be released |
| `SPAWN_MISMATCH` | 409 | spawnIntentId does not match | Use correct spawnIntentId |

**Example**:
```json
{
  "error": "PROJECT_LOCKED",
  "reason": "Project '/path/to/project' is already locked",
  "details": {
    "projectPath": "/path/to/project",
    "lockedBy": "session-abc-123"
  }
}
```

---

### Startup Errors (5xx - Startup)

These errors occur during Daemon startup.

| Error Code | HTTP Status | Description | Resolution |
|------------|-------------|-------------|------------|
| `INSTANCE_RUNNING` | 500 | Another Daemon instance is already running | Stop existing instance or use different environment |
| `LOCK_FAILED` | 500 | Failed to acquire file lock | Check file permissions on `~/.specforge/runtime/` |
| `HANDSHAKE_FAILED` | 500 | Failed to write handshake file | Check directory permissions |
| `INITIALIZATION_FAILED` | 500 | Component initialization failed | Check logs for details |

**Example**:
```json
{
  "error": "INSTANCE_RUNNING",
  "reason": "Another Daemon instance is already running",
  "details": {
    "lockFile": "~/.specforge/runtime/daemon.lock"
  }
}
```

---

### Runtime Errors (5xx - Runtime)

These errors occur during Daemon operation.

| Error Code | HTTP Status | Description | Resolution |
|------------|-------------|-------------|------------|
| `INTERNAL_ERROR` | 500 | Unexpected internal error | Check logs, may need daemon restart |
| `WAL_WRITE_FAILED` | 500 | Failed to write to events.jsonl | Check disk space and permissions |
| `STATE_WRITE_FAILED` | 500 | Failed to write state.json | Check disk space and permissions |
| `FSYNC_FAILED` | 500 | Failed to fsync data to disk | Check disk health |
| `EVENT_BUS_ERROR` | 500 | Event Bus subscription/publish error | May need daemon restart |
| `RECOVERY_FAILED` | 500 | Crash recovery failed | Check data integrity |

**Example**:
```json
{
  "error": "WAL_WRITE_FAILED",
  "reason": "Failed to append event to events.jsonl",
  "details": {
    "eventId": "0191a2b3-c4d5-6789-abcd-ef0123456789",
    "errno": "ENOSPC"
  }
}
```

---

### Recovery Errors (5xx - Recovery)

These errors are related to crash recovery.

| Error Code | HTTP Status | Description | Resolution |
|------------|-------------|-------------|------------|
| `INCONSISTENT_STATE` | 500 | State inconsistency detected | Daemon will attempt automatic repair |
| `REPAIR_FAILED` | 500 | Failed to repair inconsistent state | Manual intervention required |
| `CORRUPTED_EVENTS` | 500 | events.jsonl is corrupted | May need to restore from backup |
| `CORRUPTED_STATE` | 500 | state.json is corrupted | May need to rebuild from events |

**Example**:
```json
{
  "error": "INCONSISTENT_STATE",
  "reason": "State lastEventId does not match last event in events.jsonl",
  "details": {
    "stateLastEventId": "event-123",
    "lastEventId": "event-456",
    "issueType": "state_mismatch"
  }
}
```

---

## Startup Error Details

### INSTANCE_RUNNING

**Cause**: Another Daemon instance is already running (file lock held)

**Resolution**:
1. Check for running processes: `ps aux | grep specforge`
2. Stop the existing daemon: `specforge daemon stop`
3. Or use a different runtime directory

**Log**:
```
Error: Another Daemon instance is already running
Lock file: ~/.specforge/runtime/daemon.lock
```

---

### LOCK_FAILED

**Cause**: Cannot create or acquire the file lock

**Resolution**:
1. Check directory permissions: `ls -la ~/.specforge/runtime/`
2. Remove stale lock file manually: `rm ~/.specforge/runtime/daemon.lock`
3. Check if directory exists, create if needed

---

### HANDSHAKE_FAILED

**Cause**: Cannot write the handshake file

**Resolution**:
1. Check directory exists: `ls -la ~/.specforge/runtime/`
2. Check write permissions
3. Create directory if needed: `mkdir -p ~/.specforge/runtime/`

---

## Runtime Error Details

### WAL_WRITE_FAILED

**Cause**: Cannot write to events.jsonl

**Resolution**:
1. Check disk space: `df -h`
2. Check file permissions: `ls -la ~/.specforge/projects/*/events.jsonl`
3. Check filesystem is not read-only

**Log**:
```
[ERROR] WAL: Failed to append event: ENOSPC
[ERROR] Event: {"eventId":"...","action":"..."}
```

---

### STATE_WRITE_FAILED

**Cause**: Cannot write to state.json

**Resolution**:
1. Check disk space
2. Check file permissions
3. Check filesystem is not read-only

---

### FSYNC_FAILED

**Cause**: Cannot sync data to disk

**Resolution**:
1. Check disk health: `smartctl -a /dev/sda`
2. Check filesystem: `fsck /dev/sdaN`
3. Consider migrating to different disk

---

## Recovery Error Details

### INCONSISTENT_STATE

**Cause**: events.jsonl and state.json are out of sync

**Resolution**: Daemon automatically attempts repair. If repair fails:
1. Check event log for corruption
2. Restore state.json from backup if available
3. Rebuild state from events.jsonl manually

**Automatic Repair**:
The Daemon will:
1. Load all events from events.jsonl
2. Rebuild state from events
3. Write repaired state to state.json
4. Log repair event

---

### CORRUPTED_EVENTS

**Cause**: events.jsonl contains invalid JSON or malformed data

**Resolution**:
1. Identify corrupted lines in events.jsonl
2. Remove or fix corrupted events
3. Rebuild state.json from remaining events

**Identification**:
```bash
# Find corrupted lines
while read line; do echo "$line" | jq . > /dev/null 2>&1 || echo "CORRUPT: $line"; done < ~/.specforge/projects/*/events.jsonl
```

---

## Error Handling Best Practices

### Client-Side

1. **Handle 401 errors**: Re-read handshake file and retry
2. **Handle 409 errors**: Implement retry with exponential backoff
3. **Handle 5xx errors**: Log and alert, consider daemon restart
4. **Implement circuit breaker**: Stop sending requests after N consecutive failures

### Server-Side Logging

All errors should be logged with:
- Timestamp
- Error code
- Request context (method, path, sessionId)
- Stack trace for 5xx errors

```javascript
console.error(`[ERROR] ${errorCode}: ${reason}`, {
  timestamp: new Date().toISOString(),
  method: req.method,
  path: req.url,
  sessionId: sessionId,
  stack: error.stack
});
```

---

## Future Error Codes

Planned future error codes:
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `QUOTA_EXCEEDED` - Resource quota exceeded
- `SESSION_TIMEOUT` - Session expired due to inactivity
- `MAINTENANCE_MODE` - Daemon in maintenance mode