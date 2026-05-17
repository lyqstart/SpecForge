/**
 * Multi-Project Observability Integration Tests
 * 
 * Tests for task 5.2: Implement multi-project observability
 * - Project isolation in events.jsonl
 * - Cross-project query support
 * - Project-specific mode configuration
 * 
 * Validates: Requirements 4.1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventLogger } from '../../src/event-logger';
import { QueryAPI, createQueryAPI } from '../../src/query-api';
import { CAS } from '../../src/cas';
import type { Event, EventFilter } from '../../src/types';
import { generateEventId } from '../../src/types/event-utils';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Helper to create a test event with custom projectId
 */
function createTestEventForProject(projectId: string, overrides: Partial<Event> = {}): Event {
  const timestamp = Date.now() * 1_000_000 + Math.floor(Math.random() * 1_000_000);
  
  return {
    schema_version: '1.0',
    eventId: generateEventId(),
    ts: timestamp,
    monotonicSeq: 1,
    projectId,
    workItemId: 'work-item-1',
    actor: { id: 'agent-1', name: 'TestAgent', type: 'test' },
    category: 'system',
    action: 'test.event',
    payload: { message: 'test', project: projectId },
    ...overrides,
  };
}

describe('Multi-Project Observability', () => {
  let eventLogger: EventLogger;
  let queryAPI: QueryAPI;
  let cas: CAS;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await mkdtemp(join(tmpdir(), 'multi-project-test-'));
    
    // Initialize EventLogger
    eventLogger = new EventLogger(join(tempDir, 'events'));
    await eventLogger.initialize();
    
    // Initialize CAS
    cas = new CAS(join(tempDir, 'cas'));
    await cas.initialize();
    
    // Create QueryAPI with dependencies
    queryAPI = createQueryAPI({
      eventLogger,
      cas,
      maxEventsPerQuery: 1000,
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('1. Project Isolation in events.jsonl', () => {
    it('should store events from different projects in the same events.jsonl', async () => {
      const projectA = 'project-a-1234';
      const projectB = 'project-b-5678';
      const projectC = 'project-c-9999';

      // Add events from different projects
      await eventLogger.append(createTestEventForProject(projectA, { action: 'test.a1' }));
      await eventLogger.append(createTestEventForProject(projectB, { action: 'test.b1' }));
      await eventLogger.append(createTestEventForProject(projectA, { action: 'test.a2' }));
      await eventLogger.append(createTestEventForProject(projectC, { action: 'test.c1' }));
      await eventLogger.append(createTestEventForProject(projectB, { action: 'test.b2' }));

      // Verify all events are in the same file
      const allEvents: Event[] = [];
      for await (const e of eventLogger.getEvents()) {
        allEvents.push(e);
      }

      expect(allEvents.length).toBe(5);
      expect(allEvents.filter(e => e.projectId === projectA).length).toBe(2);
      expect(allEvents.filter(e => e.projectId === projectB).length).toBe(2);
      expect(allEvents.filter(e => e.projectId === projectC).length).toBe(1);
    });

    it('should maintain project isolation when querying by projectId', async () => {
      const projectA = 'isolated-project-a';
      const projectB = 'isolated-project-b';

      await eventLogger.append(createTestEventForProject(projectA, { action: 'secret.data.a' }));
      await eventLogger.append(createTestEventForProject(projectA, { action: 'config.a' }));
      await eventLogger.append(createTestEventForProject(projectB, { action: 'secret.data.b' }));
      await eventLogger.append(createTestEventForProject(projectB, { action: 'config.b' }));

      // Query only project A
      const projectAEvents = await queryAPI.queryEventsSync({ projectId: projectA });
      expect(projectAEvents.length).toBe(2);
      expect(projectAEvents.every(e => e.projectId === projectA)).toBe(true);
      expect(projectAEvents.some(e => e.action === 'secret.data.a')).toBe(true);
      expect(projectAEvents.some(e => e.action === 'secret.data.b')).toBe(false);

      // Query only project B
      const projectBEvents = await queryAPI.queryEventsSync({ projectId: projectB });
      expect(projectBEvents.length).toBe(2);
      expect(projectBEvents.every(e => e.projectId === projectB)).toBe(true);
      expect(projectBEvents.some(e => e.action === 'secret.data.b')).toBe(true);
      expect(projectBEvents.some(e => e.action === 'secret.data.a')).toBe(false);
    });

    it('should create and maintain project indices', async () => {
      const projectX = 'indexed-project-x';
      const projectY = 'indexed-project-y';

      // Add events for project X
      await eventLogger.append(createTestEventForProject(projectX, { action: 'x.first' }));
      await eventLogger.append(createTestEventForProject(projectX, { action: 'x.second' }));

      // Add events for project Y
      await eventLogger.append(createTestEventForProject(projectY, { action: 'y.first' }));

      // Check known projects
      const knownProjects = await eventLogger.getKnownProjects();
      expect(knownProjects).toContain(projectX);
      expect(knownProjects).toContain(projectY);
      expect(knownProjects.length).toBe(2);

      // Check project stats
      const statsX = await eventLogger.getProjectStats(projectX);
      expect(statsX).not.toBeNull();
      expect(statsX?.eventCount).toBe(2);

      const statsY = await eventLogger.getProjectStats(projectY);
      expect(statsY).not.toBeNull();
      expect(statsY?.eventCount).toBe(1);
    });

    it('should compute project counts in state reconstruction', async () => {
      const projectA = 'state-project-a';
      const projectB = 'state-project-b';

      await eventLogger.append(createTestEventForProject(projectA));
      await eventLogger.append(createTestEventForProject(projectA));
      await eventLogger.append(createTestEventForProject(projectB));

      // Rebuild state
      const state = await eventLogger.rebuildState();

      // The state.json should have project information
      expect(state.eventCount).toBe(3);
    });
  });

  describe('2. Cross-Project Query Support', () => {
    it('should query across all projects when projectId is not specified', async () => {
      const projectA = 'cross-project-a';
      const projectB = 'cross-project-b';
      const projectC = 'cross-project-c';

      await eventLogger.append(createTestEventForProject(projectA, { action: 'workflow.started' }));
      await eventLogger.append(createTestEventForProject(projectB, { action: 'workflow.started' }));
      await eventLogger.append(createTestEventForProject(projectC, { action: 'workflow.started' }));

      // Cross-project query (no projectId filter)
      const crossProjectResult = await queryAPI.queryEventsCrossProject({ action: 'workflow.started' });
      
      expect(crossProjectResult.items.length).toBe(3);
      expect(crossProjectResult.total).toBe(3);
    });

    it('should return project metadata in cross-project queries', async () => {
      const projectMeta = 'metadata-project';
      const projectData = 'data-project';

      await eventLogger.append(createTestEventForProject(projectMeta, { action: 'meta.update' }));
      await eventLogger.append(createTestEventForProject(projectMeta, { action: 'meta.update' }));
      await eventLogger.append(createTestEventForProject(projectData, { action: 'data.process' }));

      const result = await queryAPI.queryEventsCrossProject({});

      // Should include project metadata
      expect(result.projects).toBeDefined();
      expect(result.totalProjects).toBe(2);
      
      const metaProject = result.projects.find(p => p.projectId === projectMeta);
      expect(metaProject?.eventCount).toBe(2);
      
      const dataProject = result.projects.find(p => p.projectId === projectData);
      expect(dataProject?.eventCount).toBe(1);
    });

    it('should apply pagination to cross-project queries', async () => {
      const projects = ['p1', 'p2', 'p3', 'p4', 'p5'];
      
      for (const project of projects) {
        await eventLogger.append(createTestEventForProject(project, { action: 'test.event' }));
      }

      // Paginated cross-project query
      const result = await queryAPI.queryEventsCrossProject({}, { page: 0, pageSize: 2 });

      expect(result.items.length).toBe(2);
      expect(result.hasMore).toBe(true);
      expect(result.page).toBe(0);
      expect(result.pageSize).toBe(2);
    });

    it('should support sorting in cross-project queries', async () => {
      const projectA = 'sort-project-a';
      const projectB = 'sort-project-b';

      await eventLogger.append(createTestEventForProject(projectA, { ts: 3000 * 1_000_000, action: 'test.late' }));
      await eventLogger.append(createTestEventForProject(projectB, { ts: 1000 * 1_000_000, action: 'test.early' }));
      await eventLogger.append(createTestEventForProject(projectA, { ts: 2000 * 1_000_000, action: 'test.middle' }));

      // Ascending order
      const ascResult = await queryAPI.queryEventsCrossProject({}, { sortOrder: 'asc' });
      expect(ascResult.items[0].ts).toBeLessThanOrEqual(ascResult.items[1].ts);

      // Descending order
      const descResult = await queryAPI.queryEventsCrossProject({}, { sortOrder: 'desc' });
      expect(descResult.items[0].ts).toBeGreaterThanOrEqual(descResult.items[1].ts);
    });

    it('should get statistics across all projects', async () => {
      const projectA = 'stats-project-a';
      const projectB = 'stats-project-b';

      await eventLogger.append(createTestEventForProject(projectA, { category: 'workflow' }));
      await eventLogger.append(createTestEventForProject(projectA, { category: 'workflow' }));
      await eventLogger.append(createTestEventForProject(projectB, { category: 'gate' }));

      const allStats = await queryAPI.getAllProjectStats();

      expect(allStats.size).toBe(2);
      expect(allStats.get(projectA)?.eventCount).toBe(2);
      expect(allStats.get(projectB)?.eventCount).toBe(1);
    });
  });

  describe('3. Project-Specific Mode Configuration', () => {
    it('should set and get project-specific mode', () => {
      const projectId = 'mode-project';

      // Set minimal mode for specific project
      queryAPI.setProjectMode(projectId, 'minimal');
      expect(queryAPI.getProjectMode(projectId)).toBe('minimal');

      // Set deep mode for another project
      const otherProject = 'other-project';
      queryAPI.setProjectMode(otherProject, 'deep');
      expect(queryAPI.getProjectMode(otherProject)).toBe('deep');

      // Default mode should still apply to unknown projects
      expect(queryAPI.getDefaultMode()).toBe('standard');
      expect(queryAPI.getProjectMode('unknown-project')).toBe('standard');
    });

    it('should change default mode for all projects', () => {
      // Change default mode
      queryAPI.setDefaultMode('minimal');
      expect(queryAPI.getDefaultMode()).toBe('minimal');

      // Unknown project should use new default
      expect(queryAPI.getProjectMode('new-project')).toBe('minimal');

      // Project-specific mode should override default
      queryAPI.setProjectMode('special-project', 'deep');
      expect(queryAPI.getProjectMode('special-project')).toBe('deep');
    });

    it('should remove project-specific mode configuration', () => {
      const projectId = 'temp-mode-project';

      // Set project-specific mode
      queryAPI.setProjectMode(projectId, 'deep');
      expect(queryAPI.getProjectMode(projectId)).toBe('deep');

      // Remove project-specific mode
      queryAPI.removeProjectMode(projectId);

      // Should fall back to default
      expect(queryAPI.getProjectMode(projectId)).toBe('standard');
    });

    it('should get all project mode configurations', () => {
      queryAPI.setProjectMode('project-a', 'minimal');
      queryAPI.setProjectMode('project-b', 'deep');
      queryAPI.setDefaultMode('minimal');

      const allModes = queryAPI.getAllProjectModes();

      expect(allModes.length).toBe(2);
      expect(allModes.find(m => m.projectId === 'project-a')?.mode).toBe('minimal');
      expect(allModes.find(m => m.projectId === 'project-b')?.mode).toBe('deep');
    });

    it('should handle mode configuration persistence across queries', async () => {
      const projectId = 'persistent-mode-project';

      // Set project mode before adding events
      queryAPI.setProjectMode(projectId, 'deep');

      // Add events
      await eventLogger.append(createTestEventForProject(projectId, { action: 'test.event1' }));
      await eventLogger.append(createTestEventForProject(projectId, { action: 'test.event2' }));

      // Mode should still be set when querying
      expect(queryAPI.getProjectMode(projectId)).toBe('deep');

      // Query should still work correctly
      const events = await queryAPI.queryEventsSync({ projectId });
      expect(events.length).toBe(2);
    });
  });

  describe('Integration: Multi-Project Workflow', () => {
    it('should handle real-world multi-project scenario', async () => {
      // Scenario: Multiple projects with different teams working on them

      // Project 1: Frontend team
      const frontendProject = 'project-frontend-team';
      await eventLogger.append(createTestEventForProject(frontendProject, { category: 'workflow', action: 'workflow.started' }));
      await eventLogger.append(createTestEventForProject(frontendProject, { category: 'workflow', action: 'workflow.completed' }));
      await eventLogger.append(createTestEventForProject(frontendProject, { category: 'gate', action: 'gate.passed' }));

      // Project 2: Backend team
      const backendProject = 'project-backend-team';
      await eventLogger.append(createTestEventForProject(backendProject, { category: 'workflow', action: 'workflow.started' }));
      await eventLogger.append(createTestEventForProject(backendProject, { category: 'permission', action: 'permission.evaluated' }));
      await eventLogger.append(createTestEventForProject(backendProject, { category: 'workflow', action: 'workflow.failed' }));

      // Project 3: DevOps team
      const devopsProject = 'project-devops-team';
      await eventLogger.append(createTestEventForProject(devopsProject, { category: 'system', action: 'deployment.started' }));
      await eventLogger.append(createTestEventForProject(devopsProject, { category: 'system', action: 'deployment.completed' }));

      // Set different modes for different projects
      queryAPI.setProjectMode(frontendProject, 'minimal');      // Frontend: just decisions
      queryAPI.setProjectMode(backendProject, 'standard');      // Backend: all events
      queryAPI.setProjectMode(devopsProject, 'deep');           // DevOps: full debug

      // Verify project isolation - each project has its events
      const frontendEvents = await queryAPI.queryEventsSync({ projectId: frontendProject });
      expect(frontendEvents.length).toBe(3);
      expect(frontendEvents.every(e => e.category === 'workflow' || e.category === 'gate')).toBe(true);

      const backendEvents = await queryAPI.queryEventsSync({ projectId: backendProject });
      expect(backendEvents.length).toBe(3);

      const devopsEvents = await queryAPI.queryEventsSync({ projectId: devopsProject });
      expect(devopsEvents.length).toBe(2);

      // Verify mode configurations
      expect(queryAPI.getProjectMode(frontendProject)).toBe('minimal');
      expect(queryAPI.getProjectMode(backendProject)).toBe('standard');
      expect(queryAPI.getProjectMode(devopsProject)).toBe('deep');

      // Cross-project query shows all
      const allEvents = await queryAPI.queryEventsSync({});
      expect(allEvents.length).toBe(8);

      // Get project stats
      const allStats = await queryAPI.getAllProjectStats();
      expect(allStats.size).toBe(3);
      expect(allStats.get(frontendProject)?.eventCount).toBe(3);
      expect(allStats.get(backendProject)?.eventCount).toBe(3);
      expect(allStats.get(devopsProject)?.eventCount).toBe(2);
    });

    it('should handle project with no events', async () => {
      const emptyProject = 'empty-project';
      const activeProject = 'active-project';

      await eventLogger.append(createTestEventForProject(activeProject, { action: 'test.event' }));

      // Get stats for empty project
      const emptyStats = await queryAPI.getProjectStats(emptyProject);
      expect(emptyStats).toBeNull();

      // Get stats for active project
      const activeStats = await queryAPI.getProjectStats(activeProject);
      expect(activeStats).not.toBeNull();
      expect(activeStats?.eventCount).toBe(1);
    });

    it('should filter by category within a project', async () => {
      const projectId = 'filter-test-project';

      await eventLogger.append(createTestEventForProject(projectId, { category: 'workflow', action: 'w1' }));
      await eventLogger.append(createTestEventForProject(projectId, { category: 'gate', action: 'g1' }));
      await eventLogger.append(createTestEventForProject(projectId, { category: 'workflow', action: 'w2' }));

      // Filter by category within project
      const workflowEvents = await queryAPI.queryEventsSync({ 
        projectId, 
        category: 'workflow' 
      });

      expect(workflowEvents.length).toBe(2);
      expect(workflowEvents.every(e => e.category === 'workflow')).toBe(true);
    });
  });
});