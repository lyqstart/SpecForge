/**
 * directory-layout.test.ts — Architecture tests for SpecForge V6 directory layout
 *
 * Validates the schema constants, path construction functions, schema completeness,
 * _meta.json files, and actual directory structure against the canonical definitions
 * in packages/types/src/directory-layout.ts and meta-schema.ts.
 *
 * WI-012 Task T2: Architecture Test
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SPEC_DIR_NAME,
  SPEC_USER_DIR_NAME,
  LAYOUT,
  USER_LAYOUT,
  resolveProjectPath,
  specPath,
  agentRunArchivePath,
  resolveUserPath,
  type LayoutKey,
  type UserLayoutKey,
} from '../../packages/types/src/directory-layout';
import {
  WORKFLOW_TYPES,
  STAGE_TYPES,
  WorkItemMetaSchema,
} from '../../packages/types/src/meta-schema';

// ---------------------------------------------------------------------------
// Helper: cross-platform path comparison
// ---------------------------------------------------------------------------

/** Normalize a path for cross-platform comparison (handles \ vs /) */
function np(p: string): string {
  return path.normalize(p);
}

// ---------------------------------------------------------------------------
// Suite 1: LAYOUT Schema constant validation
// ---------------------------------------------------------------------------

describe('Suite 1: LAYOUT Schema constants', () => {
  it('SPEC_DIR_NAME should equal ".specforge"', () => {
    expect(SPEC_DIR_NAME).toBe('.specforge');
  });

  it('SPEC_USER_DIR_NAME should equal ".specforge"', () => {
    expect(SPEC_USER_DIR_NAME).toBe('.specforge');
  });

  it('all LAYOUT top-level values (except configFiles) should be strings', () => {
    for (const [key, value] of Object.entries(LAYOUT)) {
      if (key === 'configFiles') continue;
      expect(typeof value, `LAYOUT.${key} should be a string`).toBe('string');
    }
  });

  it('all LAYOUT.configFiles nested values should be strings', () => {
    const configFiles = LAYOUT.configFiles as Record<string, string>;
    for (const [key, value] of Object.entries(configFiles)) {
      expect(typeof value, `LAYOUT.configFiles.${key} should be a string`).toBe('string');
    }
  });

  it('all USER_LAYOUT values should be strings', () => {
    for (const [key, value] of Object.entries(USER_LAYOUT)) {
      expect(typeof value, `USER_LAYOUT.${key} should be a string`).toBe('string');
    }
  });

  it('LAYOUT path values should not start with "/" (relative paths)', () => {
    for (const [key, value] of Object.entries(LAYOUT)) {
      if (key === 'configFiles') continue;
      const v = value as string;
      expect(v.startsWith('/'), `LAYOUT.${key}="${v}" should not start with /`).toBe(false);
    }
  });

  it('LAYOUT.configFiles path values should not start with "/" (relative paths)', () => {
    const configFiles = LAYOUT.configFiles as Record<string, string>;
    for (const [key, value] of Object.entries(configFiles)) {
      expect(value.startsWith('/'), `LAYOUT.configFiles.${key}="${value}" should not start with /`).toBe(false);
    }
  });

  it('USER_LAYOUT path values should not start with "/" (relative paths)', () => {
    for (const [key, value] of Object.entries(USER_LAYOUT)) {
      const v = value as string;
      expect(v.startsWith('/'), `USER_LAYOUT.${key}="${v}" should not start with /`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Path construction function validation
// ---------------------------------------------------------------------------

describe('Suite 2: Path construction functions', () => {
  it('resolveProjectPath("/proj", "runtime") returns correct path', () => {
    const result = resolveProjectPath('/proj', 'runtime');
    expect(np(result)).toBe(np('/proj/.specforge/runtime'));
  });

  it('resolveProjectPath("/proj", "specs", "WI-001", "design.md") returns correct path', () => {
    const result = resolveProjectPath('/proj', 'specs', 'WI-001', 'design.md');
    expect(np(result)).toBe(np('/proj/.specforge/specs/WI-001/design.md'));
  });

  it('specPath("/proj", "WI-001", "design.md") returns correct path', () => {
    const result = specPath('/proj', 'WI-001', 'design.md');
    expect(np(result)).toBe(np('/proj/.specforge/specs/WI-001/design.md'));
  });

  it('agentRunArchivePath("/proj", "WI-001", "sf-design", 1) returns correct path', () => {
    const result = agentRunArchivePath('/proj', 'WI-001', 'sf-design', 1);
    expect(np(result)).toBe(np('/proj/.specforge/archive/agent_runs/WI-001-sf-design-1'));
  });

  it('resolveUserPath("hostProfile") returns path containing .specforge and host-profile.json', () => {
    const result = resolveUserPath('hostProfile');
    expect(result).toContain('.specforge');
    expect(result).toContain('host-profile.json');
  });

  it('resolveUserPath("projects", "hash123") returns correct path', () => {
    const result = resolveUserPath('projects', 'hash123');
    expect(result).toContain('.specforge');
    expect(result).toContain('projects');
    expect(result).toContain('hash123');
    expect(np(result)).toBe(
      np(path.join(require('node:os').homedir(), '.specforge', 'projects', 'hash123')),
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Schema completeness validation
// ---------------------------------------------------------------------------

describe('Suite 3: Schema completeness', () => {
  const COMMITTED_KEYS: LayoutKey[] = [
    'manifest',
    'config',
    'specs',
    'specsReadme',
    'knowledge',
    'knowledgeGraph',
  ];

  const GITIGNORED_KEYS: LayoutKey[] = [
    'runtime',
    'runtimeWal',
    'runtimeState',
    'runtimeCheckpoints',
    'logs',
    'logsTelemetry',
    'logsTrace',
    'logsToolCalls',
    'logsCost',
    'logsConversations',
    'archive',
    'archiveAgentRuns',
    'sessions',
    'cas',
  ];

  const USER_LAYOUT_KEYS: UserLayoutKey[] = [
    'runtime',
    'runtimeHandshake',
    'runtimeState',
    'runtimeEvents',
    'runtimeDaemonLock',
    'hostProfile',
    'logs',
    'projects',
    'templates',
    'backups',
  ];

  it('LAYOUT contains all committed-zone keys', () => {
    for (const key of COMMITTED_KEYS) {
      expect(LAYOUT).toHaveProperty(key);
    }
  });

  it('LAYOUT contains all gitignored-zone keys', () => {
    for (const key of GITIGNORED_KEYS) {
      expect(LAYOUT).toHaveProperty(key);
    }
  });

  it('LAYOUT committed + gitignored keys cover all string-valued entries', () => {
    const allExpected = new Set<string>([...COMMITTED_KEYS, ...GITIGNORED_KEYS, 'configFiles']);
    const actualKeys = Object.keys(LAYOUT);
    for (const key of actualKeys) {
      expect(allExpected.has(key), `Unexpected LAYOUT key: ${key}`).toBe(true);
    }
  });

  it('USER_LAYOUT contains all expected keys', () => {
    for (const key of USER_LAYOUT_KEYS) {
      expect(USER_LAYOUT).toHaveProperty(key);
    }
  });

  it('USER_LAYOUT keys exactly match expected set', () => {
    const actualKeys = new Set(Object.keys(USER_LAYOUT));
    const expectedKeys = new Set(USER_LAYOUT_KEYS as readonly string[]);
    expect(actualKeys).toEqual(expectedKeys);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: _meta.json Schema validation
// ---------------------------------------------------------------------------

describe('Suite 4: _meta.json Schema validation', () => {
  const specsDir = path.resolve(__dirname, '../../.specforge/specs');

  let metaFiles: string[] = [];

  it('should discover _meta.json files in specs directory', () => {
    // Only run if specs directory exists
    if (!fs.existsSync(specsDir)) {
      return;
    }
    const entries = fs.readdirSync(specsDir, { withFileTypes: true });
    const wiDirs = entries.filter(e => e.isDirectory() && /^WI-\d+$/.test(e.name));

    for (const dir of wiDirs) {
      const metaPath = path.join(specsDir, dir.name, '_meta.json');
      if (fs.existsSync(metaPath)) {
        metaFiles.push(metaPath);
      }
    }

    // If we have specs directories, at least some should have _meta.json
    if (wiDirs.length > 0) {
      expect(metaFiles.length, 'Expected at least one _meta.json file').toBeGreaterThan(0);
    }
  });

  it('each _meta.json should parse with WorkItemMetaSchema.safeParse', () => {
    for (const metaPath of metaFiles) {
      const content = fs.readFileSync(metaPath, 'utf-8');
      const json = JSON.parse(content);
      const result = WorkItemMetaSchema.safeParse(json);
      expect(
        result.success,
        `${metaPath}: validation failed — ${result.success ? '' : result.error.errors.map(e => e.message).join(', ')}`,
      ).toBe(true);
    }
  });

  it('each _meta.json workflow_type should be in WORKFLOW_TYPES', () => {
    const validWorkflowTypes = new Set<string>(WORKFLOW_TYPES as readonly string[]);
    for (const metaPath of metaFiles) {
      const content = fs.readFileSync(metaPath, 'utf-8');
      const json = JSON.parse(content);
      expect(
        validWorkflowTypes.has(json.workflow_type),
        `${metaPath}: workflow_type="${json.workflow_type}" is not in WORKFLOW_TYPES`,
      ).toBe(true);
    }
  });

  it('each _meta.json current_stage should be in STAGE_TYPES', () => {
    const validStageTypes = new Set<string>(STAGE_TYPES as readonly string[]);
    for (const metaPath of metaFiles) {
      const content = fs.readFileSync(metaPath, 'utf-8');
      const json = JSON.parse(content);
      expect(
        validStageTypes.has(json.current_stage),
        `${metaPath}: current_stage="${json.current_stage}" is not in STAGE_TYPES`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Directory structure existence validation
// ---------------------------------------------------------------------------

describe('Suite 5: Directory structure existence', () => {
  const specforgeDir = path.resolve(__dirname, '../../.specforge');

  it('.specforge/ directory should exist', () => {
    expect(fs.existsSync(specforgeDir)).toBe(true);
    expect(fs.statSync(specforgeDir).isDirectory()).toBe(true);
  });

  it('.specforge/manifest.json should exist', () => {
    const manifestPath = path.join(specforgeDir, 'manifest.json');
    expect(fs.existsSync(manifestPath), `${manifestPath} should exist`).toBe(true);
  });

  it('.specforge/specs/ directory should exist', () => {
    const specsDir = path.join(specforgeDir, 'specs');
    expect(fs.existsSync(specsDir), `${specsDir} should exist`).toBe(true);
    expect(fs.statSync(specsDir).isDirectory()).toBe(true);
  });

  it('.specforge/config/ directory should exist (declared in LAYOUT)', () => {
    const configDir = path.join(specforgeDir, 'config');
    expect(fs.existsSync(configDir), `${configDir} should exist`).toBe(true);
    expect(fs.statSync(configDir).isDirectory()).toBe(true);
  });

  // Validate committed-zone subdirectories declared in LAYOUT
  const committedEntries: LayoutKey[] = [
    'manifest',
    'config',
    'specs',
    'knowledge',
  ];

  it('LAYOUT declared committed-zone entries should exist as files or directories', () => {
    for (const key of committedEntries) {
      const value = LAYOUT[key];
      // configFiles is an object, skip it
      if (typeof value !== 'string') continue;
      const fullPath = path.join(specforgeDir, value);
      expect(
        fs.existsSync(fullPath),
        `LAYOUT.${key}: ${fullPath} should exist`,
      ).toBe(true);
    }
  });
});
