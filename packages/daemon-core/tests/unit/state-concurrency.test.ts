/**
 * State Manager concurrency tests — TASK-6 regression coverage for C2, CP-2, CP-3.
 *
 * Covers:
 *   C2  — state.json triple overwrite prevented by version lock
 *   CP-2 — concurrent writeStateFile conflicts retry automatically and converge
 *   CP-3 — persistStateFromExternal correctly syncs external state into memory
 *
 * All tests use temporary directories (os.tmpdir()) — no pollution of
 * ~/.specforge/runtime.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver, IPathResolver } from '../../src/daemon/path-resolver';
import type { ProjectState } from '../../src/types';

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

/**
 * In-memory mock PathResolver that routes all paths into a temp dir
 * so tests never touch ~/.specforge.
 */
class TestPathResolver implements IPathResolver {
  constructor(private baseDir: string) {}

  resolveProjectRuntimeDir(projectPath: string): string {
    return path.join(this.baseDir, 'project-rt');
  }
  resolveStatePath(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'state.json');
  }
  resolveEventsPath(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'events.jsonl');
  }
  resolveSessionsDir(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'sessions');
  }
  resolveDaemonRuntimeDir(): string {
    return this.baseDir;
  }
  resolveHandshakePath(): string {
    return path.join(this.baseDir, 'handshake.json');
  }
  resolveDaemonJsonPath(): string {
    return path.join(this.baseDir, 'daemon.json');
  }
  resolveDaemonStatePath(): string {
    return path.join(this.baseDir, 'state.json');
  }
  resolveDaemonEventsPath(): string {
    return path.join(this.baseDir, 'events.jsonl');
  }
}

/** Build a ProjectState for test assertions. */
function makeProjectState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    stateVersion: 0,
    projectPath: 'test-proj',
    schemaVersion: '1.0',
    activeSessions: [],
    workItems: [],
    lastEventId: '',
    lastEventTs: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// C2 + CP-2: Version lock prevents concurrent overwrite
// ═══════════════════════════════════════════════════════════════════

