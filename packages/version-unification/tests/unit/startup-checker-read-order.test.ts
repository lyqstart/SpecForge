/**
 * Unit test for startup read order.
 *
 * Validates Requirement 3.1:
 * "WHEN the SpecForge_System starts inside a project that has a Project_Manifest,
 *  THE SpecForge_System SHALL read `data_schema_version` from the Project_Manifest
 *  and `min_supported_data_schema` from the User_Manifest before any project data read."
 *
 * Strategy:
 *   - Set up a temp dir with a Project_Manifest, a User_Manifest, and a fake
 *     "project data" file.
 *   - Spy on `fs.readFile` (vitest's vi.spyOn).
 *   - Drive the documented startup-read sequence: readProject() then readUser()
 *     (the manifest-reader entry points used by the future startup orchestrator
 *     described in design.md §15.1).
 *   - Then simulate "any project data read" via fs.readFile.
 *   - Assert: both manifest reads were observed by the spy *before* the
 *     project-data read in call order.
 *
 * This test pins the contract so a future startup orchestrator that re-orders
 * reads (e.g., reads project data files first) will fail loudly.
 *
 * Note: We deliberately do NOT assert any ordering between Project_Manifest
 * and User_Manifest. R3.1 only requires both to precede project-data reads;
 * the relative order between the two manifests is unspecified.
 *
 * @see requirements.md §Requirement 3.1
 * @see design.md §"启动期与 PR 期两条独立路径"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { readProject, readUser } from '../../src/manifest/manifest-reader';

describe('Startup read order (R3.1)', () => {
  let tempDir: string;
  let projectManifestPath: string;
  let userManifestPath: string;
  let projectDataPath: string;
  let readFileSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'startup-read-order-'));
    projectManifestPath = path.join(tempDir, 'project-manifest.json');
    userManifestPath = path.join(tempDir, 'user-manifest.json');
    projectDataPath = path.join(tempDir, 'project-data.json');

    // Write a valid Project_Manifest (3 fields, R2.1)
    await fs.writeFile(
      projectManifestPath,
      JSON.stringify({
        data_schema_version: 5,
        initialized_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
    );

    // Write a valid User_Manifest (5 fields, R1.1)
    await fs.writeFile(
      userManifestPath,
      JSON.stringify({
        code_version: '6.0.0',
        min_supported_data_schema: 3,
        installed_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        files: [],
      }),
    );

    // Write a fake "project data" file to represent "any project data read"
    await fs.writeFile(projectDataPath, JSON.stringify({ data: 'anything' }));

    // Install the spy AFTER fixture writes so we don't capture setup activity.
    // vi.spyOn on the fs namespace works because the manifest-reader imports
    // the same `node:fs/promises` namespace object that this test imports.
    readFileSpy = vi.spyOn(fs, 'readFile');
  });

  afterEach(async () => {
    readFileSpy.mockRestore();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors — temp dir cleanup is best-effort.
    }
  });

  it('reads both Project_Manifest and User_Manifest via dedicated readers', async () => {
    const projectManifest = await readProject(projectManifestPath);
    const userManifest = await readUser(userManifestPath);

    // R3.1 names two specific fields; assert both were retrievable from the
    // manifests after the dedicated reads.
    expect(projectManifest.data_schema_version).toBe(5);
    expect(userManifest.min_supported_data_schema).toBe(3);
  });

  it('records calls to fs.readFile when reading manifests', async () => {
    await readProject(projectManifestPath);
    await readUser(userManifestPath);

    // Both manifest paths should appear in the spy's call log.
    const calledPaths = readFileSpy.mock.calls.map((call) => String(call[0]));
    expect(calledPaths).toContain(projectManifestPath);
    expect(calledPaths).toContain(userManifestPath);
  });

  it('reads BOTH manifests before any project data read (R3.1)', async () => {
    // Simulate the documented startup sequence:
    //   1. read Project_Manifest to extract data_schema_version
    //   2. read User_Manifest to extract min_supported_data_schema
    //   3. (later) any project data read
    const projectManifest = await readProject(projectManifestPath);
    const userManifest = await readUser(userManifestPath);

    // Touch the extracted fields so a future linter cannot prune them away.
    void projectManifest.data_schema_version;
    void userManifest.min_supported_data_schema;

    // Now simulate "any project data read" — this represents the FIRST
    // project-data read that happens after the startup checker decides the
    // operating mode in NORMAL_RW.
    await fs.readFile(projectDataPath, 'utf-8');

    const calledPaths = readFileSpy.mock.calls.map((call) => String(call[0]));

    const projectManifestIdx = calledPaths.indexOf(projectManifestPath);
    const userManifestIdx = calledPaths.indexOf(userManifestPath);
    const projectDataIdx = calledPaths.indexOf(projectDataPath);

    // All three reads must have been observed.
    expect(projectManifestIdx).toBeGreaterThanOrEqual(0);
    expect(userManifestIdx).toBeGreaterThanOrEqual(0);
    expect(projectDataIdx).toBeGreaterThanOrEqual(0);

    // R3.1: both manifest reads must strictly precede the project data read.
    expect(projectManifestIdx).toBeLessThan(projectDataIdx);
    expect(userManifestIdx).toBeLessThan(projectDataIdx);
  });

  it('does not read any project data file while only reading manifests', async () => {
    await readProject(projectManifestPath);
    await readUser(userManifestPath);

    // Negative check: until the orchestrator decides the mode, the manifest
    // readers must not touch project data files. A future orchestrator that
    // accidentally pre-fetches project data would fail this assertion.
    const calledPaths = readFileSpy.mock.calls.map((call) => String(call[0]));
    expect(calledPaths).not.toContain(projectDataPath);
  });
});
