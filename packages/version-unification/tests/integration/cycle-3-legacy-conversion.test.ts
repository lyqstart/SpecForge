/**
 * Integration test: Cycle-3 legacy manifest in-place conversion.
 *
 * Validates: Requirements 11.4, 11.5
 *
 * This test:
 * 1. Creates a temporary directory as test workspace
 * 2. Creates a legacy User_Manifest (without `format` field, with legacy fields)
 * 3. Calls runMigrateManifestCommand to simulate startup migration
 * 4. Verifies:
 *    - `.legacy.bak` backup file exists with original legacy content
 *    - New active manifest has `format: "CURRENT"`
 *    - Legacy fields are removed from the new manifest
 *    - Command exits with code 0
 *
 * @see requirements.md §Requirement 11.4 (Cycle-3: in-place conversion)
 * @see requirements.md §Requirement 11.5 (preserve original as .legacy.bak)
 * @see design.md §"Cycle-3: In-place conversion"
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runMigrateManifestCommand } from '../../src/legacy/migrate-manifest-command';

// =============================================================================
// Test Data
// =============================================================================

/**
 * Legacy User_Manifest format (pre-migration).
 * Contains fields that should be stripped during conversion.
 */
const LEGACY_USER_MANIFEST = {
  shared_version: '6.0.0-dev',
  required_shared_version_range: '>=3.5.0 <7.0.0',
  code_version: '6.0.0-dev',
  min_supported_data_schema: 1,
  installed_at: '2024-01-15T10:30:00.000Z',
  updated_at: '2024-01-15T10:30:00.000Z',
  files: [
    '.opencode/agents/sf-orchestrator.md',
    '.opencode/tools/sf_state_read.ts',
  ],
};

/**
 * Expected fields in the migrated (current format) User_Manifest.
 */
const CURRENT_USER_MANIFEST_EXPECTED_FIELDS = [
  'format',
  'min_supported_data_schema',
  'installed_at',
  'updated_at',
  'files',
];

// =============================================================================
// Test Suite
// =============================================================================