describe('StateManager concurrency — C2 / CP-2 version lock', () => {
  let tempDir: string;
  let resolver: TestPathResolver;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `sfc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    resolver = new TestPathResolver(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  });

  it('C2: stateVersion increases monotonically across writes', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    const s1 = await sm.getCurrentState();
    const v0 = s1.stateVersion;

    // Each transition triggers writeStateFile → version++
    await sm.transition('WI-A', '', 'intake', 'test');
    const s2 = await sm.getCurrentState();
    expect(s2.stateVersion).toBeGreaterThanOrEqual(v0 + 1);

    await sm.transition('WI-A', 'intake', 'requirements', 'test');
    const s3 = await sm.getCurrentState();
    expect(s3.stateVersion).toBeGreaterThanOrEqual(s2.stateVersion + 1);
  });

  it('CP-2: version conflict triggers rebuild + retry (disk simulated overwrite)', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    await sm.transition('WI-X', '', 'intake', 'test');
    const before = await sm.getCurrentState();
    expect(before.stateVersion).toBeGreaterThanOrEqual(1);

    // Simulate external overwrite: write state.json with a much higher version
    const statePath = (sm as any).statePath as string;
    const forgedState = { ...before, stateVersion: 999 };
    await fs.writeFile(statePath, JSON.stringify(forgedState, null, 2), 'utf-8');

    // Next transition should detect conflict (disk = 999 vs mem) → rebuild → retry → succeed
    await sm.transition('WI-X', 'intake', 'requirements', 'test');
    const after = await sm.getCurrentState();
    // After rebuild, _stateVersion was seeded from disk (999), then incremented (1000)
    expect(after.stateVersion).toBeGreaterThanOrEqual(1000);
  });

  it('CP-2: version conflict resolved via retry — transition succeeds after rebuild', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    await sm.transition('WI-Y', '', 'intake', 'test');
    const before = await sm.getCurrentState();
    expect(before.stateVersion).toBeGreaterThanOrEqual(1);

    // Repeatedly overwrite disk state to simulate external writes diverging version
    const statePath = (sm as any).statePath as string;
    for (let i = 0; i < 10; i++) {
      // Write forged versions directly to disk without reading current state into memory,
      // so the in-memory _stateVersion remains stale and a conflict is detected.
      const forged = makeProjectState({ stateVersion: 10000 + i });
      await fs.writeFile(statePath, JSON.stringify(forged, null, 2), 'utf-8');
    }

    // Transition should detect conflict, rebuild from WAL, and succeed on retry
    await sm.transition('WI-Y', 'intake', 'requirements', 'test');
    const after = await sm.getCurrentState();
    // After rebuild+retry, stateVersion was seeded from disk (~10009) then incremented
    expect(after.stateVersion).toBeGreaterThanOrEqual(10010);
    // WI-Y should still be in 'requirements' (the transition succeeded)
    const wi = after.workItems.find((w: any) => w.work_item_id === 'WI-Y')!;
    expect(wi.current_state).toBe('requirements');
  });

  it('CP-2: state.json on disk is consistent after transition', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    await sm.transition('WI-CONS', '', 'design', 'test');

    const statePath = (sm as any).statePath as string;
    const raw = await fs.readFile(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as ProjectState;
    // stateVersion in file must be >= 1 after a write
    expect(parsed.stateVersion).toBeGreaterThanOrEqual(1);
    expect(parsed.workItems.some((w: any) => w.work_item_id === 'WI-CONS')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CP-3: persistStateFromExternal
// ═══════════════════════════════════════════════════════════════════

describe('StateManager — CP-3 persistStateFromExternal', () => {
  let tempDir: string;
  let resolver: TestPathResolver;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `sfcpsfe-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    resolver = new TestPathResolver(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  });

  it('CP-3: should sync workItems from external state into in-memory map', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    const ext: ProjectState = makeProjectState({
      workItems: [
        {
          work_item_id: 'WI-EXT-1',
          workflow_type: 'bugfix_spec',
          current_state: 'completed',
          created_at: 1000,
          updated_at: 2000,
        },
        {
          work_item_id: 'WI-EXT-2',
          workflow_type: 'feature_spec',
          current_state: 'design',
          created_at: 3000,
          updated_at: 4000,
        },
      ],
    });

    await sm.persistStateFromExternal(ext);

    const current = await sm.getCurrentState();
    expect(current.workItems).toHaveLength(2);
    expect(current.workItems.some((w: any) => w.work_item_id === 'WI-EXT-1')).toBe(true);
    expect(current.workItems.some((w: any) => w.work_item_id === 'WI-EXT-2')).toBe(true);

    // Verify individual items
    const wi1 = current.workItems.find((w: any) => w.work_item_id === 'WI-EXT-1')!;
    expect(wi1.current_state).toBe('completed');
    expect(wi1.workflow_type).toBe('bugfix_spec');
  });

  it('CP-3: should sync lastEventId and lastEventTs from external state', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    const ext: ProjectState = makeProjectState({
      lastEventId: 'ext-ev-last',
      lastEventTs: 99999,
      workItems: [],
    });

    await sm.persistStateFromExternal(ext);

    const current = await sm.getCurrentState();
    expect(current.lastEventId).toBe('ext-ev-last');
    expect(current.lastEventTs).toBe(99999);
  });

  it('CP-3: should clear old in-memory workItems when external state has different items', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    // First, add an item via transition
    await sm.transition('WI-OLD', '', 'intake', 'test');
    let current = await sm.getCurrentState();
    expect(current.workItems.some((w: any) => w.work_item_id === 'WI-OLD')).toBe(true);

    // Then persist external state with different item
    const ext: ProjectState = makeProjectState({
      workItems: [
        {
          work_item_id: 'WI-NEW',
          workflow_type: 'feature_spec',
          current_state: 'requirements',
          created_at: 5000,
          updated_at: 6000,
        },
      ],
    });
    await sm.persistStateFromExternal(ext);

    current = await sm.getCurrentState();
    expect(current.workItems).toHaveLength(1);
    expect(current.workItems[0]!.work_item_id).toBe('WI-NEW');
    expect(current.workItems.some((w: any) => w.work_item_id === 'WI-OLD')).toBe(false);
  });

  it('CP-3: should write state.json via optimistic concurrency control', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    const ext: ProjectState = makeProjectState({
      stateVersion: 0,
      workItems: [
        {
          work_item_id: 'WI-OCC',
          workflow_type: 'refactor',
          current_state: 'design',
          created_at: 100,
          updated_at: 200,
        },
      ],
      lastEventId: 'occ-ev',
      lastEventTs: 777,
    });

    await sm.persistStateFromExternal(ext);

    // Read state.json directly to verify it was written
    const statePath = (sm as any).statePath as string;
    const raw = await fs.readFile(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as ProjectState;
    expect(parsed.workItems.some((w: any) => w.work_item_id === 'WI-OCC')).toBe(true);
    expect(parsed.lastEventId).toBe('occ-ev');
    // version should have been incremented by writeStateFile
    expect(parsed.stateVersion).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// C2: Backward-compatible version (missing stateVersion → 0)
// ═══════════════════════════════════════════════════════════════════

describe('StateManager — C2 backward compatibility (missing stateVersion)', () => {
  let tempDir: string;
  let resolver: TestPathResolver;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `sfcbc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    resolver = new TestPathResolver(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  });

  it('C2: should treat missing stateVersion as 0 (backward compat)', async () => {
    // Write a legacy state.json without stateVersion field
    const statePath = resolver.resolveStatePath('test-proj');
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    const legacyState = {
      projectPath: 'test-proj',
      schemaVersion: '0.9',
      activeSessions: [],
      workItems: [],
      lastEventId: '',
      lastEventTs: 0,
    };
    await fs.writeFile(statePath, JSON.stringify(legacyState, null, 2), 'utf-8');

    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    const current = await sm.getCurrentState();
    // After initialize, stateVersion should be seeded from disk (0) then
    // incremented by the persistState call during initialize.
    expect(typeof current.stateVersion).toBe('number');
    expect(current.stateVersion).toBeGreaterThanOrEqual(0);
  });
});
