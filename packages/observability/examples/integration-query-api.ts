/**
 * Integration Example: Using Query API for Custom Analysis
 * 
 * This example demonstrates how to use the Query API to perform custom analysis
 * on event data for troubleshooting and monitoring purposes.
 * 
 * **Prerequisites**:
 * - Install @specforge/observability
 * - Have events logged via Event Bus or Event Logger
 */

import { 
  QueryAPI, 
  EventLogger, 
  EventFilter, 
  Event,
  NorthStarScenario 
} from '../src/index';

/**
 * Example: Custom Analysis Dashboard
 * 
 * This class shows how to build custom analysis on top of the Query API.
 */
class CustomAnalysisDashboard {
  private queryAPI: QueryAPI;
  
  constructor(queryAPI: QueryAPI) {
    this.queryAPI = queryAPI;
  }
  
  /**
   * Analyze workflow performance over time
   */
  async analyzeWorkflowPerformance(projectId: string, hoursBack: number = 24): Promise<{
    totalWorkflows: number;
    successRate: number;
    averageDuration: number;
    failedWorkflows: Event[];
  }> {
    const startTime = Date.now() - (hoursBack * 60 * 60 * 1000);
    
    // Get all workflow events
    const events = await this.queryAPI.queryEventsSync({
      projectId,
      category: 'workflow',
      startTs: startTime * 1_000_000 // Convert to nanoseconds
    });
    
    // Filter for workflow started and completed/failed
    const started = events.filter(e => e.action === 'workflow.started');
    const completed = events.filter(e => e.action === 'workflow.completed');
    const failed = events.filter(e => e.action === 'workflow.failed');
    
    // Calculate metrics
    const totalWorkflows = started.length;
    const successRate = totalWorkflows > 0 ? (completed.length / totalWorkflows) * 100 : 0;
    
    // Calculate average duration from start to complete
    let totalDuration = 0;
    let durationCount = 0;
    
    for (const startEvent of started) {
      const matchingComplete = completed.find(
        c => c.workItemId === startEvent.workItemId && c.ts > startEvent.ts
      );
      
      if (matchingComplete) {
        const duration = (matchingComplete.ts - startEvent.ts) / 1_000_000; // Convert to ms
        totalDuration += duration;
        durationCount++;
      }
    }
    
    const averageDuration = durationCount > 0 ? totalDuration / durationCount : 0;
    
    return {
      totalWorkflows,
      successRate,
      averageDuration,
      failedWorkflows: failed
    };
  }
  
  /**
   * Analyze tool usage patterns
   */
  async analyzeToolUsage(projectId: string, hoursBack: number = 24): Promise<{
    toolCounts: Record<string, number>;
    toolSuccessRates: Record<string, { total: number; success: number }>;
    mostFrequentErrors: { toolName: string; error: string; count: number }[];
  }> {
    const startTime = Date.now() - (hoursBack * 60 * 60 * 1000);
    
    const events = await this.queryAPI.queryEventsSync({
      projectId,
      category: 'tool',
      startTs: startTime * 1_000_000
    });
    
    const toolCounts: Record<string, number> = {};
    const toolResults: Record<string, { total: number; success: number }> = {};
    const errors: Record<string, Record<string, number>> = {};
    
    for (const event of events) {
      const payload = event.payload as any;
      const toolName = payload?.toolName || 'unknown';
      
      // Count invocations
      if (event.action === 'tool.invoked') {
        toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
        
        if (!toolResults[toolName]) {
          toolResults[toolName] = { total: 0, success: 0 };
        }
        toolResults[toolName].total++;
      }
      
      // Track success/failure
      if (event.action === 'tool.completed') {
        if (toolResults[toolName]) {
          toolResults[toolName].success++;
        }
      }
      
      // Track errors
      if (event.action === 'tool.failed') {
        const error = payload?.error || 'Unknown error';
        if (!errors[toolName]) {
          errors[toolName] = {};
        }
        errors[toolName][error] = (errors[toolName][error] || 0) + 1;
      }
    }
    
    // Get most frequent errors
    const mostFrequentErrors: { toolName: string; error: string; count: number }[] = [];
    
    for (const [toolName, errorMap] of Object.entries(errors)) {
      for (const [error, count] of Object.entries(errorMap)) {
        mostFrequentErrors.push({ toolName, error, count });
      }
    }
    
    mostFrequentErrors.sort((a, b) => b.count - a.count);
    
    return {
      toolCounts,
      toolSuccessRates: toolResults,
      mostFrequentErrors: mostFrequentErrors.slice(0, 10)
    };
  }
  
