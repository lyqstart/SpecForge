/**
 * Path Resolver interface and implementations
 *
 * Abstracts path calculation logic for daemon storage across personal and
 * enterprise modes.
 */
import * as path from 'path';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { SPEC_DIR_NAME, resolveProjectPath } from '@specforge/types/directory-layout';
import {
  resolveOpenCodeConfigRoot,
  resolveSpecForgeHandshakePath,
  resolveSpecForgeUserPath,
} from '@specforge/types/user-level-paths';

export { resolveOpenCodeConfigRoot } from '@specforge/types/user-level-paths';

/**
 * Critical system paths that must never be used as a projectPath.
 * Use a function (not a module-level Set) so tests can mutate if needed.
 */
function getCriticalSystemPaths(): Set<string> {
  return new Set([
    '/',
    'C:\\',
    '/root',
    '/home',
    '/Users',
    '/var',
    '/etc',
    '/tmp',
    '/opt',
  ]);
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown when projectPath is empty, resolves to a critical system path, or
 * is otherwise unsafe.
 */
export class InvalidProjectPath extends Error {
  constructor(projectPath: string, reason: string) {
    super(`Invalid project path "${projectPath}": ${reason}`);
    this.name = 'InvalidProjectPath';
  }
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IPathResolver {
  /** Project runtime data root directory */
  resolveProjectRuntimeDir(projectPath: string): string;
  /** state.json path for a project */
  resolveStatePath(projectPath: string): string;
  /** events.jsonl path for a project */
  resolveEventsPath(projectPath: string): string;
  /** Sessions directory for a project */
  resolveSessionsDir(projectPath: string): string;
  /** Daemon global runtime directory (same across all modes) */
  resolveDaemonRuntimeDir(): string;
  /** Handshake file path (same across all modes) */
  resolveHandshakePath(): string;
  /** daemon.json project manifest path (same across all modes) */
  resolveDaemonJsonPath(): string;
  /** Daemon state.json path (under daemon runtime dir) */
  resolveDaemonStatePath(): string;
  /** Daemon events.jsonl path (under daemon runtime dir) */
  resolveDaemonEventsPath(): string;
}

// ---------------------------------------------------------------------------
// Validation helpers (internal)
// ---------------------------------------------------------------------------

function validateProjectPath(projectPath: string): void {
  if (!projectPath || projectPath.trim() === '') {
    throw new InvalidProjectPath(projectPath, 'projectPath must not be empty');
  }

  const critical = getCriticalSystemPaths();
  if (critical.has(projectPath)) {
    throw new InvalidProjectPath(projectPath, 'projectPath must not be a critical system path');
  }

  const resolved = path.resolve(projectPath);
  if (critical.has(resolved)) {
    throw new InvalidProjectPath(projectPath, 'projectPath resolves to a critical system path');
  }

  const rootCheck = path.resolve('/');
  if (resolved === rootCheck) {
    throw new InvalidProjectPath(projectPath, 'projectPath resolves to filesystem root');
  }
}

// ---------------------------------------------------------------------------
// Hash helper
// ---------------------------------------------------------------------------

function legacyHashPath(projectPath: string): string {
  let hash = 0;
  for (let i = 0; i < projectPath.length; i++) {
    const char = projectPath.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function stableProjectKey(projectPath: string): string {
  const resolved = path.resolve(projectPath);
  const identity = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  return createHash('sha256').update(identity, 'utf8').digest('hex');
}

function legacyRuntimeExists(location: string): boolean {
  try {
    fs.statSync(location);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

/**
 * PersonalPathResolver
 *
 * Project data is stored inside the project directory:
 *   <projectPath>/.specforge/runtime/
 */
export class PersonalPathResolver implements IPathResolver {
  resolveProjectRuntimeDir(projectPath: string): string {
    validateProjectPath(projectPath);
    return resolveProjectPath(projectPath, 'runtime');
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
    return resolveSpecForgeUserPath('runtime');
  }

  resolveHandshakePath(): string {
    return resolveSpecForgeHandshakePath();
  }

  resolveDaemonJsonPath(): string {
    return path.join(resolveOpenCodeConfigRoot(), 'daemon.json');
  }

  /**
   * @deprecated Daemon-global state is no longer supported.
   * Use project-scoped resolveStatePath() instead.
   */
  resolveDaemonStatePath(): string {
    console.warn('[DEPRECATED] resolveDaemonStatePath() is deprecated. Use resolveStatePath(projectPath) instead.');
    return path.join(this.resolveDaemonRuntimeDir(), 'state.json');
  }

  /**
   * @deprecated Daemon-global events are no longer supported.
   * Use project-scoped resolveEventsPath() instead.
   */
  resolveDaemonEventsPath(): string {
    console.warn('[DEPRECATED] resolveDaemonEventsPath() is deprecated. Use resolveEventsPath(projectPath) instead.');
    return path.join(this.resolveDaemonRuntimeDir(), 'events.jsonl');
  }
}

/**
 * EnterprisePathResolver
 *
 * Project runtime data is centralized under:
 *   <OpenCode config>/sf-user/projects/<sha256 of resolved project identity>/
 *
 * User-home ~/.specforge is legacy read-only and is never a current write target.
 */
export class EnterprisePathResolver implements IPathResolver {
  constructor(private readonly hasLegacyRuntime: (location: string) => boolean = legacyRuntimeExists) {}

  resolveProjectRuntimeDir(projectPath: string): string {
    validateProjectPath(projectPath);
    // The old 32-bit key is not a project identity: distinct paths can share
    // its WAL. Never silently open a fresh state while old evidence exists.
    const legacyDir = resolveSpecForgeUserPath('projects', legacyHashPath(projectPath));
    if (this.hasLegacyRuntime(legacyDir)) {
      throw new InvalidProjectPath(
        projectPath,
        `legacy enterprise runtime exists at ${legacyDir}; ownership cannot be verified for automatic migration`,
      );
    }
    return resolveSpecForgeUserPath('projects', stableProjectKey(projectPath));
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
    return resolveSpecForgeUserPath('runtime');
  }

  resolveHandshakePath(): string {
    return resolveSpecForgeHandshakePath();
  }

  resolveDaemonJsonPath(): string {
    return path.join(resolveOpenCodeConfigRoot(), 'daemon.json');
  }

  /**
   * @deprecated Daemon-global state is no longer supported.
   * Use project-scoped resolveStatePath() instead.
   */
  resolveDaemonStatePath(): string {
    console.warn('[DEPRECATED] resolveDaemonStatePath() is deprecated. Use resolveStatePath(projectPath) instead.');
    return path.join(this.resolveDaemonRuntimeDir(), 'state.json');
  }

  /**
   * @deprecated Daemon-global events are no longer supported.
   * Use project-scoped resolveEventsPath() instead.
   */
  resolveDaemonEventsPath(): string {
    console.warn('[DEPRECATED] resolveDaemonEventsPath() is deprecated. Use resolveEventsPath(projectPath) instead.');
    return path.join(this.resolveDaemonRuntimeDir(), 'events.jsonl');
  }
}
