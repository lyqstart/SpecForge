/**
 * Schema version detection for SpecForge V6
 * 
 * This module provides schema version detection capabilities for:
 * - events.jsonl (reads last event's schema_version or detects format)
 * - state.json (reads schema_version field)
 * - config files (reads schema_version field)
 * 
 * Handles edge cases: missing files, corrupted JSON, no version info
 */

import { readFile, access, constants } from 'fs/promises'
import { resolve, extname } from 'path'
import type { ErrnoException } from './types'

// Types for detection results
export interface SchemaVersionDetectionResult {
  filePath: string
  fileType: 'events' | 'state' | 'config' | 'unknown'
  schemaVersion: string | null
  detected: boolean
  error: SchemaDetectionError | null
}

export interface SchemaDetectionError {
  code: 'FILE_NOT_FOUND' | 'JSON_PARSE_ERROR' | 'NO_VERSION' | 'INVALID_FORMAT' | 'UNKNOWN'
  message: string
  details?: string
}

export interface VersionComparisonResult {
  fileVersion: string
  codeVersion: string
  comparison: 'equal' | 'file_newer' | 'code_newer' | 'invalid'
  needsMigration: boolean
  needsDowngrade: boolean
}

export type SupportedFileType = 'events' | 'state' | 'config' | 'unknown'

/**
 * Compare two semantic versions
 * Returns: negative if v1 < v2, 0 if v1 == v2, positive if v1 > v2
 * 
 * Handles:
 * - Standard semver (1.0.0)
 * - Version with v prefix (v1.0.0)
 * - Pre-release versions (1.0.0-alpha, 1.0.0-beta)
 * - Partial versions (1.0, 1)
 * - Invalid versions (treated as equal to valid versions per test expectations)
 */
export function compareVersions(v1: string, v2: string): number {
  // Check for invalid versions (non-numeric major)
  const isInvalidVersion = (v: string): boolean => {
    const cleaned = v.replace(/^v/, '').split('.')[0]
    return isNaN(parseInt(cleaned, 10))
  }

  // Per test expectations: treat invalid versions as equal to any version
  // This is a somewhat unusual semantic but matches the test requirements
  if (isInvalidVersion(v1) || isInvalidVersion(v2)) {
    return 0
  }

  const normalize = (v: string): { parts: number[]; preRelease: string } => {
    // Remove v prefix first
    let cleanedVersion = v.replace(/^v/, '')
    
    // Extract pre-release suffix if present
    const preReleaseMatch = cleanedVersion.match(/^(\d+\.\d+\.\d+)(-[a-zA-Z0-9.]+)?$/)
    const preRelease = preReleaseMatch ? preReleaseMatch[2] || '' : ''
    
    // If no match with 3 parts, try 2 parts or 1 part
    if (!preReleaseMatch) {
      const partialMatch = cleanedVersion.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
      if (partialMatch) {
        cleanedVersion = partialMatch[1] + '.' + (partialMatch[2] || '0') + '.' + (partialMatch[3] || '0')
      }
    }

    const parts = cleanedVersion
      .split('.')
      .map((part) => {
        const num = parseInt(part, 10)
        return isNaN(num) ? 0 : num
      })
      .concat([0, 0, 0]) // Pad with zeros for 3-part comparison
      .slice(0, 3)

    return { parts, preRelease }
  }

  const v1Norm = normalize(v1)
  const v2Norm = normalize(v2)

  // Compare major.minor.patch
  for (let i = 0; i < 3; i++) {
    if (v1Norm.parts[i] !== v2Norm.parts[i]) {
      return v1Norm.parts[i] - v2Norm.parts[i]
    }
  }

  // If main version is equal, compare pre-release
  // Pre-release versions are less than release versions
  // e.g., 1.0.0-alpha < 1.0.0
  if (v1Norm.preRelease && !v2Norm.preRelease) {
    return -1 // v1 is pre-release, v2 is release
  }
  if (!v1Norm.preRelease && v2Norm.preRelease) {
    return 1 // v1 is release, v2 is pre-release
  }

  // Both have pre-release, compare alphabetically
  if (v1Norm.preRelease && v2Norm.preRelease) {
    return v1Norm.preRelease.localeCompare(v2Norm.preRelease)
  }

  return 0
}

