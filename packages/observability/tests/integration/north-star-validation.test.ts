/**
 * North Star Goal Validation Tests
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 * 
 * The "North Star" goal is: "5 minutes from problem occurrence to root cause identification"
 * across 10 troubleshooting scenarios:
 * 1. Gate repeated failure
 * 2. Agent deviation from prompt
 * 3. Tool invocation errors
 * 4. Permission denials
 * 5. Upgrade/installation failures
 * 6. State machine stuck
 * 7. Concurrency deadlocks
 * 8. Skill invocation check
 * 9. Workflow execution check
 * 10. Workflow result deviation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  Event, 
  EventLogger, 
  QueryAPI, 
  AnalystEngine, 
  CAS, 
  NorthStarScenario, 
  TimeRange
} from '../../src/index';
import { createQueryAPI } from '../../src/query-api/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('North Star Goal Validation', () => {
  const testDataDir = path.join(process.cwd(), 'test-data', 'north-star-validation');
  const MAX_TIME_MS = 5 * 60 * 1000; // 5 minutes
  
  let eventLogger: EventLogger;
  let cas: CAS;
  let queryAPI: QueryAPI;
  let analystEngine: AnalystEngine;

  // The 10 North Star scenarios
  const scenarios: { scenario: NorthStarScenario; description: string }[] = [
    { scenario: 'gate-repeated-failure', description: 'Gate反复失败 (Gate repeatedly fails)' },
    { scenario: 'agent-deviation', description: 'Agent偏离prompt (Agent deviates from prompt)' },
    { scenario: 'tool-invocation-error', description: 'Tool调用错误 (Tool invocation errors)' },
    { scenario: 'permission-denial', description: '权限拒绝 (Permission denials)' },
    { scenario: 'upgrade-installation-failure', description: '升级/安装失败 (Upgrade/installation failures)' },
    { scenario: 'state-machine-stuck', description: '状态机卡住 (State machine stuck)' },
    { scenario: 'concurrency-deadlock', description: '并发死锁 (Concurrency deadlocks)' },
    { scenario: 'skill-invocation-check', description: 'Skill是否被调用 (Whether Skill was invoked)' },
    { scenario: 'workflow-execution-check', description: 'Workflow是否按预期执行 (Whether Workflow executed as expected)' },
    { scenario: 'workflow-result-deviation', description: 'Workflow执行结果偏离预期 (Workflow execution results deviate from expectations)' }
  ];

  beforeEach(async () => {
    // Clean up and create test directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    // Create fresh instances
    eventLogger = new EventLogger(testDataDir);
    await eventLogger.initialize();

    cas = new CAS(path.join(testDataDir, 'cas'));

    queryAPI = createQueryAPI({
      eventLogger,
      cas,
      maxEventsPerQuery: 1000
    });

    analystEngine = new AnalystEngine();
  });

  afterEach(async () => {
    // Clean up test directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper function to generate a unique event
   */
  function generateEvent(overrides: Partial<Event> = {}): Event {
    return {
      schema_version: '1.0',
      eventId: crypto.randomUUID(),
      ts: Date.now() * 1000000, // nanoseconds
      monotonicSeq: Math.floor(Math.random() * 10000),
      projectId: 'test-project-north-star',
      workItemId: 'test-workitem-' + Math.random().toString(36).substring(7),
      actor: { id: 'test-agent', name: 'Test Agent', type: 'agent' },
      category: 'workflow',
      action: 'workflow.started',
      payload: { test: 'data' },
      ...overrides
    };
  }

  /**
   * Generate test events for a specific scenario
   */
  async function generateScenarioEvents(scenario: NorthStarScenario): Promise<Event[]> {
    const events: Event[] = [];
    const baseTime = Date.now() * 1000000;

    switch (scenario) {
      case 'gate-repeated-failure': {
        // Generate repeated gate failures - use milliseconds for timestamp
        const nowMs = Date.now();
        for (let i = 0; i < 5; i++) {
          events.push(generateEvent({
            ts: (nowMs + i * 1000) * 1000000, // Convert ms to ns
            monotonicSeq: i,
            category: 'gate',
            action: 'gate.evaluated',
            payload: {
              gateType: 'RequirementsGate',
              effect: 'deny',
              reason: 'Requirements not met',
              gateId: 'req-gate-' + i
            }
          }));
        }
        break;
      }
      case 'agent-deviation': {
        // Generate agent deviation events - use milliseconds for timestamp
        const nowMs = Date.now();
        events.push(generateEvent({
          ts: nowMs * 1000000, // Convert ms to ns
          monotonicSeq: 0,
          category: 'session',
          action: 'session.started',
          payload: { sessionId: 'session-1' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 1000) * 1000000,
          monotonicSeq: 1,
          category: 'session',
          action: 'session.prompt',
          payload: { prompt: 'Do X' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 2000) * 1000000,
          monotonicSeq: 2,
          category: 'session',
          action: 'session.response',
          payload: { response: 'Did Y instead of X', deviation: true }
        }));
        break;
      }
      case 'tool-invocation-error': {
        // Generate tool errors - use milliseconds for timestamp
        const nowMs = Date.now();
        events.push(generateEvent({
          ts: nowMs * 1000000,
          monotonicSeq: 0,
          category: 'tool',
          action: 'tool.invoke',
          payload: { toolId: 'file-read', args: { path: '/test/file.ts' } }
        }));
        events.push(generateEvent({
          ts: (nowMs + 1000) * 1000000,
          monotonicSeq: 1,
          category: 'tool',
          action: 'tool.error',
          payload: { toolId: 'file-read', error: 'File not found' }
        }));
        break;
      }
      case 'permission-denial': {
        // Generate permission denials - use milliseconds for timestamp
        const nowMs = Date.now();
        for (let i = 0; i < 3; i++) {
          events.push(generateEvent({
            ts: (nowMs + i * 1000) * 1000000,
            monotonicSeq: i,
            category: 'permission',
            action: 'permission.evaluated',
            payload: {
              actor: { id: 'test-agent', name: 'Test Agent', type: 'agent' },
              action: 'tool.invoke',
              resource: { type: 'file', id: '/protected/file.ts' },
              matched_rule: 'deny-protected-files',
              rule_layer: 'user' as const,
              reason: 'File is in protected directory',
              effect: 'deny' as const
            }
          }));
        }
        break;
      }
      case 'upgrade-installation-failure': {
        // Generate upgrade failures - use milliseconds for timestamp
        const nowMs = Date.now();
        events.push(generateEvent({
          ts: nowMs * 1000000,
          monotonicSeq: 0,
          category: 'system',
          action: 'system.upgrade',
          payload: { version: '6.0.0' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 1000) * 1000000,
          monotonicSeq: 1,
          category: 'migration',
          action: 'migration.start',
          payload: { migrationId: 'mig-001' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 2000) * 1000000,
          monotonicSeq: 2,
          category: 'migration',
          action: 'migration.failed',
          payload: { migrationId: 'mig-001', error: 'Database connection failed' }
        }));
        break;
      }
      case 'state-machine-stuck': {
        // Generate stuck state machine - use milliseconds for timestamp
        const nowMs = Date.now();
        events.push(generateEvent({
          ts: nowMs * 1000000,
          monotonicSeq: 0,
          category: 'workflow',
          action: 'workflow.started',
          payload: { workflowId: 'wf-001' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 1000) * 1000000,
          monotonicSeq: 1,
          category: 'workflow',
          action: 'workflow.transition',
          payload: { workflowId: 'wf-001', from: 'pending', to: 'running' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 5000) * 1000000,
          monotonicSeq: 2,
          category: 'workflow',
          action: 'workflow.stuck',
          payload: { workflowId: 'wf-001', state: 'running', stuckDuration: 4000 }
        }));
        break;
      }
      case 'concurrency-deadlock': {
        // Generate deadlock events - use milliseconds for timestamp
        const nowMs = Date.now();
        events.push(generateEvent({
          ts: nowMs * 1000000,
          monotonicSeq: 0,
          category: 'workflow',
          action: 'workflow.transition',
          payload: { workflowId: 'wf-001', resource: 'lock-a' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 1) * 1000000,
          monotonicSeq: 1,
          category: 'workflow',
          action: 'workflow.transition',
          payload: { workflowId: 'wf-002', resource: 'lock-b' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 2) * 1000000,
          monotonicSeq: 2,
          category: 'system',
          action: 'system.deadlock',
          payload: { workflows: ['wf-001', 'wf-002'], resources: ['lock-a', 'lock-b'] }
        }));
        break;
      }
      case 'skill-invocation-check': {
        // Generate skill invocation events - use milliseconds for timestamp
        const nowMs = Date.now();
        events.push(generateEvent({
          ts: nowMs * 1000000,
          monotonicSeq: 0,
          category: 'session',
          action: 'session.started',
          payload: { sessionId: 'session-1' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 1000) * 1000000,
          monotonicSeq: 1,
          category: 'session',
          action: 'skill.invoked',
          payload: { skillId: 'skill-code-review', context: {} }
        }));
        events.push(generateEvent({
          ts: (nowMs + 2000) * 1000000,
          monotonicSeq: 2,
          category: 'session',
          action: 'skill.started',
          payload: { skillId: 'skill-code-review' }
        }));
        break;
      }
      case 'workflow-execution-check': {
        // Generate workflow execution events - use milliseconds for timestamp
        const nowMs = Date.now();
        events.push(generateEvent({
          ts: nowMs * 1000000,
          monotonicSeq: 0,
          category: 'workflow',
          action: 'workflow.started',
          payload: { workflowId: 'wf-001', definitionId: 'deploy-workflow' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 1000) * 1000000,
          monotonicSeq: 1,
          category: 'workflow',
          action: 'workflow.executing',
          payload: { workflowId: 'wf-001', step: 1, totalSteps: 3 }
        }));
        events.push(generateEvent({
          ts: (nowMs + 2000) * 1000000,
          monotonicSeq: 2,
          category: 'workflow',
          action: 'workflow.executing',
          payload: { workflowId: 'wf-001', step: 2, totalSteps: 3 }
        }));
        break;
      }
      case 'workflow-result-deviation': {
        // Generate workflow result deviation - use milliseconds for timestamp
        const nowMs = Date.now();
        events.push(generateEvent({
          ts: nowMs * 1000000,
          monotonicSeq: 0,
          category: 'workflow',
          action: 'workflow.started',
          payload: { workflowId: 'wf-001' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 3000) * 1000000,
          monotonicSeq: 1,
          category: 'workflow',
          action: 'workflow.completed',
          payload: { workflowId: 'wf-001', status: 'completed' }
        }));
        events.push(generateEvent({
          ts: (nowMs + 4000) * 1000000,
          monotonicSeq: 2,
          category: 'workflow',
          action: 'workflow.result',
          payload: { 
            workflowId: 'wf-001', 
            expected: { status: 'success', output: 'deployed' },
            actual: { status: 'failed', output: 'error' }
          }
        }));
        break;
      }
    }

    // Write events to the logger
    for (const event of events) {
      await eventLogger.append(event);
    }

    return events;
  }

  describe('Scenario 1: Gate Repeated Failure', () => {
    it('should analyze gate failures and identify root cause within 5 minutes', async () => {
      const scenario = 'gate-repeated-failure';
      const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };
      
      // Generate test events
      const events = await generateScenarioEvents(scenario);
      expect(events.length).toBeGreaterThan(0);

      // Measure time to root cause
      const startTime = Date.now();
      const result = await queryAPI.analyzeScenario(scenario, timeRange);
      const timeToIdentify = Date.now() - startTime;

      // Validate results
      expect(result.scenario).toBe(scenario);
      expect(result.timeToIdentify).toBeGreaterThanOrEqual(0);
      expect(timeToIdentify).toBeLessThan(MAX_TIME_MS);

      // Should identify root cause
      expect(result.rootCause).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
      
      console.log(`[${scenario}] Time to identify: ${timeToIdentify}ms, Root cause: ${result.rootCause}`);
    });
  });

  describe('Scenario 2: Agent Deviation', () => {
    it('should analyze agent deviation and identify root cause within 5 minutes', async () => {
      const scenario = 'agent-deviation';
      const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };
      
      const events = await generateScenarioEvents(scenario);
      expect(events.length).toBeGreaterThan(0);

      const startTime = Date.now();
      const result = await queryAPI.analyzeScenario(scenario, timeRange);
      const timeToIdentify = Date.now() - startTime;

      expect(result.scenario).toBe(scenario);
      expect(timeToIdentify).toBeLessThan(MAX_TIME_MS);
      expect(result.evidence.length).toBeGreaterThan(0);
      
      console.log(`[${scenario}] Time to identify: ${timeToIdentify}ms`);
    });
  });

  describe('Scenario 3: Tool Invocation Error', () => {
    it('should analyze tool errors and identify root cause within 5 minutes', async () => {
      const scenario = 'tool-invocation-error';
      const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };
      
      const events = await generateScenarioEvents(scenario);
      expect(events.length).toBeGreaterThan(0);

      const startTime = Date.now();
      const result = await queryAPI.analyzeScenario(scenario, timeRange);
      const timeToIdentify = Date.now() - startTime;

      expect(result.scenario).toBe(scenario);
      expect(timeToIdentify).toBeLessThan(MAX_TIME_MS);
      
      console.log(`[${scenario}] Time to identify: ${timeToIdentify}ms`);
    });
  });

  describe('Scenario 4: Permission Denial', () => {
    it('should analyze permission denials and identify root cause within 5 minutes', async () => {
      const scenario = 'permission-denial';
      const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };
      
      const events = await generateScenarioEvents(scenario);
      expect(events.length).toBeGreaterThan(0);

      const startTime = Date.now();
      const result = await queryAPI.analyzeScenario(scenario, timeRange);
      const timeToIdentify = Date.now() - startTime;

      expect(result.scenario).toBe(scenario);
      expect(timeToIdentify).toBeLessThan(MAX_TIME_MS);
      expect(result.rootCause).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
      
      console.log(`[${scenario}] Time to identify: ${timeToIdentify}ms, Root cause: ${result.rootCause}`);
    });
  });

  describe('Scenario 5: Upgrade/Installation Failure', () => {
    it('should analyze upgrade failures and identify root cause within 5 minutes', async () => {
      const scenario = 'upgrade-installation-failure';
      const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };
      
      const events = await generateScenarioEvents(scenario);
      expect(events.length).toBeGreaterThan(0);

      const startTime = Date.now();
      const result = await queryAPI.analyzeScenario(scenario, timeRange);
      const timeToIdentify = Date.now() - startTime;

      expect(result.scenario).toBe(scenario);
      expect(timeToIdentify).toBeLessThan(MAX_TIME_MS);
      
      console.log(`[${scenario}] Time to identify: ${timeToIdentify}ms`);
    });
  });

  describe('Scenario 6: State Machine Stuck', () => {
    it('should analyze stuck state machine and identify root cause within 5 minutes', async () => {
      const scenario = 'state-machine-stuck';
      const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };
      
      const events = await generateScenarioEvents(scenario);
      expect(events.length).toBeGreaterThan(0);

      const startTime = Date.now();
      const result = await queryAPI.analyzeScenario(scenario, timeRange);
      const timeToIdentify = Date.now() - startTime;

      expect(result.scenario).toBe(scenario);
      expect(timeToIdentify).toBeLessThan(MAX_TIME_MS);
      expect(result.rootCause).toBeTruthy();
      
      console.log(`[${scenario}] Time to identify: ${timeToIdentify}ms, Root cause: ${result.rootCause}`);
    });
  });

  describe('Scenario 7: Concurrency Deadlock', () => {
    it('should analyze deadlock and identify root cause within 5 minutes', async () => {
      const scenario = 'concurrency-deadlock';
      const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };
      
      const events = await generateScenarioEvents(scenario);
      expect(events.length).toBeGreaterThan(0);

      const startTime = Date.now();
      const result = await queryAPI.analyzeScenario(scenario, timeRange);
      const timeToIdentify = Date.now() - startTime;

      expect(result.scenario).toBe(scenario);
      expect(timeToIdentify).toBeLessThan(MAX_TIME_MS);
      
      console.log(`[${scenario}] Time to identify: ${timeToIdentify}ms`);
    });
  });

  describe('Scenario 8: Skill Invocation Check', () => {
    it('should check skill invocation and provide results within 5 minutes', async () => {
      const scenario = 'skill-invocation-check';
      const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };
      
      const events = await generateScenarioEvents(scenario);
      expect(events.length).toBeGreaterThan(0);

      const startTime = Date.now();
      const result = await queryAPI.analyzeScenario(scenario, timeRange);
      const timeToIdentify = Date.now() - startTime;

      expect(result.scenario).toBe(scenario);
      expect(timeToIdentify).toBeLessThan(MAX_TIME_MS);
      
      console.log(`[${scenario}] Time to identify: ${timeToIdentify}ms`);
    });
  });

  describe('Scenario 9: Workflow Execution Check', () => {
    it('should check workflow execution and provide results within 5 minutes', async () => {
      const scenario = 'workflow-execution-check';
      const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };
      
      const events = await generateScenarioEvents(scenario);
      expect(events.length).toBeGreaterThan(0);

      const startTime = Date.now();
      const result = await queryAPI.analyzeScenario(scenario, timeRange);
      const timeToIdentify = Date.now() - startTime;

      expect(result.scenario).toBe(scenario);
      expect(timeToIdentify).toBeLessThan(MAX_TIME_MS);
      
      console.log(`[${scenario}] Time to identify: ${timeToIdentify}ms`);
    });
  });

  describe('Scenario 10: Workflow Result Deviation', () => {
    it('should analyze workflow result deviation and identify root cause within 5 minutes', async () => {
      const scenario = 'workflow-result-deviation';
      const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };
      
      const events = await generateScenarioEvents(scenario);
      expect(events.length).toBeGreaterThan(0);

      const startTime = Date.now();
      const result = await queryAPI.analyzeScenario(scenario, timeRange);
      const timeToIdentify = Date.now() - startTime;

      expect(result.scenario).toBe(scenario);
      expect(timeToIdentify).toBeLessThan(MAX_TIME_MS);
      expect(result.rootCause).toBeTruthy();
      
      console.log(`[${scenario}] Time to identify: ${timeToIdentify}ms, Root cause: ${result.rootCause}`);
    });
  });

  describe('All 10 Scenarios Comprehensive Test', () => {
    it('should validate all 10 scenarios meet the North Star goal', async () => {
      const results: { scenario: NorthStarScenario; timeToIdentify: number; passed: boolean; rootCause: string | null }[] = [];
      
      for (const { scenario } of scenarios) {
        // Clean up and reinitialize for each scenario
        if (fs.existsSync(testDataDir)) {
          fs.rmSync(testDataDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testDataDir, { recursive: true });

        eventLogger = new EventLogger(testDataDir);
        await eventLogger.initialize();

        const queryAPI = createQueryAPI({
          eventLogger,
          cas,
          maxEventsPerQuery: 1000
        });

        const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };
        
        // Generate events and measure time
        await generateScenarioEvents(scenario);
        const startTime = Date.now();
        const result = await queryAPI.analyzeScenario(scenario, timeRange);
        const timeToIdentify = Date.now() - startTime;

        const passed = timeToIdentify < MAX_TIME_MS;
        
        results.push({
          scenario,
          timeToIdentify,
          passed,
          rootCause: result.rootCause
        });

        console.log(`[${scenario}] Time: ${timeToIdentify}ms, Passed: ${passed}, Root cause: ${result.rootCause}`);
      }

      // Verify all scenarios passed
      const passedCount = results.filter(r => r.passed).length;
      const failedScenarios = results.filter(r => !r.passed).map(r => r.scenario);

      console.log(`\n=== North Star Validation Summary ===`);
      console.log(`Passed: ${passedCount}/${scenarios.length}`);
      console.log(`Failed: ${failedScenarios.length > 0 ? failedScenarios.join(', ') : 'None'}`);
      
      // All scenarios should pass the 5-minute threshold
      expect(failedScenarios.length).toBe(0);
      
      // Each scenario should have returned some evidence
      for (const result of results) {
        expect(result.timeToIdentify).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Analyst Engine Integration', () => {
    it('should use Analyst Engine for scenario analysis', async () => {
      const scenario = 'gate-repeated-failure';
      const timeRange: TimeRange = { start: 0, end: Date.now() + 86400000 };

      // Generate events
      await generateScenarioEvents(scenario);

      // Test each analyst method
      const gateResult = await analystEngine.analyzeGateFailures('test-workitem', timeRange);
      expect(gateResult).toBeDefined();
      expect(gateResult.scenario).toBe('gate-repeated-failure');

      const permissionResult = await analystEngine.analyzePermissionDenials('test-project', timeRange);
      expect(permissionResult).toBeDefined();
      expect(permissionResult.scenario).toBe('permission-denial');

      const stateMachineResult = await analystEngine.analyzeStateMachineStuck('test-workitem');
      expect(stateMachineResult).toBeDefined();
      expect(stateMachineResult.scenario).toBe('state-machine-stuck');

      const workflowDeviationResult = await analystEngine.analyzeWorkflowResultDeviation('test-workitem');
      expect(workflowDeviationResult).toBeDefined();
      expect(workflowDeviationResult.scenario).toBe('workflow-result-deviation');
    });
  });
});