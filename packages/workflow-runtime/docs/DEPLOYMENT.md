# Workflow Runtime Deployment Guide

This guide covers deployment, configuration, and operational aspects of the Workflow Runtime module.

## Table of Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Building](#building)
4. [Testing](#testing)
5. [Deployment](#deployment)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)
8. [Performance Tuning](#performance-tuning)

---

## Installation

### Prerequisites

- Node.js >= 18.0.0
- Bun >= 1.0.0 (recommended) or npm >= 9.0.0
- TypeScript >= 5.0.0

### Package Installation

#### Using Bun (Recommended)

```bash
# Install the package
bun install @specforge/workflow-runtime

# Or add to your project
bun add @specforge/workflow-runtime
```

#### Using npm

```bash
npm install @specforge/workflow-runtime
```

### Monorepo Setup

If using in a monorepo with workspace dependencies:

```json
{
  "dependencies": {
    "@specforge/workflow-runtime": "workspace:*"
  }
}
```

---

## Configuration

### Basic Configuration

```typescript
import { WorkflowEngine, WorkflowEngineConfig } from '@specforge/workflow-runtime';

const config: WorkflowEngineConfig = {
  persistenceDir: './data/workflows',
  eventBus: myEventBusInstance // Optional
};

const engine = new WorkflowEngine(config);
```

### Configuration Options

#### `persistenceDir` (string)

Directory where workflow state and events are persisted.

- **Default**: `./workflows`
- **Type**: string (file path)
- **Required**: No

```typescript
const engine = new WorkflowEngine({
  persistenceDir: '/var/lib/specforge/workflows'
});
```

#### `eventBus` (IEventBus)

Event bus instance for publishing workflow events.

- **Default**: undefined (events not published)
- **Type**: IEventBus interface
- **Required**: No

```typescript
import { EventBus } from '@specforge/daemon-core';

const eventBus = new EventBus();
const engine = new WorkflowEngine({
  eventBus: eventBus
});
```

### Environment Variables

Configure via environment variables:

```bash
# Persistence directory
export WORKFLOW_PERSISTENCE_DIR=/var/lib/specforge/workflows

# Event bus connection (if applicable)
export EVENT_BUS_URL=amqp://localhost:5672
export EVENT_BUS_TOPIC=specforge.workflow
```

Load from environment:

```typescript
const config: WorkflowEngineConfig = {
  persistenceDir: process.env.WORKFLOW_PERSISTENCE_DIR || './workflows'
};

const engine = new WorkflowEngine(config);
```

---

## Building

### Development Build

```bash
# Build TypeScript to JavaScript
bun run build

# Watch mode for development
bun run build:watch
```

### Production Build

```bash
# Clean previous build
bun run clean

# Build for production
bun run build

# Verify build output
ls -la dist/
```

### Build Output

The build produces:
- `dist/index.js` - Main entry point
- `dist/index.d.ts` - TypeScript type definitions
- `dist/**/*.js` - Compiled modules
- `dist/**/*.d.ts` - Type definitions for all modules

---

## Testing

### Running Tests

#### All Tests

```bash
# Run all tests
bun run test

# Run with coverage
bun run test:coverage
```

#### Unit Tests

```bash
# Run unit tests only
bun run test:unit

# Watch mode
bun test packages/workflow-runtime/tests/unit/ --watch
```

#### Integration Tests

```bash
# Run integration tests
bun run test:integration
```

#### Property-Based Tests

```bash
# Run property tests
bun run test:property

# Run specific property test
bun test packages/workflow-runtime/tests/property/workflow-state-machine.property.test.ts
```

### Test Configuration

Tests are configured in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    testTimeout: 10000,      // 10 second timeout per test
    hookTimeout: 5000,       // 5 second timeout for setup/teardown
    teardownTimeout: 3000,   // 3 second timeout for cleanup
    pool: 'forks',           // Process isolation
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/']
    }
  }
});
```

### Coverage Requirements

- Minimum line coverage: 80%
- Minimum branch coverage: 75%
- Minimum function coverage: 80%

Check coverage:

```bash
bun run test:coverage
open coverage/index.html  # View HTML report
```

---

## Deployment

### Docker Deployment

#### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install bun
RUN npm install -g bun

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN bun run build

# Expose port (if needed)
EXPOSE 3000

# Start application
CMD ["node", "dist/index.js"]
```

#### Build and Run

