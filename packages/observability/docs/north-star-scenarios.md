# North Star Scenario Analysis Guide

## Overview

The **North Star Goal** for SpecForge V6 is: **"5 minutes from problem occurrence to root cause identification"** across 10 troubleshooting scenarios.

This guide explains how to use the Observability module to analyze each scenario and achieve the North Star goal.

---

## The 10 Scenarios

| # | Scenario | Category | Key Events |
|---|----------|----------|------------|
| 1 | Gate反复失败 (Gate Repeatedly Fails) | gate | `gate.evaluated` |
| 2 | Agent偏离prompt (Agent Deviates from Prompt) | session | `session.prompt`, `session.response` |
| 3 | Tool调用错误 (Tool Invocation Errors) | tool | `tool.invoke`, `tool.error` |
| 4 | 权限拒绝 (Permission Denials) | permission | `permission.evaluated` |
| 5 | 升级/安装失败 (Upgrade/Installation Failures) | system, migration | `system.upgrade`, `migration.failed` |
| 6 | 状态机卡住 (State Machine Stuck) | workflow | `workflow.stuck`, `workflow.transition` |
| 7 | 并发死锁 (Concurrency Deadlocks) | workflow, system | `workflow.transition`, `system.deadlock` |
| 8 | Skill是否被调用 (Skill Invocation Check) | session | `skill.invoked`, `skill.started` |
| 9 | Workflow是否按预期执行 (Workflow Execution Check) | workflow | `workflow.started`, `workflow.completed` |
| 10 | Workflow执行结果偏离预期 (Workflow Result Deviation) | workflow | `workflow.completed`, `workflow.result` |

---

## Scenario 1: Gate Repeatedly Fails

### Problem

Gates (code review, quality checks, security scans) are failing repeatedly, blocking workflow execution.

### Analysis Method

```typescript
const result = await queryAPI.analyzeScenario('gate-repeated-failure', {
  start: Date.now() - 3600000, // Last hour
  end: Date.now()
});

console.log(result.rootCause);      // e.g., "Gate "code-review" failed 5 times"
console.log(result.confidence);     // 0-1
console.log(result.recommendations);
```

### Key Events to Search

```typescript
const events = await queryAPI.queryEventsSync({
  category: 'gate',
  action: 'gate.evaluated',
  startTs: Date.now() - 3600000
});

// Filter for failures
const failures = events.filter(e => e.payload?.effect === 'deny');
```

### Root Cause Indicators

- **Same gate failing multiple times**: Check gate configuration
- **Different gates failing**: Check system state or input parameters
- **Intermittent failures**: Check timing or resource availability

### Recommendations

1. Review gate configuration for failing gate type
2. Check input parameters to the gate
3. Verify prerequisite conditions are met
4. Check for upstream failures causing cascade

---

## Scenario 2: Agent Deviates from Prompt

### Problem

The agent's response significantly deviates from the original prompt or instructions.

### Analysis Method

```typescript
const result = await queryAPI.analyzeScenario('agent-deviation', {
  start: Date.now() - 3600000,
  end: Date.now()
});
```

### Key Events to Search

```typescript
// Get prompt events
const prompts = await queryAPI.queryEventsSync({
  category: 'session',
  action: 'session.prompt'
});

// Get response events
const responses = await queryAPI.queryEventsSync({
  category: 'session',
  action: 'session.response'
});

// Check for deviation markers
const deviations = responses.filter(e => e.payload?.deviated === true);
```

### Root Cause Indicators

- **Prompt not received**: Check session initialization
- **Model configuration changed**: Verify model settings
- **Context overflow**: Check token limits
- **System prompt conflicts**: Review agent configuration

### Recommendations

1. Review prompt engineering
2. Check agent configuration
3. Analyze deviation patterns
4. Verify model settings
5. Consider adjusting temperature/max tokens

---

## Scenario 3: Tool Invocation Errors

### Problem

Tool calls are failing with errors, preventing workflow completion.

### Analysis Method

