/**
 * Integration test: 1000 files CI guard performance.
 *
 * **Validates: Requirements 9.4**
 * Requirement 9.4: "THE SpecForge_System SHALL execute CI_Version_Guard
 * within 30 seconds on a repository containing up to 1000 source files."
 *
 * This test:
 * 1. Creates 1000 temporary TypeScript files as fixture
 * 2. Simulates a PR diff (some files changed)
 * 3. Calls `runVersionGuard` and measures elapsed time
 * 4. Asserts completion within 30 seconds
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runVersionGuard, type RunVersionGuardResult } from '../../scripts/ci/version-guard';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const FIXTURE_FILE_COUNT = 1000;
const MAX_ALLOWED_MS = 30_000;

describe('CI Version Guard performance', () => {
  const tempDirs: string[] = [];

  /**
   * Creates a temporary directory with N TypeScript files.
   * Returns the list of created file paths.
   */
  async function createTempRepoWithFiles(fileCount: number): Promise<string[]> {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), 'vg-perf-test-'));
    tempDirs.push(tempDir);

    const srcDir = path.join(tempDir, 'packages', 'test-pkg', 'src');
    await fs.mkdir(srcDir, { recursive: true });

    // Create package.json
    const pkgJson = {
      name: 'test-pkg',
      version: '1.0.0',
      type: 'module',
    };
    await fs.writeFile(
      path.join(tempDir, 'packages', 'test-pkg', 'package.json'),
      JSON.stringify(pkgJson, null, 2),
    );

    // Create root package.json
    const rootPkgJson = {
      name: 'specforge',
      version: '6.0.0',
      workspaces: ['packages/*'],
    };
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(rootPkgJson, null, 2),
    );

    const filePaths: string[] = [];

    // Create TypeScript files
    for (let i = 0; i < fileCount; i++) {
      const fileName = `file-${i.toString().padStart(4, '0')}.ts`;
      const filePath = path.join(srcDir, fileName);
      const content = `// File ${i}\nexport const value${i} = ${i};\n`;
      await fs.writeFile(filePath, content);
      filePaths.push(filePath);
    }

    // Also create constants.ts in the version-unification package (for the MIN_SUPPORTED_DATA_SCHEMA check)
    const vuDir = path.join(tempDir, 'packages', 'version-unification', 'src');
    await fs.mkdir(vuDir, { recursive: true });
    await fs.writeFile(
      path.join(vuDir, 'constants.ts'),
      `export const MIN_SUPPORTED_DATA_SCHEMA = 0;\nexport const HIGHEST_KNOWN_SCHEMA = 0;\n`,
    );

    return filePaths;
  }

  /**
   * Creates a mock scanner that simulates PR diff behavior.
   * Returns a subset of files as "changed" (simulating a PR with some modifications).
   */
  function createMockScanner(
    allFiles: string[],
    changedCount: number,
  ): {
    getChangedFiles: () => Promise<string[]>;
    getFileHunks: (file: string) => Promise<{ hunks: Array<{ lines: string[] }> }>;
    readFileWithSizeLimit: (file: string) => Promise<string | null>;
  } {
    // Simulate ~10% of files changed in the PR
    const changedFiles = allFiles
      .sort(() => Math.random() - 0.5)
      .slice(0, changedCount);

    const fileContents = new Map<string, string>();
    for (const fp of allFiles) {
      fileContents.set(fp, fs.readFile(fp, 'utf-8').catch(() => ''));
    }

    return {
      getChangedFiles: async () => changedFiles,
      getFileHunks: async (file: string) => {
        const content = await fileContents.get(file) || '';
        return {
          hunks: [
            {
              lines: content.split('\n').map((l) => `+${l}`),
            },
          ],
        };
      },
      readFileWithSizeLimit: async (file: string) => {
        try {
          return await fs.readFile(file, 'utf-8');
        } catch {
          return null;
        }
      },
    };
  }

  afterAll(async () => {
    // Clean up temp directories
    for (const dir of tempDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('should complete CI guard within 30 seconds for 1000 files', async () => {
    // Create fixture: 1000 TypeScript files
    const allFiles = await createTempRepoWithFiles(FIXTURE_FILE_COUNT);
    const tempRoot = tempDirs[tempDirs.length - 1];

    // Simulate ~100 files changed in the PR (10% of 1000)
    const changedFileCount = Math.floor(FIXTURE_FILE_COUNT * 0.1);
    const mockScanner = createMockScanner(allFiles, changedFileCount);

    // Run version guard with the mock scanner
    const result: RunVersionGuardResult = await runVersionGuard({
      diffBase: 'HEAD~1',
      repoRoot: tempRoot,
      hardTimeoutMs: MAX_ALLOWED_MS,
      scanner: mockScanner,
    });

    // Log for debugging
    console.log(`[version-guard-1000-files] Scanned ${result.report.scannedFileCount} files in ${result.report.elapsedMs}ms`);
    console.log(`[version-guard-1000-files] Violations: ${result.report.violations.length}`);
    if (result.report.infrastructureError) {
      console.log(`[version-guard-1000-files] Infra error: ${result.report.infrastructureError}`);
    }

    // Assert: Must complete within 30 seconds
    expect(result.report.elapsedMs).toBeLessThan(MAX_ALLOWED_MS);

    // Assert: No timeout occurred
    expect(result.report.timedOut).toBeUndefined();

    // The exit code may be 0 or 1 depending on violations found,
    // but performance is the main concern here
    expect(typeof result.exitCode).toBe('number');
  }, MAX_ALLOWED_MS + 5000); // Allow extra time for test setup

  it('should handle edge case of all files changed', async () => {
    // Create fixture with fewer files for this edge case
    const fileCount = 500;
    const allFiles = await createTempRepoWithFiles(fileCount);
    const tempRoot = tempDirs[tempDirs.length - 1];

    // Simulate ALL files changed
    const mockScanner = createMockScanner(allFiles, fileCount);

    const result: RunVersionGuardResult = await runVersionGuard({
      diffBase: 'HEAD~1',
      repoRoot: tempRoot,
      hardTimeoutMs: MAX_ALLOWED_MS,
      scanner: mockScanner,
    });

    console.log(`[version-guard-edge] Scanned ${result.report.scannedFileCount} files in ${result.report.elapsedMs}ms`);

    // Should still complete within 30 seconds even with all files changed
    expect(result.report.elapsedMs).toBeLessThan(MAX_ALLOWED_MS);
    expect(result.report.timedOut).toBeUndefined();
  }, MAX_ALLOWED_MS + 5000);
});