```bash
# Build image
docker build -t specforge-workflow-runtime:latest .

# Run container
docker run -d \
  --name workflow-runtime \
  -v /var/lib/specforge/workflows:/app/data/workflows \
  -e WORKFLOW_PERSISTENCE_DIR=/app/data/workflows \
  specforge-workflow-runtime:latest
```

### Kubernetes Deployment

#### Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: workflow-runtime
  namespace: specforge
spec:
  replicas: 3
  selector:
    matchLabels:
      app: workflow-runtime
  template:
    metadata:
      labels:
        app: workflow-runtime
    spec:
      containers:
      - name: workflow-runtime
        image: specforge-workflow-runtime:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
        env:
        - name: WORKFLOW_PERSISTENCE_DIR
          value: /var/lib/specforge/workflows
        - name: EVENT_BUS_URL
          valueFrom:
            configMapKeyRef:
              name: specforge-config
              key: event-bus-url
        volumeMounts:
        - name: workflows
          mountPath: /var/lib/specforge/workflows
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: workflows
        persistentVolumeClaim:
          claimName: workflow-storage
```

#### Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace specforge

# Create persistent volume claim
kubectl apply -f pvc.yaml -n specforge

# Deploy
kubectl apply -f deployment.yaml -n specforge

# Check status
kubectl get pods -n specforge
kubectl logs -f deployment/workflow-runtime -n specforge
```

### NPM Package Distribution

#### Publish to Registry

```bash
# Build the package
bun run build

# Publish to npm
bun publish

# Or using npm
npm publish
```

#### Version Management

```bash
# Update version in package.json
# Then tag in git
git tag v0.1.0
git push origin v0.1.0
```

---

## Monitoring

### Health Checks

Implement health check endpoints:

```typescript
import express from 'express';

const app = express();
const engine = new WorkflowEngine();

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/ready', (req, res) => {
  const instances = engine.getAllInstances();
  res.json({ 
    ready: true,
    instances: instances.length 
  });
});

app.listen(3000);
```

### Metrics Collection

Track key metrics:

```typescript
interface WorkflowMetrics {
  totalInstances: number;
  runningInstances: number;
  completedInstances: number;
  failedInstances: number;
  averageExecutionTime: number;
  totalGatesExecuted: number;
  gateFailureRate: number;
}

function collectMetrics(engine: WorkflowEngine): WorkflowMetrics {
  const instances = engine.getAllInstances();
  
  const running = instances.filter(i => i.status === 'running').length;
  const completed = instances.filter(i => i.status === 'completed').length;
  const failed = instances.filter(i => i.status === 'failed').length;
  
  const totalTime = instances.reduce((sum, i) => {
    return sum + (i.updatedAt.getTime() - i.createdAt.getTime());
  }, 0);
  
  const avgTime = instances.length > 0 ? totalTime / instances.length : 0;
  
  const totalGates = instances.reduce((sum, i) => sum + i.history.length, 0);
  const failedGates = instances.reduce((sum, i) => {
    return sum + i.history.filter(e => e.type === 'workflow.gate_completed' && !e.data?.result?.passed).length;
  }, 0);
  
  return {
    totalInstances: instances.length,
    runningInstances: running,
    completedInstances: completed,
    failedInstances: failed,
    averageExecutionTime: avgTime,
    totalGatesExecuted: totalGates,
    gateFailureRate: totalGates > 0 ? failedGates / totalGates : 0
  };
}
```

### Logging

Configure logging:

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

engine.onEvent((event) => {
  logger.info({ event }, `Workflow event: ${event.type}`);
});
```

---

## Troubleshooting

### Common Issues

#### Issue: Workflow Instance Not Found

**Symptom**: `getInstance()` returns undefined

**Solution**:
```typescript
// Verify instance exists
const instance = engine.getInstance(instanceId);
if (!instance) {
  console.log('Available instances:');
  engine.getAllInstances().forEach(i => {
    console.log(`  - ${i.id}`);
  });
}
```

#### Issue: Gate Execution Timeout

**Symptom**: Gate execution hangs indefinitely

**Solution**:
```typescript
// Add timeout wrapper
async function executeWithTimeout(
  gate: GateDefinition,
  timeoutMs: number = 5000
): Promise<GateResult> {
  return Promise.race([
    engine.executeGate(gate),
    new Promise<GateResult>((_, reject) =>
      setTimeout(() => reject(new Error('Gate timeout')), timeoutMs)
    )
  ]);
}
```

#### Issue: Persistence Directory Not Writable

**Symptom**: `EACCES: permission denied` errors

**Solution**:
```bash
# Check permissions
ls -la /var/lib/specforge/workflows

