# User Guide: Three-Tier Observability Modes

## Overview

The Observability module provides three operational modes that balance detail level with resource consumption. This guide explains how to configure and use each mode effectively.

## Three-Tier Mode Comparison

| Mode | Records | Payload | Use Case |
|------|---------|---------|----------|
| **minimal** | Decision events only | No payloads | CI/CD, low-resource environments |
| **standard** (default) | All events | Excludes >64KiB | Daily development |
| **deep** | All events | Full payloads | Post-mortem, complex debugging |

---

## Mode 1: Minimal Mode

Minimal mode is designed for resource-constrained environments where only critical decision information is needed.

### What Gets Recorded

**Decision Events Only**:
- **Gate decisions**: `gate.passed`, `gate.failed`
- **Permission decisions**: `permission.evaluated` (allow/deny)
- **Workflow transitions**: `workflow.started`, `workflow.completed`, `workflow.failed`, `workflow.transition`

### Example Events in Minimal Mode

```json
{
  "eventId": "01HX...",
  "ts": 1704067200000000000,
  "category": "gate",
  "action": "gate.evaluated",
  "projectId": "abc123",
  "workItemId": "work-001",
  "payload": { "effect": "deny", "gateType": "code-review" }
}
```

### When to Use Minimal Mode

- **CI/CD pipelines**: Reduce storage overhead during automated builds
- **Production environments**: Minimize performance impact
- **Long-running processes**: When storage is limited
- **Debugging known issues**: When you only need decision context

### Configuration

```typescript
// Via EventBus
eventBus.setMode('minimal');

// Via QueryAPI for specific projects
queryAPI.setProjectMode('my-project', 'minimal');
```

### Limitations

- No payload data available for analysis
- Cannot trace detailed event chains
- Limited to decision-level debugging
- Cannot analyze modality adaptation decisions (REQ-14.6)

---

## Mode 2: Standard Mode (Default)

Standard mode is the default balance between observability and performance.

### What Gets Recorded

**All Events**:
- Workflow events (start, transition, complete, fail)
- Gate evaluations and results
- Permission decisions with full context
- Session events (start, prompt, response)
- Tool invocations and results
- Modality adaptation decisions (REQ-14.6)
- System events (upgrade, migration)

**Payload Handling**:
- Small payloads (< 64 KiB): Stored inline in events.jsonl
- Large payloads (> 64 KiB): Stored in CAS as blob references

### Payload Size Threshold

```typescript
// Automatic threshold: 64 KiB = 65,536 bytes
const payloadSize = JSON.stringify(payload).length;
const shouldStoreInCAS = payloadSize > 64 * 1024;
```

### Example Events in Standard Mode

```json
{
  "eventId": "01HX...",
  "ts": 1704067200000000000,
  "category": "workflow",
  "action": "workflow.completed",
  "projectId": "abc123",
  "workItemId": "work-001",
  "actor": { "id": "sf-executor", "name": "sf-executor", "type": "agent" },
  "payload": {
    "workflowName": "deploy",
    "result": { "status": "success", "duration": 45000 }
  }
}
```

### Large Payload Example

```json
{
  "eventId": "01HX...",
  "ts": 1704067200000000000,
  "category": "session",
  "action": "session.response",
  "projectId": "abc123",
  "payload": "...",
  "payloadBlobRef": "blob://dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"
}
```

### When to Use Standard Mode

- **Daily development**: Balance of detail and performance
- **General troubleshooting**: Most issues can be diagnosed
- **Team collaboration**: Shared observability without excessive data
- **Performance monitoring**: Standard operational visibility

### Configuration

```typescript
// Default mode - no configuration needed
const eventBus = new EventBus(); // Already in 'standard' mode

// Explicitly set standard mode
eventBus.setMode('standard');

// Per-project configuration
queryAPI.setProjectMode('production', 'standard');
```

---

## Mode 3: Deep Mode

Deep mode provides maximum observability for complex debugging and post-mortem analysis.

### What Gets Recorded

**All Events with Full Payloads**:
- Complete workflow execution traces
- Full prompt/response pairs for sessions
- Complete tool input/output data
- All permission evaluation context
- All system state changes

**Payload Handling**:
- All payloads stored in CAS as blob references
- Content preserved in full for analysis
- Enables reconstruction of complete execution context

### Example Events in Deep Mode

```json
{
  "eventId": "01HX...",
  "ts": 1704067200000000000,
  "category": "session",
  "action": "session.response",
  "projectId": "abc123",
  "workItemId": "work-001",
  "actor": { "id": "sf-planner", "name": "sf-planner", "type": "agent" },
  "payload": {
    "prompt": "Full original prompt with context...",
    "response": "Complete agent response...",
    "tokensUsed": 15000,
    "model": "claude-3-opus",
    "latency": 2500
  },
  "payloadBlobRef": "blob://a1b2c3d4..."
}
```

### When to Use Deep Mode