describe('Integration: Cycle-3 legacy manifest in-place conversion', () => {
  let tempDir: string;
  let manifestPath: string;
  let backupPath: string;

  beforeEach(async () => {
    // Create temp workspace
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cycle3-legacy-'));
    manifestPath = path.join(tempDir, 'manifest.json');
    backupPath = `${manifestPath}.legacy.bak`;

    // Write legacy manifest to disk
    await fs.writeFile(manifestPath, JSON.stringify(LEGACY_USER_MANIFEST, null, 2) + '\n', 'utf-8');
  });

  afterEach(async () => {
    // Clean up temp workspace
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should convert legacy manifest in-place and create backup', async () => {
    // ---------------------------------------------------------------------
    // Step 1: Verify pre-conditions
    // ---------------------------------------------------------------------
    const preManifestContent = await fs.readFile(manifestPath, 'utf-8');
    const preManifest = JSON.parse(preManifestContent);

    // Should NOT have `format` field (indicates legacy)
    expect(preManifest).not.toHaveProperty('format');
    // Should have legacy fields
    expect(preManifest).toHaveProperty('shared_version');
    expect(preManifest).toHaveProperty('required_shared_version_range');

    // ---------------------------------------------------------------------
    // Step 2: Run migration command
    // ---------------------------------------------------------------------
    const result = await runMigrateManifestCommand(['--manifest-path', manifestPath]);

    // Command should succeed
    expect(result.exitCode).toBe(0);

    // ---------------------------------------------------------------------
    // Step 3: Verify backup file exists and has original content
    // ---------------------------------------------------------------------
    const backupExists = await fs
      .access(backupPath)
      .then(() => true)
      .catch(() => false);

    expect(backupExists, '.legacy.bak backup file should exist').toBe(true);

    const backupContent = await fs.readFile(backupPath, 'utf-8');
    const backupManifest = JSON.parse(backupContent);

    // Backup should be byte-identical to original
    expect(backupManifest).toEqual(LEGACY_USER_MANIFEST);
    // Backup should still be legacy format (no `format` field)
    expect(backupManifest).not.toHaveProperty('format');

    // ---------------------------------------------------------------------
    // Step 4: Verify new active manifest is in current format
    // ---------------------------------------------------------------------
    const newManifestContent = await fs.readFile(manifestPath, 'utf-8');
    const newManifest = JSON.parse(newManifestContent);

    // Should have `format: "CURRENT"` field
    expect(newManifest).toHaveProperty('format');
    expect(newManifest.format).toBe('CURRENT');

    // Should have the required fields
    for (const field of CURRENT_USER_MANIFEST_EXPECTED_FIELDS) {
      expect(newManifest, `Field "${field}" should exist in migrated manifest`).toHaveProperty(field);
    }

    // Legacy fields should be removed
    expect(newManifest).not.toHaveProperty('shared_version');
    expect(newManifest).not.toHaveProperty('required_shared_version_range');
    // Note: code_version IS a valid field in User_Manifest (R1), so it should remain

    // Data should be preserved
    expect(newManifest.min_supported_data_schema).toBe(LEGACY_USER_MANIFEST.min_supported_data_schema);
    expect(newManifest.installed_at).toBe(LEGACY_USER_MANIFEST.installed_at);
    expect(newManifest.updated_at).toBe(LEGACY_USER_MANIFEST.updated_at);
    expect(newManifest.files).toEqual(LEGACY_USER_MANIFEST.files);
  });

  it('should be idempotent on subsequent runs', async () => {
    // First run - convert
    const result1 = await runMigrateManifestCommand(['--manifest-path', manifestPath]);
    expect(result1.exitCode).toBe(0);

    const firstRunContent = await fs.readFile(manifestPath, 'utf-8');

    // Second run - should be no-op
    const result2 = await runMigrateManifestCommand(['--manifest-path', manifestPath]);
    expect(result2.exitCode).toBe(0);

    const secondRunContent = await fs.readFile(manifestPath, 'utf-8');

    // Content should be identical (idempotent)
    expect(secondRunContent).toBe(firstRunContent);
  });

  it('should detect legacy Project_Manifest and convert correctly', async () => {
    // Clean up and create project manifest instead
    await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cycle3-project-'));
    manifestPath = path.join(tempDir, 'manifest.json');
    backupPath = `${manifestPath}.legacy.bak`;

    // Legacy Project_Manifest (with data_schema_version but also legacy fields)
    const LEGACY_PROJECT_MANIFEST = {
      shared_version: '5.0.0',
      required_shared_version_range: '>=3.0.0 <6.0.0',
      code_version: '5.0.0',
      data_schema_version: 2,
      initialized_at: '2023-06-01T09:00:00.000Z',
      updated_at: '2023-06-01T09:00:00.000Z',
    };

    await fs.writeFile(manifestPath, JSON.stringify(LEGACY_PROJECT_MANIFEST, null, 2) + '\n', 'utf-8');

    // Run migration
    const result = await runMigrateManifestCommand(['--manifest-path', manifestPath]);
    expect(result.exitCode).toBe(0);

    // Verify backup
    const backupExists = await fs
      .access(backupPath)
      .then(() => true)
      .catch(() => false);
    expect(backupExists).toBe(true);

    // Verify converted project manifest
    const newContent = await fs.readFile(manifestPath, 'utf-8');
    const newManifest = JSON.parse(newContent);

    expect(newManifest).toHaveProperty('format');
    expect(newManifest.format).toBe('CURRENT');
    expect(newManifest).toHaveProperty('data_schema_version');
    expect(newManifest).not.toHaveProperty('shared_version');
    expect(newManifest).not.toHaveProperty('required_shared_version_range');
    expect(newManifest).not.toHaveProperty('code_version');

    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});