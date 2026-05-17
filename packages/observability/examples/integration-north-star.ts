/**
 * Integration Example: Implementing a New North Star Scenario
 * 
 * This example demonstrates how to implement a custom North Star scenario
 * for the Analyst Engine to identify specific problem patterns.
 * 
 * **Prerequisites**:
 * - Install @specforge/observability
 * - Understand the Analyst Engine and Query API
 */

import { 
  EventLogger, 
  AnalystEngine, 
  QueryAPI,
  Event,
  NorthStarScenario,
  AnalysisResult,
  EventFilter 
} from '../src/index';

/**
 * Custom Scenario: Detect and Analyze Memory Leaks
 * 
 * This example shows how to implement a custom scenario that detects
 * patterns indicative of memory leaks in agent processes.
 */
class MemoryLeakScenario {
  private queryAPI: QueryAPI;
  private scenarioId: NorthStarScenario = 'custom.memory-leak';
  
  constructor(queryAPI: QueryAPI) {
    this.queryAPI = queryAPI;
  }
  
  /**
   * Analyze for memory leak patterns
   */
  async analyze(projectId: string, timeRange: { start: number; end: number }): Promise<AnalysisResult> {
    const evidence: Event[] = [];
    const recommendations: string[] = [];
    
    // Get all system events related to memory
    const events = await this.queryAPI.queryEventsSync({
      projectId,
      category: 'system',
      startTs: timeRange.start * 1_000_000,
      endTs: timeRange.end * 1_000_000
    });
    
    // Look for memory warning patterns
    const memoryWarnings = events.filter(e => 
      e.action === 'system.memory.warning' || 
      e.action === 'system.memory.critical'
    );
    
    // Look for increasing memory usage patterns
    const memoryUsage: { ts: number; usage: number }[] = [];
    
    for (const event of events) {
      const payload = event.payload as any;
      if (payload?.memoryUsageMB) {
        memoryUsage.push({
          ts: event.ts,
          usage: payload.memoryUsageMB
        });
      }
    }
    
    // Sort by timestamp
    memoryUsage.sort((a, b) => a.ts - b.ts);
    
    // Check for increasing trend
    let increasingTrend = false;
    if (memoryUsage.length >= 3) {
      const firstHalf = memoryUsage.slice(0, Math.floor(memoryUsage.length / 2));
      const secondHalf = memoryUsage.slice(Math.floor(memoryUsage.length / 2));
      
      const avgFirst = firstHalf.reduce((sum, m) => sum + m.usage, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((sum, m) => sum + m.usage, 0) / secondHalf.length;
      
      if (avgSecond > avgFirst * 1.5) {
        increasingTrend = true;
        evidence.push(...memoryWarnings);
      }
    }
    
    // Determine confidence
    let confidence = 0;
    let rootCause: string | null = null;
    
    if (memoryWarnings.length > 0 && increasingTrend) {
      confidence = 0.9;
      rootCause = 'Memory usage shows continuous increase pattern with warnings';
      recommendations.push('Review memory allocation in agent code');
      recommendations.push('Check for unbounded caching or data structures');
      recommendations.push('Consider implementing memory limits');
    } else if (memoryWarnings.length > 0) {
      confidence = 0.5;
      rootCause = 'Memory warnings detected but no clear trend';
      recommendations.push('Monitor memory usage over longer period');
    } else if (increasingTrend) {
      confidence = 0.6;
      rootCause = 'Memory usage increasing but no warnings yet';
      recommendations.push('Investigate potential memory leak before critical');
    }
    
    return {
      scenario: this.scenarioId,
      rootCause,
      confidence,
      evidence,
      recommendations,
      timeToIdentify: Date.now() - timeRange.end
    };
  }
}

/**
 * Custom Scenario: Detect Configuration Drift
 * 
 * Detects when configuration has drifted from expected state,
 * causing inconsistent behavior.
 */
class ConfigurationDriftScenario {
  private queryAPI: QueryAPI;
  private scenarioId: NorthStarScenario = 'custom.config-drift';
  
  constructor(queryAPI: QueryAPI) {
    this.queryAPI = queryAPI;
  }
  
  /**
   * Analyze for configuration drift
   */
  async analyze(projectId: string, timeRange: { start: number; end: number }): Promise<AnalysisResult> {
    const events = await this.queryAPI.queryEventsSync({
      projectId,
      category: 'system',
      action: 'system.config.changed',
      startTs: timeRange.start * 1_000_000,
      endTs: timeRange.end * 1_000_000
    });
    
    const evidence: Event[] = [...events];
    const recommendations: string[] = [];
    
    // Check for multiple config changes
    const configChanges = new Map<string, number>();
    
    for (const event of events) {
      const payload = event.payload as any;
      const configKey = payload?.configKey || 'unknown';
      configChanges.set(configKey, (configChanges.get(configKey) || 0) + 1);
    }
    let confidence = 0;
    let rootCause: string | null = null;
    
    // High frequency changes indicate drift
    const excessiveChanges = Array.from(configChanges.entries()).filter(([_, count]) => count > 5);
    
    if (excessiveChanges.length > 0) {
      confidence = 0.8;
      rootCause = `Configuration drift detected: ${excessiveChanges.map(([k]) => k).join(', ')} changed frequently`;
      recommendations.push('Review and standardize configuration management');
      recommendations.push('Consider configuration versioning');
    }
    
    return {
      scenario: this.scenarioId,
      rootCause,
      confidence,
      evidence,
      recommendations,
      timeToIdentify: Date.now() - timeRange.end
    };
  }
}

/**
 * Custom Scenario: Analyze Permission Escalation Patterns
 * 
 * Detects potential permission escalation attempts.
 */
class PermissionEscalationScenario {
  private queryAPI: QueryAPI;
  private scenarioId: NorthStarScenario = 'custom.permission-escalation';
  
