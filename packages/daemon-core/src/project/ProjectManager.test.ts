import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectManager } from './ProjectManager';
import { EventBus } from '../event-bus/EventBus';

describe('ProjectManager', () => {
  let manager: ProjectManager;

  beforeEach(() => {
    manager = new ProjectManager(new EventBus());
  });

  it('should register and get project context', async () => {
    const projectPath = '/path/to/project';
    const context = await manager.getProject(projectPath);

    expect(context.projectPath).toBe(projectPath);
    expect(context.projectId).toBeDefined();
    expect(context.wal).toBeDefined();
    expect(context.stateManager).toBeDefined();
    expect(context.dataDir).toContain('.specforge');
  });

  it('should return same instance for same project path', async () => {
    const projectPath = '/path/to/project';
    const ctx1 = await manager.getProject(projectPath);
    const ctx2 = await manager.getProject(projectPath);

    expect(ctx1).toBe(ctx2);
  });

  it('should isolate state between projects', async () => {
    const ctx1 = await manager.getProject('/project/a');
    const ctx2 = await manager.getProject('/project/b');

    expect(ctx1.projectId).not.toBe(ctx2.projectId);
    expect(ctx1.stateManager).not.toBe(ctx2.stateManager);
    expect(ctx1.wal).not.toBe(ctx2.wal);
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

  it('should list active projects', async () => {
    const projectPath = '/path/to/project';
    await manager.getProject(projectPath);

    const projects = manager.listActiveProjects();
    expect(projects).toContain(projectPath);
  });

  it('should unregister project', async () => {
    const projectPath = '/path/to/project';
    await manager.getProject(projectPath);
    expect(manager.listActiveProjects()).toContain(projectPath);

    await manager.unregisterProject(projectPath);
    expect(manager.listActiveProjects()).not.toContain(projectPath);
  });

  it('should refuse to unregister locked project', async () => {
    const projectPath = '/path/to/project';
    await manager.getProject(projectPath);
    await manager.acquireLock(projectPath);

    await expect(manager.unregisterProject(projectPath)).rejects.toThrow();
  });
});
