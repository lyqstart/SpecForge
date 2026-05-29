/**
 * Path Resolver unit tests
 *
 * Covers IPathResolver, PersonalPathResolver, EnterprisePathResolver, and
 * the InvalidProjectPath validation guard.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import {
  IPathResolver,
  PersonalPathResolver,
  EnterprisePathResolver,
  InvalidProjectPath,
} from '../../src/daemon/path-resolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleProject = path.join('home', 'user', 'my-project');

// ---------------------------------------------------------------------------
// IPathResolver contract
// ---------------------------------------------------------------------------
describe('IPathResolver', () => {
  function assertContract(resolver: IPathResolver): void {
    const dp = resolver.resolveProjectRuntimeDir(sampleProject);
    expect(typeof dp).toBe('string');
    expect(dp.length).toBeGreaterThan(0);

    const sp = resolver.resolveStatePath(sampleProject);
    expect(sp).toContain('state.json');
    expect(sp.startsWith(dp)).toBe(true);

    const ep = resolver.resolveEventsPath(sampleProject);
    expect(ep).toContain('events.jsonl');
    expect(ep.startsWith(dp)).toBe(true);

    const sd = resolver.resolveSessionsDir(sampleProject);
    expect(sd).toContain('sessions');
    expect(sd.startsWith(dp)).toBe(true);

    const dr = resolver.resolveDaemonRuntimeDir();
    expect(dr).toContain('.specforge');
    expect(dr).toContain('runtime');

    const hp = resolver.resolveHandshakePath();
    expect(hp).toContain('handshake.json');
    expect(hp.startsWith(dr)).toBe(true);

    const dj = resolver.resolveDaemonJsonPath();
    expect(dj).toContain('daemon.json');
  }

  it('PersonalPathResolver satisfies the contract', () => {
    assertContract(new PersonalPathResolver());
  });

  it('EnterprisePathResolver satisfies the contract', () => {
    assertContract(new EnterprisePathResolver());
  });
});

// ---------------------------------------------------------------------------
// PersonalPathResolver
// ---------------------------------------------------------------------------
describe('PersonalPathResolver', () => {
  const resolver = new PersonalPathResolver();

  describe('resolveProjectRuntimeDir', () => {
    it('returns a path under the project directory', () => {
      const dir = resolver.resolveProjectRuntimeDir(sampleProject);
      expect(dir).toContain('.specforge');
      expect(dir).toContain('runtime');
      expect(dir.startsWith(sampleProject)).toBe(true);
    });

    it('uses path.join for cross-platform separators', () => {
      const dir = resolver.resolveProjectRuntimeDir(sampleProject);
      const expected = path.join(sampleProject, '.specforge', 'runtime');
      expect(dir).toBe(expected);
    });
  });

  describe('resolveStatePath', () => {
    it('ends with state.json inside the runtime dir', () => {
      const p = resolver.resolveStatePath(sampleProject);
      expect(p).toBe(
        path.join(sampleProject, '.specforge', 'runtime', 'state.json'),
      );
    });
  });

  describe('resolveEventsPath', () => {
    it('ends with events.jsonl inside the runtime dir', () => {
      const p = resolver.resolveEventsPath(sampleProject);
      expect(p).toBe(
        path.join(sampleProject, '.specforge', 'runtime', 'events.jsonl'),
      );
    });
  });

  describe('resolveSessionsDir', () => {
    it('ends with sessions inside the runtime dir', () => {
      const p = resolver.resolveSessionsDir(sampleProject);
      expect(p).toBe(
        path.join(sampleProject, '.specforge', 'runtime', 'sessions'),
      );
    });
  });

  describe('resolveDaemonRuntimeDir', () => {
    it('returns ~/.specforge/runtime', () => {
      const dir = resolver.resolveDaemonRuntimeDir();
      const expected = path.join(os.homedir(), '.specforge', 'runtime');
      expect(dir).toBe(expected);
    });
  });

  describe('resolveHandshakePath', () => {
    it('returns handshake.json inside the daemon runtime dir', () => {
      const p = resolver.resolveHandshakePath();
      const expected = path.join(os.homedir(), '.specforge', 'runtime', 'handshake.json');
      expect(p).toBe(expected);
    });
  });

  describe('resolveDaemonJsonPath', () => {
    it('returns ~/.config/opencode/daemon.json', () => {
      const p = resolver.resolveDaemonJsonPath();
      const expected = path.join(os.homedir(), '.config', 'opencode', 'daemon.json');
      expect(p).toBe(expected);
    });
  });
});

// ---------------------------------------------------------------------------
// EnterprisePathResolver
// ---------------------------------------------------------------------------
describe('EnterprisePathResolver', () => {
  const resolver = new EnterprisePathResolver();

  describe('resolveProjectRuntimeDir', () => {
    it('returns a path under ~/.specforge/projects/<hash>', () => {
      const dir = resolver.resolveProjectRuntimeDir(sampleProject);
      expect(dir).toContain('.specforge');
      expect(dir).toContain('projects');
      expect(dir.startsWith(os.homedir())).toBe(true);
    });

    it('produces a hash that differs across project paths', () => {
      const a = resolver.resolveProjectRuntimeDir('/home/user/project-a');
      const b = resolver.resolveProjectRuntimeDir('/home/user/project-b');
      expect(a).not.toBe(b);
    });

    it('produces the same hash for the same project path (deterministic)', () => {
      const a = resolver.resolveProjectRuntimeDir(sampleProject);
      const b = resolver.resolveProjectRuntimeDir(sampleProject);
      expect(a).toBe(b);
    });
  });

  describe('resolveStatePath', () => {
    it('ends with state.json inside the project runtime dir', () => {
      const runtime = resolver.resolveProjectRuntimeDir(sampleProject);
      const p = resolver.resolveStatePath(sampleProject);
      expect(p).toBe(path.join(runtime, 'state.json'));
    });
  });

  describe('resolveEventsPath', () => {
    it('ends with events.jsonl inside the project runtime dir', () => {
      const runtime = resolver.resolveProjectRuntimeDir(sampleProject);
      const p = resolver.resolveEventsPath(sampleProject);
      expect(p).toBe(path.join(runtime, 'events.jsonl'));
    });
  });

  describe('resolveSessionsDir', () => {
    it('ends with sessions inside the project runtime dir', () => {
      const runtime = resolver.resolveProjectRuntimeDir(sampleProject);
      const p = resolver.resolveSessionsDir(sampleProject);
      expect(p).toBe(path.join(runtime, 'sessions'));
    });
  });

  describe('resolveDaemonRuntimeDir', () => {
    it('returns ~/.specforge/runtime (same as personal)', () => {
      const dir = resolver.resolveDaemonRuntimeDir();
      const expected = path.join(os.homedir(), '.specforge', 'runtime');
      expect(dir).toBe(expected);
    });
  });

  describe('resolveHandshakePath', () => {
    it('returns handshake.json inside the daemon runtime dir (same as personal)', () => {
      const p = resolver.resolveHandshakePath();
      const expected = path.join(os.homedir(), '.specforge', 'runtime', 'handshake.json');
      expect(p).toBe(expected);
    });
  });

  describe('resolveDaemonJsonPath', () => {
    it('returns ~/.config/opencode/daemon.json (same as personal)', () => {
      const p = resolver.resolveDaemonJsonPath();
      const expected = path.join(os.homedir(), '.config', 'opencode', 'daemon.json');
      expect(p).toBe(expected);
    });
  });
});

// ---------------------------------------------------------------------------
// Shared daemon-global path symmetry
// ---------------------------------------------------------------------------
describe('Path resolver symmetry', () => {
  it('both resolvers return the same daemon runtime dir', () => {
    const personal = new PersonalPathResolver();
    const enterprise = new EnterprisePathResolver();
    expect(personal.resolveDaemonRuntimeDir()).toBe(enterprise.resolveDaemonRuntimeDir());
  });

  it('both resolvers return the same handshake path', () => {
    const personal = new PersonalPathResolver();
    const enterprise = new EnterprisePathResolver();
    expect(personal.resolveHandshakePath()).toBe(enterprise.resolveHandshakePath());
  });

  it('both resolvers return the same daemon.json path', () => {
    const personal = new PersonalPathResolver();
    const enterprise = new EnterprisePathResolver();
    expect(personal.resolveDaemonJsonPath()).toBe(enterprise.resolveDaemonJsonPath());
  });
});

// ---------------------------------------------------------------------------
// Validation: invalid projectPath
// ---------------------------------------------------------------------------
describe('InvalidProjectPath validation', () => {
  function allProjectMethods(resolver: IPathResolver, p: string): void {
    resolver.resolveProjectRuntimeDir(p);
    resolver.resolveStatePath(p);
    resolver.resolveEventsPath(p);
    resolver.resolveSessionsDir(p);
  }

  describe('empty or blank path', () => {
    it.each([
      ['', 'empty string'],
      ['   ', 'whitespace-only'],
    ])('PersonalPathResolver rejects %s (%s)', (projectPath) => {
      expect(() => new PersonalPathResolver().resolveProjectRuntimeDir(projectPath)).toThrow(
        InvalidProjectPath,
      );
    });

    it.each([
      ['', 'empty string'],
      ['   ', 'whitespace-only'],
    ])('EnterprisePathResolver rejects %s (%s)', (projectPath) => {
      expect(() => new EnterprisePathResolver().resolveProjectRuntimeDir(projectPath)).toThrow(
        InvalidProjectPath,
      );
    });
  });

  describe('critical system paths', () => {
    it('PersonalPathResolver rejects "/"', () => {
      expect(() => allProjectMethods(new PersonalPathResolver(), '/')).toThrow(
        InvalidProjectPath,
      );
    });

    it('EnterprisePathResolver rejects "/"', () => {
      expect(() => allProjectMethods(new EnterprisePathResolver(), '/')).toThrow(
        InvalidProjectPath,
      );
    });

    it('PersonalPathResolver rejects "C:\\"', () => {
      expect(() => allProjectMethods(new PersonalPathResolver(), 'C:\\')).toThrow(
        InvalidProjectPath,
      );
    });

    it('EnterprisePathResolver rejects "C:\\"', () => {
      expect(() => allProjectMethods(new EnterprisePathResolver(), 'C:\\')).toThrow(
        InvalidProjectPath,
      );
    });
  });

  describe('error message includes the rejected path', () => {
    it('mentions the path in the message', () => {
      try {
        new PersonalPathResolver().resolveProjectRuntimeDir('');
      } catch (e) {
        expect((e as InvalidProjectPath).message).toContain('""');
      }
    });
  });

  describe('all project-scoped methods validate', () => {
    it.each([
      'resolveStatePath',
      'resolveEventsPath',
      'resolveSessionsDir',
    ] as const)('%s throws on empty path (PersonalPathResolver)', (method) => {
      const resolver = new PersonalPathResolver();
      expect(() => resolver[method]('')).toThrow(InvalidProjectPath);
    });

    it.each([
      'resolveStatePath',
      'resolveEventsPath',
      'resolveSessionsDir',
    ] as const)('%s throws on empty path (EnterprisePathResolver)', (method) => {
      const resolver = new EnterprisePathResolver();
      expect(() => resolver[method]('')).toThrow(InvalidProjectPath);
    });
  });
});

// ---------------------------------------------------------------------------
// Enterprise path hash is backward-compatible
// ---------------------------------------------------------------------------
describe('EnterprisePathResolver hash stability', () => {
  it('matches the legacy hash algorithm used in WAL/StateManager', () => {
    // Legacy algorithm (from WAL.hashPath):
    function legacyHash(p: string): string {
      let hash = 0;
      for (let i = 0; i < p.length; i++) {
        const char = p.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16).padStart(8, '0');
    }

    const resolver = new EnterprisePathResolver();
    const testPaths = [
      '/home/user/project-a',
      'C:\\Users\\user\\project-b',
      '/opt/app',
    ];

    for (const tp of testPaths) {
      const dir = resolver.resolveProjectRuntimeDir(tp);
      const expected = path.join(os.homedir(), '.specforge', 'projects', legacyHash(tp));
      expect(dir).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-platform path separators
// ---------------------------------------------------------------------------
describe('Cross-platform path handling', () => {
  it('uses path.join (not string concatenation) in PersonalPathResolver', () => {
    const resolver = new PersonalPathResolver();
    const p = resolver.resolveStatePath(sampleProject);
    expect(p).not.toContain('//');
    expect(p).not.toContain('\\\\');
  });

  it('uses path.join (not string concatenation) in EnterprisePathResolver', () => {
    const resolver = new EnterprisePathResolver();
    const p = resolver.resolveStatePath(sampleProject);
    expect(p).not.toContain('//');
    expect(p).not.toContain('\\\\');
  });

  it('handles Windows-style project paths on any platform', () => {
    const winPath = 'C:\\Users\\dev\\my-app';
    const resolver = new PersonalPathResolver();
    const dir = resolver.resolveProjectRuntimeDir(winPath);
    expect(dir.length).toBeGreaterThan(0);
    // path.join preserves the original separator style
    expect(dir.startsWith(winPath)).toBe(true);
  });
});