```typescript
const result = await queryAPI.analyzeScenario('tool-invocation-error', {
  start: Date.now() - 3600000,
  end: Date.now()
});
```

### Key Events to Search

```typescript
const toolErrors = await queryAPI.queryEventsSync({
  category: 'tool',
  action: 'tool.error'
});

// Also check successful invocations
const toolSuccess = await queryAPI.queryEventsSync({
  category: 'tool',
  action: 'tool.completed'
});

// Get specific tool errors
const gitErrors = toolErrors.filter(e => e.payload?.toolId === 'git');
```

### Root Cause Indicators

- **Authentication errors**: Check credentials
- **Not found errors**: Verify tool availability
- **Timeout errors**: Check resource availability
- **Parameter errors**: Validate input schema
- **Permission errors**: Check tool permissions

### Recommendations

1. Review tool implementation
2. Check input parameters against schema
3. Verify tool dependencies are installed
4. Check authentication credentials
5. Review tool configuration

---

## Scenario 4: Permission Denials

### Problem

Actions are being denied due to permission rules.

### Analysis Method

```typescript
const result = await queryAPI.analyzeScenario('permission-denial', {
  start: Date.now() - 3600000,
  end: Date.now()
});

console.log(result.rootCause); // e.g., 'Permission denied by rule "no-file-delete" (3 times)'
```

### Key Events to Search

```typescript
// Get all permission decisions (Property 10)
const decisions = await queryAPI.queryEventsSync({
  category: 'permission',
  action: 'permission.evaluated'
});

// Filter for denials
const denials = decisions.filter(e => e.payload?.effect === 'deny');
```

### Permission Decision Traceability (Property 10)

Every permission decision includes complete traceability:

```typescript
// Get full trace for a specific decision
const trace = await queryAPI.getPermissionTrace(decisionEventId);

console.log(trace.decision.payload.matched_rule);   // Rule ID
console.log(trace.decision.payload.rule_layer);     // 'hard' | 'builtin' | 'user'
console.log(trace.decision.payload.reason);         // Explanation
console.log(trace.relatedEvents);                   // Events leading to decision
```

### Root Cause Indicators

- **Unknown rule**: Check rule definition
- **Wrong actor**: Verify actor identity
- **Resource mismatch**: Check resource patterns
- **Layer priority**: Understand rule layering

### Recommendations

1. Review the matched permission rule
2. Add exception if needed for legitimate action
3. Verify actor has required permissions
4. Check rule layer ordering
5. Consider rule refinement

---

## Scenario 5: Upgrade/Installation Failures

### Problem

System upgrades or migrations are failing.

### Analysis Method

```typescript
const result = await queryAPI.analyzeScenario('upgrade-installation-failure', {
  start: Date.now() - 86400000, // Last 24 hours
  end: Date.now()
});
```

### Key Events to Search

```typescript
const upgrades = await queryAPI.queryEventsSync({
  category: 'system',
  action: 'system.upgrade'
});

const migrations = await queryAPI.queryEventsSync({
  category: 'migration',
  action: 'migration.failed'
});

// Get migration details
const migrationDetails = await queryAPI.queryEventsSync({
  category: 'migration'
});
```

### Root Cause Indicators

- **Download failures**: Check network connectivity
- **Checksum mismatches**: Verify package integrity
- **Dependency conflicts**: Check dependency tree
- **Permission errors**: Verify file system permissions
- **Rollback failures**: Check backup integrity

### Recommendations

1. Check network connectivity for package downloads
2. Verify package checksums
3. Review dependency conflict messages
4. Check file system permissions
5. Verify backup/restore mechanisms

---

## Scenario 6: State Machine Stuck

### Problem

A workflow is stuck in a particular state and not progressing.

### Analysis Method

```typescript
const result = await queryAPI.analyzeScenario('state-machine-stuck', {
  start: Date.now() - 3600000,
  end: Date.now()
});
```

### Key Events to Search

