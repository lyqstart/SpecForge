/**
 * Project Manager unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectManager } from './ProjectManager';
import { EventBus } from '../event-bus/EventBus';

describe('ProjectManager', () => {
  let manager: ProjectManager;

  beforeEach(() => {
    manager = new ProjectManager(new EventBus());
  });

  it('should get project context', () => {
    const projectPath = '/path/to/project';
    const context = manager.getProjectContext(projectPath);
    
    expect(context.projectPath).toBe(projectPath);
    expect(context.schemaVersion).toBe('1.0');
  });

  it('should acquire and release locks', async () => {
    const projectPath = '/path/to/project';
    const lock = await manager.acquireLock(projectPath);
    
    expect(lock.id).toBeDefined();
    expect(lock.projectPath).toBe(projectPath);
    expect(lock.acquiredAt).toBeDefined();
    expect(lock.expiresAt).toBeDefined();
  });

  it('should throw error for duplicate lock', async () => {
    const projectPath = '/path/to/project';
    await manager.acquireLock(projectPath);
    
    await expect(manager.acquireLock(projectPath)).rejects.toThrow();
  });

  it('should list active projects', () => {
    const projectPath = '/path/to/project';
    manager.getProjectContext(projectPath);
    
    const projects = manager.listActiveProjects();
    expect(projects).toContain(projectPath);
  });
});
