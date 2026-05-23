/**
 * Unit tests for runMigrateManifestCommand (Task 13.2).
 *
 * Covers Requirement 12 acceptance criteria:
 *
 *   - R12.2: already-current manifest → byte-identical no-op + exit 0
 *   - R12.3: legacy manifest → backup `.legacy.bak` + new format with
 *            `format: "CURRENT"` + exit 0
 *   - R12.4: failure (e.g., missing manifest, invalid JSON) → active file
 *            unchanged, append `<manifest-dir>/migrate-error.log` with the
 *            first entry carrying `schema_version: "1.0"`, exit ≠ 0
 *   - R12.5: idempotence — repeated invocations after a successful conversion
 *            produce no further byte changes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  runMigrateManifestCommand,
  type MigrateManifestResult,
} from '../../src/legacy/migrate-manifest-command.js';

describe('runMigrateManifestCommand (Task 13.2 / R12)', () => {
  let tempDir: string;
  let manifestPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'migrate-cmd-'));
    manifestPath = path.join(tempDir, 'manifest.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
      /* best-effort cleanup */
    });
  });

  // ---------------------------------------------------------------------------
  // R12.2 — no-op path
  // ---------------------------------------------------------------------------

  it('R12.2: leaves an already-current manifest byte-identical and exits 0', async () => {
    // A manifest with only allowed user-manifest fields → not legacy.
    const currentFormat = {
      format: 'CURRENT',
      code_version: '6.0.0',
      min_supported_data_schema: 0,
      installed_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      files: [],
    };
    const original = JSON.stringify(currentFormat, null, 2);
    await fs.writeFile(manifestPath, original, 'utf-8');

    const before = await fs.readFile(manifestPath);

    const result: MigrateManifestResult = await runMigrateManifestCommand([
      '--manifest-path',
      manifestPath,
    ]);

    expect(result.exitCode).toBe(0);

    const after = await fs.readFile(manifestPath);
    expect(after.equals(before)).toBe(true);

    // No backup, no error log should be created on the no-op path.
    await expect(fs.access(`${manifestPath}.legacy.bak`)).rejects.toThrow();
    await expect(fs.access(path.join(tempDir, 'migrate-error.log'))).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // R12.3 — legacy → conversion path
  // ---------------------------------------------------------------------------

  it('R12.3: converts a legacy manifest, creates .legacy.bak, injects format:"CURRENT", exits 0', async () => {
    const legacy = {
      // Legacy markers (any one is enough to flip isLegacy → true)
      shared_version: '5.9.0',
      required_shared_version_range: '>=5.0.0 <6.0.0',
      schema_version: '0.9',
      runtime_schema_version: '0.9',
      // Plus some allowed fields to be carried forward
      code_version: '5.9.0',
      min_supported_data_schema: 0,
      installed_at: '2023-12-01T00:00:00Z',
      updated_at: '2023-12-01T00:00:00Z',
      files: [],
    };
    const originalContent = JSON.stringify(legacy, null, 2);
    const originalBytes = Buffer.from(originalContent, 'utf-8');
    await fs.writeFile(manifestPath, originalBytes);

    const result = await runMigrateManifestCommand([
      '--manifest-path',
      manifestPath,
    ]);

    expect(result.exitCode).toBe(0);

    // Backup must exist and be byte-identical to the pre-migration content.
    const backupPath = `${manifestPath}.legacy.bak`;
    const backupBytes = await fs.readFile(backupPath);
    expect(backupBytes.equals(originalBytes)).toBe(true);

    // Active manifest must have been rewritten to the new format.
    const newContent = await fs.readFile(manifestPath, 'utf-8');
    const newJson = JSON.parse(newContent);

    // R12.3: format meta field set to the constant "CURRENT".
    expect(newJson.format).toBe('CURRENT');

    // Allowed fields carried forward.
    expect(newJson.code_version).toBe('5.9.0');
    expect(newJson.min_supported_data_schema).toBe(0);
    expect(newJson.installed_at).toBe('2023-12-01T00:00:00Z');
    expect(newJson.updated_at).toBe('2023-12-01T00:00:00Z');
    expect(newJson.files).toEqual([]);

    // Legacy fields stripped.
    expect(newJson).not.toHaveProperty('shared_version');
    expect(newJson).not.toHaveProperty('required_shared_version_range');
    expect(newJson).not.toHaveProperty('schema_version');
    expect(newJson).not.toHaveProperty('runtime_schema_version');
  });

  // ---------------------------------------------------------------------------
  // R12.4 — failure path: missing manifest
  // ---------------------------------------------------------------------------

  it('R12.4: when manifest is missing, leaves nothing on disk, appends migrate-error.log with schema_version header, exits non-zero', async () => {
    // No manifest written; tempDir is empty.
    const result = await runMigrateManifestCommand([
      '--manifest-path',
      manifestPath,
    ]);

    expect(result.exitCode).not.toBe(0);

    // Error log must have been created in the manifest dir, with the first
    // line carrying the schema_version header per R12.4.
    const logPath = path.join(tempDir, 'migrate-error.log');
    const logContent = await fs.readFile(logPath, 'utf-8');
    const lines = logContent.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const firstEntry = JSON.parse(lines[0]);
    expect(firstEntry.schema_version).toBe('1.0');
    expect(firstEntry.stage).toBe('read');
    expect(firstEntry.manifest_path).toBe(manifestPath);
    expect(typeof firstEntry.err).toBe('string');
    expect(firstEntry.err.length).toBeGreaterThan(0);

    // Active manifest must remain absent (we did not accidentally create it).
    await expect(fs.access(manifestPath)).rejects.toThrow();
    // No backup leaked either.
    await expect(fs.access(`${manifestPath}.legacy.bak`)).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // R12.4 — failure path: invalid JSON keeps active manifest byte-identical
  // ---------------------------------------------------------------------------

  it('R12.4: invalid JSON leaves active manifest byte-identical and writes header entry to migrate-error.log', async () => {
    const garbage = '{ this is not valid json ';
    await fs.writeFile(manifestPath, garbage, 'utf-8');

    const before = await fs.readFile(manifestPath);

    const result = await runMigrateManifestCommand([
      '--manifest-path',
      manifestPath,
    ]);

    expect(result.exitCode).not.toBe(0);

    // Active file unchanged (R12.4 byte-identical guarantee).
    const after = await fs.readFile(manifestPath);
    expect(after.equals(before)).toBe(true);

    // No backup created on a parse failure (we only back up on the legacy path).
    await expect(fs.access(`${manifestPath}.legacy.bak`)).rejects.toThrow();

    // Error log present with header entry.
    const logPath = path.join(tempDir, 'migrate-error.log');
    const logContent = await fs.readFile(logPath, 'utf-8');
    const lines = logContent.trim().split('\n');
    const firstEntry = JSON.parse(lines[0]);
    expect(firstEntry.schema_version).toBe('1.0');
    expect(firstEntry.stage).toBe('parse');
  });

  // ---------------------------------------------------------------------------
  // R12.5 — idempotence
  // ---------------------------------------------------------------------------

  it('R12.5: repeated invocations after a successful conversion are byte-identical no-ops', async () => {
    const legacy = {
      shared_version: '5.9.0',
      code_version: '5.9.0',
      min_supported_data_schema: 0,
      installed_at: '2023-12-01T00:00:00Z',
      updated_at: '2023-12-01T00:00:00Z',
      files: [],
    };
    await fs.writeFile(manifestPath, JSON.stringify(legacy, null, 2), 'utf-8');

    // First invocation: legacy → conversion.
    const r1 = await runMigrateManifestCommand([
      '--manifest-path',
      manifestPath,
    ]);
    expect(r1.exitCode).toBe(0);

    const afterFirstRun = await fs.readFile(manifestPath);

    // Second invocation: must be byte-identical no-op.
    const r2 = await runMigrateManifestCommand([
      '--manifest-path',
      manifestPath,
    ]);
    expect(r2.exitCode).toBe(0);
    const afterSecondRun = await fs.readFile(manifestPath);
    expect(afterSecondRun.equals(afterFirstRun)).toBe(true);

    // Third invocation: still byte-identical.
    const r3 = await runMigrateManifestCommand([
      '--manifest-path',
      manifestPath,
    ]);
    expect(r3.exitCode).toBe(0);
    const afterThirdRun = await fs.readFile(manifestPath);
    expect(afterThirdRun.equals(afterFirstRun)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // R12.1 — --help still prints help and exits 0 (sanity)
  // ---------------------------------------------------------------------------

  it('R12.1: --help exits 0 without touching the filesystem', async () => {
    const result = await runMigrateManifestCommand(['--help']);
    expect(result.exitCode).toBe(0);
    // Manifest path was not provided and no I/O should have happened on tempDir.
    const entries = await fs.readdir(tempDir);
    expect(entries).toEqual([]);
  });
});
