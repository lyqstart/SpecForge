/**
 * North Star Goal Validation Tests with Report Generation
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
  TimeRange,
  generateValidationReport,
  formatReportAsText,
  formatReportAsJSON,
  formatReportAsMarkdown,
  createScenarioResult,
  SCENARIO_DESCRIPTIONS,
  MAX_TIME_MS,
  type ScenarioValidationResult
} from '../src/index';
import { createQueryAPI } from '../src/query-api/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('North Star Goal Validation with Reports', () => {
  const testDataDir = path.join(process.cwd(), 'test-data', 'north-star-validation');
  const reportsDir = path.join(testDataDir, 'reports');
  
  let eventLogger: EventLogger;
  let cas: CAS;
  let queryAPI: QueryAPI;
  let analystEngine: AnalystEngine;

  // The 10 North Star scenarios
  const scenarios: NorthStarScenario[] = [
    'gate-repeated-failure',
    'agent-deviation',
    'tool-invocation-error',
    'permission-denial',
    'upgrade-installation-failure',
    'state-machine-stuck',
    'concurrency-deadlock',
    'skill-invocation-check',
    'workflow-execution-check',
    'workflow-result-deviation'
  ];

  beforeEach(async () => {
    // Clean up and create test directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDataDir, { recursive: true });
    fs.mkdirSync(reportsDir, { recursive: true });

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
    // Keep reports directory for inspection, but clean up test data
    const reportsBackup = path.join(process.cwd(), 'test-data', 'north-star-reports');
    if (fs.existsSync(reportsDir) && fs.readdirSync(reportsDir).length > 0) {
      if (!fs.existsSync(reportsBackup)) {
        fs.mkdirSync(reportsBackup, { recursive: true });
      }
      // Copy reports to backup location
      const files = fs.readdirSync(reportsDir);
      for (const file of files) {
        fs.copyFileSync(
          path.join(reportsDir, file),
          path.join(reportsBackup, file)
        );
      }
    }

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
    const nowMs = Date.now();

    switch (scenario) {
      case 'gate-repeated-failure': {
        for (let i = 0; i < 5; i++) {
          events.push(generateEvent({
            ts: (nowMs + i * 1000) * 1000000,
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

  describe('Complete North Star Validation with Report Generation', () => {
    it('should validate all 10 scenarios and generate comprehensive reports', async () => {
      const results: ScenarioValidationResult[] = [];
      
      for (const scenario of scenarios) {
        // Clean up and reinitialize for each scenario
        if (fs.existsSync(testDataDir)) {
          fs.rmSync(testDataDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testDataDir, { recursive: true });
        fs.mkdirSync(reportsDir, { recursive: true });

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
        const analysisResult = await queryAPI.analyzeScenario(scenario, timeRange);
        const actualTimeMs = Date.now() - startTime;

        // Create scenario result
        const scenarioResult = createScenarioResult(scenario, analysisResult, actualTimeMs);
        results.push(scenarioResult);

        console.log(`[${scenario}] Time: ${actualTimeMs}ms, Passed: ${scenarioResult.passed}, Root cause: ${scenarioResult.rootCause}`);
      }

      // Generate validation report
      const report = generateValidationReport(results);

      // Verify all scenarios passed
      expect(report.failedScenarios).toBe(0);
      expect(report.passedScenarios).toBe(10);
      expect(report.totalScenarios).toBe(10);

      // Verify time constraints
      expect(report.maxTimeMs).toBeLessThan(MAX_TIME_MS);
      expect(report.averageTimeMs).toBeLessThan(MAX_TIME_MS);

      // Generate reports in multiple formats
      const textReport = formatReportAsText(report);
      const jsonReport = formatReportAsJSON(report);
      const markdownReport = formatReportAsMarkdown(report);

      // Save reports to files
      fs.writeFileSync(path.join(reportsDir, 'validation-report.txt'), textReport);
      fs.writeFileSync(path.join(reportsDir, 'validation-report.json'), jsonReport);
      fs.writeFileSync(path.join(reportsDir, 'validation-report.md'), markdownReport);

      console.log('\n' + '='.repeat(80));
      console.log('North Star Validation Summary');
      console.log('='.repeat(80));
      console.log(`Passed: ${report.passedScenarios}/${report.totalScenarios}`);
      console.log(`Average Time: ${report.averageTimeMs.toFixed(2)}ms`);
      console.log(`Max Time: ${report.maxTimeMs}ms`);
      console.log(`Min Time: ${report.minTimeMs}ms`);
      console.log(report.summary);
      console.log('='.repeat(80));
      console.log(`\nReports saved to: ${reportsDir}`);
      console.log('  - validation-report.txt');
      console.log('  - validation-report.json');
      console.log('  - validation-report.md');

      // Verify report structure
      expect(report.schema_version).toBe('1.0');
      expect(report.timestamp).toBeGreaterThan(0);
      expect(report.results).toHaveLength(10);

      // Verify each scenario has proper description
      for (const result of report.results) {
        expect(result.description).toBe(SCENARIO_DESCRIPTIONS[result.scenario]);
        expect(result.timeToIdentify).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Report Format Validation', () => {
    it('should generate valid text report format', () => {
      const mockResults: ScenarioValidationResult[] = [{
        scenario: 'gate-repeated-failure',
        description: SCENARIO_DESCRIPTIONS['gate-repeated-failure'],
        timeToIdentify: 10,
        passed: true,
        rootCause: 'Test root cause',
        confidence: 0.95,
        evidenceCount: 5,
        recommendationsCount: 3
      }];

      const report = generateValidationReport(mockResults);
      const textReport = formatReportAsText(report);

      expect(textReport).toContain('North Star Goal Validation Report');
      expect(textReport).toContain('Total Scenarios: 1');
      expect(textReport).toContain('Passed: 1');
      expect(textReport).toContain('gate-repeated-failure');
      expect(textReport).toContain('Test root cause');
    });

    it('should generate valid JSON report format', () => {
      const mockResults: ScenarioValidationResult[] = [{
        scenario: 'agent-deviation',
        description: SCENARIO_DESCRIPTIONS['agent-deviation'],
        timeToIdentify: 15,
        passed: true,
        rootCause: 'Test root cause',
        confidence: 0.85,
        evidenceCount: 3,
        recommendationsCount: 2
      }];

      const report = generateValidationReport(mockResults);
      const jsonReport = formatReportAsJSON(report);
      const parsed = JSON.parse(jsonReport);

      expect(parsed.schema_version).toBe('1.0');
      expect(parsed.totalScenarios).toBe(1);
      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].scenario).toBe('agent-deviation');
    });

    it('should generate valid Markdown report format', () => {
      const mockResults: ScenarioValidationResult[] = [{
        scenario: 'tool-invocation-error',
        description: SCENARIO_DESCRIPTIONS['tool-invocation-error'],
        timeToIdentify: 20,
        passed: true,
        rootCause: 'Test root cause',
        confidence: 0.90,
        evidenceCount: 4,
        recommendationsCount: 1
      }];

      const report = generateValidationReport(mockResults);
      const markdownReport = formatReportAsMarkdown(report);

      expect(markdownReport).toContain('# North Star Goal Validation Report');
      expect(markdownReport).toContain('## Summary');
      expect(markdownReport).toContain('## Detailed Results');
      expect(markdownReport).toContain('| Scenario | Status | Time (ms) |');
      expect(markdownReport).toContain('tool-invocation-error');
    });
  });
});
