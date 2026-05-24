import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Event, Lock, Subscription } from '../types';
import { EventBus } from '../event-bus/EventBus';
import { WAL } from '../wal/WAL';
import { StateManager } from '../state/StateManager';

export interface ProjectContext {
  projectId: string;
  projectPath: string;
  dataDir: string;
  wal: WAL;
  stateManager: StateManager;
}

export class ProjectManager {
  private eventBus: EventBus;
  private baseDir: string;
  private projects: Map<string, ProjectContext> = new Map();
  private projectLocks: Map<string, Lock> = new Map();
  private subscription: Subscription | null = null;

  constructor(eventBus: EventBus, baseDir?: string) {
    this.eventBus = eventBus;
    this.baseDir = baseDir ?? (process.env['HOME'] || process.env['USERPROFILE'] || '');
  }

  async getProject(projectPath: string): Promise<ProjectContext> {
    const existing = this.projects.get(projectPath);
    if (existing) {
      return existing;
    }
    return this.registerProject(projectPath);
  }

  async registerProject(projectPath: string): Promise<ProjectContext> {
    const existing = this.projects.get(projectPath);
    if (existing) {
      return existing;
    }

    const projectId = this.generateProjectId(projectPath);
    const dataDir = this.getProjectDataDir(projectId);

    await fs.mkdir(dataDir, { recursive: true });

    const wal = new WAL(projectPath);
    await wal.initialize();

    const stateManager = new StateManager(projectPath);
    await stateManager.initialize();

    const ctx: ProjectContext = {
      projectId,
      projectPath,
      dataDir,
      wal,
      stateManager,
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

  getProjectContext(projectPath: string): ProjectContext | undefined {
    return this.projects.get(projectPath);
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

  private handleProjectEvent(event: Event): void {
    const payload = event.payload as { projectPath?: string };
    if (event.action === 'project.updated' && payload.projectPath) {
      // Project state is maintained independently via per-project StateManager
    }
  }

  private generateProjectId(projectPath: string): string {
    return crypto.createHash('sha256').update(projectPath).digest('hex').substring(0, 16);
  }

  private getProjectDataDir(projectId: string): string {
    return path.join(this.baseDir, '.specforge', 'projects', projectId);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
