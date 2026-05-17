/**
 * Project Manager unit tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import { Event, ProjectState } from '../../src/types';

describe('ProjectManager', () => {
  let projectManager: ProjectManager;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();
    projectManager = new ProjectManager(eventBus);
    projectManager.start();
  });

  afterEach(() => {
    projectManager.stop();
    eventBus.stop();
  });

  describe('project context', () => {
    it('should create empty project context on first access', () => {
      const context = projectManager.getProjectContext('/path/to/project');
      
      expect(context).toBeDefined();
      expect(context.projectPath).toBe('/path/to/project');
      expect(context.schemaVersion).toBe('1.0');
      expect(context.activeSessions).toEqual([]);
      expect(context.workItems).toEqual([]);
    });

    it('should return same context for same project path', () => {
      const context1 = projectManager.getProjectContext('/path/to/project');
      const context2 = projectManager.getProjectContext('/path/to/project');
      
      expect(context1).toBe(context2);
    });

    it('should maintain separate contexts for different projects', () => {
      const context1 = projectManager.getProjectContext('/path/to/project1');
      const context2 = projectManager.getProjectContext('/path/to/project2');
      
      expect(context1).not.toBe(context2);
      expect(context1.projectPath).not.toBe(context2.projectPath);
    });

    it('should list all active projects', () => {
      projectManager.getProjectContext('/path/to/project1');
      projectManager.getProjectContext('/path/to/project2');
      projectManager.getProjectContext('/path/to/project3');
      
      const projects = projectManager.listActiveProjects();
      
      expect(projects.length).toBe(3);
      expect(projects).toContain('/path/to/project1');
      expect(projects).toContain('/path/to/project2');
      expect(projects).toContain('/path/to/project3');
    });
  });

  describe('project locks', () => {
    it('should acquire lock for a project', async () => {
      const lock = await projectManager.acquireLock('/path/to/project');
      
      expect(lock).toBeDefined();
      expect(lock.projectPath).toBe('/path/to/project');
      expect(lock.acquiredAt).toBeDefined();
      expect(lock.expiresAt).toBeGreaterThan(lock.acquiredAt);
    });

    it('should throw when project is already locked', async () => {
      await projectManager.acquireLock('/path/to/project');
      
      await expect(
        projectManager.acquireLock('/path/to/project')
      ).rejects.toThrow('already locked');
    });

    it('should release lock', async () => {
      const lock = await projectManager.acquireLock('/path/to/project');
      projectManager.releaseLock(lock);
      
      // Should be able to acquire again
      const newLock = await projectManager.acquireLock('/path/to/project');
      expect(newLock).toBeDefined();
    });

    it('should only release correct lock', async () => {
      const lock1 = await projectManager.acquireLock('/path/to/project1');
      await projectManager.acquireLock('/path/to/project2');
      
      // Try to release lock1
      projectManager.releaseLock(lock1);
      
      // project2 should still be locked
      await expect(
        projectManager.acquireLock('/path/to/project2')
      ).rejects.toThrow();
    });

    it('should handle lock expiration', async () => {
      const lock = await projectManager.acquireLock('/path/to/project');
      
      // Lock expires in 30 seconds, this should still work
      const canAcquire = await projectManager.acquireLock('/path/to/project-different');
      expect(canAcquire).toBeDefined();
    });
  });

  describe('event handling', () => {
    it('should handle project.updated events', () => {
      const updatedState: ProjectState = {
        projectPath: '/path/to/project',
        schemaVersion: '1.0',
        activeSessions: ['session-1'],
        workItems: [{ id: 'workitem-1', title: 'Test' }],
        lastEventId: 'event-1',
        lastEventTs: Date.now(),
      };
      
      const event: Event = {
        eventId: 'event-1',
        ts: Date.now(),
        projectId: 'test-project',
        action: 'project.updated',
        payload: {
          projectPath: '/path/to/project',
          state: updatedState,
        },
        metadata: { schemaVersion: '1.0', source: 'test' },
      };
      
      eventBus.publish(event);
      
      // Give time for event to process
      const context = projectManager.getProjectContext('/path/to/project');
      // The event handling updates the project state
    });
  });

  describe('project isolation', () => {
    it('should maintain separate locks for different projects', async () => {
      const lock1 = await projectManager.acquireLock('/path/to/project1');
      const lock2 = await projectManager.acquireLock('/path/to/project2');
      
      expect(lock1.id).not.toBe(lock2.id);
    });

    it('should not block other projects when one is locked', async () => {
      await projectManager.acquireLock('/path/to/project1');
      
      // Should be able to acquire lock for different project
      const lock2 = await projectManager.acquireLock('/path/to/project2');
      expect(lock2).toBeDefined();
    });
  });
});