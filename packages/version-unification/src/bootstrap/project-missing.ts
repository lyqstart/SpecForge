/**
 * Bootstrap handler for when Project Manifest is missing.
 *
 * @see requirements.md §Requirement 15 (项目级 manifest 缺失的兜底)
 * @see design.md §bootstrap/ (R14 / R15)
 */

import { ProjectManifestWriter } from '../manifest/project-manifest-writer.js';
import { ManifestUnwritableDirError } from '../manifest/types.js';

/**
 * Arguments for handling project manifest missing scenario.
 */
export interface HandleProjectManifestMissingArgs {
  /** The project directory where the manifest should be created */
  projectDir: string;
  /** The highest known schema version (typically HIGHEST_KNOWN_SCHEMA) */
  highestKnown: number;
  /** Writer for creating the project manifest */
  writer: typeof ProjectManifestWriter;
  /** Log function for outputting info/warning messages */
  log: (msg: string) => void;
}

/**
 * Result when project manifest is successfully created.
 */
export interface ProjectManifestCreated {
  /** Indicates successful creation */
  readonly success: true;
  /** The path where the manifest was created */
  readonly manifestPath: string;
  /** The data_schema_version that was set */
  readonly dataSchemaVersion: number;
}

/**
 * Result when project directory is not writable.
 */
export interface ProjectManifestWriteFailed {
  /** Indicates write failure */
  readonly success: false;
  /** The error that occurred */
  readonly error: ManifestUnwritableDirError;
}

/**
 * Handles the case when Project_Manifest file does not exist on disk.
 *
 * Behavior (R15):
 * - If User_Manifest indicates successful install (caller checks this):
 *   1. Create a new Project_Manifest with data_schema_version = highestKnown
 *   2. Set initialized_at and updated_at to current ISO 8601 timestamp
 *   3. Emit a single info-level message with absolute path and chosen dsv
 * - If the directory is not writable:
 *   1. Throw ManifestUnwritableDirError
 *   2. Entry point prints dir + errno, exit != 0
 *
 * @param args - Handler arguments
 * @returns Promise resolving to creation result or error
 */
export async function handleProjectManifestMissing(
  args: HandleProjectManifestMissingArgs
): Promise<ProjectManifestCreated | ProjectManifestWriteFailed> {
  const { projectDir, highestKnown, writer, log } = args;

  // Build the manifest path
  const manifestPath = `${projectDir}/specforge/manifest.json`;

  try {
    // Write the fresh manifest with the highest known schema version (R15.1, R15.2)
    await writer.writeFresh(manifestPath, highestKnown);

    // Emit info message with absolute path and chosen data_schema_version (R15.3)
    log(`Project manifest created at: ${manifestPath}`);
    log(`Schema version: ${highestKnown}`);

    return {
      success: true,
      manifestPath,
      dataSchemaVersion: highestKnown,
    };
  } catch (error) {
    // Check if it's a filesystem permission error
    if (isPermissionError(error)) {
      // Extract errno if available
      const errno = getErrno(error);

      // Throw ManifestUnwritableDirError (R15.4)
      // The caller is expected to print this error and exit with non-zero code
      throw new ManifestUnwritableDirError(
        projectDir,
        errno,
        `Cannot write project manifest to directory: ${projectDir}${errno ? ` (errno: ${errno})` : ''}`
      );
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Checks if an error is a filesystem permission error.
 */
function isPermissionError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'EACCES' || code === 'EPERM' || code === 'EROFS';
  }
  return false;
}

/**
 * Extracts errno from an error if available.
 */
function getErrno(error: unknown): number | undefined {
  if (error instanceof Error) {
    const err = error as NodeJS.ErrnoException;
    return err.errno;
  }
  return undefined;
}