# Fix permissions
chmod 755 /var/lib/specforge/workflows
chown specforge:specforge /var/lib/specforge/workflows
```

#### Issue: Memory Leak with Long-Running Workflows

**Symptom**: Memory usage grows over time

**Solution**:
```typescript
// Periodically clean up old instances
setInterval(() => {
  const instances = engine.getAllInstances();
  const oneHourAgo = new Date(Date.now() - 3600000);
  
  instances.forEach(instance => {
    if (instance.updatedAt < oneHourAgo && 
        (instance.status === 'completed' || instance.status === 'failed')) {
      // Archive or delete old instances
      console.log(`Archiving instance: ${instance.id}`);
    }
  });
}, 300000); // Every 5 minutes
```

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
export DEBUG=specforge:*

# Run with debug output
DEBUG=specforge:* bun run app.ts
```

---

## Performance Tuning

### Optimization Tips

#### 1. Use Parallel Execution for Independent Gates

```typescript
// ✅ Good: Independent gates in parallel
const compositeGate: CompositeGateDefinition = {
  type: "composite",
  mode: "parallel",
  failPolicy: "collect_all",
  children: [
    { type: "simple", id: "lint", name: "Lint" },
    { type: "simple", id: "types", name: "Type Check" },
    { type: "simple", id: "tests", name: "Tests" }
  ]
};

// ❌ Bad: Sequential when could be parallel
const sequentialGate: CompositeGateDefinition = {
  type: "composite",
  mode: "sequential",
  failPolicy: "fail_fast",
  children: [
    { type: "simple", id: "lint", name: "Lint" },
    { type: "simple", id: "types", name: "Type Check" },
    { type: "simple", id: "tests", name: "Tests" }
  ]
};
```

#### 2. Use Fail-Fast for Dependent Gates

```typescript
// ✅ Good: Stop on first failure for dependent gates
const compositeGate: CompositeGateDefinition = {
  type: "composite",
  mode: "sequential",
  failPolicy: "fail_fast",
  children: [
    { type: "simple", id: "validate", name: "Validate" },
    { type: "simple", id: "process", name: "Process" },
    { type: "simple", id: "finalize", name: "Finalize" }
  ]
};
```

#### 3. Batch Workflow Instances

```typescript
// Process multiple instances efficiently
async function processBatch(
  engine: WorkflowEngine,
  workflowId: string,
  count: number
): Promise<void> {
  const instances = Array.from({ length: count }, () =>
    engine.createInstance(workflowId)
  );
  
  // Execute in parallel with concurrency limit
  const concurrency = 5;
  for (let i = 0; i < instances.length; i += concurrency) {
    const batch = instances.slice(i, i + concurrency);
    await Promise.all(batch.map(inst => engine.execute(inst.id)));
  }
}
```

#### 4. Monitor and Optimize Gate Execution Time

```typescript
// Track gate execution times
const gateTimes: Record<string, number[]> = {};

engine.onEvent((event) => {
  if (event.type === 'workflow.gate_completed') {
    const gateId = event.data?.gateId;
    const duration = event.data?.duration;
    
    if (gateId && duration) {
      if (!gateTimes[gateId]) gateTimes[gateId] = [];
      gateTimes[gateId].push(duration);
    }
  }
});

// Analyze slow gates
function analyzePerformance(): void {
  Object.entries(gateTimes).forEach(([gateId, times]) => {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    
    if (avg > 1000) {
      console.warn(`Slow gate: ${gateId} (avg: ${avg}ms, max: ${max}ms)`);
    }
  });
}
```

### Resource Limits

Set appropriate resource limits:

```typescript
// Limit concurrent gate executions
const MAX_CONCURRENT_GATES = 10;
let activeGates = 0;

async function executeGateWithLimit(gate: GateDefinition): Promise<GateResult> {
  while (activeGates >= MAX_CONCURRENT_GATES) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  activeGates++;
  try {
    return await engine.executeGate(gate);
  } finally {
    activeGates--;
  }
}
```

---

## See Also

- [API Documentation](./API.md)
- [Usage Examples](./EXAMPLES.md)
- [GateResult Documentation](./GateResult.md)