  /**
   * Analyze permission decisions
   */
  async analyzePermissionDecisions(projectId: string, hoursBack: number = 24): Promise<{
    totalDecisions: number;
    allowRate: number;
    deniedActions: { action: string; count: number; reasons: string[] }[];
    mostDeniedUsers: { actorId: string; denialCount: number }[];
  }> {
    const startTime = Date.now() - (hoursBack * 60 * 60 * 1000);
    
    const events = await this.queryAPI.queryEventsSync({
      projectId,
      category: 'permission',
      action: 'permission.evaluated',
      startTs: startTime * 1_000_000
    });
    
    let allowCount = 0;
    let denyCount = 0;
    const deniedActions: Record<string, { count: number; reasons: Set<string> }> = {};
    const userDenials: Record<string, number> = {};
    
    for (const event of events) {
      const payload = event.payload as any;
      const effect = payload?.effect;
      const action = payload?.action || 'unknown';
      const actorId = event.actor?.id || 'unknown';
      const reason = payload?.reason || '';
      
      if (effect === 'allow') {
        allowCount++;
      } else if (effect === 'deny') {
        denyCount++;
        
        // Track denied actions
        if (!deniedActions[action]) {
          deniedActions[action] = { count: 0, reasons: new Set() };
        }
        deniedActions[action].count++;
        if (reason) {
          deniedActions[action].reasons.add(reason);
        }
        
        // Track user denials
        userDenials[actorId] = (userDenials[actorId] || 0) + 1;
      }
    }
    
    const totalDecisions = allowCount + denyCount;
    const allowRate = totalDecisions > 0 ? (allowCount / totalDecisions) * 100 : 0;
    
    // Format denied actions
    const formattedDeniedActions = Object.entries(deniedActions).map(([action, data]) => ({
      action,
      count: data.count,
      reasons: Array.from(data.reasons)
    }));
    
    // Format most denied users
    const mostDeniedUsers = Object.entries(userDenials)
      .map(([actorId, count]) => ({ actorId, denialCount: count }))
      .sort((a, b) => b.denialCount - a.denialCount)
      .slice(0, 10);
    
    return {
      totalDecisions,
      allowRate,
      deniedActions: formattedDeniedActions,
      mostDeniedUsers
    };
  }
  
  /**
   * Get events in a specific time range for manual inspection
   */
  async getEventsForInspection(
    projectId: string, 
    startTime: Date, 
    endTime: Date,
    limit: number = 100
  ): Promise<Event[]> {
    const filter: EventFilter = {
      projectId,
      startTs: startTime.getTime() * 1_000_000,
      endTs: endTime.getTime() * 1_000_000,
      limit
    };
    
    const result = await this.queryAPI.queryEvents(filter);
    return result.items;
  }
}

/**
 * Example: Cross-Project Analysis
 * 
 * Analyze events across multiple projects.
 */
class CrossProjectAnalyzer {
  private queryAPI: QueryAPI;
  
  constructor(queryAPI: QueryAPI) {
    this.queryAPI = queryAPI;
  }
  
  /**
   * Get overview of all projects
   */
  async getProjectsOverview(): Promise<{
    projects: { projectId: string; eventCount: number; firstEvent: number; lastEvent: number }[];
    totalEvents: number;
  }> {
    const allStats = await this.queryAPI.getAllProjectStats();
    
    const projects: { projectId: string; eventCount: number; firstEvent: number; lastEvent: number }[] = [];
    let totalEvents = 0;
    
    for (const [projectId, stats] of allStats) {
      projects.push({
        projectId,
        eventCount: stats.eventCount,
        firstEvent: stats.firstEventTs,
        lastEvent: stats.lastEventTs
      });
      totalEvents += stats.eventCount;
    }
    
    return { projects, totalEvents };
  }
  
  /**
   * Search for specific events across all projects
   */
  async searchAcrossProjects(action: string, hoursBack: number = 24): Promise<{
    items: Event[];
    total: number;
    projects: { projectId: string; count: number }[];
  }> {
    const startTime = Date.now() - (hoursBack * 60 * 60 * 1000);
    
    const result = await this.queryAPI.queryEventsCrossProject(
      {
        action,
        startTs: startTime * 1_000_000
      },
      { pageSize: 100 }
    );
    
    return {
      items: result.items,
      total: result.total,
      projects: result.projects
    };
  }
}

/**
 * Main demonstration
 */
