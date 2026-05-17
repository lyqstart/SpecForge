/**
 * Query API module
 * 
 * Provides structured access to observability data:
 * - Event filtering by various criteria
 * - Efficient event retrieval with pagination
 * - Blob content access from CAS
 * - Permission decision tracing (Property 10)
 * 
 * Validates: Requirements 1.4, 4.4, Property 10
 */

import type { 
  QueryAPI as IQueryAPI, 
  Event, 
  EventFilter, 
  EventCategory,
  NorthStarScenario, 
  TimeRange, 
  AnalysisResult, 
  PermissionTrace,
  PermissionDecisionEvent
} from '@/types';
import { EventLogger } from '@/event-logger/index.js';
import { CAS, BLOB_REF_PREFIX } from '@/cas/index.js';

/**
 * Query API configuration
 */
export interface QueryAPIConfig {
  eventLogger: EventLogger;
  cas: CAS;
  /**
   * Maximum number of events to return per query (default: 1000)
   */
  maxEventsPerQuery?: number;
  /**
   * Default timestamp range in milliseconds (default: 24 hours)
   */
  defaultTimeRangeMs?: number;
}

/**
 * Project-specific mode configuration
 * Allows different observability modes per project
 */
export interface ProjectModeConfig {
  projectId: string;
  mode: 'minimal' | 'standard' | 'deep';
}

/**
 * Multi-project query result with project metadata
 */
export interface MultiProjectQueryResult extends PaginatedResult<Event> {
  projects: {
    projectId: string;
    eventCount: number;
  }[];
  totalProjects: number;
}

/**
 * Event query options for pagination
 */
export interface QueryOptions {
  /**
   * Page number (0-indexed)
   */
  page?: number;
  /**
   * Number of events per page
   */
  pageSize?: number;
  /**
   * Sort order (default: ascending by timestamp)
   */
  sortOrder?: 'asc' | 'desc';
  /**
   * Include related events in results
   */
  includeRelated?: boolean;
}

/**
 * Paginated query result
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * North Star scenario to event category/action mapping
 */
const SCENARIO_MAPPINGS: Record<NorthStarScenario, {
  categories: EventCategory[];
  actions: string[];
  relatedActions?: string[];
}> = {
  'gate-repeated-failure': {
    categories: ['gate'],
    actions: ['gate.evaluated'],
    relatedActions: ['gate.started', 'gate.completed']
  },
  'agent-deviation': {
    categories: ['session'],
    actions: ['session.started', 'session.prompt', 'session.response'],
    relatedActions: ['agent.deviation.detected']
  },
  'tool-invocation-error': {
    categories: ['tool'],
    actions: ['tool.invoke', 'tool.error'],
    relatedActions: ['tool.completed', 'tool.failed']
  },
  'permission-denial': {
    categories: ['permission'],
    actions: ['permission.evaluated'],
    relatedActions: ['permission.denied', 'permission.allowed']
  },
  'upgrade-installation-failure': {
    categories: ['system', 'migration'],
    actions: ['system.upgrade', 'migration.start', 'migration.failed'],
    relatedActions: ['migration.completed']
  },
  'state-machine-stuck': {
    categories: ['workflow'],
    actions: ['workflow.started', 'workflow.transition', 'workflow.stuck'],
    relatedActions: ['workflow.completed', 'workflow.failed']
  },
  'concurrency-deadlock': {
    categories: ['workflow', 'system'],
    actions: ['workflow.transition', 'system.deadlock'],
    relatedActions: ['workflow.completed']
  },
  'skill-invocation-check': {
    categories: ['session'],
    actions: ['skill.invoked', 'skill.started'],
    relatedActions: ['skill.completed', 'skill.failed']
  },
  'workflow-execution-check': {
    categories: ['workflow'],
    actions: ['workflow.started', 'workflow.executing'],
    relatedActions: ['workflow.completed', 'workflow.failed']
  },
  'workflow-result-deviation': {
    categories: ['workflow'],
    actions: ['workflow.completed', 'workflow.result'],
    relatedActions: ['workflow.started', 'workflow.expected']
  }
};

/**
 * QueryAPI Implementation
 * 
 * Provides efficient querying and analysis of observability data
 * with support for multi-project observability
 */
