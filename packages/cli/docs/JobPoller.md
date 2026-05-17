# JobPoller - Optimized Async Job Polling (Task 9.2)

## Overview

`JobPoller` is an optimized polling mechanism for tracking asynchronous job status with exponential backoff. It replaces fixed-interval polling with intelligent, adaptive polling that reduces CPU usage and improves response times.

## Features

- **Exponential Backoff**: Intervals grow exponentially (100ms → 5s) to reduce CPU usage during long waits
- **Configurable Intervals**: Min/max intervals (default: 100ms - 5s)
- **AbortSignal Support**: Clean cancellation with proper resource cleanup
- **Jitter**: Randomization prevents thundering herd problem
- **Async Resource Cleanup**: Proper timer and listener cleanup (A1/C4 compliance)
- **Batch Polling**: Poll multiple jobs in parallel
- **Statistics**: Get interval statistics for performance analysis

## Installation

```typescript
import { JobPoller, createJobPoller } from '@specforge/cli/job';
```

## Basic Usage

### Simple Polling

```typescript
const poller = new JobPoller({
  minInterval: 100,    // Start at 100ms
  maxInterval: 5000,   // Cap at 5s
});

const result = await poller.poll('job-123', async (jobId) => {
  // Fetch job status from daemon
  const response = await fetch(`/jobs/${jobId}`);
  const data = await response.json();
  
  return {
    jobId,
    status: data.status,
    isTerminal: ['completed', 'failed', 'blocked', 'cancelled'].includes(data.status),
    result: data.result,
    error: data.error,
    timestamp: Date.now(),
  };
}, {
  timeout: 60000, // 60 second timeout
  onUpdate: (result) => console.log(`Status: ${result.status}`),
});

console.log(`Job completed: ${result.status}`);
```

### With AbortSignal

```typescript
const controller = new AbortController();

// Cancel polling after 30 seconds
setTimeout(() => controller.abort(), 30000);

try {
  const result = await poller.poll('job-123', pollFn, {
    timeout: 60000,
    signal: controller.signal,
  });
} catch (error) {
  if (error.code === 'POLLING_ABORTED') {
    console.log('Polling was cancelled');
  }
}
```

### Batch Polling

```typescript
const jobIds = ['job-1', 'job-2', 'job-3'];

const results = await poller.pollMultiple(jobIds, async (jobId) => {
  // Fetch status for each job
  const response = await fetch(`/jobs/${jobId}`);
  const data = await response.json();
  
  return {
    jobId,
    status: data.status,
    isTerminal: isTerminalStatus(data.status),
    timestamp: Date.now(),
  };
}, {
  timeout: 60000,
});

// results is a Map<jobId, PollResult>
for (const [jobId, result] of results) {
  console.log(`${jobId}: ${result.status}`);
}
```

## Configuration

### JobPollerConfig

```typescript
interface JobPollerConfig {
  /** Minimum polling interval in milliseconds (default: 100) */
  minInterval?: number;
  
  /** Maximum polling interval in milliseconds (default: 5000) */
  maxInterval?: number;
  
  /** Backoff multiplier (default: 2.0) */
  multiplier?: number;
  
  /** Randomization factor for jitter (0.0-1.0, default: 0.1) */
  randomizationFactor?: number;
  
  /** Terminal states set (default: ['completed', 'failed', 'blocked', 'cancelled']) */
  terminalStates?: Set<string>;
}
```

### PollOptions

```typescript
interface PollOptions {
  /** Maximum time to poll in milliseconds (default: 300000 = 5 min) */
  timeout?: number;
  
  /** Callback on each poll result */
  onUpdate?: (result: PollResult) => void;
  
  /** Callback on poll error */
  onError?: (error: Error) => void;
  
  /** External abort signal for cancellation */
  signal?: AbortSignal;
}
```

## Exponential Backoff Algorithm

The polling interval is calculated using:

```
interval = min(maxInterval, minInterval * multiplier^attempt) * (1 + jitter)
```

Where:
- `attempt` is the current poll attempt (0-indexed)
- `jitter` is a random value in [0, randomizationFactor]

### Example Intervals (default config, no jitter)

| Attempt | Interval |
|---------|----------|
| 0       | 100ms    |
| 1       | 200ms    |
| 2       | 400ms    |
| 3       | 800ms    |
| 4       | 1600ms   |
| 5       | 3200ms   |
| 6+      | 5000ms   |

## Performance Characteristics

### CPU Efficiency

- **Idle polling**: < 5% CPU usage (verified by performance tests)
- **Memory**: Minimal overhead, no memory leaks
- **Throughput**: Can handle 100+ concurrent jobs efficiently

### Interval Statistics

```typescript
const stats = poller.getIntervalStats(10);
console.log(`Min interval: ${stats.minInterval}ms`);
console.log(`Max interval: ${stats.maxInterval}ms`);
console.log(`Avg interval: ${stats.avgInterval}ms`);
console.log(`Total time: ${stats.totalTime}ms`);
```

