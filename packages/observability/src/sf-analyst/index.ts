/**
 * sf-analyst Integration Module
 * 
 * Provides data access interfaces and analysis capabilities for the sf-analyst agent.
 * Separated from sf-debugger: sf-analyst performs architectural-level analysis
 * while sf-debugger focuses on code-level fixes.
 * 
 * Validates: Requirements 5.1, 5.2, 5.3
 */

import type { 
  AnalysisResult, 
  TimeRange, 
  Event, 
  EventFilter,
  NorthStarScenario,
  PermissionTrace
} from '@/types';
import { QueryAPI, createQueryAPI } from '@/query-api/index.js';
import { EventLogger } from '@/event-logger/index.js';
import { CAS } from '@/cas/index.js';

/**
 * sf-analyst agent responsibilities:
 * - Read observability data
 * - Generate structured analysis results
 * - Support all 10 North Star troubleshooting scenarios
 * - Provide data access interfaces for other agents
 */

/**
 * Analysis request for scheduling
 */
export interface AnalysisRequest {
  /**
   * Unique request identifier
   */
  requestId: string;
  
  /**
   * The scenario to analyze
   */
  scenario: NorthStarScenario;
  
  /**
   * Time range for analysis
   */
  timeRange: TimeRange;
  
  /**
   * Optional work item ID for scenario-specific analysis
   */
  workItemId?: string;
  
  /**
   * Optional session ID
   */
  sessionId?: string;
  
  /**
   * Optional project ID
   */
  projectId?: string;
  
  /**
   * Request priority (higher = more urgent)
   */
  priority?: number;
  
  /**
   * Callback when analysis is complete
   */
  onComplete?: (result: AnalysisResult) => void;
  
  /**
   * Callback on error
   */
  onError?: (error: Error) => void;
}

/**
 * Scheduled analysis job
 */
export interface ScheduledAnalysis {
  request: AnalysisRequest;
  scheduledAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: AnalysisResult;
  error?: string;
}

/**
 * Analysis result format for delivery
 */
export interface AnalysisReport {
  /**
   * Report unique identifier
   */
  reportId: string;
  
  /**
   * Request ID that generated this report
   */
  requestId: string;
  
  /**
   * The scenario analyzed
   */
  scenario: NorthStarScenario;
  
  /**
   * Analysis result
   */
  result: AnalysisResult;
  
  /**
   * Timestamp when analysis was completed
   */
  completedAt: number;
  
  /**
   * Time taken to generate analysis (ms)
   */
  analysisTimeMs: number;
  
  /**
   * Metadata about the analysis
   */
  metadata: {
    dataPoints: number;
    eventsAnalyzed: number;
    confidence: number;
  };
}

/**
 * Data access interface for sf-analyst
 * Provides read-only access to observability data
 */
export interface AnalystDataAccess {
  /**
   * Query events from the event log
   */
  queryEvents(filter: EventFilter): Promise<Event[]>;
  
  /**
   * Get a specific event by ID
   */
  getEvent(eventId: string): Promise<Event | null>;
  
  /**
   * Get blob content from CAS
   */
  getBlobContent(ref: string): Promise<Uint8Array | string | null>;
  
  /**
   * Get permission trace for a decision
   */
  getPermissionTrace(decisionId: string): Promise<PermissionTrace>;
  
  /**
   * Get event statistics
   */
  getStats(): Promise<{
    eventCount: number;
    lastEventId: string | null;
    categories: Record<string, number>;
  }>;
}

/**
 * sf-analyst configuration
 */
export interface SfAnalystConfig {
  /**
   * Event logger instance
   */
  eventLogger: EventLogger;
  
  /**
   * CAS instance
   */
  cas: CAS;
  
  /**
   * Maximum concurrent analyses
   */
  maxConcurrent?: number;
  
  /**
   * Default analysis timeout in ms
   */
  defaultTimeoutMs?: number;
  
