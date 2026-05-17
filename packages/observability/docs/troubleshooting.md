# Troubleshooting Guide

## Common Issues and Solutions

This guide covers common issues you may encounter when using the Observability module and how to resolve them.

---

## Event Bus Issues

### Events Not Being Recorded

**Symptom**: Events are emitted but not appearing in queries.

**Possible Causes**:
1. Mode filtering is preventing event recording
2. Event Bus not connected to Event Logger
3. Project ID mismatch

**Diagnosis**:
```typescript
// Check current mode
console.log(eventBus.getMode());

// Verify mode includes your event category
const eventData = {
  category: 'workflow',
  action: 'workflow.started',
  projectId: 'my-project',
  payload: {}
};

// Check if event would be recorded
// (internal check - events should emit normally)
```

**Solutions**:
1. Switch to appropriate mode:
   ```typescript
   eventBus.setMode('standard'); // or 'deep'
   ```
2. Ensure Event Logger is connected:
   ```typescript
   // Subscribe to all events and forward to logger
   for await (const event of eventBus.subscribe('*')) {
     await eventLogger.append(event);
   }
   ```
3. Verify project ID is set correctly

---

### Subscribers Not Receiving Events

**Symptom**: Subscriber callback never fires.

**Possible Causes**:
1. Pattern doesn't match event
2. Async iterator not being consumed
3. Subscriber cleaned up prematurely

**Diagnosis**:
```typescript
// Check subscriber count
console.log(eventBus._getSubscriberCount());

// Test with wildcard pattern
for await (const event of eventBus.subscribe('*')) {
  console.log('Received:', event.action);
  break; // Just test receipt
}
```

**Solutions**:
1. Use correct pattern format: `category.action` or wildcards
   ```typescript
   // Correct
   eventBus.subscribe('workflow.*');
   eventBus.subscribe('*.started');
   
   // Incorrect - missing category
   eventBus.subscribe('started');
   ```
2. Ensure async iterator is properly consumed:
   ```typescript
   // Must consume iterator for callback to fire
   const iterator = eventBus.subscribe('workflow.*');
   const event = await iterator.next();
   ```
3. Keep subscriber reference alive while needed

---

## CAS Issues

### Blob Not Found

**Symptom**: `retrieve()` returns null for valid blob reference.

**Possible Causes**:
1. Incorrect blob reference format
2. Blob was garbage collected
3. CAS storage path incorrect

**Diagnosis**:
```typescript
const ref = 'blob://dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f';

// Verify format
console.log(ref.startsWith('blob://'));

// Check if blob exists
const exists = await cas.exists(ref);
console.log('Blob exists:', exists);
```

**Solutions**:
1. Use correct reference format:
   ```typescript
   // Correct
   const ref = await cas.store(content);
   
   // Incorrect - missing blob:// prefix
   const ref = 'dffd6021bb2bd5b0...'; // Won't work!
   ```
2. Check garbage collection:
   ```typescript
   // Blobs with 0 reference count may be collected
   const count = await cas.getRefCount(hash);
   ```
3. Verify storage path:
   ```typescript
   const cas = new CAS('./correct/path');
   await cas.initialize();
   ```

### Content Addressing Mismatch

**Symptom**: Store returns unexpected blob reference.

**Possible Causes**:
1. Content encoding differences
2. Whitespace differences
3. Object key ordering differences

**Diagnosis**:
```typescript
const content = 'Hello, World!';
const ref = await cas.store(content);

// Manually compute expected hash
import { createHash } from 'crypto';
const expectedHash = createHash('sha256').update(content).digest('hex');
console.log('Expected:', 'blob://' + expectedHash);
console.log('Got:', ref);
```

**Solutions**:
1. Ensure consistent encoding:
   ```typescript
   // Use exact same content
   const ref1 = await cas.store('Hello');      // blob://...
   const ref2 = await cas.store('Hello');      // Same blob!
   const ref3 = await cas.store('Hello ');     // Different (trailing space)
   const ref4 = await cas.store('hello');      // Different (case)
   ```
2. For objects, ensure consistent serialization:
   ```typescript
   // Serialize consistently before storing
   const content = JSON.stringify({ b: 2, a: 1 }); // Deterministic order
   ```

---

## Event Logger Issues

### Events Not Persisting

**Symptom**: Events are emitted but not found in queries.

**Possible Causes**:
1. Logger not initialized
2. File system permissions
3. Disk space full