```typescript
// Check for stuck events
const stuckEvents = await queryAPI.queryEventsSync({
  category: 'workflow',
  action: 'workflow.stuck'
});

// Get workflow transitions
const transitions = await queryAPI.queryEventsSync({
  category: 'workflow',
  action: 'workflow.transition'
});

// Find incomplete workflows
const started = await queryAPI.queryEventsSync({
  category: 'workflow',
  action: 'workflow.started'
});

const completed = await queryAPI.queryEventsSync({
  category: 'workflow',
  action: 'workflow.completed'
});

const incomplete = started.filter(s => 
  !completed.some(c => c.workItemId === s.workItemId)
);
```

### Root Cause Indicators

- **No transition events**: Missing state handler
- **Same state repeated**: Loop detection
- **Missing prerequisite**: Check dependencies
- **Deadlock**: Circular wait conditions
- **Resource unavailable**: Check resource state

### Recommendations

1. Review workflow state transitions
2. Check for missing state handlers
3. Verify workflow definition
4. Check for circular dependencies
5. Review resource availability

---

## Scenario 7: Concurrency Deadlocks

### Problem

Multiple workflows are competing for resources, causing deadlocks.

### Analysis Method

```typescript
const result = await queryAPI.analyzeScenario('concurrency-deadlock', {
  start: Date.now() - 3600000,
  end: Date.now()
});
```

### Key Events to Search

```typescript
const deadlockEvents = await queryAPI.queryEventsSync({
  category: 'system',
  action: 'system.deadlock'
});

// Check workflow transitions around deadlock time
const transitions = await queryAPI.queryEventsSync({
  category: 'workflow',
  action: 'workflow.transition'
});

// Find overlapping workflows
const workflowStarts = await queryAPI.queryEventsSync({
  category: 'workflow',
  action: 'workflow.started'
});
```

### Root Cause Indicators

- **Circular wait**: A→B→C→A pattern
- **Resource contention**: Multiple workflows same resource
- **Lock timeout**: Extended lock hold times
- **Starvation**: Low-priority workflows never execute

### Recommendations

1. Review resource locking strategy
2. Implement deadlock detection
3. Add timeout to lock acquisition
4. Consider lock-free data structures
5. Implement priority inheritance

---

## Scenario 8: Skill Invocation Check

### Problem

Need to verify if a specific skill was invoked during execution.

### Analysis Method

```typescript
const result = await queryAPI.analyzeScenario('skill-invocation-check', {
  start: Date.now() - 3600000,
  end: Date.now()
});
```

### Key Events to Search

```typescript
// Get skill invocations
const skillInvocations = await queryAPI.queryEventsSync({
  category: 'session',
  action: 'skill.invoked'
});

// Check skill start
const skillStarts = await queryAPI.queryEventsSync({
  category: 'session',
  action: 'skill.started'
});

// Check skill completion
const skillCompletes = await queryAPI.queryEventsSync({
  category: 'session',
  action: 'skill.completed'
});

// Find specific skill
const specificSkill = skillInvocations.filter(
  e => e.payload?.skillId === 'my-skill'
);
```

### Root Cause Indicators

- **No invocation events**: Skill not triggered
- **Started but not completed**: Skill execution failed
- **Wrong skill invoked**: Pattern matching issue
- **Multiple invocations**: Check trigger conditions

### Recommendations

1. Verify skill trigger conditions
2. Check skill pattern matching
3. Review skill implementation
4. Check skill dependencies
5. Verify skill configuration

---

## Scenario 9: Workflow Execution Check

### Problem

Need to verify if a workflow executed as expected.

### Analysis Method

```typescript
const result = await queryAPI.analyzeScenario('workflow-execution-check', {
  start: Date.now() - 3600000,
  end: Date.now()
});
```

### Key Events to Search

```typescript
// Get workflow starts
const starts = await queryAPI.queryEventsSync({
  category: 'workflow',
  action: 'workflow.started'
});

// Get workflow completions
const completions = await queryAPI.queryEventsSync({
  category: 'workflow',
  action: 'workflow.completed'
});

// Check execution status
const executions = await queryAPI.queryEventsSync({
  category: 'workflow',
  action: 'workflow.executing'
});
```

