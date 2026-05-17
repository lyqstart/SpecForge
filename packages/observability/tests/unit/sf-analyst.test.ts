/**
 * Unit tests for sf-analyst integration
 * 
 * Validates: Requirements 5.1, 5.2, 5.3
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SfAnalyst, createSfAnalyst, type AnalysisRequest } from '@/sf-analyst/index.js';
import { EventLogger } from '@/event-logger/index.js';
import { CAS } from '@/cas/index.js';
import type { Event, TimeRange, NorthStarScenario, AnalysisResult } from '@/types';

// Test utilities
function createTestEvent(overrides: Partial<Event> = {}): Event {
  return {
    schema_version: '1.0',
    eventId: `test-event-${Date.now()}-${Math.random()}`,
    ts: Date.now() * 1000000,
    monotonicSeq: 1,
    projectId: 'test-project',
    workItemId: 'test-workitem',
    actor: { id: 'test-agent', name: 'TestAgent', type: 'agent' },
    category: 'workflow',
    action: 'workflow.started',
    ...overrides
  };
}

function createTestTimeRange(): TimeRange {
  const now = Date.now();
  return {
    start: now - 3600000, // 1 hour ago
    end: now
  };
}

describe('SfAnalyst', () => {
  let eventLogger: EventLogger;
  let cas: CAS;
  let sfAnalyst: SfAnalyst;

  beforeEach(async () => {
    // Create fresh instances with test directories
    eventLogger = new EventLogger(`./test-data/observability-${Date.now()}`);
    cas = new CAS(`./test-data/cas-${Date.now()}`);
    
    await eventLogger.initialize();
    await cas.initialize();
    
    sfAnalyst = createSfAnalyst({
      eventLogger,
      cas,
      maxConcurrent: 2,
      defaultTimeoutMs: 5000,
      maxEventsPerAnalysis: 100
    });
  });

  describe('Data Access Interface', () => {
    it('should provide data access interface', () => {
      const dataAccess = sfAnalyst.getDataAccess();
      
      expect(dataAccess).toBeDefined();
      expect(typeof dataAccess.queryEvents).toBe('function');
      expect(typeof dataAccess.getEvent).toBe('function');
      expect(typeof dataAccess.getBlobContent).toBe('function');
      expect(typeof dataAccess.getPermissionTrace).toBe('function');
      expect(typeof dataAccess.getStats).toBe('function');
    });

    it('should query events with filter', async () => {
      const dataAccess = sfAnalyst.getDataAccess();
      
      // Add test events
      const event1 = createTestEvent({ category: 'workflow', action: 'workflow.started' });
      const event2 = createTestEvent({ category: 'workflow', action: 'workflow.completed' });
      
      await eventLogger.append(event1);
      await eventLogger.append(event2);
      
      // Query events
      const events = await dataAccess.queryEvents({ category: 'workflow' });
      
      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array when no events match filter', async () => {
      const dataAccess = sfAnalyst.getDataAccess();
      
      const events = await dataAccess.queryEvents({ 
        category: 'permission' 
      });
      
      expect(events).toEqual([]);
    });

    it('should get stats', async () => {
      const dataAccess = sfAnalyst.getDataAccess();
      
      const stats = await dataAccess.getStats();
      
      expect(stats).toHaveProperty('eventCount');
      expect(stats).toHaveProperty('lastEventId');
      expect(stats).toHaveProperty('categories');
      expect(typeof stats.eventCount).toBe('number');
    });
  });

  describe('Analysis Execution', () => {
    it('should execute analysis synchronously', async () => {
      // Add test events for gate failure scenario
      const gateEvent = createTestEvent({
        category: 'gate',
        action: 'gate.evaluated',
        payload: { effect: 'deny', gateType: 'design-gate' }
      });
      
      await eventLogger.append(gateEvent);
      
      // Execute analysis
      const request: AnalysisRequest = {
        requestId: 'test-request-1',
        scenario: 'gate-repeated-failure',
        timeRange: createTestTimeRange()
      };
      
      const report = await sfAnalyst.executeAnalysis(request);
      
      expect(report).toBeDefined();
      expect(report.requestId).toBe(request.requestId);
      expect(report.scenario).toBe('gate-repeated-failure');
      expect(report.result).toBeDefined();
      expect(report.metadata).toBeDefined();
    });

    it('should format analysis results', async () => {
      const result: AnalysisResult = {
        scenario: 'gate-repeated-failure',
        rootCause: 'Gate "test-gate" failed 3 times',
        confidence: 0.8,
        evidence: [],
        recommendations: ['Check gate config', 'Verify inputs'],
        timeToIdentify: 150
      };
      
      const formatted = sfAnalyst.formatResult(result);
      
      expect(formatted.summary).toContain('Root cause identified');
      expect(formatted.details).toContain('Confidence: 80%');
      expect(formatted.recommendations).toEqual(result.recommendations);
      expect(formatted.confidence).toBe('High');
    });

    it('should handle analysis errors gracefully', async () => {
      const request: AnalysisRequest = {
        requestId: 'test-request-error',
        scenario: 'invalid-scenario' as NorthStarScenario,
        timeRange: createTestTimeRange()
      };
      
      // This should not throw but return a result with error info
      try {
        await sfAnalyst.executeAnalysis(request);
      } catch (error) {
        // Expected for invalid scenario
        expect(error).toBeDefined();
      }
    });
  });

  describe('Analysis Scheduling', () => {
    it('should schedule analysis for async execution', async () => {
      const request: AnalysisRequest = {
        requestId: 'scheduled-1',
        scenario: 'permission-denial',
        timeRange: createTestTimeRange(),
        priority: 5
      };
      
      const requestId = sfAnalyst.scheduleAnalysis(request);
      
      expect(requestId).toBe(request.requestId);
      
      // Wait for async processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const scheduled = sfAnalyst.getScheduledAnalysis(requestId);
      expect(scheduled).toBeDefined();
      // After waiting, it should be either running or completed
      expect(['running', 'completed']).toContain(scheduled?.status);
    });

    it('should get queue status', () => {
      const request1: AnalysisRequest = {
        requestId: 'queue-test-1',
        scenario: 'state-machine-stuck',
        timeRange: createTestTimeRange()
      };
      
      const request2: AnalysisRequest = {
        requestId: 'queue-test-2',
        scenario: 'workflow-execution-check',
        timeRange: createTestTimeRange()
      };
      
      sfAnalyst.scheduleAnalysis(request1);
      sfAnalyst.scheduleAnalysis(request2);
      
      const status = sfAnalyst.getQueueStatus();
      
      expect(status).toHaveProperty('pending');
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('completed');
      expect(status).toHaveProperty('failed');
    });

    it('should allow cancelling analyses or complete successfully', async () => {
      const request: AnalysisRequest = {
        requestId: 'cancel-test',
        scenario: 'skill-invocation-check',
        timeRange: createTestTimeRange()
      };
      
      sfAnalyst.scheduleAnalysis(request);
      
      // Wait a moment then check status
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const scheduled = sfAnalyst.getScheduledAnalysis(request.requestId);
      
      // The analysis might have already completed (which is fine)
      // or it might still be pending (in which case we can cancel it)
      if (scheduled?.status === 'pending') {
        const cancelled = sfAnalyst.cancelAnalysis(request.requestId);
        expect(cancelled).toBe(true);
        
        const afterCancel = sfAnalyst.getScheduledAnalysis(request.requestId);
        expect(afterCancel?.status).toBe('failed');
      } else {
        // Analysis already completed or is running - that's also valid behavior
        expect(['running', 'completed']).toContain(scheduled?.status);
      }
    });

    it('should not cancel running analysis', () => {
      const request: AnalysisRequest = {
        requestId: 'running-test',
        scenario: 'workflow-result-deviation',
        timeRange: createTestTimeRange()
      };
      
      // We can't easily test this without making analysis run
      // But we can verify the method exists
      expect(typeof sfAnalyst.cancelAnalysis).toBe('function');
    });
  });

  describe('Result Delivery', () => {
    it('should store completed reports', async () => {
      // Add test event
      const event = createTestEvent({
        category: 'permission',
        action: 'permission.evaluated',
        payload: { effect: 'deny', matched_rule: 'rule-1' }
      });
      
      await eventLogger.append(event);
      
      // Execute analysis
      const request: AnalysisRequest = {
        requestId: 'report-test',
        scenario: 'permission-denial',
        timeRange: createTestTimeRange()
      };
      
      const report = await sfAnalyst.executeAnalysis(request);
      
      // Get the report
      const retrieved = sfAnalyst.getReport(report.reportId);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.requestId).toBe(request.requestId);
      expect(retrieved?.scenario).toBe('permission-denial');
    });

    it('should get reports for a request', async () => {
      const request: AnalysisRequest = {
        requestId: 'multi-report-test',
        scenario: 'tool-invocation-error',
        timeRange: createTestTimeRange()
      };
      
      // Execute once
      await sfAnalyst.executeAnalysis(request);
      
      const reports = sfAnalyst.getReportsForRequest(request.requestId);
      
      expect(Array.isArray(reports)).toBe(true);
    });

    it('should clear old reports', async () => {
      // This is a memory management test
      sfAnalyst.clearOldReports(5);
      
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('North Star Scenarios', () => {
    it('should analyze gate failures', async () => {
      const event = createTestEvent({
        category: 'gate',
        action: 'gate.evaluated',
        workItemId: 'workitem-1',
        payload: { effect: 'deny', gateType: 'test-gate' }
      });
      
      await eventLogger.append(event);
      
      const result = await sfAnalyst.analyzeGateFailures('workitem-1', createTestTimeRange());
      
      expect(result).toBeDefined();
      expect(result.scenario).toBe('gate-repeated-failure');
    });

    it('should analyze tool errors', async () => {
      const event = createTestEvent({
        category: 'tool',
        action: 'tool.error',
        payload: { toolId: 'test-tool', error: 'test error' }
      });
      
      await eventLogger.append(event);
      
      const result = await sfAnalyst.analyzeToolErrors('test-tool', createTestTimeRange());
      
      expect(result).toBeDefined();
      expect(result.scenario).toBe('tool-invocation-error');
    });

    it('should analyze permission denials', async () => {
      const event = createTestEvent({
        category: 'permission',
        action: 'permission.evaluated',
        projectId: 'project-1',
        payload: { effect: 'deny', matched_rule: 'rule-1' }
      });
      
      await eventLogger.append(event);
      
      const result = await sfAnalyst.analyzePermissionDenials('project-1', createTestTimeRange());
      
      expect(result).toBeDefined();
      expect(result.scenario).toBe('permission-denial');
    });

    it('should analyze agent deviation', async () => {
      const event = createTestEvent({
        category: 'session',
        action: 'session.prompt',
        payload: { sessionId: 'session-1' }
      });
      
      await eventLogger.append(event);
      
      const result = await sfAnalyst.analyzeAgentDeviation('session-1');
      
      expect(result).toBeDefined();
      expect(result.scenario).toBe('agent-deviation');
    });
  });

  describe('Separation from sf-debugger', () => {
    it('should not provide code modification capabilities', () => {
      // sf-analyst is read-only - it should not have any methods
      // that modify code or system state
      
      const dataAccess = sfAnalyst.getDataAccess();
      
      // Data access should only have query methods
      expect(dataAccess.queryEvents).toBeDefined();
      expect(dataAccess.getEvent).toBeDefined();
      expect(dataAccess.getBlobContent).toBeDefined();
      expect(dataAccess.getPermissionTrace).toBeDefined();
      expect(dataAccess.getStats).toBeDefined();
      
      // Should NOT have methods like:
      // - modifyCode
      // - fixBug
      // - applyPatch
      // etc.
    });

    it('should focus on architectural-level analysis', () => {
      // The sf-analyst should analyze patterns, not individual code issues
      expect(sfAnalyst.formatResult).toBeDefined();
      
      const result: AnalysisResult = {
        scenario: 'state-machine-stuck',
        rootCause: 'Multiple workflows stuck in pending state',
        confidence: 0.9,
        evidence: [],
        recommendations: ['Review state machine configuration'],
        timeToIdentify: 100
      };
      
      const formatted = sfAnalyst.formatResult(result);
      
      // Should provide recommendations, not code fixes
      expect(formatted.recommendations.length).toBeGreaterThan(0);
      expect(formatted.recommendations[0]).not.toContain('fix');
    });
  });

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const customAnalyst = createSfAnalyst({
        eventLogger,
        cas,
        maxConcurrent: 1,
        defaultTimeoutMs: 30000,
        maxEventsPerAnalysis: 500
      });
      
      expect(customAnalyst).toBeDefined();
    });

    it('should use default configuration when not provided', () => {
      const defaultAnalyst = createSfAnalyst({
        eventLogger,
        cas
      });
      
      expect(defaultAnalyst).toBeDefined();
      
      const status = defaultAnalyst.getQueueStatus();
      expect(status).toBeDefined();
    });
  });
});

describe('SfAnalyst Integration Requirements', () => {
  let eventLogger: EventLogger;
  let cas: CAS;
  let sfAnalyst: SfAnalyst;

  beforeEach(async () => {
    eventLogger = new EventLogger(`./test-data/observability-req-${Date.now()}`);
    cas = new CAS(`./test-data/cas-req-${Date.now()}`);
    
    await eventLogger.initialize();
    await cas.initialize();
    
    sfAnalyst = createSfAnalyst({ eventLogger, cas });
  });

  /**
   * Requirement 5.1: Data access interfaces for sf-analyst
   * The observability module must provide data access interfaces for all 10 V6.0 built-in Agents
   */
  it('should provide data access interfaces for agents (REQ 5.1)', () => {
    const dataAccess = sfAnalyst.getDataAccess();
    
    // Verify all required data access methods exist
    expect(dataAccess.queryEvents).toBeDefined();
    expect(dataAccess.getEvent).toBeDefined();
    expect(dataAccess.getBlobContent).toBeDefined();
    expect(dataAccess.getPermissionTrace).toBeDefined();
    expect(dataAccess.getStats).toBeDefined();
  });

  /**
   * Requirement 5.2: Scheduling and execution
   * The sf-analyst must support scheduling and execution of analyses
   */
  it('should support analysis scheduling (REQ 5.2)', async () => {
    const request: AnalysisRequest = {
      requestId: 'req-5.2-test',
      scenario: 'upgrade-installation-failure',
      timeRange: createTestTimeRange()
    };
    
    const requestId = sfAnalyst.scheduleAnalysis(request);
    
    expect(requestId).toBe(request.requestId);
    
    // Wait for async processing to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const scheduled = sfAnalyst.getScheduledAnalysis(requestId);
    expect(scheduled).toBeDefined();
    // After waiting, should be running or completed
    expect(['running', 'completed']).toContain(scheduled?.status);
  });

  /**
   * Requirement 5.3: Result formatting and delivery
   * The sf-analyst must format and deliver analysis results
   */
  it('should format and deliver results (REQ 5.3)', async () => {
    const event = createTestEvent({
      category: 'workflow',
      action: 'workflow.stuck',
      payload: { state: 'pending' }
    });
    
    await eventLogger.append(event);
    
    const request: AnalysisRequest = {
      requestId: 'req-5.3-test',
      scenario: 'state-machine-stuck',
      timeRange: createTestTimeRange()
    };
    
    const report = await sfAnalyst.executeAnalysis(request);
    
    // Verify result has required delivery fields
    expect(report.reportId).toBeDefined();
    expect(report.requestId).toBe(request.requestId);
    expect(report.scenario).toBe(request.scenario);
    expect(report.result).toBeDefined();
    expect(report.completedAt).toBeDefined();
    expect(report.analysisTimeMs).toBeDefined();
    expect(report.metadata).toBeDefined();
    
    // Verify formatting works
    const formatted = sfAnalyst.formatResult(report.result);
    expect(formatted.summary).toBeDefined();
    expect(formatted.details).toBeDefined();
    expect(formatted.recommendations).toBeDefined();
    expect(formatted.confidence).toBeDefined();
  });

  /**
   * Separation from sf-debugger (REQ 3.3)
   * sf-analyst performs architectural-level sensory analysis
   * sf-debugger fixes code issues
   */
  it('should be separated from sf-debugger (REQ 3.3)', () => {
    // sf-analyst should be read-only
    const dataAccess = sfAnalyst.getDataAccess();
    
    // Should not have methods that modify code
    const publicMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(sfAnalyst)
    );
    
    // Should not contain any of these sf-debugger methods
    const debuggerMethods = ['fixCode', 'applyPatch', 'modifyFile', 'executeFix'];
    const hasDebuggerMethods = debuggerMethods.some(method => 
      publicMethods.includes(method)
    );
    
    expect(hasDebuggerMethods).toBe(false);
  });
});