async function main() {
  console.log('=== Query API Integration Example ===\n');
  
  // Initialize components
  const eventLogger = new EventLogger();
  await eventLogger.initialize();
  const queryAPI = new QueryAPI(eventLogger);
  
  // First, let's populate some sample events
  console.log('1. Populating sample events...');
  
  // Add some workflow events
  for (let i = 0; i < 5; i++) {
    await eventLogger.append({
      schema_version: '1.0',
      eventId: `wf-started-${i}`,
      ts: Date.now() * 1_000_000 - i * 60_000_000,
      monotonicSeq: i * 2,
      projectId: 'demo-project',
      workItemId: `workitem-${i}`,
      actor: { id: 'workflow-agent', name: 'Workflow Agent', type: 'agent' },
      category: 'workflow',
      action: 'workflow.started',
      payload: { workflowName: `workflow-${i}` }
    });
    
    await eventLogger.append({
      schema_version: '1.0',
      eventId: `wf-completed-${i}`,
      ts: Date.now() * 1_000_000 - i * 60_000_000 + 30_000_000,
      monotonicSeq: i * 2 + 1,
      projectId: 'demo-project',
      workItemId: `workitem-${i}`,
      actor: { id: 'workflow-agent', name: 'Workflow Agent', type: 'agent' },
      category: 'workflow',
      action: i === 2 ? 'workflow.failed' : 'workflow.completed',
      payload: { workflowName: `workflow-${i}`, result: i === 2 ? 'failed' : 'success' }
    });
  }
  
  // Add some tool events
  for (let i = 0; i < 10; i++) {
    const toolName = ['git', 'npm', 'node', 'docker'][i % 4];
    await eventLogger.append({
      schema_version: '1.0',
      eventId: `tool-invoked-${i}`,
      ts: Date.now() * 1_000_000 - i * 10_000_000,
      monotonicSeq: i,
      projectId: 'demo-project',
      workItemId: 'workitem-1',
      actor: { id: 'tool-agent', name: 'Tool Agent', type: 'agent' },
      category: 'tool',
      action: i === 5 ? 'tool.failed' : 'tool.completed',
      payload: { toolName, result: i === 5 ? 'error' : 'ok', error: i === 5 ? 'Command failed' : undefined }
    });
  }
  
  // Add permission events
  for (let i = 0; i < 5; i++) {
    await eventLogger.append({
      schema_version: '1.0',
      eventId: `perm-${i}`,
      ts: Date.now() * 1_000_000 - i * 20_000_000,
      monotonicSeq: i,
      projectId: 'demo-project',
      workItemId: 'workitem-1',
      actor: { id: 'user-1', name: 'User', type: 'user' },
      category: 'permission',
      action: 'permission.evaluated',
      payload: {
        actor: { id: 'user-1', name: 'User', type: 'user' },
        action: 'tool.invoke',
        resource: { type: 'tool', id: 'filesystem-write' },
        matched_rule: 'allow-write',
        rule_layer: 'user' as const,
        reason: 'User has permission',
        effect: i === 0 ? 'deny' : 'allow'
      }
    });
  }
  
  console.log('   Sample events created\n');
  
  // Example 1: Custom Analysis Dashboard
  console.log('2. Custom Analysis Dashboard:');
  const dashboard = new CustomAnalysisDashboard(queryAPI);
  
  const workflowStats = await dashboard.analyzeWorkflowPerformance('demo-project', 24);
  console.log(`   Workflows: ${workflowStats.totalWorkflows}`);
  console.log(`   Success Rate: ${workflowStats.successRate.toFixed(1)}%`);
  console.log(`   Average Duration: ${workflowStats.averageDuration.toFixed(0)}ms`);
  console.log(`   Failed: ${workflowStats.failedWorkflows.length}`);
  console.log('');
  
  const toolStats = await dashboard.analyzeToolUsage('demo-project', 24);
  console.log('   Tool Usage:');
  for (const [tool, count] of Object.entries(toolStats.toolCounts)) {
    const rates = toolStats.toolSuccessRates[tool];
    const successRate = rates ? ((rates.success / rates.total) * 100).toFixed(1) : '0.0';
    console.log(`     ${tool}: ${count} invocations, ${successRate}% success`);
  }
  console.log('');
  
  const permStats = await dashboard.analyzePermissionDecisions('demo-project', 24);
  console.log(`   Permission Decisions: ${permStats.totalDecisions}`);
  console.log(`   Allow Rate: ${permStats.allowRate.toFixed(1)}%`);
  console.log(`   Denied: ${permStats.deniedActions.reduce((sum, a) => sum + a.count, 0)}`);
  console.log('');
  
  // Example 2: Cross-Project Analysis
  console.log('3. Cross-Project Analysis:');
  const crossProject = new CrossProjectAnalyzer(queryAPI);
  const overview = await crossProject.getProjectsOverview();
  console.log(`   Total projects: ${overview.projects.length}`);
  console.log(`   Total events: ${overview.totalEvents}`);
  console.log('');
  
  // Example 3: Using Query API directly
  console.log('4. Direct Query API Usage:');
  const events = await queryAPI.queryEventsSync({
    projectId: 'demo-project',
    category: 'workflow',
    limit: 3
  });
  console.log(`   Retrieved ${events.length} workflow events`);
  
  // Get all known projects
  const projects = await queryAPI.getKnownProjects();
  console.log(`   Known projects: ${projects.join(', ')}`);
  console.log('');
  
  // Example 4: Using built-in scenario analysis
  console.log('5. Built-in Scenario Analysis:');
  try {
    const analysis = await queryAPI.analyzeScenario('gate-repeated-failure', {
      start: Date.now() - 3600000,
      end: Date.now()
    });
    console.log(`   Scenario: ${analysis.scenario}`);
    console.log(`   Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
    console.log(`   Root cause: ${analysis.rootCause || 'None identified'}`);
  } catch (e) {
    console.log('   (No matching events for scenario analysis)');
  }
  console.log('');
  
  console.log('=== Query API Example Complete ===');
  console.log('\nKey Takeaways:');
  console.log('• Query API provides rich filtering and pagination');
  console.log('• Use queryEventsSync for simple queries');
  console.log('• Use queryEventsCrossProject for multi-project analysis');
  console.log('• Build custom dashboards on top of Query API');
  console.log('• Access raw events for detailed inspection');
  
  // Cleanup
  await eventLogger.clear();
}

// Run the example
main().catch(console.error);