### Root Cause Indicators

- **Started but not completed**: Check execution flow
- **Completed with errors**: Review failure events
- **Never started**: Check trigger conditions
- **Wrong execution order**: Verify workflow definition

### Recommendations

1. Check workflow trigger conditions
2. Review workflow definition
3. Verify state transitions
4. Check for execution errors
5. Review workflow dependencies

---

## Scenario 10: Workflow Result Deviation

### Problem

Workflow completed but the result doesn't match expectations.

### Analysis Method

```typescript
const result = await queryAPI.analyzeScenario('workflow-result-deviation', {
  start: Date.now() - 3600000,
  end: Date.now()
});
```

### Key Events to Search

```typescript
// Get workflow results
const results = await queryAPI.queryEventsSync({
  category: 'workflow',
  action: 'workflow.result'
});

// Get expected results
const expected = await queryAPI.queryEventsSync({
  category: 'workflow',
  action: 'workflow.expected'
});

// Compare expected vs actual
for (const result of results) {
  const matching = expected.find(e => 
    e.workItemId === result.workItemId
  );
  if (matching && JSON.stringify(matching.payload) !== JSON.stringify(result.payload)) {
    console.log('Deviation found:', result.workItemId);
  }
}
```

### Root Cause Indicators

- **Parameter differences**: Check input parameters
- **Environment differences**: Verify runtime context
- **Logic errors**: Review workflow implementation
- **External dependencies**: Check service availability

### Recommendations

1. Compare expected vs actual results
2. Review input parameters
3. Check workflow logic for discrepancies
4. Verify external service status
5. Review runtime environment

---

## Using sf-analyst for Analysis

The sf-analyst agent provides automated analysis for all scenarios:

```typescript
import { createSfAnalyst } from '@specforge/observability';

const analyst = createSfAnalyst({
  eventLogger,
  cas
});

// Direct analysis
const report = await analyst.executeAnalysis({
  requestId: 'analysis-1',
  scenario: 'gate-repeated-failure',
  timeRange: { start: Date.now() - 3600000, end: Date.now() },
  workItemId: 'workitem-123'
});

console.log(report.result.rootCause);
console.log(report.analysisTimeMs);

// Format for display
const formatted = analyst.formatResult(report.result);
console.log(formatted.summary);
console.log(formatted.recommendations);
```

---

## Achieving the North Star Goal

To achieve "5 minutes from problem to root cause":

### 1. Identify the Scenario

Determine which of the 10 scenarios matches your issue.

### 2. Query Relevant Events

Use the Query API to fetch relevant events:

```typescript
const events = await queryAPI.queryEventsSync({
  // Adjust time range based on when issue started
  startTs: problemStartTime * 1000000,  // Convert to nanoseconds
  endTs: Date.now() * 1000000,
  category: relevantCategory,
  action: relevantAction
});
```

### 3. Run Scenario Analysis

Use built-in analysis for automated root cause detection:

```typescript
const result = await queryAPI.analyzeScenario(scenario, {
  start: problemStartTime,
  end: Date.now()
});
```

### 4. Review Recommendations

Follow the provided recommendations to address the root cause.

### Performance Targets

- Event query: < 100ms
- Scenario analysis: < 500ms
- Total time to root cause: < 5 minutes

---

## Troubleshooting Common Issues

### Events Not Found

1. **Wrong time range**: Use nanoseconds for timestamps
2. **Wrong category/action**: Check event schema
3. **Mode filtering**: Verify mode includes relevant events
4. **Project ID**: Check projectId filter

### Analysis Returns No Results

1. **Increase time range**: Try broader time window
2. **Remove filters**: Start with unfiltered query
3. **Check mode**: Ensure mode captures relevant events

### Root Cause Not Identified

1. **Switch to deep mode**: Get full payload data
2. **Manual event review**: Examine raw events
3. **Expand time range**: Issue may be older
4. **Check related events**: Look at upstream/downstream events