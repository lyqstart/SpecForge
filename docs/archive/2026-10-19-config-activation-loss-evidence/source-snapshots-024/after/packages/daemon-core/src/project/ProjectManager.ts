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
import type { SchemaDescriptorPrecheckResult } from '@specforge/types/schema-contract';
import { precheckProjectRegistrationSchemas } from './project-schema-descriptors';
import { loadAcceptedConfigSync, parseConfigurationObject, type MergedConfig } from '@specforge/configuration';

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

export type ProjectSchemaPrecheck = (
  projectPath: string,
) => Promise<SchemaDescriptorPrecheckResult>;

export class ProjectManager {
  private configurationActivations = new Map<string, Promise<unknown>>();

  private async serializeConfiguration<T>(projectPath: string, action: () => Promise<T>): Promise<T> {
    const key = process.platform === 'win32' ? path.resolve(projectPath).toLowerCase() : path.resolve(projectPath);
    const prior = this.configurationActivations.get(key);
    const next = (prior ? prior.catch(() => undefined) : Promise.resolve()).then(action);
    this.configurationActivations.set(key, next);
    try { return await next; }
    finally { if (this.configurationActivations.get(key) === next) this.configurationActivations.delete(key); }
  }

  /** Serialize acceptance per project; a changed config cannot affect active work. */
  async getProjectConfiguration(projectPath: string): Promise<MergedConfig> {
    return this.serializeConfiguration(projectPath, async () => {
      const config = loadAcceptedConfigSync({ projectPath });
      const sha256 = crypto.createHash('sha256').update(JSON.stringify(config.merged)).digest('hex');
      const file = path.join(this.pathResolver.resolveProjectRuntimeDir(projectPath), 'configuration-activation.json');
      let previous: { schema_version: string; sha256: string } | undefined;
      try {
        previous = JSON.parse(await fs.readFile(file, 'utf8'));
        if (!previous || typeof previous !== 'object' || Array.isArray(previous)) throw new Error('CONFIGURATION_ACTIVATION_CORRUPT');
      }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('CONFIGURATION_ACTIVATION_CORRUPT'); }
      if (previous && (previous.schema_version !== '1.0' || !/^[a-f0-9]{64}$/.test(previous.sha256))) throw new Error('CONFIGURATION_ACTIVATION_CORRUPT');
      // Missing acceptance evidence is not proof of first use. Rebuild from
      // events before creating a new identity, including after process restart.
      if (!previous || previous.sha256 !== sha256) {
        const sm = await this.getProjectStateManager(projectPath);
        await sm.rebuildState();
        if (sm.listWorkItems().some(item => !['closed', 'rejected', 'superseded'].includes(item.current_state))) {
          throw new Error('CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK: restore the accepted configuration before continuing');
        }
      }
      if (!previous || previous.sha256 !== sha256) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        const temporary = `${file}.${crypto.randomUUID()}.tmp`;
        await fs.writeFile(temporary, JSON.stringify({ schema_version: '1.0', sha256 }) + '\n', { flag: 'wx' });
        try { await fs.rename(temporary, file); }
        finally { await fs.rm(temporary, { force: true }); }
      }
      return structuredClone(config);
    });
  }

  /** Sole producer for runtime project JSON. Never writes user credentials or WI artifacts. */
  async manageProjectConfiguration(projectPath: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.serializeConfiguration(projectPath, async () => {
      if (!path.isAbsolute(projectPath)) throw new Error('CONFIGURATION_PROJECT_REQUIRED');
      // Controlled ownership does not authorize following a project junction outside its boundary.
      for (const relative of ['config/project.json', 'runtime/configuration-activation.json', 'runtime/configuration-history']) {
        let cursor = projectPath;
        for (const segment of [SPEC_DIR_NAME, ...relative.split('/')]) {
          cursor = path.join(cursor, segment);
          try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('CONFIGURATION_SYMLINK_FORBIDDEN'); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        }
      }
      const action = args.action;
      if (!['read', 'validate', 'update', 'restore'].includes(String(action))) throw new Error('CONFIGURATION_ACTION_INVALID');
      const file = path.join(projectPath, SPEC_DIR_NAME, 'config', 'project.json');
      const current = await fs.readFile(file);
      const hash = (bytes: string | Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
      const currentHash = hash(current);
      if (action === 'read') {
        // Even corrupt documents can be identified for compare-and-swap recovery. Never return raw input.
        let valid = true;
        try { loadAcceptedConfigSync({ projectPath }); } catch { valid = false; }
        return { success: true, document_sha256: currentHash, valid };
      }
      const history = path.join(this.pathResolver.resolveProjectRuntimeDir(projectPath), 'configuration-history');
      let content: string;
      if (action === 'restore') {
        if (typeof args.restore_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(args.restore_sha256)) throw new Error('CONFIGURATION_RESTORE_ID_INVALID');
        const restoredFile = path.join(history, `${args.restore_sha256}.json`);
        if ((await fs.lstat(restoredFile)).isSymbolicLink()) throw new Error('CONFIGURATION_SYMLINK_FORBIDDEN');
        content = await fs.readFile(restoredFile, 'utf8');
        if (hash(content) !== args.restore_sha256) throw new Error('CONFIGURATION_HISTORY_CORRUPT');
      } else {
        if (typeof args.content !== 'string' || Buffer.byteLength(args.content) > 65536) throw new Error('CONFIGURATION_CONTENT_INVALID');
        content = args.content;
      }
      const candidate = loadAcceptedConfigSync({ projectPath, projectData: parseConfigurationObject(content) });
      const effectiveHash = hash(JSON.stringify(candidate.merged));
      if (action === 'validate') return { success: true, valid: true, document_sha256: hash(content), effective_sha256: effectiveHash };
      if (args.expected_sha256 !== currentHash) throw new Error('CONFIGURATION_BASELINE_CHANGED');
      const activationFile = path.join(this.pathResolver.resolveProjectRuntimeDir(projectPath), 'configuration-activation.json');
      let activation: { schema_version: string; sha256: string } | undefined;
      try { activation = JSON.parse(await fs.readFile(activationFile, 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('CONFIGURATION_ACTIVATION_CORRUPT'); }
      if (activation !== undefined && (!activation || activation.schema_version !== '1.0' || !/^[a-f0-9]{64}$/.test(activation.sha256))) throw new Error('CONFIGURATION_ACTIVATION_CORRUPT');
      const state = await this.getProjectStateManager(projectPath);
      await state.rebuildState();
      const active = state.listWorkItems().some(item => !['closed', 'rejected', 'superseded'].includes(item.current_state));
      if (active && activation?.sha256 !== effectiveHash) throw new Error('CONFIGURATION_CHANGE_BLOCKED_ACTIVE_WORK');
      await fs.mkdir(history, { recursive: true });
      const archive = path.join(history, `${currentHash}.json`);
      try { await fs.writeFile(archive, current, { flag: 'wx' }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (hash(await fs.readFile(archive)) !== currentHash) throw new Error('CONFIGURATION_HISTORY_CORRUPT');
      }
      // Recheck immediately before rename: stale callers cannot silently overwrite another update.
      if (hash(await fs.readFile(file)) !== currentHash) throw new Error('CONFIGURATION_BASELINE_CHANGED');
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporary, content, { flag: 'wx' });
      try { await fs.rename(temporary, file); }
      finally { await fs.rm(temporary, { force: true }); }
      // Acceptance remains owned by getProjectConfiguration. No active WI can accept a new hash.
      // If the process stops here, its next acceptance either records the new boundary or fails closed.
      return { success: true, document_sha256: hash(content), previous_sha256: currentHash, effective_sha256: effectiveHash, activation: 'validated_pending_acceptance' };
    });
  }
  private eventBus: EventBus;
  private pathResolver: IPathResolver;
  private daemonStateManager: StateManager;
  private projects: Map<string, ProjectContext> = new Map();
  private projectStateManagers: Map<string, StateManager> = new Map();
  private projectLocks: Map<string, Lock> = new Map();
  private subscription: Subscription | null = null;
  private readonly projectSchemaPrecheck: ProjectSchemaPrecheck;

  constructor(
    eventBus: EventBus,
    pathResolver: IPathResolver,
    daemonStateManager: StateManager,
    projectSchemaPrecheck: ProjectSchemaPrecheck = precheckProjectRegistrationSchemas,
  ) {
    this.eventBus = eventBus;
    this.pathResolver = pathResolver;
    this.daemonStateManager = daemonStateManager;
    this.projectSchemaPrecheck = projectSchemaPrecheck;
  }

  getDaemonStateManager(): StateManager {
    return this.daemonStateManager;
  }

  /**
   * 获取项目级 StateManager，不存在则自动创建。
   * 写入路径为 <projectPath>/.specforge/runtime/events.jsonl
   */
  async getProjectStateManager(projectPath: string): Promise<StateManager> {
    if (!this.projectStateManagers.has(projectPath)) {
      const sm = new StateManager(this.pathResolver, projectPath, false);
      await sm.initialize();
      this.projectStateManagers.set(projectPath, sm);
    }
    return this.projectStateManagers.get(projectPath)!;
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

    // Current releases register only the authoritative V6 Project Spec layout.
    // A root manifest belongs to the retired auto-detection path and must not
    // be used to infer, repair, or register a project.
    const specDir = path.join(projectPath, SPEC_DIR_NAME);
    const currentManifestPath = path.join(specDir, 'project', 'spec_manifest.json');
    const retiredRootManifestPath = path.join(specDir, 'manifest.json');
    const retiredRootManifestExists = await fs.access(retiredRootManifestPath)
      .then(() => true)
      .catch(() => false);
    if (retiredRootManifestExists) {
      throw new Error('UNSUPPORTED_PROJECT_LAYOUT');
    }

    const currentManifestExists = await fs.access(currentManifestPath)
      .then(() => true)
      .catch(() => false);
    if (!currentManifestExists) {
      throw new Error('PROJECT_NOT_INITIALIZED');
    }

    // Schema precheck is deliberately before the first project write. Each
    // persistent-file owner supplies its exact schema contract; no global
    // version or directory discovery is used here.
    const schemaPrecheck = await this.projectSchemaPrecheck(projectPath);
    if (!schemaPrecheck.ok) {
      const details = schemaPrecheck.checks
        .filter((check) => check.status === 'blocked')
        .map((check) => `${check.descriptorId}:${check.errorCode ?? check.status}`)
        .join(',');
      throw new Error(`PROJECT_SCHEMA_PRECHECK_BLOCKED:${details}`);
    }

    // Authoritative current manifest exists → normal registration.
    await this.getProjectConfiguration(projectPath);
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