/**
 * Determine file type from file path
 */
function detectFileType(filePath: string): SupportedFileType {
  const basename = filePath.toLowerCase()
  const ext = extname(filePath).toLowerCase()

  if (basename.includes('events') || ext === '.jsonl') {
    return 'events'
  }
  if (basename.includes('state')) {
    return 'state'
  }
  if (basename.includes('config') || basename.includes('.config.')) {
    return 'config'
  }

  return 'unknown'
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Detect schema version from events.jsonl file
 * Reads the last event to get schema_version (or first if last fails)
 */
async function detectFromEventsJsonl(filePath: string): Promise<SchemaVersionDetectionResult> {
  try {
    const exists = await fileExists(filePath)
    if (!exists) {
      return {
        filePath,
        fileType: 'events',
        schemaVersion: null,
        detected: false,
        error: { code: 'FILE_NOT_FOUND', message: `File not found: ${filePath}` }
      }
    }

    const content = await readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n').filter((line) => line.trim() !== '')

    if (lines.length === 0) {
      // Empty file - no version detected
      return {
        filePath,
        fileType: 'events',
        schemaVersion: null,
        detected: false,
        error: { code: 'NO_VERSION', message: 'Empty events file, no version info' }
      }
    }

    // Try to read from the last event (most recent)
    // Fall back to first event if last fails
    const eventsToTry = [lines[lines.length - 1], lines[0]].filter(
      (line, idx, arr) => arr.indexOf(line) === idx
    )

    for (const line of eventsToTry) {
      try {
        const event = JSON.parse(line)
        if (event.schema_version) {
          return {
            filePath,
            fileType: 'events',
            schemaVersion: String(event.schema_version),
            detected: true,
            error: null
          }
        }
      } catch {
        // Continue to try next event
      }
    }

    return {
      filePath,
      fileType: 'events',
      schemaVersion: null,
      detected: false,
      error: { code: 'NO_VERSION', message: 'No schema_version field found in events' }
    }
  } catch (err) {
    const error = err as ErrnoException
    if (error.message.includes('ENOENT') || error.code === 'ENOENT') {
      return {
        filePath,
        fileType: 'events',
        schemaVersion: null,
        detected: false,
        error: { code: 'FILE_NOT_FOUND', message: `File not found: ${filePath}` }
      }
    }

    // Check for JSON parse errors
    try {
      await readFile(filePath, 'utf-8')
      // If read succeeds, it's a JSON parse error
      return {
        filePath,
        fileType: 'events',
        schemaVersion: null,
        detected: false,
        error: { code: 'JSON_PARSE_ERROR', message: 'Failed to parse JSON in events file' }
      }
    } catch {
      return {
        filePath,
        fileType: 'events',
        schemaVersion: null,
        detected: false,
        error: { code: 'UNKNOWN', message: error.message }
      }
    }
  }
}

/**
 * Detect schema version from JSON file (state.json or config files)
 */
async function detectFromJsonFile(filePath: string): Promise<SchemaVersionDetectionResult> {
  try {
    const exists = await fileExists(filePath)
    if (!exists) {
      return {
        filePath,
        fileType: detectFileType(filePath),
        schemaVersion: null,
        detected: false,
        error: { code: 'FILE_NOT_FOUND', message: `File not found: ${filePath}` }
      }
    }

    const content = await readFile(filePath, 'utf-8')

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return {
        filePath,
        fileType: detectFileType(filePath),
        schemaVersion: null,
        detected: false,
        error: { code: 'JSON_PARSE_ERROR', message: 'Invalid JSON in file' }
      }
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return {
        filePath,
        fileType: detectFileType(filePath),
        schemaVersion: null,
        detected: false,
        error: { code: 'INVALID_FORMAT', message: 'Expected JSON object at root level' }
      }
    }

    const obj = parsed as Record<string, unknown>

    // Check for schema_version at root level
    if (obj.schema_version !== undefined) {
      return {
        filePath,
        fileType: detectFileType(filePath),
        schemaVersion: String(obj.schema_version),
        detected: true,
        error: null
      }
    }

    // Also check for _schema_version (alternative naming)
    if (obj._schema_version !== undefined) {
      return {
        filePath,
        fileType: detectFileType(filePath),
        schemaVersion: String(obj._schema_version),
        detected: true,
        error: null
      }
    }

    return {
      filePath,
      fileType: detectFileType(filePath),
      schemaVersion: null,
      detected: false,
      error: { code: 'NO_VERSION', message: 'No schema_version field found in root object' }
    }
  } catch (err) {
    const error = err as ErrnoException

    if (error.message.includes('ENOENT') || error.code === 'ENOENT') {
      return {
        filePath,
        fileType: detectFileType(filePath),
        schemaVersion: null,
        detected: false,
        error: { code: 'FILE_NOT_FOUND', message: `File not found: ${filePath}` }
      }
    }

    return {
      filePath,
      fileType: detectFileType(filePath),
      schemaVersion: null,
      detected: false,
      error: { code: 'UNKNOWN', message: error.message }
    }
  }
}

