# North Star Goal Validation Report

**Generated:** 2026-05-14T18:59:53.924Z
**Schema Version:** 1.0

## Summary

- **Total Scenarios:** 10
- **Passed:** 10
- **Failed:** 0
- **Average Time:** 2.70ms
- **Min Time:** 1ms
- **Max Time:** 9ms

✅ All 10 scenarios passed the North Star goal (< 5 minutes to root cause)

## Detailed Results

| Scenario | Status | Time (ms) | Root Cause | Confidence | Evidence |
|----------|--------|-----------|------------|------------|----------|
| gate-repeated-failure | ✅ PASS | 9 | Gate "RequirementsGate" failed 5 times | 100.0% | 5 |
| agent-deviation | ✅ PASS | 3 | Most frequent action: session.started (1 occurrences) | 50.0% | 3 |
| tool-invocation-error | ✅ PASS | 2 | Most frequent action: tool.invoke (1 occurrences) | 50.0% | 2 |
| permission-denial | ✅ PASS | 2 | Permission denied by rule "deny-protected-files" (3 times) | 100.0% | 3 |
| upgrade-installation-failure | ✅ PASS | 2 | Most frequent action: system.upgrade (1 occurrences) | 50.0% | 1 |
| state-machine-stuck | ✅ PASS | 2 | Workflow stuck at: running | 80.0% | 1 |
| concurrency-deadlock | ✅ PASS | 1 | Most frequent action: workflow.transition (2 occurrences) | 50.0% | 2 |
| skill-invocation-check | ✅ PASS | 1 | Most frequent action: skill.invoked (1 occurrences) | 50.0% | 2 |
| workflow-execution-check | ✅ PASS | 3 | Most frequent action: workflow.executing (2 occurrences) | 50.0% | 3 |
| workflow-result-deviation | ✅ PASS | 2 | 1 workflow results deviated from expected | 90.0% | 1 |

## Scenario Descriptions

### gate-repeated-failure

Gate反复失败 (Gate repeatedly fails)

**Root Cause:** Gate "RequirementsGate" failed 5 times

**Recommendations:** 3 recommendation(s) provided

### agent-deviation

Agent偏离prompt (Agent deviates from prompt)

**Root Cause:** Most frequent action: session.started (1 occurrences)

**Recommendations:** 1 recommendation(s) provided

### tool-invocation-error

Tool调用错误 (Tool invocation errors)

**Root Cause:** Most frequent action: tool.invoke (1 occurrences)

**Recommendations:** 1 recommendation(s) provided

### permission-denial

权限拒绝 (Permission denials)

**Root Cause:** Permission denied by rule "deny-protected-files" (3 times)

**Recommendations:** 3 recommendation(s) provided

### upgrade-installation-failure

升级/安装失败 (Upgrade/installation failures)

**Root Cause:** Most frequent action: system.upgrade (1 occurrences)

**Recommendations:** 1 recommendation(s) provided

### state-machine-stuck

状态机卡住 (State machine stuck)

**Root Cause:** Workflow stuck at: running

**Recommendations:** 3 recommendation(s) provided

### concurrency-deadlock

并发死锁 (Concurrency deadlocks)

**Root Cause:** Most frequent action: workflow.transition (2 occurrences)

**Recommendations:** 1 recommendation(s) provided

### skill-invocation-check

Skill是否被调用 (Whether Skill was invoked)

**Root Cause:** Most frequent action: skill.invoked (1 occurrences)

**Recommendations:** 1 recommendation(s) provided

### workflow-execution-check

Workflow是否按预期执行 (Whether Workflow executed as expected)

**Root Cause:** Most frequent action: workflow.executing (2 occurrences)

**Recommendations:** 1 recommendation(s) provided

### workflow-result-deviation

Workflow执行结果偏离预期 (Workflow execution results deviate from expectations)

**Root Cause:** 1 workflow results deviated from expected

**Recommendations:** 3 recommendation(s) provided
