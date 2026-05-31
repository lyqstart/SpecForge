/**
 * Recovery Subsystem path tests — TASK-6 regression coverage for C3, CP-5.
 *
 * Covers:
 *   C3  — RecoverySubsystem no longer produces nested .specforge/runtime paths
 *   CP-5 — RecoverySubsystem uses correct daemon-global path in daemon mode
 *
 * All tests use temporary directories exclusively.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { RecoverySubsystem } from '../../src/recovery/RecoverySubsystem';
import { WAL } from '../../src/wal/WAL';
import { StateManager } from '../../src/state/StateManager';
import { IPathResolver } from '../../src/daemon/path-resolver';

// ────────────────────────────────────────────────────────────────────
// Mock path resolvers
// ────────────────────────────────────────────────────────────────────

/**
 * Path resolver that simulates a daemon runtime directory.
 * Daemon-global paths live directly under the daemon runtime dir;
 * project-scoped paths live under a nested project directory.
 */
class MockDaemonPathResolver implements IPathResolver {
  constructor(private daemonRuntimeDir: string) {}

  resolveProjectRuntimeDir(projectPath: string): string {
    // This is the project-level API — it nests inside daemonRuntimeDir
    // (simulating the buggy behavior: nesting .specforge/runtime again)
    return path.join(this.daemonRuntimeDir, '.specforge', 'runtime');
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
    return this.daemonRuntimeDir;
  }
  resolveHandshakePath(): string {
    return path.join(this.daemonRuntimeDir, 'handshake.json');
  }
  resolveDaemonJsonPath(): string {
    return path.join(os.homedir(), '.config', 'opencode', 'daemon.json');
  }
  resolveDaemonStatePath(): string {
    return path.join(this.daemonRuntimeDir, 'state.json');
  }
  resolveDaemonEventsPath(): string {
    return path.join(this.daemonRuntimeDir, 'events.jsonl');
  }
}

// ═══════════════════════════════════════════════════════════════════
// C3: No nested .specforge/runtime paths
// ═══════════════════════════════════════════════════════════════════