  /**
   * Maximum events to analyze per scenario
   */
  maxEventsPerAnalysis?: number;
}

/**
 * sf-analyst Integration
 * 
 * Provides a unified interface for sf-analyst agent to:
 * 1. Access observability data (read-only)
 * 2. Schedule and execute analyses
 * 3. Format and deliver results
 */
export class SfAnalyst {
  private queryAPI: QueryAPI;
  private dataAccess: AnalystDataAccess;
  private scheduledAnalyses: Map<string, ScheduledAnalysis> = new Map();
  private completedReports: Map<string, AnalysisReport> = new Map();
  private maxConcurrent: number;
  private defaultTimeoutMs: number;
  private runningCount = 0;

  /**
   * Create a new sf-analyst integration instance
   * @param config Configuration options
   */
  constructor(config: SfAnalystConfig) {
    this.queryAPI = createQueryAPI({
      eventLogger: config.eventLogger,
      cas: config.cas,
      maxEventsPerQuery: config.maxEventsPerAnalysis ?? 1000
    });
    
    this.maxConcurrent = config.maxConcurrent ?? 3;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 60000;
    
    // Create data access interface
    this.dataAccess = this.createDataAccess();
  }

  /**
   * Create the data access interface for sf-analyst
   */
  private createDataAccess(): AnalystDataAccess {
    const self = this;
    
    return {
      async queryEvents(filter: EventFilter): Promise<Event[]> {
        return self.queryAPI.queryEventsSync(filter);
      },
      
      async getEvent(eventId: string): Promise<Event | null> {
        const events = await self.queryAPI.queryEventsSync({ limit: 1 });
        return events.find(e => e.eventId === eventId) ?? null;
      },
      
      async getBlobContent(ref: string): Promise<Uint8Array | string | null> {
        return self.queryAPI.getBlobContent(ref);
      },
      
      async getPermissionTrace(decisionId: string): Promise<PermissionTrace> {
        return self.queryAPI.getPermissionTrace(decisionId);
      },
      
      async getStats() {
        return self.queryAPI.getStats();
      }
    };
  }

  /**
   * Get the data access interface
   * This is the primary interface for sf-analyst to read observability data
   * 
   * @returns Read-only data access interface
   */
  getDataAccess(): AnalystDataAccess {
    return this.dataAccess;
  }

  /**
   * Execute an analysis synchronously
   * 
   * @param request Analysis request
   * @returns Analysis report
   */
  async executeAnalysis(request: AnalysisRequest): Promise<AnalysisReport> {
    const startTime = Date.now();
    const reportId = `report-${request.requestId}-${Date.now()}`;
    
    try {
      // Execute the analysis via Query API
      const result = await this.queryAPI.analyzeScenario(
        request.scenario,
        request.timeRange
      );
      
      // Format the result into a report
      const report: AnalysisReport = {
        reportId,
        requestId: request.requestId,
        scenario: request.scenario,
        result,
        completedAt: Date.now(),
        analysisTimeMs: Date.now() - startTime,
        metadata: {
          dataPoints: result.evidence.length,
          eventsAnalyzed: result.evidence.length,
          confidence: result.confidence
        }
      };
      
      // Store the report
      this.completedReports.set(reportId, report);
      
      // Call completion callback if provided
      if (request.onComplete) {
        request.onComplete(result);
      }
      
      return report;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Call error callback if provided
      if (request.onError) {
        request.onError(error instanceof Error ? error : new Error(errorMessage));
      }
      
      throw error;
    }
  }

  /**
   * Schedule an analysis for asynchronous execution
   * 
   * @param request Analysis request
   * @returns Request ID
   */
  scheduleAnalysis(request: AnalysisRequest): string {
    const scheduled: ScheduledAnalysis = {
      request,
      scheduledAt: Date.now(),
      status: 'pending'
    };
    
    this.scheduledAnalyses.set(request.requestId, scheduled);
    
    // Process the queue
    this.processQueue();
    
    return request.requestId;
  }