  constructor(queryAPI: QueryAPI) {
    this.queryAPI = queryAPI;
  }
  
  /**
   * Analyze for permission escalation patterns
   */
  async analyze(projectId: string, timeRange: { start: number; end: number }): Promise<AnalysisResult> {
    const events = await this.queryAPI.queryEventsSync({
      projectId,
      category: 'permission',
      action: 'permission.evaluated',
      startTs: timeRange.start * 1_000_000,
      endTs: timeRange.end * 1_000_000
    });
    
    const evidence: Event[] = [];
    const recommendations: string[] = [];
    
    // Look for denied permissions followed by retries
    const deniedEvents: Event[] = [];
    const allowedEvents: Event[] = [];
    
    for (const event of events) {
      const payload = event.payload as any;
      if (payload?.effect === 'deny') {
        deniedEvents.push(event);
      } else if (payload?.effect === 'allow') {
        allowedEvents.push(event);
      }
    }
    
    // Check for retry patterns (denied then allowed)
    let escalationDetected = false;
    
    for (const denied of deniedEvents) {
      const retry = allowedEvents.find(a => 
        a.actor?.id === denied.actor?.id &&
        (a.payload as any)?.action === (denied.payload as any)?.action &&
        a.ts > denied.ts &&
        (a.ts - denied.ts) < 60000000000 // Within 1 minute
      );
      
      if (retry) {
        evidence.push(denied, retry);
        escalationDetected = true;
      }
    }
    
    let confidence = 0;
    let rootCause: string | null = null;
    
    if (escalationDetected) {
      confidence = 0.7;
      rootCause = 'Potential permission escalation: denied actions retried and eventually allowed';
      recommendations.push('Review permission rules for potential bypasses');
      recommendations.add('Implement rate limiting on permission retries');
      recommendations.add('Audit successful permission retries');
    }
    
    return {
      scenario: this.scenarioId,
      rootCause,
      confidence,
      evidence,
      recommendations,
      timeToIdentify: Date.now() - timeRange.end
    };
  }
}

/**
 * Extended Analyst Engine
 * 
 * Wraps the built-in Analyst Engine with custom scenarios.
 */
class ExtendedAnalystEngine {
  private analystEngine: AnalystEngine;
  private customScenarios: Map<string, { analyze: (projectId: string, timeRange: { start: number; end: number }) => Promise<AnalysisResult> }> = new Map();
  
  constructor(queryAPI: QueryAPI) {
    this.analystEngine = new AnalystEngine(queryAPI);
    
    // Register custom scenarios
    this.customScenarios.set('custom.memory-leak', new MemoryLeakScenario(queryAPI));
    this.customScenarios.set('custom.config-drift', new ConfigurationDriftScenario(queryAPI));
    this.customScenarios.set('custom.permission-escalation', new PermissionEscalationScenario(queryAPI));
  }
  
  /**
   * Analyze a scenario (built-in or custom)
   */
  async analyze(projectId: string, scenario: NorthStarScenario, timeRange: { start: number; end: number }): Promise<AnalysisResult> {
    // Check if it's a custom scenario
    if (this.customScenarios.has(scenario)) {
      return this.customScenarios.get(scenario)!.analyze(projectId, timeRange);
    }
    
    // Fall back to built-in scenarios
    return this.analystEngine.analyzeGateFailures(projectId, timeRange);
  }
  