- **Post-mortem analysis**: After incidents to understand root causes
- **Complex debugging**: When standard mode lacks sufficient detail
- **Pattern analysis**: Understanding agent behavior over time
- **Compliance auditing**: Complete audit trails required
- **Performance optimization**: Detailed timing and token analysis

### Configuration

```typescript
// Via EventBus
eventBus.setMode('deep');

// Via QueryAPI for specific projects
queryAPI.setProjectMode('debug-project', 'deep');

// For specific debugging sessions
const eventBus = new EventBus();
eventBus.setMode('minimal'); // Start minimal

// Switch to deep when issue is reproduced
eventBus.setMode('deep');

// Reproduce issue...

// Switch back to minimal
eventBus.setMode('minimal');
```

---

## Runtime Mode Switching

All modes support runtime switching without restart:

```typescript
// Simple switch
eventBus.setMode('deep');

// Monitor mode changes
const currentMode = eventBus.getMode();
console.log(`Current mode: ${currentMode}`);
```

### Mode Switching Best Practices

1. **Start Minimal**: Begin with minimal mode in production
2. **Switch on Need**: Change to standard/deep when investigating issues
3. **Targeted Projects**: Use per-project modes to isolate debugging
4. **Revert After**: Switch back after issue is resolved

```typescript
// Example: Debug a specific project
async function debugProject(projectId: string) {
  // Save current mode
  const originalMode = queryAPI.getProjectMode(projectId);
  
  try {
    // Switch to deep mode
    queryAPI.setProjectMode(projectId, 'deep');
    
    // ... reproduce issue ...
    
    // Query detailed events
    const events = await queryAPI.queryEventsSync({
      projectId,
      startTs: Date.now() - 3600000
    });
    
    // Analyze...
  } finally {
    // Restore original mode
    queryAPI.setProjectMode(projectId, originalMode);
  }
}
```

---

## Per-Project Mode Configuration

You can configure different modes for different projects:

```typescript
// Set mode for specific project
queryAPI.setProjectMode('frontend-app', 'deep');
queryAPI.setProjectMode('backend-service', 'standard');
queryAPI.setProjectMode('legacy-system', 'minimal');

// Set default mode for new projects
queryAPI.setDefaultMode('standard');

// Get mode for a project
const mode = queryAPI.getProjectMode('frontend-app');

// Remove project-specific config (revert to default)
queryAPI.removeProjectMode('frontend-app');

// List all project configurations
const configs = queryAPI.getAllProjectModes();
// [{ projectId: 'frontend-app', mode: 'deep' }, ...]
```

---

## Storage Considerations

### Estimated Storage per Mode

Based on typical usage patterns:

| Mode | Events/Day | Storage/Day (typical) |
|------|------------|----------------------|
| minimal | ~1,000 | ~1 MB |
| standard | ~50,000 | ~50 MB |
| deep | ~50,000 | ~500 MB+ |

*Estimates vary based on payload sizes and event frequency.*

### CAS Storage

Large payloads (>64 KiB) are stored in CAS:

```typescript
// CAS automatically stores large payloads
const largePayload = { /* ... */ }; // > 64 KiB
await eventBus.emit({
  category: 'session',
  action: 'session.response',
  projectId: 'my-project',
  payload: largePayload
});

// Payload automatically stored as blob reference
// Event contains: payloadBlobRef: "blob://<sha256>"

// Retrieve later
const content = await queryAPI.getBlobContent('blob://<sha256>');
```

---

## Mode Selection Guide

### Decision Tree

```
Need detailed payload data for analysis?
├── Yes → Use 'deep' mode
└── No
    ├── CI/CD or automated builds?
    │   └── Yes → Use 'minimal' mode
    └── Production environment with resource constraints?
        └── Yes → Use 'minimal' mode
        └── General development?
            └── Yes → Use 'standard' mode (default)
```

### Quick Reference

| Scenario | Recommended Mode |
|----------|------------------|
| CI pipeline | minimal |
| Production monitoring | minimal |
| Daily development | standard |
| Investigating bug | standard → deep |
| Post-incident analysis | deep |
| Compliance audit | deep |
| Memory-constrained environment | minimal |

---

## Troubleshooting

### Mode Not Working as Expected

1. **Check current mode**:
   ```typescript
   console.log(eventBus.getMode());
   ```

2. **Verify project-specific settings**:
   ```typescript
   console.log(queryAPI.getProjectMode('my-project'));
   console.log(queryAPI.getDefaultMode());
   ```

3. **Check filter in Event Bus**:
   Events may be filtered before reaching the logger.

### Storage Growing Too Fast

1. Switch to minimal mode temporarily
2. Review event frequency
3. Enable CAS garbage collection:
   ```typescript
   await cas.garbageCollect();
   ```

### Can't Find Events

1. Verify mode includes the event category
2. Check time range filter (timestamps in nanoseconds!)
3. Verify project ID matches
4. Try querying without filters first