export class QueryAPI implements IQueryAPI {
  private eventLogger: EventLogger;
  private cas: CAS;
  private maxEventsPerQuery: number;
  /** Project-specific mode configuration */
  private projectModes: Map<string, 'minimal' | 'standard' | 'deep'> = new Map();
  /** Default mode for projects without specific configuration */
  private defaultMode: 'minimal' | 'standard' | 'deep' = 'standard';

  /**
   * Create a new QueryAPI instance
   * @param config QueryAPI configuration
   */
  constructor(config: QueryAPIConfig) {
    this.eventLogger = config.eventLogger;
    this.cas = config.cas;
    this.maxEventsPerQuery = config.maxEventsPerQuery ?? 1000;
  }

  // ========== Project-specific mode configuration ==========

  /**
   * Set the observability mode for a specific project
   * This enables project-specific observability granularity
   * 
   * @param projectId The project ID
   * @param mode The observability mode for this project
   */
  setProjectMode(projectId: string, mode: 'minimal' | 'standard' | 'deep'): void {
    this.projectModes.set(projectId, mode);
    console.log(`QueryAPI: Set project ${projectId} mode to ${mode}`);
  }

  /**
   * Get the observability mode for a specific project
   * Returns the project-specific mode if set, otherwise returns the default mode
   * 
   * @param projectId The project ID
   * @returns The observability mode for this project
   */
  getProjectMode(projectId: string): 'minimal' | 'standard' | 'deep' {
    return this.projectModes.get(projectId) ?? this.defaultMode;
  }

  /**
   * Set the default mode for projects without specific configuration
   * 
   * @param mode The default observability mode
   */
  setDefaultMode(mode: 'minimal' | 'standard' | 'deep'): void {
    this.defaultMode = mode;
    console.log(`QueryAPI: Set default mode to ${mode}`);
  }

  /**
   * Get the default mode for projects without specific configuration
   * 
   * @returns The default observability mode
   */
  getDefaultMode(): 'minimal' | 'standard' | 'deep' {
    return this.defaultMode;
  }

  /**
   * Remove project-specific mode configuration
   * The project will fall back to the default mode
   * 
   * @param projectId The project ID
   */
  removeProjectMode(projectId: string): void {
    this.projectModes.delete(projectId);
    console.log(`QueryAPI: Removed project-specific mode for ${projectId}`);
  }

  /**
   * Get all project-specific mode configurations
   * 
   * @returns Array of project mode configurations
   */
  getAllProjectModes(): ProjectModeConfig[] {
    const configs: ProjectModeConfig[] = [];
    for (const [projectId, mode] of this.projectModes) {
      configs.push({ projectId, mode });
    }
    return configs;
  }

  // ========== Cross-project query support ==========

  /**
   * Query events across all projects (cross-project query)
   * When projectId is not specified in filter, queries all projects
   * 
   * @param filter Event filter criteria (omit projectId for cross-project)
   * @param options Query options for pagination
   * @returns Paginated list of events from all projects
   */
  async queryEventsCrossProject(filter: EventFilter, options?: QueryOptions): Promise<MultiProjectQueryResult> {
    // Remove projectId filter to query across all projects
    const crossProjectFilter = { ...filter };
    delete crossProjectFilter.projectId;
    
    // Get events across all projects
    const allEvents = await this.eventLogger.getEventsAcrossAllProjects(crossProjectFilter);
    
    // Get project statistics
    const knownProjects = await this.eventLogger.getKnownProjects();
    const projectStats: { projectId: string; eventCount: number }[] = [];
    for (const projectId of knownProjects) {
      const stats = await this.eventLogger.getProjectStats(projectId);
      if (stats) {
        projectStats.push({ projectId, eventCount: stats.eventCount });
      }
    }

    // Apply sorting and pagination
    const page = options?.page ?? 0;
    const pageSize = options?.pageSize ?? this.maxEventsPerQuery;
    const sortOrder = options?.sortOrder ?? 'asc';
    
    const sortedEvents = sortOrder === 'asc'
      ? allEvents.sort((a, b) => a.ts - b.ts)
      : allEvents.sort((a, b) => b.ts - a.ts);

    const total = sortedEvents.length;
    const startIndex = page * pageSize;
    const paginatedEvents = sortedEvents.slice(startIndex, startIndex + pageSize);
    const hasMore = total > startIndex + pageSize;

    return {
      items: paginatedEvents,
      total,
      page,
      pageSize,
      hasMore,
      projects: projectStats,
      totalProjects: knownProjects.length
    };
  }

