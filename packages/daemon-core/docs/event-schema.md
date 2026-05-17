# Event Schema

The Daemon Core uses a well-defined event schema for all state changes. Events are written to `events.jsonl` (JSON Lines format) and serve as the authoritative source of truth.

## Event Structure

```typescript
interface Event {
  eventId: string;        // UUIDv7, globally unique
  ts: number;             // Unix timestamp (ms), monotonically non-decreasing
  projectId: string;      // Non-empty, project-aggregatable
  action: string;         // Event action type
  payload: Record<string, unknown>;  // Action-specific data
  metadata: {
    schemaVersion: string;   // Schema version (e.g., "1.0")
    source: 'daemon' | 'client' | 'adapter';  // Event origin
  };
}
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | string | UUIDv7, globally unique identifier |
| `ts` | number | Unix timestamp in milliseconds |
| `projectId` | string | Project identifier (non-empty) |
| `action` | string | Event action type |
| `payload` | object | Action-specific data |
| `metadata` | object | Event metadata |
| `metadata.schemaVersion` | string | Schema version (e.g., "1.0") |
| `metadata.source` | string | Event origin: `daemon`, `client`, or `adapter` |

## Event Actions

### Session Events

#### session.created

A new session has been registered (pending state).

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef0123456789",
  "ts": 1704067200000,
  "projectId": "/path/to/project",
  "action": "session.created",
  "payload": {
    "sessionId": "session-xyz-123",
    "agentRole": "sf-orchestrator",
    "workflowRole": "requirements-phase-executor",
    "workItemId": "task-456",
    "spawnIntentId": "intent-abc-789",
    "parentSessionId": null
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "client"
  }
}
```

#### session.activated

A pending session has been activated.

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef012345678a",
  "ts": 1704067201000,
  "projectId": "/path/to/project",
  "action": "session.activated",
  "payload": {
    "sessionId": "session-xyz-123",
    "spawnIntentId": "intent-abc-789"
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "adapter"
  }
}
```

#### session.terminated

An active session has been terminated (moved to history).

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef012345678b",
  "ts": 1704067250000,
  "projectId": "/path/to/project",
  "action": "session.terminated",
  "payload": {
    "sessionId": "session-xyz-123",
    "reason": "task_completed"
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "daemon"
  }
}
```

#### session.touched

Session activity heartbeat to update lastActiveAt.

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef012345678c",
  "ts": 1704067300000,
  "projectId": "/path/to/project",
  "action": "session.touched",
  "payload": {
    "sessionId": "session-xyz-123"
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "client"
  }
}
```

### Project Events

#### project.created

A new project context has been created.

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef012345678d",
  "ts": 1704067200000,
  "projectId": "/path/to/project",
  "action": "project.created",
  "payload": {
    "projectPath": "/path/to/project",
    "schemaVersion": "1.0"
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "daemon"
  }
}
```

#### project.updated

Project state has been updated.

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef012345678e",
  "ts": 1704067210000,
  "projectId": "/path/to/project",
  "action": "project.updated",
  "payload": {
    "projectPath": "/path/to/project",
    "updates": {
      "activeSessions": ["session-xyz-123"]
    }
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "daemon"
  }
}
```

### Security Events

#### permission.denied

Authentication or authorization failure.

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef012345678f",
  "ts": 1704067200000,
  "projectId": "",
  "action": "permission.denied",
  "payload": {
    "method": "GET",
    "path": "/events",
    "reason": "Invalid token",
    "clientIp": "127.0.0.1"
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "daemon"
  }
}
```

**Note**: `projectId` is empty for security events since there is no project context.

### Recovery Events

#### recovery.repaired

State inconsistency has been repaired.

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef0123456790",
  "ts": 1704067200000,
  "projectId": "/path/to/project",
  "action": "recovery.repaired",
  "payload": {
    "issueType": "state_mismatch",
    "description": "Rebuilt state from 42 events",
    "repairPath": "rebuild_from_events"
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "daemon"
  }
}
```

#### recovery.started

Daemon has started crash recovery.

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef0123456791",
  "ts": 1704067200000,
  "projectId": "/path/to/project",
  "action": "recovery.started",
  "payload": {
    "reason": "inconsistent_state",
    "detectedIssues": ["state_mismatch"]
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "daemon"
  }
}
```

### Work Item Events

#### workitem.started

A work item has started processing.

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef0123456792",
  "ts": 1704067200000,
  "projectId": "/path/to/project",
  "action": "workitem.started",
  "payload": {
    "workItemId": "task-456",
    "sessionId": "session-xyz-123",
    "workItemType": "requirements-analysis"
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "client"
  }
}
```

#### workitem.completed

A work item has been completed.

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef0123456793",
  "ts": 1704067250000,
  "projectId": "/path/to/project",
  "action": "workitem.completed",
  "payload": {
    "workItemId": "task-456",
    "sessionId": "session-xyz-123",
    "result": "success"
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "client"
  }
}
```

#### workitem.failed

A work item has failed.

```json
{
  "eventId": "0191a2b3-c4d5-6789-abcd-ef0123456794",
  "ts": 1704067250000,
  "projectId": "/path/to/project",
  "action": "workitem.failed",
  "payload": {
    "workItemId": "task-456",
    "sessionId": "session-xyz-123",
    "error": "validation_failed",
    "details": "Required field missing"
  },
  "metadata": {
    "schemaVersion": "1.0",
    "source": "client"
  }
}
```

## Event File Format

Events are stored in `events.jsonl` (JSON Lines format), one event per line:

```
{"eventId":"0191a2b3-c4d5-6789-abcd-ef0123456789","ts":1704067200000,"projectId":"/path/to/project","action":"session.created",...}
{"eventId":"0191a2b3-c4d5-6789-abcd-ef012345678a","ts":1704067201000,"projectId":"/path/to/project","action":"session.activated",...}
```

### Why JSON Lines?

- **Append-only**: Perfect for WAL (Write-Ahead Log)
- **Streaming**: Easy to process events as they arrive
- **Crash-safe**: No file locking required for writes
- **Line-based parsing**: Simple to parse, no complex deserialization

## Multi-Sync Readiness

The event schema is designed to support future multi-machine synchronization:

### Property 30 Compliance

1. **Global Uniqueness**: `eventId` uses UUIDv7 which includes timestamp and randomness, ensuring global uniqueness across machines.

2. **Monotonic Timestamps**: `ts` is monotonically non-decreasing within a single machine. Events written to the same project's events.jsonl always have non-decreasing timestamps.

3. **Project Aggregatable**: `projectId` is non-empty and can be used to filter events by project dimension for synchronization.

4. **Forward Compatibility**: 
   - Unknown fields in `payload` are ignored
   - New fields can be added without breaking existing parsers
   - `schemaVersion` allows for schema evolution

### Future Considerations

For multi-machine sync, consider:
- Adding `machineId` to track event origin
- Vector clocks for causality tracking
- Event batching for network efficiency