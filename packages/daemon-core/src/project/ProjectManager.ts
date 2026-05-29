import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Event, Lock, Subscription } from '../types';
import { EventBus } from '../event-bus/EventBus';
import { WAL } from '../wal/WAL';
import { StateManager } from '../state/StateManager';
import { IPathResolver } from '../daemon/path-resolver';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

export interface ProjectContext {
  projectId: string;
  projectPath: string;
  dataDir: string;
  schemaVersion: string;
  activeSessions: string[];
  workItems: { id: string; title: string }[];
  lastEventId: string;
  lastEventTs: number;
  /** @deprecated No longer populated — use ProjectManager.getDaemonStateManager() */
  wal?: WAL;
  /** @deprecated No longer populated — use ProjectManager.getDaemonStateManager() */
  stateManager?: StateManager;
  /** Replaces wal as the idempotency flag for fully registered projects */
  isFullyRegistered?: boolean;
}

interface DaemonManifest {
  version: string;
  projects: Record<string, { projectId: string; registeredAt: number }>;
}

export class ProjectManager {
  private eventBus: EventBus;
  private pathResolver: IPathResolver;
  private daemonStateManager: StateManager;
  private projects: Map<string, ProjectContext> = new Map();
  private projectLocks: Map<string, Lock> = new Map();
  private subscription: Subscription | null = null;

  constructor(eventBus: EventBus, pathResolver: IPathResolver, daemonStateManager: StateManager) {
    this.eventBus = eventBus;
    this.pathResolver = pathResolver;
    this.daemonStateManager = daemonStateManager;
  }

  getDaemonStateManager(): StateManager {
    return this.daemonStateManager;
  }

  async getProject(projectPath: string): Promise<ProjectContext> {
    const existing = this.projects.get(projectPath);
    if (existing?.isFullyRegistered) {
      return existing;
    }
    return this.registerProject(projectPath);
  }

  async registerProject(projectPath: string): Promise<ProjectContext> {
    const existing = this.projects.get(projectPath);
    if (existing?.isFullyRegistered) {
      return existing;
    }

    // B2: Check if project is initialized before proceeding
    const specDir = path.join(projectPath, SPEC_DIR_NAME);
    const manifestPath = path.join(specDir, 'manifest.json');

    const manifestExists = await fs.access(manifestPath).then(() => true).catch(() => false);

    if (!manifestExists) {
      // Check if .specforge/ directory exists (old project migration)
      const specDirExists = await fs.access(specDir).then(() => true).catch(() => false);

      if (specDirExists) {
        // Old project migration: auto-create manifest.json
        const manifest = {
          schema_version: '6.0',
          project_name: path.basename(projectPath),
          created_at: new Date().toISOString().split('T')[0],
        };
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
        // Continue with normal registration...
      } else {
        // Brand new project: reject registration
        throw new Error('PROJECT_NOT_INITIALIZED');
      }
    }

    // manifest exists → normal registration
    const projectId = existing?.projectId ?? this.generateProjectId(projectPath);
    const dataDir = this.pathResolver.resolveProjectRuntimeDir(projectPath);

    await fs.mkdir(dataDir, { recursive: true });

    // Ensure .gitignore in personal mode — fire-and-forget, don't block
    this.ensureGitignore(projectPath).catch((err) => {
      console.error(
        `[ProjectManager] Failed to ensure .gitignore for ${projectPath}:`,
        err,
      );
    });

    const ctx: ProjectContext = {
      projectId,
      projectPath,
      dataDir,
      schemaVersion: existing?.schemaVersion ?? '1.0',
      activeSessions: existing?.activeSessions ?? [],
      workItems: existing?.workItems ?? [],
      lastEventId: existing?.lastEventId ?? '',
      lastEventTs: existing?.lastEventTs ?? 0,
      isFullyRegistered: true,
    };

    this.projects.set(projectPath, ctx);
    return ctx;
  }

  async unregisterProject(projectPath: string): Promise<void> {
    const ctx = this.projects.get(projectPath);
    if (!ctx) {
      return;
    }

    if (this.projectLocks.has(projectPath)) {
      throw new Error(`Cannot unregister project ${projectPath}: project is locked`);
    }

    this.projects.delete(projectPath);
  }

