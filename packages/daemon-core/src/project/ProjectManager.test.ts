import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import { ProjectManager, type ProjectSchemaPrecheck } from './ProjectManager';
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
const mockReadFile = fs.readFile as unknown as ReturnType<typeof vi.fn>;

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
 * Set of project paths whose authoritative Project Spec manifest exists.
 */
function mockCurrentManifestExistsForPaths(projectPaths: string[]) {
  const normalizedAllowed = projectPaths.map(normalizePath);

  mockAccess.mockImplementation((p: string) => {
    const np = normalizePath(p);
    if (np.endsWith('.specforge/project/spec_manifest.json')) {
      for (const ap of normalizedAllowed) {
        if (np.startsWith(ap)) return Promise.resolve();
      }
    }
    return Promise.reject(new Error('ENOENT'));
  });
  mockReadFile.mockImplementation((p: string) => {
    const np = normalizePath(p);
    if (np.endsWith('.specforge/project/spec_manifest.json')) {
      return Promise.resolve(JSON.stringify({
        schema_version: '1.0',
        project_spec_version: 'PSV-0001',
        project_name: 'Test project',
        default_module: 'main',
        modules: [],
        project: {},
      }));
    }
    return Promise.reject(new Error('ENOENT'));
  });
}

/**
 * Helper: configure fs.access to simulate no supported current manifest.
 */
function mockNoCurrentManifest() {
  mockAccess.mockRejectedValue(new Error('ENOENT'));
}

/**
 * Helper: configure fs.access to simulate the retired root manifest only.
 */
function mockRetiredRootManifestExists() {
  mockAccess.mockImplementation((p: string) => {
    const np = normalizePath(p);
    if (np.endsWith('.specforge/manifest.json')) {
      return Promise.resolve();
    }
    return Promise.reject(new Error('ENOENT'));
  });
}

describe('ProjectManager', () => {
  let manager: ProjectManager;
  let projectSchemaPrecheck: ReturnType<typeof vi.fn<ProjectSchemaPrecheck>>;

  beforeEach(() => {
    vi.clearAllMocks();
    projectSchemaPrecheck = vi.fn<ProjectSchemaPrecheck>().mockResolvedValue({
      ok: true,
      needsMigration: false,
      checks: [],
    });
    manager = new ProjectManager(
      new EventBus(),
      createMockPathResolver(),
      createMockStateManager(),
      projectSchemaPrecheck,
    );
  });

  // -----------------------------------------------------------------------
  // Existing behavior under the current Project Spec layout.
  // -----------------------------------------------------------------------
  describe('existing functionality', () => {
    beforeEach(() => {
      mockCurrentManifestExistsForPaths(['/path/to/project', '/project/a', '/project/b']);
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
  // Current initialization boundary.
  // -----------------------------------------------------------------------
  describe('manifest initialization checks', () => {
    it('should throw PROJECT_NOT_INITIALIZED when the current manifest is absent', async () => {
      mockNoCurrentManifest();

      await expect(manager.registerProject('/uninitialized/project')).rejects.toThrow(
        'PROJECT_NOT_INITIALIZED',
      );
    });

    it('should reject the retired root manifest without auto-creating current state', async () => {
      mockRetiredRootManifestExists();

      const projectPath = '/old/project';
      await expect(manager.registerProject(projectPath)).rejects.toThrow(
        'UNSUPPORTED_PROJECT_LAYOUT',
      );
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should register normally when project/spec_manifest.json exists', async () => {
      mockCurrentManifestExistsForPaths(['/initialized/project']);

      const projectPath = '/initialized/project';
      const context = await manager.registerProject(projectPath);

      expect(context.projectPath).toBe(projectPath);
      expect(context.projectId).toBeDefined();
      expect(context.isFullyRegistered).toBe(true);
    });

    it('should fail before runtime directory creation when the manifest schema is unregistered', async () => {
      mockCurrentManifestExistsForPaths(['/future/project']);
      mockReadFile.mockResolvedValue(JSON.stringify({
        schema_version: '2.0',
        project_spec_version: 'PSV-0001',
      }));
      projectSchemaPrecheck.mockResolvedValue({
        ok: false,
        needsMigration: false,
        checks: [{
          descriptorId: 'project-spec-manifest',
          owner: '@specforge/daemon-core/project-spec',
          relativePath: '.specforge/project/spec_manifest.json',
          status: 'blocked',
          observedSchemaId: '2.0',
          currentSchemaId: '1.0',
          transitionAssetIds: [],
          errorCode: 'CHAIN_GAP',
          error: 'no complete explicit transition chain',
        }],
      });

      await expect(manager.registerProject('/future/project')).rejects.toThrow(
        'PROJECT_SCHEMA_PRECHECK_BLOCKED',
      );
      expect(mockMkdir).not.toHaveBeenCalled();
      expect(projectSchemaPrecheck).toHaveBeenCalledWith('/future/project');
    });
  });
});
