/**
 * Manifest Reader.
 * 
 * Provides read operations for User and Project Manifest files.
 * - Reads and parses JSON from manifest files
 * - Throws appropriate errors for invalid JSON (InvalidJsonInManifestError)
 * - Throws ManifestNotFoundError when file doesn't exist (bootstrap layer handles this)
 *
 * @see requirements.md §Requirement 14.3
 * @see design.md §Components.manifest-reader.ts
 */

import * as fs from 'node:fs/promises';
import {
  InvalidJsonInManifestError,
  ManifestNotFoundError,
  type UserManifest,
  type ProjectManifest,
} from './types.js';

/**
 * Reads a User Manifest from the specified path.
 * 
 * Reads the file content and parses it as JSON.
 * - File not found throws ManifestNotFoundError (bootstrap handles this)
 * - Invalid JSON throws InvalidJsonInManifestError with path and parse error
 *
 * @param path - The path to the user manifest file
 * @returns Promise resolving to the parsed UserManifest
 * @throws ManifestNotFoundError if the file does not exist (R14.3)
 * @throws InvalidJsonInManifestError if JSON parsing fails (R14.3)
 */
export async function readUser(path: string): Promise<UserManifest> {
  return readManifest<UserManifest>(path, 'user');
}

/**
 * Reads a Project Manifest from the specified path.
 * 
 * Reads the file content and parses it as JSON.
 * - File not found throws ManifestNotFoundError (bootstrap handles this)
 * - Invalid JSON throws InvalidJsonInManifestError with path and parse error
 *
 * @param path - The path to the project manifest file
 * @returns Promise resolving to the parsed ProjectManifest
 * @throws ManifestNotFoundError if the file does not exist (R14.3)
 * @throws InvalidJsonInManifestError if JSON parsing fails (R14.3)
 */
export async function readProject(path: string): Promise<ProjectManifest> {
  return readManifest<ProjectManifest>(path, 'project');
}

/**
 * Internal function to read and parse a manifest file.
 * 
 * @param path - The path to the manifest file
 * @param type - The type of manifest ('user' or 'project')
 * @returns Promise resolving to the parsed manifest
 * @throws ManifestNotFoundError if the file does not exist
 * @throws InvalidJsonInManifestError if JSON parsing fails
 */
async function readManifest<T>(path: string, type: 'user' | 'project'): Promise<T> {
  let content: string;
  
  try {
    // Attempt to read the file
    content = await fs.readFile(path, 'utf-8');
  } catch (error) {
    // Check if it's a "file not found" error (ENOENT)
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      // File doesn't exist - bootstrap layer handles this case
      throw new ManifestNotFoundError(type, path);
    }
    // Re-throw other filesystem errors
    throw error;
  }

  try {
    // Parse the JSON content
    const parsed = JSON.parse(content) as T;
    return parsed;
  } catch (error) {
    // JSON parse failure - throw InvalidJsonInManifestError with path and parse error
    throw new InvalidJsonInManifestError(path, error);
  }
}