## Error Handling

### PollingTimeoutError

Thrown when polling exceeds the timeout without reaching terminal state.

```typescript
try {
  await poller.poll('job-123', pollFn, { timeout: 5000 });
} catch (error) {
  if (error instanceof PollingTimeoutError) {
    console.log(`Timeout after ${error.timeoutMs}ms`);
    console.log(`Suggestion: ${error.suggestion}`);
  }
}
```

### PollingAbortedError

Thrown when polling is cancelled via AbortSignal.

```typescript
try {
  await poller.poll('job-123', pollFn, { signal: controller.signal });
} catch (error) {
  if (error instanceof PollingAbortedError) {
    console.log(`Polling cancelled: ${error.reason}`);
  }
}
```

## Async Resource Cleanup

JobPoller implements proper async resource cleanup (A1/C4 compliance):

- **Timers**: All setTimeout calls are cleared in finally block
- **Listeners**: AbortSignal listeners are removed after polling completes
- **No leaks**: Verified by vitest's detectOpenHandles

```typescript
// Resources are automatically cleaned up
const result = await poller.poll('job-123', pollFn);
// No dangling timers or listeners remain
```

## Integration with JobTracker

JobPoller can be used with JobTracker for complete async job management:

```typescript
import { JobTracker } from '@specforge/cli/job';

const tracker = new JobTracker({ client: daemonClient });
const poller = new JobPoller();

// Create a job
const job = await tracker.createJob('spec start', { template: 'default' });

// Poll for completion
const result = await poller.poll(job.jobId, async (jobId) => {
  const status = await tracker.getJobStatus(jobId);
  return {
    jobId,
    status: status.status,
    isTerminal: isTerminalStatus(status.status),
    result: status.result,
    error: status.error,
    timestamp: Date.now(),
  };
});
```

## Testing

### Unit Tests

```bash
bun test packages/cli/tests/unit/JobPoller.test.ts
```

Covers:
- Configuration validation
- Polling logic
- Timeout handling
- AbortSignal support
- Async resource cleanup
- Error handling

### Performance Tests

```bash
bun test packages/cli/tests/unit/JobPoller.performance.test.ts
```

Verifies:
- CPU efficiency (< 5% idle)
- Memory usage
- Exponential backoff behavior
- Throughput with concurrent jobs

## Best Practices

1. **Use appropriate intervals**: Adjust minInterval/maxInterval based on job type
   - Short jobs (< 5s): minInterval=100ms, maxInterval=1s
   - Medium jobs (5-30s): minInterval=500ms, maxInterval=2s
   - Long jobs (> 30s): minInterval=1s, maxInterval=5s

2. **Provide callbacks**: Use onUpdate for progress indication
   ```typescript
   await poller.poll(jobId, pollFn, {
     onUpdate: (result) => updateProgressBar(result.status),
   });
   ```

3. **Handle errors**: Always catch and handle PollingTimeoutError and PollingAbortedError
   ```typescript
   try {
     await poller.poll(jobId, pollFn);
   } catch (error) {
     if (error instanceof PollingTimeoutError) {
       // Handle timeout
     } else if (error instanceof PollingAbortedError) {
       // Handle abort
     }
   }
   ```

4. **Use batch polling**: For multiple jobs, use pollMultiple instead of sequential polls
   ```typescript
   // Good: Parallel polling
   const results = await poller.pollMultiple(jobIds, pollFn);
   
   // Avoid: Sequential polling
   for (const jobId of jobIds) {
     await poller.poll(jobId, pollFn);
   }
   ```

5. **Clean up resources**: Always use AbortSignal for cancellation
   ```typescript
   const controller = new AbortController();
   setTimeout(() => controller.abort(), timeout);
   
   try {
     await poller.poll(jobId, pollFn, { signal: controller.signal });
   } finally {
     // Resources are automatically cleaned up
   }
   ```

## Compliance

JobPoller implements the following engineering standards:

- **A1 (败者清理)**: Timer cleanup in finally block
- **A2 (终止可达)**: Abort signal in finally block
- **A3 (推优于拉)**: Supports event-driven callbacks via onUpdate
- **C3 (超时根因)**: Timeout errors include operation, timeoutMs, suggestion
- **C4 (可清理 API)**: Proper resource cleanup with AbortSignal support
- **T2 (异步测试超时)**: All tests have explicit timeouts
- **T3 (Fake Timer)**: Performance tests use real timers with timeout protection

See `docs/engineering-lessons/async-resource-lifecycle.md` for details.

## Related

- [JobTracker](./JobTracker.md) - Async job tracking and status management
- [JobWaiter](./JobWaiter.md) - Event-driven job waiting
- [ExponentialBackoff](./ExponentialBackoff.md) - Backoff calculation utilities