**Diagnosis**:
```typescript
// Check if initialized
try {
  await eventLogger.getEvents({ limit: 1 });
} catch (e) {
  console.log('Logger not initialized:', e);
}

// Check events path
console.log(eventLogger.getEventsPath());

// Check file exists
import { promises as fs } from 'fs';
const exists = await fs.access(eventLogger.getEventsPath());
```

**Solutions**:
1. Initialize logger:
   ```typescript
   const eventLogger = new EventLogger('./data/observability');
   await eventLogger.initialize();
   ```
2. Check permissions:
   ```bash
   ls -la ./data/observability/
   ```
3. Check disk space:
   ```bash
   df -h
   ```

### Query Returns No Events

**Symptom**: Query returns empty despite events being emitted.

**Possible Causes**:
1. Timestamp format mismatch (milliseconds vs nanoseconds)
2. Wrong project ID
3. Filter too restrictive

**Diagnosis**:
```typescript
// Check event count
console.log('Event count:', eventLogger.getEventCount());

// Try unfiltered query
const allEvents = await queryAPI.queryEventsSync({ limit: 10 });
console.log('Events found:', allEvents.length);

// Check timestamps
for (const event of allEvents) {
  console.log('Event ts:', event.ts);
  console.log('Now (ns):', Date.now() * 1000000);
}
```

**Solutions**:
1. Use correct timestamp format (nanoseconds!):
   ```typescript
   // Wrong - milliseconds
   const filter = { startTs: Date.now() - 3600000 };
   
   // Correct - nanoseconds
   const filter = { startTs: Date.now() * 1000000 - 3600000 * 1000000 };
   
   // Or use TimeRange in milliseconds (for Query API)
   const result = await queryAPI.analyzeScenario(scenario, {
     start: Date.now() - 3600000,  // milliseconds
     end: Date.now()
   });
   ```
2. Check project ID:
   ```typescript
   // Query without project filter first
   const events = await queryAPI.queryEventsSync({ limit: 100 });
   console.log('Project IDs:', [...new Set(events.map(e => e.projectId))]);
   ```
3. Relax filters:
   ```typescript
   // Start with minimal filter
   const events = await queryAPI.queryEventsSync({ limit: 100 });
   
   // Then narrow down
   const filtered = events.filter(e => e.category === 'workflow');
   ```

---

## Query API Issues

### Analysis Returns Null Root Cause

**Symptom**: `analyzeScenario()` returns no root cause.

**Possible Causes**:
1. No events in time range
2. Wrong scenario mapping
3. Events not matching scenario criteria

**Diagnosis**:
```typescript
const result = await queryAPI.analyzeScenario('gate-repeated-failure', {
  start: Date.now() - 3600000,
  end: Date.now()
});

console.log('Root cause:', result.rootCause);
console.log('Evidence count:', result.evidence.length);

// Check what events were found
if (result.evidence.length === 0) {
  // No events in range - expand time range
}
```

**Solutions**:
1. Expand time range:
   ```typescript
   const result = await queryAPI.analyzeScenario(scenario, {
     start: Date.now() - 86400000, // 24 hours
     end: Date.now()
   });
   ```
2. Verify scenario matches events:
   ```typescript
   // Check gate events exist
   const gateEvents = await queryAPI.queryEventsSync({
     category: 'gate'
   });
   console.log('Gate events:', gateEvents.length);
   ```
3. Check mode captures relevant events:
   ```typescript
   // Minimal mode may not capture enough events
   eventBus.setMode('standard');
   ```

### Permission Trace Fails

**Symptom**: `getPermissionTrace()` throws error.

**Possible Causes**:
1. Event ID not found
2. Missing required payload fields

**Diagnosis**:
```typescript
try {
  const trace = await queryAPI.getPermissionTrace(decisionId);
} catch (e) {
  console.error(e.message);
  // Check if event exists
  const events = await queryAPI.queryEventsSync({
    action: 'permission.evaluated',
    limit: 100
  });
  console.log('Available events:', events.length);
}
```

**Solutions**:
1. Verify event exists:
   ```typescript
   const events = await queryAPI.queryEventsSync({
     action: 'permission.evaluated'
   });
   const exists = events.some(e => e.eventId === decisionId);
   ```
2. Check event has required fields:
   ```typescript
   const event = events.find(e => e.eventId === decisionId);
   console.log('Payload:', event?.payload);
   ```

---

## Performance Issues

### Slow Query Performance

**Symptom**: Queries take longer than expected.