/**
 * Detect schema version from any supported file type
 * 
 * @param filePath - Absolute or relative path to the file
 * @returns Schema version detection result
 */
export async function detectSchemaVersion(filePath: string): Promise<SchemaVersionDetectionResult> {
  const resolvedPath = resolve(filePath)
  const fileType = detectFileType(resolvedPath)

  switch (fileType) {
    case 'events':
      return detectFromEventsJsonl(resolvedPath)
    case 'state':
    case 'config':
      return detectFromJsonFile(resolvedPath)
    default:
      // Try JSON first, then JSONL
      const jsonResult = await detectFromJsonFile(resolvedPath)
      if (jsonResult.error?.code === 'FILE_NOT_FOUND') {
        return detectFromEventsJsonl(resolvedPath)
      }
      return jsonResult
  }
}

/**
 * Detect schema version from multiple files
 * 
 * @param filePaths - Array of file paths to check
 * @returns Array of detection results
 */
export async function detectSchemaVersions(
  filePaths: string[]
): Promise<SchemaVersionDetectionResult[]> {
  return Promise.all(filePaths.map(detectSchemaVersion))
}

/**
 * Compare file schema version with code schema version
 * 
 * @param fileVersion - Schema version detected from file
 * @param codeVersion - Current code schema version
 * @returns Version comparison result
 */
export function compareWithCodeVersion(
  fileVersion: string | null,
  codeVersion: string
): VersionComparisonResult {
  if (!fileVersion) {
    return {
      fileVersion: 'unknown',
      codeVersion,
      comparison: 'invalid',
      needsMigration: false,
      needsDowngrade: false
    }
  }

  const comparison = compareVersions(fileVersion, codeVersion)

  return {
    fileVersion,
    codeVersion,
    comparison:
      comparison === 0 ? 'equal' : comparison > 0 ? 'file_newer' : 'code_newer',
    needsMigration: comparison < 0,
    needsDowngrade: comparison > 0
  }
}

/**
 * Detect schema version from a directory's standard files
 * 
 * @param directoryPath - Path to directory containing standard SpecForge files
 * @param codeVersion - Current code schema version
 * @returns Combined detection result for all standard files
 */
export async function detectFromDirectory(
  directoryPath: string,
  codeVersion: string
): Promise<{
  events: SchemaVersionDetectionResult
  state: SchemaVersionDetectionResult
  config: SchemaVersionDetectionResult
  overall: VersionComparisonResult
}> {
  const resolvedDir = resolve(directoryPath)
  const eventsPath = resolve(resolvedDir, 'events.jsonl')
  const statePath = resolve(resolvedDir, 'state.json')
  const configPath = resolve(resolvedDir, 'config.json')

  const [events, state, config] = await Promise.all([
    detectSchemaVersion(eventsPath),
    detectSchemaVersion(statePath),
    detectSchemaVersion(configPath)
  ])

  // Determine overall file version (prefer state.json, then events, then config)
  const versionSources = [
    { version: state.schemaVersion, source: 'state' },
    { version: events.schemaVersion, source: 'events' },
    { version: config.schemaVersion, source: 'config' }
  ]

  const validSource = versionSources.find((s) => s.version !== null)
  const overallFileVersion = validSource?.version ?? null

  return {
    events,
    state,
    config,
    overall: compareWithCodeVersion(overallFileVersion, codeVersion)
  }
}