  /**
   * Process the analysis queue
   */
  private processQueue(): void {
    // Don't exceed max concurrent
    if (this.runningCount >= this.maxConcurrent) {
      return;
    }
    
    // Find pending analyses
    const pending = [...this.scheduledAnalyses.values()]
      .filter(a => a.status === 'pending')
      .sort((a, b) => (b.request.priority ?? 0) - (a.request.priority ?? 0));
    
    if (pending.length === 0) {
      return;
    }
    
    // Run one analysis
    const next = pending[0];
    this.runScheduledAnalysis(next);
  }

  /**
   * Run a scheduled analysis
   */
  private async runScheduledAnalysis(scheduled: ScheduledAnalysis): Promise<void> {
    this.runningCount++;
    scheduled.status = 'running';
    
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.executeAnalysis(scheduled.request),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(
              `Analysis timeout: 分析请求 "${scheduled.request.requestId}" 超过 ${this.defaultTimeoutMs}ms 未完成。` +
              `可能原因：分析逻辑耗时过长或事件数据量过大。` +
              `建议：缩小查询时间范围，或增大 defaultTimeoutMs 配置。`
            )),
            this.defaultTimeoutMs
          );
        })
      ]);
      
      scheduled.status = 'completed';
      scheduled.result = result.result;
    } catch (error) {
      scheduled.status = 'failed';
      scheduled.error = error instanceof Error ? error.message : String(error);
      
      if (scheduled.request.onError) {
        scheduled.request.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      clearTimeout(timeoutId); // 规则 C1：无论胜负，清理败者 timer
      this.runningCount--;
      this.processQueue();
    }
  }

  /**
   * Get a scheduled analysis by ID
   * 
   * @param requestId Request ID
   * @returns Scheduled analysis or undefined
   */
  getScheduledAnalysis(requestId: string): ScheduledAnalysis | undefined {
    return this.scheduledAnalyses.get(requestId);
  }

  /**
   * Get a completed report
   * 
   * @param reportId Report ID
   * @returns Analysis report or undefined
   */
  getReport(reportId: string): AnalysisReport | undefined {
    return this.completedReports.get(reportId);
  }

  /**
   * Get all reports for a request
   * 
   * @param requestId Request ID
   * @returns Array of reports
   */
  getReportsForRequest(requestId: string): AnalysisReport[] {
    return [...this.completedReports.values()]
      .filter(r => r.requestId === requestId);
  }

  /**
   * Format analysis result for delivery
   * Converts internal result to user-friendly format
   * 
   * @param result Analysis result
   * @returns Formatted report
   */
  formatResult(result: AnalysisResult): {
    summary: string;
    details: string[];
    recommendations: string[];
    confidence: string;
  } {
    const confidencePercent = Math.round(result.confidence * 100);
    
    return {
      summary: result.rootCause 
        ? `Root cause identified: ${result.rootCause}` 
        : 'No root cause identified',
      details: [
        `Scenario: ${result.scenario}`,
        `Time to identify: ${result.timeToIdentify}ms`,
        `Evidence: ${result.evidence.length} events`,
        `Confidence: ${confidencePercent}%`
      ],
      recommendations: result.recommendations,
      confidence: confidencePercent >= 80 ? 'High' : 
                  confidencePercent >= 50 ? 'Medium' : 'Low'
    };
  }

  /**
   * Cancel a scheduled analysis
   * 
   * @param requestId Request ID to cancel
   * @returns True if cancelled, false if not found or already running
   */
  cancelAnalysis(requestId: string): boolean {
    const scheduled = this.scheduledAnalyses.get(requestId);
    
    if (!scheduled) {
      return false;
    }
    
    if (scheduled.status === 'running') {
      // Cannot cancel running analyses
      return false;
    }
    
    scheduled.status = 'failed';
    scheduled.error = 'Cancelled by user';
    
    return true;
  }

  /**
   * Get queue status
   * 
   * @returns Queue statistics
   */
  getQueueStatus(): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    const analyses = [...this.scheduledAnalyses.values()];
    
    return {
      pending: analyses.filter(a => a.status === 'pending').length,
      running: analyses.filter(a => a.status === 'running').length,
      completed: analyses.filter(a => a.status === 'completed').length,
      failed: analyses.filter(a => a.status === 'failed').length
    };
  }

  /**
   * Analyze gate failures (North Star Scenario 1)
   * 
   * @param workItemId Work item ID
   * @param timeRange Time range
   * @returns Analysis result
   */
  async analyzeGateFailures(workItemId: string, timeRange: TimeRange): Promise<AnalysisResult> {
    const filter: EventFilter = {
      workItemId,
      startTs: timeRange.start,
      endTs: timeRange.end,
      category: 'gate',
      action: 'gate.evaluated'
    };
    
    const events = await this.dataAccess.queryEvents(filter);
    
    return this.performGateFailureAnalysis(events);
  }

  /**
   * Analyze agent deviation (North Star Scenario 2)
   * 
   * @param sessionId Session ID
   * @returns Analysis result
   */
  async analyzeAgentDeviation(sessionId: string): Promise<AnalysisResult> {
    const events = await this.dataAccess.queryEvents({
      action: 'session.prompt'
    });
    
    const promptEvents = events.filter(e => (e.payload as any)?.sessionId === sessionId);
    const responseEvents = await this.dataAccess.queryEvents({
      action: 'session.response'
    });
    const responseForSession = responseEvents.filter(e => (e.payload as any)?.sessionId === sessionId);
    
    return this.performAgentDeviationAnalysis(promptEvents, responseForSession);
  }

  /**
   * Analyze tool invocation errors (North Star Scenario 3)
   * 
   * @param toolId Tool ID
   * @param timeRange Time range
   * @returns Analysis result
   */
  async analyzeToolErrors(toolId: string, timeRange: TimeRange): Promise<AnalysisResult> {
    const events = await this.dataAccess.queryEvents({
      startTs: timeRange.start,
      endTs: timeRange.end,
      category: 'tool',
      action: 'tool.error'
    });
    
    const toolErrors = events.filter(e => (e.payload as any)?.toolId === toolId);
    
    return {
      scenario: 'tool-invocation-error',
      rootCause: toolErrors.length > 0 
        ? `Tool "${toolId}" had ${toolErrors.length} errors`
        : null,
      confidence: toolErrors.length > 0 ? 0.8 : 1,
      evidence: toolErrors,
      recommendations: toolErrors.length > 0 
        ? ['Review tool implementation', 'Check input parameters', 'Verify tool dependencies']
        : ['No errors found'],
      timeToIdentify: 0
    };
  }

  /**
   * Analyze permission denials (North Star Scenario 4)
   * 
   * @param projectId Project ID
   * @param timeRange Time range
   * @returns Analysis result
   */
  async analyzePermissionDenials(projectId: string, timeRange: TimeRange): Promise<AnalysisResult> {
    const filter: EventFilter = {
      projectId,
      startTs: timeRange.start,
      endTs: timeRange.end,
      category: 'permission',
      action: 'permission.evaluated'
    };
    
    const events = await this.dataAccess.queryEvents(filter);
    const denials = events.filter(e => (e.payload as any)?.effect === 'deny');
    
    return this.performPermissionDenialAnalysis(denials);
  }

  /**
   * Perform gate failure analysis
   */
  private performGateFailureAnalysis(events: Event[]): AnalysisResult {
    const failures = events.filter(e => 
      e.payload && (e.payload as any)?.effect === 'deny'
    );
    
    if (failures.length === 0) {
      return {
        scenario: 'gate-repeated-failure',
        rootCause: null,
        confidence: 1,
        evidence: events,
        recommendations: ['No gate failures found'],
        timeToIdentify: 0
      };
    }
    
    // Group by gate type
    const gateTypes = new Map<string, number>();
    for (const event of failures) {
      const gateType = (event.payload as any)?.gateType ?? 'unknown';
      gateTypes.set(gateType, (gateTypes.get(gateType) ?? 0) + 1);
    }
    
    const mostFrequent = [...gateTypes.entries()].sort((a, b) => b[1] - a[1])[0];
    
    return {
      scenario: 'gate-repeated-failure',
      rootCause: `Gate "${mostFrequent[0]}" failed ${mostFrequent[1]} times`,
      confidence: Math.min(1, mostFrequent[1] / 3),
      evidence: failures,
      recommendations: [
        `Review gate configuration for "${mostFrequent[0]}"`,
        'Check input parameters',
        'Verify prerequisite conditions'
      ],
      timeToIdentify: 0
    };
  }

  /**
   * Perform agent deviation analysis
   */
  private performAgentDeviationAnalysis(promptEvents: Event[], responseEvents: Event[]): AnalysisResult {
    if (promptEvents.length === 0 || responseEvents.length === 0) {
      return {
        scenario: 'agent-deviation',
        rootCause: null,
        confidence: 1,
        evidence: [],
        recommendations: ['No session data found'],
        timeToIdentify: 0
      };
    }
    
    // Simple deviation detection: check for significant response differences
    const deviations = responseEvents.filter(e => (e.payload as any)?.deviated === true);
    
    return {
      scenario: 'agent-deviation',
      rootCause: deviations.length > 0 
        ? `Agent deviated from prompt in ${deviations.length} responses`
        : null,
      confidence: deviations.length > 0 ? 0.7 : 1,
      evidence: [...promptEvents, ...responseEvents],
      recommendations: deviations.length > 0
        ? ['Review prompt engineering', 'Check agent configuration', 'Analyze deviation patterns']
        : ['No deviations detected'],
      timeToIdentify: 0
    };
  }

  /**
   * Perform permission denial analysis
   */
  private performPermissionDenialAnalysis(events: Event[]): AnalysisResult {
    if (events.length === 0) {
      return {
        scenario: 'permission-denial',
        rootCause: null,
        confidence: 1,
        evidence: [],
        recommendations: ['No permission denials found'],
        timeToIdentify: 0
      };
    }
    
    // Group by matched rule
    const rules = new Map<string, number>();
    for (const event of events) {
      const rule = (event.payload as any)?.matched_rule ?? 'unknown';
      rules.set(rule, (rules.get(rule) ?? 0) + 1);
    }
    
    const mostCommon = [...rules.entries()].sort((a, b) => b[1] - a[1])[0];
    
    return {
      scenario: 'permission-denial',
      rootCause: `Permission denied by rule "${mostCommon[0]}" (${mostCommon[1]} times)`,
      confidence: Math.min(1, mostCommon[1] / 3),
      evidence: events,
      recommendations: [
        `Review permission rule "${mostCommon[0]}"`,
        'Add exception if needed',
        'Verify actor permissions'
      ],
      timeToIdentify: 0
    };
  }

  /**
   * Clear old reports to free memory
   * 
   * @param maxReports Maximum number of reports to keep
   */
  clearOldReports(maxReports: number = 100): void {
    if (this.completedReports.size <= maxReports) {
      return;
    }
    
    const entries = [...this.completedReports.entries()]
      .sort((a, b) => b[1].completedAt - a[1].completedAt);
    
    const toDelete = entries.slice(maxReports);
    for (const [id] of toDelete) {
      this.completedReports.delete(id);
    }
  }
}

/**
 * Create an sf-analyst integration instance
 * 
 * @param config Configuration
 * @returns Configured SfAnalyst instance
 */
export function createSfAnalyst(config: SfAnalystConfig): SfAnalyst {
  return new SfAnalyst(config);
}

// Re-export types for convenience
export type { 
  AnalysisResult, 
  TimeRange, 
  Event, 
  EventFilter,
  NorthStarScenario,
  PermissionTrace 
} from '@/types';