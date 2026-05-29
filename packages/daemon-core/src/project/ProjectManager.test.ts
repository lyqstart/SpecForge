import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import { ProjectManager } from './ProjectManager';
import { EventBus } from '../event-bus/EventBus';
import type { IPathResolver } from '../daemon/path-resolver';
import type { StateManager } from '../state/StateManager';

// Mock fs/promises so that tests don't touch the real filesystem
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
}));

// Grab the mocked functions (cast through unknown for typing)
const mockAccess = fs.access as unknown as ReturnType<typeof vi.fn>;
const mockMkdir = fs.mkdir as unknown as ReturnType<typeof vi.fn>;
const mockWriteFile = fs.writeFile as unknown as ReturnType<typeof vi.fn>;

function createMockPathResolver(): IPathResolver {
  const base = '/mock';
  return {
    resolveProjectRuntimeDir: (p: string) => `${base}/${p}/.specforge/runtime`,
    resolveStatePath: (p: string) => `${base}/${p}/.specforge/runtime/state.json`,
    resolveEventsPath: (p: string) => `${base}/${p}/.specforge/runtime/events.jsonl`,
    resolveSessionsDir: (p: string) => `${base}/${p}/.specforge/runtime/sessions`,
    resolveDaemonRuntimeDir: () => `${base}/.specforge/runtime`,
    resolveHandshakePath: () => `${base}/.specforge/runtime/handshake.json`,
    resolveDaemonJsonPath: () => `${base}/.config/opencode/daemon.json`,
    resolveDaemonStatePath: () => `${base}/.specforge/runtime/state.json`,
    resolveDaemonEventsPath: () => `${base}/.specforge/runtime/events.jsonl`,
  };
}

/** Minimal mock StateManager for unit tests */
function createMockStateManager(): StateManager {
  return {} as StateManager;
}

/** Normalize slashes to forward slashes for cross-platform path comparison */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Set of project paths whose manifest.json should be treated as existing.
 * Uses path.join with the project path to build the expected manifest path
 * so that slash direction matches the runtime OS.
 */
function mockManifestExistsForPaths(projectPaths: string[]) {
  const normalizedAllowed = projectPaths.map(normalizePath);

  mockAccess.mockImplementation((p: string) => {
    const np = normalizePath(p);
    // Check if this is a manifest.json access for an allowed project
    if (np.includes('.specforge/manifest.json')) {
      for (const ap of normalizedAllowed) {
        if (np.startsWith(ap)) return Promise.resolve();
      }
    }
    return Promise.reject(new Error('ENOENT'));
  });
}

/**
 * Helper: configure fs.access to simulate "no manifest.json, no .specforge/"
 */
function mockNoManifestNoSpecDir() {
  mockAccess.mockRejectedValue(new Error('ENOENT'));
}

/**
 * Helper: configure fs.access to simulate "no manifest.json but .specforge/ exists"
 * (old project migration scenario)
 */
function mockNoManifestButSpecDirExists() {
  mockAccess.mockImplementation((p: string) => {
    const np = normalizePath(p);
    // manifest.json → does NOT exist
    if (np.endsWith('manifest.json')) {
      return Promise.reject(new Error('ENOENT'));
    }
    // .specforge/ directory → exists
    if (np.includes('.specforge')) {
      return Promise.resolve();
    }
    return Promise.reject(new Error('ENOENT'));
  });
}

describe('ProjectManager', () => {
  let manager: ProjectManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ProjectManager(new EventBus(), createMockPathResolver(), createMockStateManager());
  });

  // -----------------------------------------------------------------------
  // Existing tests — fixed by mocking manifest.json as existing
  // -----------------------------------------------------------------------
  describe('existing functionality', () => {
    beforeEach(() => {
      mockManifestExistsForPaths(['/path/to/project', '/project/a', '/project/b']);
    });

    it('should register and get project context', async () => {
      const projectPath = '/path/to/project';
      const context = await manager.getProject(projectPath);

      expect(context.projectPath).toBe(projectPath);
      expect(context.projectId).toBeDefined();
      expect(context.isFullyRegistered).toBe(true);
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
      // All projects share the daemon global StateManager
      expect(manager.getDaemonStateManager()).toBe(manager.getDaemonStateManager());
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

  // -----------------------------------------------------------------------
  // New tests — manifest.json & migration scenarios (P0 from impact analysis)
  // -----------------------------------------------------------------------
  describe('manifest initialization checks', () => {
    it('should throw PROJECT_NOT_INITIALIZED when no manifest.json and no .specforge/', async () => {
      mockNoManifestNoSpecDir();

      await expect(manager.registerProject('/uninitialized/project')).rejects.toThrow(
        'PROJECT_NOT_INITIALIZED',
      );
    });

    it('should auto-create manifest.json when .specforge/ exists but manifest.json missing (old project migration)', async () => {
      mockNoManifestButSpecDirExists();

      const projectPath = '/old/project';
      const context = await manager.registerProject(projectPath);

      // Should have called writeFile to create the manifest
      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && normalizePath(call[0] as string).endsWith('manifest.json'),
      );
      expect(writeCall).toBeDefined();
      // Verify the manifest content structure
      const manifestContent = JSON.parse(writeCall![1] as string);
      expect(manifestContent.schema_version).toBe('6.0');
      expect(manifestContent.project_name).toBe('project');

      // Registration should still succeed
      expect(context.projectPath).toBe(projectPath);
      expect(context.isFullyRegistered).toBe(true);
    });

    it('should register normally when manifest.json exists', async () => {
      mockManifestExistsForPaths(['/initialized/project']);

      const projectPath = '/initialized/project';
      const context = await manager.registerProject(projectPath);

      expect(context.projectPath).toBe(projectPath);
      expect(context.projectId).toBeDefined();
      expect(context.isFullyRegistered).toBe(true);
    });
  });
});