describe('RecoverySubsystem — C3: no nested .specforge/runtime paths', () => {
  it('C3: daemon-global mode events path does NOT contain nested .specforge/runtime', () => {
    const daemonRt = path.join(os.tmpdir(), 'daemon-rt-nonest');
    const resolver = new MockDaemonPathResolver(daemonRt);
    const mockWal = { readAllEvents: vi.fn().mockResolvedValue({ events: [] }) } as unknown as WAL;
    const mockSm = {
      rebuildState: vi.fn().mockResolvedValue({ projectPath: 'p', schemaVersion: '1.0', activeSessions: [], workItems: [], lastEventId: '', lastEventTs: 0 }),
      persistStateFromExternal: vi.fn().mockResolvedValue(undefined),
    } as unknown as StateManager;

    const rs = new RecoverySubsystem(resolver, 'any-project', mockWal, mockSm);

    const eventsPath = rs.getEventsPath();
    const statePath = rs.getStatePath();

    // The paths should be directly under daemonRt, NOT nested again
    expect(eventsPath).toBe(path.join(daemonRt, 'events.jsonl'));
    expect(statePath).toBe(path.join(daemonRt, 'state.json'));

    // Verify no double nesting
    expect(eventsPath).not.toContain('.specforge' + path.sep + 'runtime' + path.sep + '.specforge');
    expect(statePath).not.toContain('.specforge' + path.sep + 'runtime' + path.sep + '.specforge');
  });

  it('C3: daemon-global paths are flat (no project-hash subdirectory)', () => {
    const daemonRt = path.join(os.tmpdir(), 'daemon-rt-flat');
    const resolver = new MockDaemonPathResolver(daemonRt);
    const mockWal = { readAllEvents: vi.fn().mockResolvedValue({ events: [] }) } as unknown as WAL;
    const mockSm = {
      rebuildState: vi.fn().mockResolvedValue({ projectPath: 'p', schemaVersion: '1.0', activeSessions: [], workItems: [], lastEventId: '', lastEventTs: 0 }),
      persistStateFromExternal: vi.fn().mockResolvedValue(undefined),
    } as unknown as StateManager;

    const rs = new RecoverySubsystem(resolver, 'some-project', mockWal, mockSm);

    const eventsPath = rs.getEventsPath();
    // Should be <daemonRt>/events.jsonl, not <daemonRt>/projects/<hash>/events.jsonl
    expect(eventsPath).toBe(path.join(daemonRt, 'events.jsonl'));
    const dirName = path.dirname(eventsPath);
    // The directory of events.jsonl should be the daemon runtime dir itself
    expect(dirName).toBe(daemonRt);
  });

  it('C3: legacy mode (no wal/SM) uses project-scoped paths (expected for backward compat)', () => {
    const daemonRt = path.join(os.tmpdir(), 'daemon-rt-legacy');
    const resolver = new MockDaemonPathResolver(daemonRt);
    // No wal or stateManager — legacy mode
    const rs = new RecoverySubsystem(resolver, 'legacy-project');

    const eventsPath = rs.getEventsPath();
    // Legacy mode produces project-scoped nested paths
    expect(eventsPath).toContain('.specforge');
    expect(eventsPath).toContain('runtime');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CP-5: RecoverySubsystem uses correct daemon-global path
// ═══════════════════════════════════════════════════════════════════

describe('RecoverySubsystem — CP-5: correct daemon-global path', () => {
  it('CP-5: resolveDaemonEventsPath is used instead of resolveEventsPath when WAL+SM injected', () => {
    const daemonRt = path.join(os.tmpdir(), 'daemon-rt-cp5');
    const resolver = new MockDaemonPathResolver(daemonRt);

    // Spy on the resolver to verify which methods are called
    const eventsSpy = vi.spyOn(resolver, 'resolveDaemonEventsPath');
    const stateSpy = vi.spyOn(resolver, 'resolveDaemonStatePath');
    const projectEventsSpy = vi.spyOn(resolver, 'resolveEventsPath');

    const mockWal = { readAllEvents: vi.fn().mockResolvedValue({ events: [] }) } as unknown as WAL;
    const mockSm = {
      rebuildState: vi.fn().mockResolvedValue({ projectPath: 'p', schemaVersion: '1.0', activeSessions: [], workItems: [], lastEventId: '', lastEventTs: 0 }),
      persistStateFromExternal: vi.fn().mockResolvedValue(undefined),
    } as unknown as StateManager;

    // Constructor should call the daemon-global methods
    new RecoverySubsystem(resolver, 'test-project', mockWal, mockSm);

    expect(eventsSpy).toHaveBeenCalled();
    expect(stateSpy).toHaveBeenCalled();
    // resolveEventsPath (project-scoped) should NOT be called in daemon-global mode
    expect(projectEventsSpy).not.toHaveBeenCalled();

    eventsSpy.mockRestore();
    stateSpy.mockRestore();
    projectEventsSpy.mockRestore();
  });

  it('CP-5: state path matches daemon-global state.json (not project-scoped)', () => {
    const daemonRt = path.join(os.tmpdir(), 'daemon-rt-cp5b');
    const resolver = new MockDaemonPathResolver(daemonRt);
    const mockWal = { readAllEvents: vi.fn().mockResolvedValue({ events: [] }) } as unknown as WAL;
    const mockSm = {
      rebuildState: vi.fn().mockResolvedValue({ projectPath: 'p', schemaVersion: '1.0', activeSessions: [], workItems: [], lastEventId: '', lastEventTs: 0 }),
      persistStateFromExternal: vi.fn().mockResolvedValue(undefined),
    } as unknown as StateManager;

    const rs = new RecoverySubsystem(resolver, 'any-project', mockWal, mockSm);

    // CP-5: The state path must be <daemonRt>/state.json
    expect(rs.getStatePath()).toBe(path.join(daemonRt, 'state.json'));
    // Not project-scoped
    expect(rs.getStatePath()).not.toContain('project');
  });

  it('CP-5: events path matches daemon-global events.jsonl (not project-scoped)', () => {
    const daemonRt = path.join(os.tmpdir(), 'daemon-rt-cp5c');
    const resolver = new MockDaemonPathResolver(daemonRt);
    const mockWal = { readAllEvents: vi.fn().mockResolvedValue({ events: [] }) } as unknown as WAL;
    const mockSm = {
      rebuildState: vi.fn().mockResolvedValue({ projectPath: 'p', schemaVersion: '1.0', activeSessions: [], workItems: [], lastEventId: '', lastEventTs: 0 }),
      persistStateFromExternal: vi.fn().mockResolvedValue(undefined),
    } as unknown as StateManager;

    const rs = new RecoverySubsystem(resolver, 'any-project', mockWal, mockSm);

    // CP-5: The events path must be <daemonRt>/events.jsonl
    expect(rs.getEventsPath()).toBe(path.join(daemonRt, 'events.jsonl'));
    // Not project-scoped
    expect(rs.getEventsPath()).not.toContain('project');
  });

  it('CP-5: end-to-end path sanity — daemon-global events and state both under daemonRuntimeDir', () => {
    const daemonRt = path.join(os.tmpdir(), 'daemon-rt-e2e');
    const resolver = new MockDaemonPathResolver(daemonRt);
    const mockWal = { readAllEvents: vi.fn().mockResolvedValue({ events: [] }) } as unknown as WAL;
    const mockSm = {
      rebuildState: vi.fn().mockResolvedValue({ projectPath: 'p', schemaVersion: '1.0', activeSessions: [], workItems: [], lastEventId: '', lastEventTs: 0 }),
      persistStateFromExternal: vi.fn().mockResolvedValue(undefined),
    } as unknown as StateManager;

    const rs = new RecoverySubsystem(resolver, 'irrelevant', mockWal, mockSm);

    const eventsPath = rs.getEventsPath();
    const statePath = rs.getStatePath();

    // Both should be children of daemonRt
    expect(eventsPath.startsWith(daemonRt)).toBe(true);
    expect(statePath.startsWith(daemonRt)).toBe(true);

    // Neither should be nested deeper than one level under daemonRt
    const eventsRelative = path.relative(daemonRt, eventsPath);
    const stateRelative = path.relative(daemonRt, statePath);
    expect(eventsRelative).toBe('events.jsonl');
    // state.json should be at root level too
    expect(stateRelative.split(path.sep).length).toBe(1);
  });
});