**Possible Causes**:
1. Large events.jsonl file
2. No index available
3. Too many events in result

**Solutions**:
1. Use pagination:
   ```typescript
   const result = await queryAPI.queryEvents(filter, {
     page: 0,
     pageSize: 50  // Limit results
   });
   ```
2. Use specific filters:
   ```typescript
   // Narrow down first
   const result = await queryAPI.queryEvents({
     projectId: 'specific-project',
     category: 'workflow',
     startTs: Date.now() * 1000000 - 3600000 * 1000000,
     limit: 100
   });
   ```
3. Check file size:
   ```typescript
   const stats = await eventLogger.getStats();
   console.log('File size:', stats.fileSize);
   ```

### High Memory Usage

**Symptom**: Application uses excessive memory.

**Possible Causes**:
1. Large payloads in memory
2. Too many events loaded
3. Project indices cached

**Solutions**:
1. Use minimal mode:
   ```typescript
   eventBus.setMode('minimal');
   ```
2. Limit query results:
   ```typescript
   const events = await queryAPI.queryEventsSync({
     limit: 100  // Don't load all events
   });
   ```
3. Clear old reports:
   ```typescript
   analyst.clearOldReports(50);
   ```

---

## Configuration Issues

### Mode Not Applying

**Symptom**: Changing mode has no effect.

**Possible Causes**:
1. Setting wrong component's mode
2. Mode set after events emitted
3. Project-specific mode overriding

**Solutions**:
1. Set mode on correct component:
   ```typescript
   // Set Event Bus mode for new events
   eventBus.setMode('deep');
   
   // Set Query API mode for existing data analysis
   // (mode doesn't affect querying, only recording)
   ```
2. Set mode before emitting events:
   ```typescript
   eventBus.setMode('deep');  // Set first
   await eventBus.emit(...);  // Then emit
   ```
3. Check project-specific settings:
   ```typescript
   console.log(queryAPI.getProjectMode('my-project'));
   console.log(queryAPI.getDefaultMode());
   ```

---

## Data Recovery

### Recovering After Crash

If the system crashes, you can rebuild state from events.jsonl:

```typescript
const eventLogger = new EventLogger('./data/observability');
await eventLogger.initialize();

// Rebuild state from WAL
const state = await eventLogger.rebuildState();
console.log('Recovered events:', state.eventCount);
console.log('Last event:', state.lastEventId);
```

### Verifying WAL Integrity

Check that all events can be read:

```typescript
let validCount = 0;
let invalidCount = 0;

for await (const event of eventLogger.getEvents({ limit: Infinity })) {
  validCount++;
}

console.log(`Valid events: ${validCount}`);
console.log(`Invalid events: ${invalidCount}`);
```

---

## Debugging Tips

### Enable Debug Logging

Most methods have console.log statements that can help:

```typescript
// Set mode - logs current mode
eventBus.setMode('deep');

// Store content - logs blob reference
const ref = await cas.store('test');

// Query events - logs filter applied
const events = await queryAPI.queryEventsSync({ category: 'workflow' });
```

### Check Component State

```typescript
// Event Bus
console.log('Mode:', eventBus.getMode());
console.log('Subscribers:', eventBus._getSubscriberCount());

// Event Logger
console.log('Event count:', eventLogger.getEventCount());
console.log('Last event:', eventLogger.getLastEventId());

// CAS
console.log('Stats:', await cas.getStats());

// Query API
console.log('Default mode:', queryAPI.getDefaultMode());
console.log('Project modes:', queryAPI.getAllProjectModes());
```

### Test Components Individually

```typescript
// Test Event Bus alone
const eb = new EventBus();
eb.subscribe('*').then(iter => {
  iter.next().then(console.log);
});
await eb.emit({ category: 'test', action: 'test', projectId: 'x' });

// Test CAS alone
const cas = new CAS('./test-cas');
await cas.initialize();
const ref = await cas.store('hello');
console.log('Stored:', ref);

// Test Event Logger alone
const el = new EventLogger('./test-events');
await el.initialize();
await el.append({ /* valid event */ });
```

---

## Getting Help

If you encounter issues not covered here:

1. **Check event schema**: Ensure events have all required fields
2. **Verify initialization**: All components must be initialized
3. **Check timestamps**: Use nanoseconds for Event.ts, milliseconds for TimeRange
4. **Review mode**: Ensure mode captures relevant events
5. **Check file permissions**: Verify write access to data directories