  /**
   * Get list of all known project IDs
   * 
   * @returns Array of project IDs that have events
   */
  async getKnownProjects(): Promise<string[]> {
    return this.eventLogger.getKnownProjects();
  }

  /**
   * Get project-specific statistics
   * 
   * @param projectId The project ID
   * @returns Project statistics or null if project not found
   */
  async getProjectStats(projectId: string): Promise<{ eventCount: number; firstEventTs: number; lastEventTs: number } | null> {
    return this.eventLogger.getProjectStats(projectId);
  }

  /**
   * Get statistics across all projects
   * 
   * @returns Map of project IDs to their statistics
   */
  async getAllProjectStats(): Promise<Map<string, { eventCount: number; firstEventTs: number; lastEventTs: number }>> {
    const projects = await this.eventLogger.getKnownProjects();
    const statsMap = new Map<string, { eventCount: number; firstEventTs: number; lastEventTs: number }>();
    
    for (const projectId of projects) {
      const stats = await this.eventLogger.getProjectStats(projectId);
      if (stats) {
        statsMap.set(projectId, stats);
      }
    }
    
    return statsMap;
  }

  /**
   * Query events with filtering
   * Implements efficient event retrieval with pagination
   * 
   * @param filter Event filter criteria
   * @param options Query options for pagination
   * @returns Paginated list of events
   */
  async queryEvents(filter: EventFilter, options?: QueryOptions): Promise<PaginatedResult<Event>> {
    const page = options?.page ?? 0;
    const pageSize = options?.pageSize ?? this.maxEventsPerQuery;
    const sortOrder = options?.sortOrder ?? 'asc';
    
    // Build the filter - apply limit from filter or use default + 1 for hasMore check
    const effectiveFilter: EventFilter = {
      ...filter,
      limit: filter.limit ?? (pageSize + 1),
    };

    // Collect all matching events first
    const events: Event[] = [];
    for await (const event of this.eventLogger.getEvents(effectiveFilter)) {
      events.push(event);
    }

    const total = events.length;

    // Sort events by timestamp
    const sortedEvents = sortOrder === 'asc' 
      ? events.sort((a, b) => a.ts - b.ts)
      : events.sort((a, b) => b.ts - a.ts);

    // Apply pagination
    const startIndex = page * pageSize;
    const paginatedEvents = sortedEvents.slice(startIndex, startIndex + pageSize);
    const hasMore = total > startIndex + pageSize;

    return {
      items: paginatedEvents,
      total,
      page,
      pageSize,
      hasMore
    };
  }

  /**
   * Query events synchronously (simple version)
   * 
   * @param filter Event filter criteria
   * @returns Array of events matching the filter
   */
  async queryEventsSync(filter: EventFilter): Promise<Event[]> {
    const result = await this.queryEvents(filter);
    return result.items;
  }

  /**
   * Analyze a North Star troubleshooting scenario
   * 
   * @param scenario The scenario to analyze
   * @param timeRange Time range for analysis
   * @returns Analysis result with root cause and evidence
   */
  async analyzeScenario(scenario: NorthStarScenario, timeRange: TimeRange): Promise<AnalysisResult> {
    const mapping = SCENARIO_MAPPINGS[scenario];
    if (!mapping) {
      return {
        scenario,
        rootCause: `Unknown scenario: ${scenario}`,
        confidence: 0,
        evidence: [],
        recommendations: ['Invalid scenario type'],
        timeToIdentify: 0
      };
    }

    const startTime = Date.now();
    
    // Convert TimeRange from milliseconds to nanoseconds for event filtering
    // TimeRange.start/end are in milliseconds, but Event.ts is in nanoseconds
    const startTsNs = timeRange.start * 1000000;
    const endTsNs = timeRange.end * 1000000;
    
    // Build filter for scenario-specific events
    // Query all actions for this scenario (not just the first one)
    const mainEvents: Event[] = [];
    for (const action of mapping.actions) {
      const filter: EventFilter = {
        startTs: startTsNs,
        endTs: endTsNs,
        category: mapping.categories[0],
        action: action,
        limit: this.maxEventsPerQuery
      };
      for await (const event of this.eventLogger.getEvents(filter)) {
        mainEvents.push(event);
      }
    }

    // Query related events
    const relatedEvents: Event[] = [];
    if (mapping.relatedActions) {
      for (const action of mapping.relatedActions) {
        const relatedFilter: EventFilter = {
          startTs: startTsNs,
          endTs: endTsNs,
          category: mapping.categories[0],
          action: action,
          limit: this.maxEventsPerQuery
        };
        for await (const event of this.eventLogger.getEvents(relatedFilter)) {
          relatedEvents.push(event);
        }
      }
    }

    // Analyze based on scenario type
    const analysis = this.performScenarioAnalysis(scenario, mainEvents, relatedEvents);

    return {
      ...analysis,
      scenario,
      timeToIdentify: Date.now() - startTime
    };
  }