  /**
   * Get list of all available scenarios (built-in + custom)
   */
  getAvailableScenarios(): string[] {
    const builtIn: NorthStarScenario[] = [
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
    
    return [...builtIn, ...Array.from(this.customScenarios.keys())];
  }
}

/**
 * Main demonstration
 */
async function main() {
  console.log('=== North Star Scenario Implementation Example ===\n');
  
  // Initialize components
  const eventLogger = new EventLogger();
  await eventLogger.initialize();
  const queryAPI = new QueryAPI(eventLogger);
  const analystEngine = new ExtendedAnalystEngine(queryAPI);
  
  // Populate sample events for different scenarios
  console.log('1. Populating sample events...');
  
  // Gate failure events
  for (let i = 0; i < 5; i++) {
    await eventLogger.append({
      schema_version: '1.0',
      eventId: `gate-fail-${i}`,
      ts: Date.now() * 1_000_000 - i * 60_000_000,
      monotonicSeq: i,
      projectId: 'demo-project',
      workItemId: 'workitem-1',
      actor: null,
      category: 'gate',
      action: 'gate.failed',
      payload: { gateId: 'requirements-gate', reason: 'Missing required artifacts' }
    });
  }
  
  // Memory warning events
  for (let i = 0; i < 5; i++) {
    await eventLogger.append({
      schema_version: '1.0',
      eventId: `mem-${i}`,
      ts: Date.now() * 1_000_000 - i * 30_000_000,
      monotonicSeq: i,
      projectId: 'demo-project',
      workItemId: null,
      actor: { id: 'system', name: 'System', type: 'system' },
      category: 'system',
      action: 'system.memory.warning',
      payload: { memoryUsageMB: 100 + i * 50, threshold: 300 }
    });
  }
  
  // Permission events with escalation pattern
  for (let i = 0; i < 3; i++) {
    await eventLogger.append({
      schema_version: '1.0',
      eventId: `perm-deny-${i}`,
      ts: Date.now() * 1_000_000 - i * 10_000_000,
      monotonicSeq: i,
      projectId: 'demo-project',
      workItemId: 'workitem-1',
      actor: { id: 'user-1', name: 'User', type: 'user' },
      category: 'permission',
      action: 'permission.evaluated',
      payload: {
        actor: { id: 'user-1', name: 'User', type: 'user' },
        action: 'tool.invoke',
        resource: { type: 'tool', id: 'admin-panel' },
        matched_rule: 'deny-admin',
        rule_layer: 'hard',
        reason: 'Admin tools not allowed',
        effect: 'deny'
      }
    });
    
    await eventLogger.append({
      schema_version: '1.0',
      eventId: `perm-allow-${i}`,
      ts: Date.now() * 1_000_000 - i * 10_000_000 + 5_000_000,
      monotonicSeq: i + 0.5,
      projectId: 'demo-project',
      workItemId: 'workitem-1',
      actor: { id: 'user-1', name: 'User', type: 'user' },
      category: 'permission',
      action: 'permission.evaluated',
      payload: {
        actor: { id: 'user-1', name: 'User', type: 'user' },
        action: 'tool.invoke',
        resource: { type: 'tool', id: 'admin-panel' },
        matched_rule: 'allow-admin',
        rule_layer: 'user',
        reason: 'User granted admin access',
        effect: 'allow'
      }
    });
  }
  
  console.log('   Sample events created\n');
  
  // Example 1: Built-in scenario
  console.log('2. Built-in Scenario (gate-repeated-failure):');
  const gateAnalysis = await queryAPI.analyzeScenario('gate-repeated-failure', {
    start: Date.now() - 3600000,
    end: Date.now()
  });
  console.log(`   Scenario: ${gateAnalysis.scenario}`);
  console.log(`   Confidence: ${(gateAnalysis.confidence * 100).toFixed(0)}%`);
  console.log(`   Root cause: ${gateAnalysis.rootCause || 'None'}`);
  console.log(`   Evidence: ${gateAnalysis.evidence.length} events`);
  console.log('');
  
  // Example 2: Custom scenario - Memory Leak
  console.log('3. Custom Scenario (custom.memory-leak):');
  const memoryAnalysis = await analystEngine.analyze('demo-project', 'custom.memory-leak', {
    start: Date.now() - 3600000,
    end: Date.now()
  });
  console.log(`   Scenario: ${memoryAnalysis.scenario}`);
  console.log(`   Confidence: ${(memoryAnalysis.confidence * 100).toFixed(0)}%`);
  console.log(`   Root cause: ${memoryAnalysis.rootCause || 'None'}`);
  if (memoryAnalysis.recommendations.length > 0) {
    console.log('   Recommendations:');
    memoryAnalysis.recommendations.forEach(r => console.log(`     - ${r}`));
  }
  console.log('');
  
  // Example 3: Custom scenario - Permission Escalation
  console.log('4. Custom Scenario (custom.permission-escalation):');
  const permAnalysis = await analystEngine.analyze('demo-project', 'custom.permission-escalation', {
    start: Date.now() - 3600000,
    end: Date.now()
  });
  console.log(`   Scenario: ${permAnalysis.scenario}`);
  console.log(`   Confidence: ${(permAnalysis.confidence * 100).toFixed(0)}%`);
  console.log(`   Root cause: ${permAnalysis.rootCause || 'None'}`);
  console.log(`   Evidence: ${permAnalysis.evidence.length} events`);
  console.log('');
  
  // Example 4: List available scenarios
  console.log('5. Available Scenarios:');
  const scenarios = analystEngine.getAvailableScenarios();
  scenarios.forEach(s => console.log(`   - ${s}`));
  console.log('');
  
  console.log('=== North Star Scenario Example Complete ===');
  console.log('\nKey Takeaways:');
  console.log('• North Star scenarios identify specific problem patterns');
  console.log('• Custom scenarios can be added by implementing analyze() method');
  console.log('• Scenarios return confidence, root cause, evidence, and recommendations');
  console.log('• The Analyst Engine helps achieve "5 minutes to root cause" goal');
  
  // Cleanup
  await eventLogger.clear();
}

// Run the example
main().catch(console.error);