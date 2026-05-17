# HTTP Endpoints

The Daemon Core exposes the following HTTP/1.1 endpoints for client communication. All endpoints require Bearer Token authentication except where noted.

## Base URL

```
http://127.0.0.1:<port>
```

The port is dynamically allocated and written to the handshake file at `~/.specforge/runtime/daemon.sock.json`.

## Endpoints

### GET / - Health Check

Check if the Daemon is running and healthy.

**Authentication**: Not required

**Response**:
```json
{
  "status": "ok",
  "service": "daemon-core"
}
```

**Example**:
```bash
curl http://127.0.0.1:8080/
```

---

### GET /events - Server-Sent Events Stream

Subscribe to real-time events from the Event Bus. This endpoint maintains a long-lived connection and streams events as they occur.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (SSE format):
```
data: {"eventId":"...","ts":1234567890,"projectId":"...","action":"session.activated",...}

data: {"eventId":"...","ts":1234567891,"projectId":"...","action":"project.updated",...}
```

**Event Types**:
- `session.created` - New session registered
- `session.activated` - Session activated
- `session.terminated` - Session terminated
- `session.touched` - Session activity heartbeat
- `project.updated` - Project state changed
- `permission.denied` - Authentication failure
- `recovery.repaired` - State repair completed

**Example**:
```javascript
const eventSource = new EventSource('http://127.0.0.1:8080/events', {
  headers: {
    'Authorization': 'Bearer <token>'
  }
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received event:', data.action);
};
```

---

### POST /session/create - Create Session

Create a new pending session.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "agentRole": "sf-orchestrator",
  "workflowRole": "requirements-phase-executor",
  "workItemId": "task-123",
  "spawnIntentId": "intent-abc",
  "parentSessionId": "optional-parent-session-id"
}
```

**Response** (200):
```json
{
  "success": true,
  "session": {
    "sessionId": "session-xyz",
    "agentRole": "sf-orchestrator",
    "workflowRole": "requirements-phase-executor",
    "status": "pending",
    "createdAt": 1234567890000
  }
}
```

**Error Responses**:
- 400: Invalid request body
- 401: Unauthorized (missing/invalid token)

---

### POST /session/activate - Activate Session

Activate a pending session.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "sessionId": "session-xyz",
  "spawnIntentId": "intent-abc"
}
```

**Response** (200):
```json
{
  "success": true,
  "session": {
    "sessionId": "session-xyz",
    "status": "active",
    "lastActiveAt": 1234567890000
  }
}
```

**Error Responses**:
- 400: Invalid request body or session not found
- 401: Unauthorized
- 409: Session activation conflict (spawnIntentId mismatch)

---

### POST /session/terminate - Terminate Session

Terminate an active session.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "sessionId": "session-xyz"
}
```

**Response** (200):
```json
{
  "success": true,
  "session": {
    "sessionId": "session-xyz",
    "status": "history"
  }
}
```

**Error Responses**:
- 400: Invalid request body
- 401: Unauthorized
- 404: Session not found

---

### GET /session/:sessionId - Get Session

Get session details by ID.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (200):
```json
{
  "sessionId": "session-xyz",
  "agentRole": "sf-orchestrator",
  "workflowRole": "requirements-phase-executor",
  "status": "active",
  "createdAt": 1234567890000,
  "lastActiveAt": 1234567900000
}
```

**Error Responses**:
- 401: Unauthorized
- 404: Session not found

---

### GET /sessions - List All Sessions

List all sessions across all states.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters** (optional):
- `status`: Filter by status (`pending`, `active`, `history`)
- `limit`: Maximum number of sessions to return (default: 100)

**Response** (200):
```json
{
  "sessions": [
    {
      "sessionId": "session-xyz",
      "agentRole": "sf-orchestrator",
      "status": "active",
      "createdAt": 1234567890000
    }
  ],
  "total": 1
}
```

---

### GET /project/:projectId - Get Project State

Get the current state of a project.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (200):
```json
{
  "projectPath": "/path/to/project",
  "schemaVersion": "1.0",
  "activeSessions": ["session-xyz"],
  "workItems": [],
  "lastEventId": "event-123",
  "lastEventTs": 1234567890000
}
```

**Error Responses**:
- 401: Unauthorized
- 404: Project not found

---

### GET /projects - List Projects

List all active project contexts.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (200):
```json
{
  "projects": [
    "/path/to/project1",
    "/path/to/project2"
  ]
}
```

---

### POST /project/:projectId/lock - Acquire Project Lock

Acquire a write lock for a project to serialize concurrent operations.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (200):
```json
{
  "success": true,
  "lock": {
    "id": "lock-abc",
    "projectPath": "/path/to/project",
    "acquiredAt": 1234567890000,
    "expiresAt": 1234567920000
  }
}
```

**Error Responses**:
- 401: Unauthorized
- 409: Project already locked

---

### DELETE /project/:projectId/lock - Release Project Lock

Release a previously acquired project lock.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "lockId": "lock-abc"
}
```

**Response** (200):
```json
{
  "success": true
}
```

---

### GET /status - Daemon Status

Get the current status of the Daemon.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (200):
```json
{
  "status": "running",
  "pid": 12345,
  "startedAt": 1234567890000,
  "uptime": 3600000,
  "activeProjects": 2,
  "activeSessions": 5
}
```

---

### POST /daemon/stop - Stop Daemon

Gracefully stop the Daemon.

**Authentication**: Required

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (200):
```json
{
  "success": true,
  "message": "Daemon stopped gracefully"
}
```

---

## SSE Connection Management

### Connection Headers

The Server-Sent Events endpoint sets the following headers:
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

### Reconnection

Clients should implement automatic reconnection with exponential backoff:
```javascript
let retryCount = 0;
const maxRetries = 5;

eventSource.onerror = () => {
  if (retryCount < maxRetries) {
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    setTimeout(() => {
      // Reconnect
      retryCount++;
    }, delay);
  }
};
```

### Heartbeat

Clients can send periodic requests to `/session/touch` to keep sessions active:
```javascript
setInterval(() => {
  fetch('/session/touch', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sessionId: 'session-xyz' })
  });
}, 30000); // Every 30 seconds
```

## Rate Limiting

Currently, there is no rate limiting implemented. Future versions may include:
- Request rate limits per client
- Burst allowance
- Rate limit headers in responses