  /**
   * Perform scenario-specific analysis
   */
  private performScenarioAnalysis(
    scenario: NorthStarScenario,
    mainEvents: Event[],
    relatedEvents: Event[]
  ): Omit<AnalysisResult, 'scenario'> {
    switch (scenario) {
      case 'gate-repeated-failure':
        return this.analyzeGateFailures(mainEvents, relatedEvents);
      case 'permission-denial':
        return this.analyzePermissionDenials(mainEvents, relatedEvents);
      case 'state-machine-stuck':
        return this.analyzeStateMachineStuck(mainEvents, relatedEvents);
      case 'workflow-result-deviation':
        return this.analyzeWorkflowResultDeviation(mainEvents, relatedEvents);
      default:
        return this.genericAnalysis(mainEvents, relatedEvents);
    }
  }

  /**
   * Analyze gate repeated failures
   */
  private analyzeGateFailures(events: Event[], _relatedEvents: Event[]): Omit<AnalysisResult, 'scenario'> {
    const gateFailures = events.filter(e => e.action === 'gate.evaluated' && e.payload && typeof e.payload === 'object' && 'effect' in e.payload && e.payload.effect === 'deny');
    
    if (gateFailures.length === 0) {
      return {
        rootCause: null,
        confidence: 1,
        evidence: events,
        recommendations: ['No gate failures found in the time range'],
        timeToIdentify: 0
      };
    }

    // Group by gate type and find repeated failures
    const gateTypes = new Map<string, number>();
    for (const event of gateFailures) {
      const gateType = (event.payload as any)?.gateType ?? 'unknown';
      gateTypes.set(gateType, (gateTypes.get(gateType) ?? 0) + 1);
    }

    const mostFrequentGate = [...gateTypes.entries()].sort((a, b) => b[1] - a[1])[0];
    
    return {
      rootCause: `Gate "${mostFrequentGate[0]}" failed ${mostFrequentGate[1]} times`,
      confidence: Math.min(1, mostFrequentGate[1] / 3),
      evidence: gateFailures,
      recommendations: [
        `Review gate "${mostFrequentGate[0]}" configuration`,
        'Check input parameters to the gate',
        'Verify prerequisite conditions are met'
      ],
      timeToIdentify: 0
    };
  }

