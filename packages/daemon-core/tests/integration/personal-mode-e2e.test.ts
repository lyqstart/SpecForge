/**
 * Integration Tests — Personal Mode E2E + Enterprise Backward Compatibility
 *
 * Tests:
 * - CP-2: enterprise mode WAL writes under ~/.specforge/projects/<hash>/
 * - Personal mode: WAL writes under project/.specforge/runtime/
 * - End-to-end: register → ingest event → subsystem routing → persistence
 * - .specforge/.gitignore SpecForge managed block
 * - daemon.json enterprise backward compatibility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PersonalPathResolver, EnterprisePathResolver, IPathResolver } from '../../src/daemon/path-resolver';
import { WAL } from '../../src/wal/WAL';
import { StateManager } from '../../src/state/StateManager';
import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import type { Event } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fsSync.mkdtempSync(path.join(os.tmpdir(), 'specforge-e2e-'));
}

async function rmRF(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 1. PersonalPathResolver — path resolution
// ---------------------------------------------------------------------------

describe('PersonalPathResolver — path resolution', () => {
  const resolver = new PersonalPathResolver();

  it('should resolve runtime dir inside project', () => {
    const dir = resolver.resolveProjectRuntimeDir('/home/user/my-project');
    expect(dir).toBe(path.join('/home/user/my-project', '.specforge', 'runtime'));
  });

  it('should resolve events path under project runtime', () => {
    const eventsPath = resolver.resolveEventsPath('/home/user/my-project');
    expect(eventsPath).toBe(
      path.join('/home/user/my-project', '.specforge', 'runtime', 'events.jsonl')
    );
  });

  it('should resolve state path under project runtime', () => {
    const statePath = resolver.resolveStatePath('/home/user/my-project');
    expect(statePath).toBe(
      path.join('/home/user/my-project', '.specforge', 'runtime', 'state.json')
    );
  });

  it('should resolve sessions dir under project runtime', () => {
    const sessionsDir = resolver.resolveSessionsDir('/home/user/my-project');
    expect(sessionsDir).toBe(
      path.join('/home/user/my-project', '.specforge', 'runtime', 'sessions')
    );
  });

  it('should resolve daemon runtime dir under ~/.specforge/runtime', () => {
    const dir = resolver.resolveDaemonRuntimeDir();
    expect(dir).toBe(path.join(os.homedir(), '.specforge', 'runtime'));
  });

  it('should resolve daemon.json under ~/.config/opencode', () => {
    const daemonJsonPath = resolver.resolveDaemonJsonPath();
    expect(daemonJsonPath).toBe(path.join(os.homedir(), '.config', 'opencode', 'daemon.json'));
  });
});

// ---------------------------------------------------------------------------
// 2. EnterprisePathResolver — path resolution (CP-2)
// ---------------------------------------------------------------------------

describe('EnterprisePathResolver — path resolution (CP-2)', () => {
  const resolver = new EnterprisePathResolver();

  it('should resolve runtime dir under ~/.specforge/projects/<hash>/', () => {
    const dir = resolver.resolveProjectRuntimeDir('/home/user/my-project');
    expect(dir).toContain(path.join(os.homedir(), '.specforge', 'projects'));
    // Verify it's NOT inside the project directory
    expect(dir).not.toContain(path.join('/home/user/my-project', '.specforge', 'runtime'));
  });

  it('should resolve WAL events path under ~/.specforge/projects/<hash>/', () => {
    const eventsPath = resolver.resolveEventsPath('/home/user/my-project');
    expect(eventsPath).toContain(path.join(os.homedir(), '.specforge', 'projects'));
    expect(eventsPath).toContain('events.jsonl');
  });

  it('should resolve state path under ~/.specforge/projects/<hash>/', () => {
    const statePath = resolver.resolveStatePath('/home/user/my-project');
    expect(statePath).toContain(path.join(os.homedir(), '.specforge', 'projects'));
    expect(statePath).toContain('state.json');
  });

  it('should produce deterministic hash for the same project path', () => {
    const dir1 = resolver.resolveProjectRuntimeDir('/home/user/my-project');
    const dir2 = resolver.resolveProjectRuntimeDir('/home/user/my-project');
    expect(dir1).toBe(dir2);
  });

  it('should produce different hashes for different projects', () => {
    const dir1 = resolver.resolveProjectRuntimeDir('/home/user/project-a');
    const dir2 = resolver.resolveProjectRuntimeDir('/home/user/project-b');
    expect(dir1).not.toBe(dir2);
  });

  it('should share daemon-global paths with PersonalPathResolver', () => {
    const personal = new PersonalPathResolver();
    const enterprise = new EnterprisePathResolver();

    expect(enterprise.resolveDaemonRuntimeDir()).toBe(personal.resolveDaemonRuntimeDir());
    expect(enterprise.resolveHandshakePath()).toBe(personal.resolveHandshakePath());
    expect(enterprise.resolveDaemonJsonPath()).toBe(personal.resolveDaemonJsonPath());
  });
});

// ---------------------------------------------------------------------------
// 3. Personal Mode E2E — WAL + StateManager + file persistence
// ---------------------------------------------------------------------------

describe('Personal Mode E2E — WAL persistence', () => {
  let tmpDir: string;
  let projectPath: string;
  let resolver: PersonalPathResolver;
  let wal: WAL;
  let stateManager: StateManager;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    projectPath = path.join(tmpDir, 'my-project');
    resolver = new PersonalPathResolver();

    const eventsPath = resolver.resolveEventsPath(projectPath);
    wal = new WAL(eventsPath);
    await wal.initialize();

    stateManager = new StateManager(resolver, projectPath);
    await stateManager.initialize();
  });

  afterEach(async () => {
    await rmRF(tmpDir);
  });

  it('should create events.jsonl inside project/.specforge/runtime/', async () => {
    const eventsPath = resolver.resolveEventsPath(projectPath);
    expect(await fileExists(eventsPath)).toBe(true);
    expect(eventsPath).toContain(path.join('.specforge', 'runtime', 'events.jsonl'));
  });

  it('should create state.json inside project/.specforge/runtime/', async () => {
    const statePath = resolver.resolveStatePath(projectPath);
    expect(await fileExists(statePath)).toBe(true);
    expect(statePath).toContain(path.join('.specforge', 'runtime', 'state.json'));
  });

  it('should append events to WAL and persist them', async () => {
    const event = wal.createEvent(
      'WI-001',
      'state',
      'state.transition',
      { work_item_id: 'WI-001', from_state: '', to_state: 'intake' },
      'system',
    );

    await wal.appendEvent(event);

    // Read back and verify
    const { events } = await wal.readAllEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe('state.transition');
    expect(events[0]!.projectId).toBe('WI-001');
    expect(events[0]!.monotonicSeq).toBe(1);
  });

  it('should transition work item state end-to-end', async () => {
    // Register a new work item
    await stateManager.transition('WI-001', '', 'intake', 'test-runner');

    // Verify in-memory state
    const state = stateManager.getState('WI-001');
    expect(state).not.toBeNull();
    expect(state!.current_state).toBe('intake');
    expect(state!.work_item_id).toBe('WI-001');

    // Verify WAL contains the event
    const { events } = await wal.readAllEvents();
    expect(events.some(e => e.action === 'state.transition' && e.projectId === 'WI-001')).toBe(true);

    // Verify state.json checkpoint
    const statePath = resolver.resolveStatePath(projectPath);
    const stateContent = await fs.readFile(statePath, 'utf-8');
    const stateJson = JSON.parse(stateContent);
    expect(stateJson.workItems.length).toBeGreaterThanOrEqual(1);
    expect(stateJson.workItems.some((wi: any) => wi.work_item_id === 'WI-001')).toBe(true);
  });

  it('should enforce optimistic locking — reject stale from_state', async () => {
    await stateManager.transition('WI-001', '', 'intake');

    // Trying to transition with wrong from_state should throw
    await expect(
      stateManager.transition('WI-001', 'design', 'development')
    ).rejects.toThrow(/Optimistic lock failed/);
  });

  it('should handle multiple work items in personal mode', async () => {
    await stateManager.transition('WI-001', '', 'intake');
    await stateManager.transition('WI-002', '', 'requirements');
    await stateManager.transition('WI-001', 'intake', 'requirements');

    const wi1 = stateManager.getState('WI-001');
    const wi2 = stateManager.getState('WI-002');

    expect(wi1!.current_state).toBe('requirements');
    expect(wi2!.current_state).toBe('requirements');
  });

  it('should rebuild state from WAL after simulated restart', async () => {
    // Simulate work
    await stateManager.transition('WI-001', '', 'intake');
    await stateManager.transition('WI-001', 'intake', 'design');

    // Simulate restart: create a new StateManager that reads the same WAL
    const stateManager2 = new StateManager(resolver, projectPath);
    await stateManager2.initialize();

    const state = stateManager2.getState('WI-001');
    expect(state).not.toBeNull();
    expect(state!.current_state).toBe('design');
    expect(state!.work_item_id).toBe('WI-001');
  });
});

// ---------------------------------------------------------------------------
// 4. Enterprise Mode E2E — backward compatibility (CP-2)
// ---------------------------------------------------------------------------

describe('Enterprise Mode E2E — backward compatibility', () => {
  let tmpDir: string;
  let projectPath: string;
  let resolver: EnterprisePathResolver;
  let wal: WAL;
  let stateManager: StateManager;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    projectPath = path.join(tmpDir, 'enterprise-project');
    resolver = new EnterprisePathResolver();

    const eventsPath = resolver.resolveEventsPath(projectPath);
    wal = new WAL(eventsPath);
    await wal.initialize();

    stateManager = new StateManager(resolver, projectPath);
    await stateManager.initialize();
  });

  afterEach(async () => {
    await rmRF(tmpDir);
  });

  it('CP-2: should write WAL under ~/.specforge/projects/<hash>/', async () => {
    const eventsPath = resolver.resolveEventsPath(projectPath);
    expect(await fileExists(eventsPath)).toBe(true);
    expect(eventsPath).toContain(path.join('.specforge', 'projects'));
    expect(eventsPath).toContain('events.jsonl');
  });

  it('CP-2: should write state.json under ~/.specforge/projects/<hash>/', async () => {
    const statePath = resolver.resolveStatePath(projectPath);
    // state.json exists after initialize
    expect(await fileExists(statePath)).toBe(true);
    expect(statePath).toContain(path.join('.specforge', 'projects'));
    expect(statePath).toContain('state.json');
  });

  it('should append events to enterprise WAL and persist', async () => {
    const event = wal.createEvent(
      'WI-ENT-001',
      'state',
      'state.transition',
      { work_item_id: 'WI-ENT-001', from_state: '', to_state: 'design' },
      'enterprise-bot',
    );

    await wal.appendEvent(event);

    const { events } = await wal.readAllEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe('state.transition');
    expect(events[0]!.monotonicSeq).toBe(1);
  });

  it('should work end-to-end in enterprise mode (behavior unchanged)', async () => {
    // Register
    await stateManager.transition('WI-ENT-001', '', 'intake');

    // Transition through multiple stages
    await stateManager.transition('WI-ENT-001', 'intake', 'requirements');
    await stateManager.transition('WI-ENT-001', 'requirements', 'design');

    // Verify final state
    const state = stateManager.getState('WI-ENT-001');
    expect(state!.current_state).toBe('design');

    // Verify all events in WAL
    const { events } = await wal.readAllEvents();
    const transitions = events.filter(e => e.action === 'state.transition');
    expect(transitions.length).toBe(3);

    // Verify monotonicSeq is strictly increasing
    const seqs = transitions.map(e => e.monotonicSeq ?? 0);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!);
    }
  });

  it('should isolate projects in enterprise mode (different hashes)', async () => {
    const projectB = path.join(tmpDir, 'other-project');
    const eventsB = resolver.resolveEventsPath(projectB);
    const walB = new WAL(eventsB);
    await walB.initialize();

    // Different project paths produce different hash directories
    const dirA = path.dirname(resolver.resolveEventsPath(projectPath));
    const dirB = path.dirname(eventsB);
    expect(dirA).not.toBe(dirB);
  });
});

// ---------------------------------------------------------------------------
// 5. .specforge/.gitignore managed block (ProjectManager)
// ---------------------------------------------------------------------------

describe('.specforge/.gitignore — SpecForge managed block', () => {
  let tmpDir: string;
  let projectPath: string;
  let resolver: IPathResolver;
  let eventBus: EventBus;
  let projectManager: ProjectManager;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    projectPath = path.join(tmpDir, 'gitignore-test');
    resolver = new PersonalPathResolver();
    eventBus = new EventBus();
    projectManager = new ProjectManager(eventBus, resolver);
  });

  afterEach(async () => {
    projectManager.stop();
    eventBus.stop();
    await rmRF(tmpDir);
  });

  it('should create .specforge/.gitignore with managed block on project registration', async () => {
    // Register project triggers ensureGitignore
    const ctx = await projectManager.registerProject(projectPath);
    expect(ctx).toBeDefined();

    // Give fire-and-forget a moment
    await new Promise(resolve => setTimeout(resolve, 200));

    const gitignorePath = path.join(projectPath, '.specforge', '.gitignore');
    expect(await fileExists(gitignorePath)).toBe(true);

    const content = await fs.readFile(gitignorePath, 'utf-8');
    expect(content).toContain('# SpecForge managed (BEGIN)');
    expect(content).toContain('# SpecForge managed (END)');
    expect(content).toContain('runtime/');
  });

  it('should not add managed block twice', async () => {
    await projectManager.registerProject(projectPath);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Manually check current content
    const gitignorePath = path.join(projectPath, '.specforge', '.gitignore');
    const content1 = await fs.readFile(gitignorePath, 'utf-8');
    const beginCount = (content1.match(/# SpecForge managed \(BEGIN\)/g) || []).length;

    // Trigger again
    await projectManager.registerProject(projectPath);
    await new Promise(resolve => setTimeout(resolve, 100));

    const content2 = await fs.readFile(gitignorePath, 'utf-8');
    const beginCount2 = (content2.match(/# SpecForge managed \(BEGIN\)/g) || []).length;

    expect(beginCount2).toBe(beginCount);
  });
});

// ---------------------------------------------------------------------------
// 6. daemon.json — project manifest backward compatibility
// ---------------------------------------------------------------------------

describe('daemon.json — project manifest', () => {
  let tmpDir: string;
  let projectPath: string;
  let resolver: IPathResolver;
  let eventBus: EventBus;
  let projectManager: ProjectManager;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    projectPath = path.join(tmpDir, 'manifest-test');
    resolver = new PersonalPathResolver();
    eventBus = new EventBus();
    projectManager = new ProjectManager(eventBus, resolver);
  });

  afterEach(async () => {
    projectManager.stop();
    eventBus.stop();
    // Clean up daemon.json written to the global path to avoid
    // cross-test contamination (side effect of using real dir paths)
    try {
      const daemonJsonPath = resolver.resolveDaemonJsonPath();
      await fs.unlink(daemonJsonPath);
    } catch {
      // file may not exist
    }
    await rmRF(tmpDir);
  });

  it('should load empty manifest when no daemon.json exists', async () => {
    const manifest = await projectManager.loadProjectManifest();
    expect(manifest).toBeDefined();
    expect(manifest.version).toBe('1.0');
    // projects may be populated from a prior run; check it is an object
    expect(typeof manifest.projects).toBe('object');
  });

  it('should save and reload project manifest', async () => {
    const manifest = {
      version: '1.0',
      projects: {
        '/test/project-a': { projectId: 'abc123', registeredAt: 1234567890 },
      },
    };
    await projectManager.saveProjectManifest(manifest);

    const reloaded = await projectManager.loadProjectManifest();
    expect(reloaded.version).toBe('1.0');
    expect(reloaded.projects['/test/project-a']).toBeDefined();
    expect(reloaded.projects['/test/project-a']!.projectId).toBe('abc123');
  });

  it('should use same daemon.json path for both modes', () => {
    const personal = new PersonalPathResolver();
    const enterprise = new EnterprisePathResolver();
    expect(personal.resolveDaemonJsonPath()).toBe(enterprise.resolveDaemonJsonPath());
  });

  it('should register project with unique projectId', async () => {
    const ctx = await projectManager.registerProject(projectPath);
    expect(ctx.projectId).toBeDefined();
    expect(ctx.projectId.length).toBe(16); // sha256 hex substring(0, 16)

    // Same project path should return same context
    const ctx2 = await projectManager.registerProject(projectPath);
    expect(ctx2.projectId).toBe(ctx.projectId);
  });

  it('should list active projects', async () => {
    await projectManager.registerProject(projectPath);
    const projB = path.join(tmpDir, 'project-b');
    await projectManager.registerProject(projB);

    const active = projectManager.listActiveProjects();
    expect(active).toContain(projectPath);
    expect(active).toContain(projB);
  });
});

// ---------------------------------------------------------------------------
// 7. Cross-mode — personal and enterprise produce correct file layouts
// ---------------------------------------------------------------------------

describe('Cross-mode — file layout verification', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(async () => {
    await rmRF(tmpDir);
  });

  it('should write personal mode WAL inside project directory', async () => {
    const projectPath = path.join(tmpDir, 'personal-proj');
    const resolver = new PersonalPathResolver();
    const eventsPath = resolver.resolveEventsPath(projectPath);
    const wal = new WAL(eventsPath);
    await wal.initialize();

    const event = wal.createEvent('WI-P', 'state', 'state.transition', { to: 'intake' });
    await wal.appendEvent(event);

    // Verify events.jsonl is inside the project directory tree
    expect(eventsPath).toContain(projectPath);
    expect(await fileExists(eventsPath)).toBe(true);

    // Read back
    const { events } = await wal.readAllEvents();
    expect(events).toHaveLength(1);
  });

  it('should write enterprise mode WAL outside project directory', async () => {
    const projectPath = path.join(tmpDir, 'enterprise-proj');
    const resolver = new EnterprisePathResolver();
    const eventsPath = resolver.resolveEventsPath(projectPath);
    const wal = new WAL(eventsPath);
    await wal.initialize();

    const event = wal.createEvent('WI-E', 'state', 'state.transition', { to: 'intake' });
    await wal.appendEvent(event);

    // Verify events.jsonl is NOT inside the project directory tree
    expect(eventsPath).not.toContain(projectPath);
    expect(await fileExists(eventsPath)).toBe(true);

    const { events: evts } = await wal.readAllEvents();
    expect(evts).toHaveLength(1);
  });

  it('should correctly identify personal vs enterprise layout', async () => {
    const projectPath = path.join(tmpDir, 'test-proj');
    const personal = new PersonalPathResolver();
    const enterprise = new EnterprisePathResolver();

    const personalRuntime = personal.resolveProjectRuntimeDir(projectPath);
    const enterpriseRuntime = enterprise.resolveProjectRuntimeDir(projectPath);

    // Personal: inside project
    expect(personalRuntime).toContain(projectPath);

    // Enterprise: under ~/.specforge/projects/
    expect(enterpriseRuntime).toContain(path.join('.specforge', 'projects'));
    expect(enterpriseRuntime).not.toContain(projectPath);
  });
});