  async acquireLock(projectPath: string): Promise<Lock> {
    const current = this.projectLocks.get(projectPath);
    if (current && current.expiresAt > Date.now()) {
      throw new Error(`Project ${projectPath} is already locked`);
    }
    if (current) {
      this.projectLocks.delete(projectPath);
    }

    const now = Date.now();
    const lock: Lock = {
      id: this.generateId(),
      projectPath,
      acquiredAt: now,
      expiresAt: now + 30_000,
    };

    this.projectLocks.set(projectPath, lock);
    return lock;
  }

  releaseLock(lock: Lock): void {
    const current = this.projectLocks.get(lock.projectPath);
    if (current && current.id === lock.id) {
      this.projectLocks.delete(lock.projectPath);
    }
  }

  listActiveProjects(): string[] {
    return Array.from(this.projects.keys());
  }

  getProjectContext(projectPath: string): ProjectContext {
    const existing = this.projects.get(projectPath);
    if (existing) {
      return existing;
    }

    // Lightweight creation — no file I/O, no WAL/StateManager
    const projectId = this.generateProjectId(projectPath);
    const dataDir = this.pathResolver.resolveProjectRuntimeDir(projectPath);

    const ctx: ProjectContext = {
      projectId,
      projectPath,
      dataDir,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems: [],
      lastEventId: '',
      lastEventTs: 0,
    };

    this.projects.set(projectPath, ctx);
    return ctx;
  }

  start(): void {
    this.subscription = this.eventBus.subscribe('project.updated', (event) => {
      this.handleProjectEvent(event);
    });
  }

  stop(): void {
    if (this.subscription) {
      this.eventBus.unsubscribe(this.subscription);
      this.subscription = null;
    }
    this.projects.clear();
    this.projectLocks.clear();
  }

  // ---------------------------------------------------------------------------
  // Manifest I/O
  // ---------------------------------------------------------------------------

  async loadProjectManifest(): Promise<DaemonManifest> {
    const newPath = this.pathResolver.resolveDaemonJsonPath();
    const oldPath = path.join(os.homedir(), SPEC_DIR_NAME, 'daemon.json');

    // Try new path first
    try {
      const content = await fs.readFile(newPath, 'utf-8');
      return JSON.parse(content) as DaemonManifest;
    } catch {
      // New path doesn't exist — try old path and migrate
      try {
        const content = await fs.readFile(oldPath, 'utf-8');
        const manifest = JSON.parse(content) as DaemonManifest;
        await this.saveProjectManifest(manifest);
        return manifest;
      } catch {
        // Neither exists
        return { version: '1.0', projects: {} };
      }
    }
  }

  async saveProjectManifest(manifest: DaemonManifest): Promise<void> {
    const manifestPath = this.pathResolver.resolveDaemonJsonPath();
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async ensureGitignore(projectPath: string): Promise<void> {
    if (!this.isPersonalMode(projectPath)) {
      return;
    }

    const gitignorePath = path.join(projectPath, SPEC_DIR_NAME, '.gitignore');
    const BEGIN = '# SpecForge managed (BEGIN)';
    const END = '# SpecForge managed (END)';
    const entry = 'runtime/';

    let content = '';
    try {
      content = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
      // File doesn't exist yet — will create it
    }

    if (content.includes(BEGIN) && content.includes(END)) {
      return; // Already managed
    }

    const newBlock = `${BEGIN}\n${entry}\n${END}\n`;
    const updated = content ? content.trimEnd() + '\n\n' + newBlock : newBlock;

    await fs.mkdir(path.dirname(gitignorePath), { recursive: true });
    await fs.writeFile(gitignorePath, updated, 'utf-8');
  }

  private isPersonalMode(projectPath: string): boolean {
    try {
      const runtimeDir = this.pathResolver.resolveProjectRuntimeDir(projectPath);
      const normalized = path.resolve(runtimeDir);
      const projectAbs = path.resolve(projectPath);
      return normalized.startsWith(projectAbs + path.sep);
    } catch {
      return false;
    }
  }

  private handleProjectEvent(event: Event): void {
    const payload = event.payload as { projectPath?: string };
    if (event.action === 'project.updated' && payload.projectPath) {
      // Project state is maintained independently via per-project StateManager
    }
  }

  private generateProjectId(projectPath: string): string {
    return crypto.createHash('sha256').update(projectPath).digest('hex').substring(0, 16);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