  /**
   * Analyze permission denials (Property 10)
   */
  private analyzePermissionDenials(events: Event[], _relatedEvents: Event[]): Omit<AnalysisResult, 'scenario'> {
    const denials = events.filter(e => 
      e.action === 'permission.evaluated' && 
      e.payload && 
      typeof e.payload === 'object' && 
      'effect' in e.payload && 
      e.payload.effect === 'deny'
    );

    if (denials.length === 0) {
      return {
        rootCause: null,
        confidence: 1,
        evidence: events,
        recommendations: ['No permission denials found in the time range'],
        timeToIdentify: 0
      };
    }

    // Group by matched rule
    const ruleCounts = new Map<string, number>();
    for (const event of denials) {
      const rule = (event.payload as any)?.matched_rule ?? 'unknown';
      ruleCounts.set(rule, (ruleCounts.get(rule) ?? 0) + 1);
    }

    const mostCommonRule = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      rootCause: `Permission denied by rule "${mostCommonRule[0]}" (${mostCommonRule[1]} times)`,
      confidence: Math.min(1, mostCommonRule[1] / 3),
      evidence: denials,
      recommendations: [
        `Review permission rule "${mostCommonRule[0]}"`,
        'Consider adding exception for the denied action',
        'Check if the actor has required permissions'
      ],
      timeToIdentify: 0
    };
  }

  /**
   * Analyze state machine stuck
   */
  private analyzeStateMachineStuck(events: Event[], _relatedEvents: Event[]): Omit<AnalysisResult, 'scenario'> {
    const stuckEvents = events.filter(e => e.action === 'workflow.stuck');

    if (stuckEvents.length > 0) {
      return {
        rootCause: `Workflow stuck at: ${stuckEvents.map(e => (e.payload as any)?.state ?? 'unknown').join(', ')}`,
        confidence: 0.8,
        evidence: stuckEvents,
        recommendations: [
          'Review workflow state transitions',
          'Check for missing state handlers',
          'Verify workflow definition'
        ],
        timeToIdentify: 0
      };
    }

    // Check for workflows that started but didn't complete
    const startedWorkflows = new Set<string>();
    const completedWorkflows = new Set<string>();
    
    for (const event of events) {
      if (event.action === 'workflow.started') {
        startedWorkflows.add(event.workItemId ?? event.eventId);
      } else if (event.action === 'workflow.completed') {
        completedWorkflows.add(event.workItemId ?? event.eventId);
      }
    }

    const incomplete = [...startedWorkflows].filter(id => !completedWorkflows.has(id));

    if (incomplete.length > 0) {
      return {
        rootCause: `${incomplete.length} workflows started but not completed`,
        confidence: 0.6,
        evidence: events,
        recommendations: [
          'Check workflow completion status',
          'Review pending workflows',
          'Investigate workflow execution logs'
        ],
        timeToIdentify: 0
      };
    }

    return {
      rootCause: null,
      confidence: 1,
      evidence: events,
      recommendations: ['No stuck workflows found'],
      timeToIdentify: 0
    };
  }

  /**
   * Analyze workflow result deviation
   */
  private analyzeWorkflowResultDeviation(events: Event[], _relatedEvents: Event[]): Omit<AnalysisResult, 'scenario'> {
    const completedEvents = events.filter(e => e.action === 'workflow.completed');
    const resultEvents = events.filter(e => e.action === 'workflow.result');

    if (resultEvents.length === 0 && completedEvents.length === 0) {
      return {
        rootCause: null,
        confidence: 1,
        evidence: events,
        recommendations: ['No workflow results found in the time range'],
        timeToIdentify: 0
      };
    }

    // Compare expected vs actual results
    const deviations: Event[] = [];
    for (const event of resultEvents) {
      const expected = (event.payload as any)?.expected;
      const actual = (event.payload as any)?.actual;
      if (expected && actual && JSON.stringify(expected) !== JSON.stringify(actual)) {
        deviations.push(event);
      }
    }

    if (deviations.length > 0) {
      return {
        rootCause: `${deviations.length} workflow results deviated from expected`,
        confidence: 0.9,
        evidence: deviations,
        recommendations: [
          'Compare expected vs actual results',
          'Review input parameters',
          'Check workflow logic for discrepancies'
        ],
        timeToIdentify: 0
      };
    }

    return {
      rootCause: null,
      confidence: 1,
      evidence: events,
      recommendations: ['All workflow results match expected values'],
      timeToIdentify: 0
    };
  }

  /**
   * Generic analysis for unhandled scenarios
   */
  private genericAnalysis(events: Event[], _relatedEvents: Event[]): Omit<AnalysisResult, 'scenario'> {
    if (events.length === 0) {
      return {
        rootCause: null,
        confidence: 1,
        evidence: [],
        recommendations: ['No events found for analysis'],
        timeToIdentify: 0
      };
    }

    // Simple analysis: count events by action
    const actionCounts = new Map<string, number>();
    for (const event of events) {
      actionCounts.set(event.action, (actionCounts.get(event.action) ?? 0) + 1);
    }

    const topAction = [...actionCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      rootCause: `Most frequent action: ${topAction[0]} (${topAction[1]} occurrences)`,
      confidence: 0.5,
      evidence: events,
      recommendations: ['Perform deeper analysis with specific scenario'],
      timeToIdentify: 0
    };
  }

  /**
   * Get permission decision trace (Property 10)
   * 
   * Provides complete traceability for permission decisions:
   * - All six required fields: actor, action, resource, matched_rule, rule_layer, reason
   * - Can trace back to matched_rule and rule_layer for deny results
   * 
   * @param decisionId Event ID of the permission decision
   * @returns Permission trace with decision details and related events
   */
  async getPermissionTrace(decisionId: string): Promise<PermissionTrace> {
    // Find the permission decision event by ID
    const filter: EventFilter = {
      action: 'permission.evaluated',
      limit: this.maxEventsPerQuery
    };

    let decisionEvent: PermissionDecisionEvent | null = null;
    
    for await (const event of this.eventLogger.getEvents(filter)) {
      if (event.eventId === decisionId) {
        decisionEvent = event as PermissionDecisionEvent;
        break;
      }
    }

    if (!decisionEvent) {
      throw new Error(`Permission decision not found: ${decisionId}`);
    }

    // Validate required fields (Property 10)
    if (!decisionEvent.payload) {
      throw new Error(`Permission decision missing payload: ${decisionId}`);
    }

    const payload = decisionEvent.payload as any;
    const requiredFields = ['actor', 'action', 'resource', 'matched_rule', 'rule_layer', 'reason'];
    const missingFields = requiredFields.filter(field => !(field in payload));
    
    if (missingFields.length > 0) {
      throw new Error(`Permission decision missing required fields: ${missingFields.join(', ')}`);
    }

    // Find related events leading to this decision
    const relatedEvents = await this.findRelatedPermissionEvents(decisionEvent, payload);

    return {
      decision: decisionEvent,
      rule: null, // Would be resolved from Permission Engine
      context: {
        timestamp: decisionEvent.ts,
        projectId: decisionEvent.projectId,
        workItemId: decisionEvent.workItemId
      },
      relatedEvents
    };
  }

  /**
   * Find events related to a permission decision
   */
  private async findRelatedPermissionEvents(
    decision: PermissionDecisionEvent,
    payload: any
  ): Promise<Event[]> {
    const relatedEvents: Event[] = [];
    
    // Find events from the same actor around the same time
    const actorId = payload.actor?.id;
    if (actorId) {
      const timeWindow = 60000; // 1 minute window
      const filter: EventFilter = {
        startTs: decision.ts - timeWindow,
        endTs: decision.ts + timeWindow,
        actor: { id: actorId },
        limit: 100
      };

      for await (const event of this.eventLogger.getEvents(filter)) {
        if (event.eventId !== decision.eventId) {
          relatedEvents.push(event);
        }
      }
    }

    return relatedEvents;
  }

  /**
   * Query permission decisions with filtering
   * 
   * @param filter Filter for permission decisions
   * @returns Array of permission decision events
   */
  async queryPermissionDecisions(filter?: Partial<EventFilter>): Promise<PermissionDecisionEvent[]> {
    const effectiveFilter: EventFilter = {
      ...filter,
      category: 'permission',
      action: 'permission.evaluated',
      limit: filter?.limit ?? this.maxEventsPerQuery
    };

    const decisions: PermissionDecisionEvent[] = [];
    
    for await (const event of this.eventLogger.getEvents(effectiveFilter)) {
      decisions.push(event as PermissionDecisionEvent);
    }

    return decisions;
  }

  /**
   * Get blob content from CAS
   * 
   * Retrieves content stored in Content-Addressable Storage
   * 
   * @param ref Blob reference in format "blob://<sha256>"
   * @returns Content as Uint8Array or string, or null if not found
   */
  async getBlobContent(ref: string): Promise<Uint8Array | string | null> {
    // Validate blob reference format
    if (!ref.startsWith(BLOB_REF_PREFIX)) {
      console.warn(`Invalid blob reference format: ${ref}. Expected format: "blob://<sha256>"`);
      return null;
    }

    return this.cas.retrieve(ref);
  }

  /**
   * Check if blob content exists
   * 
   * @param ref Blob reference
   * @returns True if blob exists
   */
  async blobExists(ref: string): Promise<boolean> {
    return this.cas.exists(ref);
  }

  /**
   * Get event statistics
   * 
   * @returns Statistics about stored events
   */
  async getStats(): Promise<{
    eventCount: number;
    lastEventId: string | null;
    categories: Record<string, number>;
  }> {
    const categories: Record<string, number> = {};
    
    // Count events by category
    for await (const event of this.eventLogger.getEvents({ limit: this.maxEventsPerQuery })) {
      categories[event.category] = (categories[event.category] ?? 0) + 1;
    }

    return {
      eventCount: this.eventLogger.getEventCount(),
      lastEventId: this.eventLogger.getLastEventId(),
      categories
    };
  }
}

/**
 * Create a QueryAPI instance
 * 
 * @param config QueryAPI configuration
 * @returns Configured QueryAPI instance
 */
export function createQueryAPI(config: QueryAPIConfig): QueryAPI {
  return new QueryAPI(config);
}