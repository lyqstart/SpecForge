/**
 * Code version module - provides access to the SpecForge code version.
 *
 * REQUIREMENT 5.1: Every runtime read of `code_version` is derived from the
 * `version` field of the repository root `package.json` at build time or install time.
 *
 * Implementation approach:
 * - During development: read directly from root package.json via fs
 * - For production/build: this should be replaced with a hardcoded constant
 *   injected at build time for better performance
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The code version string derived from repository root package.json.
 * This is cached after first read to avoid repeated file I/O.
 */
let cachedCodeVersion: string | undefined = undefined;

/**
 * CODE_VERSION constant - the canonical version string.
 * In production builds, this should be replaced with build-time injection.
 */
export const CODE_VERSION: string = getCodeVersion();

/**
 * Get the SpecForge code version.
 *
 * This is the ONLY runtime entry point for accessing the code version.
 * Returns the semantic version string from the repository root package.json.
 *
 * @returns The code version string (e.g., "6.0.0-dev")
 * @throws Error if version cannot be read or parsed
 */
export function getCodeVersion(): string {
  if (cachedCodeVersion !== undefined) {
    return cachedCodeVersion;
  }

  // During development, read from root package.json
  // In production, this should be replaced with build-time injected constant
  try {
    const rootDir = findRootDir();
    const packageJsonPath = join(rootDir, 'package.json');
    const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    if (!packageJson.version || typeof packageJson.version !== 'string') {
      throw new Error('package.json missing or has invalid version field');
    }

    // Validate semantic version format per R1.2
    const semverRegex = /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/;
    if (!semverRegex.test(packageJson.version)) {
      throw new Error(`Invalid version format: ${packageJson.version}`);
    }

    cachedCodeVersion = packageJson.version;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get code version: ${error.message}`);
    }
    throw new Error('Failed to get code version: unknown error');
  }

  // After successful read, cachedCodeVersion is guaranteed to be defined
  return cachedCodeVersion!;
}

/**
 * Find the repository root directory by looking for package.json
 */
function findRootDir(): string {
  // Start from the location of this file and traverse up
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFilePath);

  // Walk up the directory tree looking for package.json
  let dir = currentDir;
  for (let i = 0; i < 10; i++) { // Max 10 levels up
    const candidate = join(dir, 'package.json');
    try {
      readFileSync(candidate, 'utf-8');
      return dir;
    } catch {
      // Continue searching parent
      const parent = join(dir, '..');
      if (parent === dir) break; // Reached filesystem root
      dir = parent;
    }
  }

  throw new Error('Cannot find repository root (package.json)');
}

/**
 * Reset the cached version (useful for testing)
 * @internal
 */
export function _resetCache(): void {
  cachedCodeVersion = undefined;
}