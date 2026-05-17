/**
 * Inconsistency Detection for Recovery Repair (Task 4.1)
 * 
 * This module detects inconsistencies between events.jsonl and state.json
 * that may occur after crashes or unexpected terminations.
 * 
 * Requirements: 2.1, 2.2
 * Validates: v6-architecture-overview Property 20
 */

import { readFile, access, stat } from 'fs/promises'
import { resolve, dirname, join } from 'path'
import { constants } from 'fs'

// ============================================================================
// Types
// ============================================================================

/**
 * Inconsistency types detected between events.jsonl and state.json
 */
export type InconsistencyType =
  /** events.jsonl file is missing */
  | 'events_missing'
  /** events.jsonl file is corrupted (invalid JSON or format) */
  | 'events_corrupted'
  /** state.json file is missing */
  | 'state_missing'
  /** state.json file is corrupted (invalid JSON) */
  | 'state_corrupted'
  /** Both events.jsonl and state.json are missing */
  | 'both_missing'
  /** Both files are corrupted or unreadable */
  | 'both_corrupted'
  /** Schema version mismatch between files */
  | 'version_mismatch'
  /** State says design phase but design.md doesn't exist */
  | 'design_missing'
  /** State event sequence doesn't match events.jsonl count */
  | 'sequence_mismatch'
  /** Events file is empty */
  | 'events_empty'
  /** State has invalid or missing required fields */
  | 'state_invalid_structure'
  /** No inconsistency detected - files are consistent */
  | 'consistent'

/**
 * Severity levels for inconsistencies
 */
export type InconsistencySeverity = 'critical' | 'warning' | 'info'

/**
 * Single inconsistency detection result
 */
export interface Inconsistency {
  /** Type of inconsistency detected */
  type: InconsistencyType
  /** Severity level */
  severity: InconsistencySeverity
  /** Human-readable description */
  message: string
  /** File paths involved */
  files: string[]
  /** Additional context for debugging/repair */
  context?: Record<string, unknown>
}

/**
 * Result of inconsistency detection
 */
export interface InconsistencyDetectionResult {
  /** Whether inconsistency was detected */
  hasInconsistency: boolean
  /** List of detected inconsistencies (empty if consistent) */
  inconsistencies: Inconsistency[]
  /** Files that were checked */
  checkedFiles: {
    eventsJsonl: string | null
    stateJson: string | null
    designMd: string | null
  }
  /** Detection metadata */
  metadata: {
    detectedAt: string
    eventsExists: boolean
    stateExists: boolean
    eventsReadable: boolean
    stateReadable: boolean
  }
}

/**
 * Options for inconsistency detection
 */
export interface DetectionOptions {
  /** Base directory containing specforge data */
  baseDir: string
  /** Current code schema version */
  codeSchemaVersion?: string
  /** Check for design.md when state indicates design phase */
  checkDesignPhase?: boolean
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if file exists and is readable
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
 * Get file stats (returns null if file doesn't exist or not readable)
 */
async function getFileStats(filePath: string): Promise<{ size: number; mtime: Date } | null> {
  try {
    const stats = await stat(filePath)
    return { size: stats.size, mtime: stats.mtime }
  } catch {
    return null
  }
}

/**
 * Try to read and parse a JSON file
 */
async function readJsonFile<T = unknown>(filePath: string): Promise<{
  success: boolean
  data?: T
  error?: string
}> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const data = JSON.parse(content) as T
    return { success: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Try to read and parse events.jsonl
 * Returns array of parsed events or error info
 */
async function readEventsJsonl(
  filePath: string
): Promise<{
  success: boolean
  events?: Array<Record<string, unknown>>
  lineCount: number
  error?: string
}> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n').filter((line) => line.trim() !== '')
    const events: Array<Record<string, unknown>> = []

    for (const line of lines) {
      try {
        events.push(JSON.parse(line))
      } catch {
        // Return partial results with error
        return {
          success: false,
          events,
          lineCount: lines.length,
          error: `Invalid JSON at line ${events.length + 1}`
        }
      }
    }

    return { success: true, events, lineCount: lines.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, lineCount: 0, error: message }
  }
}

/**
 * Get the workflow phase from state
 */
function getWorkflowPhase(state: Record<string, unknown>): string | null {
  // Check various possible phase locations
  if (typeof state.phase === 'string') return state.phase
  if (typeof state.status === 'string') return state.status
  if (typeof state.workflow === 'object' && state.workflow !== null) {
    const workflow = state.workflow as Record<string, unknown>
    if (typeof workflow.phase === 'string') return workflow.phase
    if (typeof workflow.status === 'string') return workflow.status
  }
  return null
}

// ============================================================================
// Inconsistency Detection Logic
// ============================================================================

/**
 * Detect inconsistencies between events.jsonl and state.json
 * 
 * @param options Detection options including base directory
 * @returns Detection result with list of inconsistencies
 */
export async function detectInconsistencies(
  options: DetectionOptions
): Promise<InconsistencyDetectionResult> {
  const { baseDir, codeSchemaVersion, checkDesignPhase = true } = options

  const resolvedBaseDir = resolve(baseDir)
  const eventsPath = join(resolvedBaseDir, 'events.jsonl')
  const statePath = join(resolvedBaseDir, 'state.json')
  const designPath = join(resolvedBaseDir, 'design.md')

  const inconsistencies: Inconsistency[] = []

  // Check file existence and readability
  const [eventsExists, stateExists, designExists] = await Promise.all([
    fileExists(eventsPath),
    fileExists(statePath),
    checkDesignPhase ? fileExists(designPath) : Promise.resolve(false)
  ])

  const metadata = {
    detectedAt: new Date().toISOString(),
    eventsExists,
    stateExists,
    eventsReadable: eventsExists,
    stateReadable: stateExists
  }

  // Case 1: Both files missing
  if (!eventsExists && !stateExists) {
    inconsistencies.push({
      type: 'both_missing',
      severity: 'critical',
      message: 'Both events.jsonl and state.json are missing',
      files: [eventsPath, statePath],
      context: { baseDir: resolvedBaseDir }
    })
    return {
      hasInconsistency: true,
      inconsistencies,
      checkedFiles: {
        eventsJsonl: eventsPath,
        stateJson: statePath,
        designMd: checkDesignPhase ? designPath : null
      },
      metadata
    }
  }

  // Case 2: events.jsonl missing
  if (!eventsExists) {
    inconsistencies.push({
      type: 'events_missing',
      severity: 'critical',
      message: 'events.jsonl is missing but state.json exists',
      files: [eventsPath, statePath],
      context: { stateExists }
    })
  }

  // Case 3: state.json missing
  if (!stateExists) {
    inconsistencies.push({
      type: 'state_missing',
      severity: 'warning',
      message: 'state.json is missing but events.jsonl exists',
      files: [eventsPath, statePath],
      context: { eventsExists }
    })

    // Still try to read events for additional checks
    if (eventsExists) {
      const eventsResult = await readEventsJsonl(eventsPath)
      if (!eventsResult.success) {
        inconsistencies.push({
          type: 'events_corrupted',
          severity: 'critical',
          message: `events.jsonl is corrupted: ${eventsResult.error}`,
          files: [eventsPath],
          context: { lineCount: eventsResult.lineCount }
        })
      } else if (eventsResult.events && eventsResult.events.length === 0) {
        inconsistencies.push({
          type: 'events_empty',
          severity: 'warning',
          message: 'events.jsonl is empty',
          files: [eventsPath]
        })
      }
    }

    return {
      hasInconsistency: true,
      inconsistencies,
      checkedFiles: {
        eventsJsonl: eventsPath,
        stateJson: statePath,
        designMd: checkDesignPhase ? designPath : null
      },
      metadata
    }
  }

  // Both files exist, now check their contents
  const [eventsResult, stateResult] = await Promise.all([
    readEventsJsonl(eventsPath),
    readJsonFile<Record<string, unknown>>(statePath)
  ])

  // Check events.jsonl status
  if (!eventsResult.success) {
    inconsistencies.push({
      type: 'events_corrupted',
      severity: 'critical',
      message: `events.jsonl is corrupted: ${eventsResult.error}`,
      files: [eventsPath],
      context: { lineCount: eventsResult.lineCount }
    })
  } else if (eventsResult.events && eventsResult.events.length === 0) {
    inconsistencies.push({
      type: 'events_empty',
      severity: 'info',
      message: 'events.jsonl is empty (no events recorded)',
      files: [eventsPath]
    })
  }

  // Check state.json status
  if (!stateResult.success) {
    inconsistencies.push({
      type: 'state_corrupted',
      severity: 'critical',
      message: `state.json is corrupted: ${stateResult.error}`,
      files: [statePath]
    })
  } else if (stateResult.data) {
    // Validate state.json structure
    const state = stateResult.data

    // Check for required fields
    const hasRequiredFields = state.phase !== undefined || state.status !== undefined
    if (!hasRequiredFields) {
      inconsistencies.push({
        type: 'state_invalid_structure',
        severity: 'warning',
        message: 'state.json lacks required phase/status fields',
        files: [statePath],
        context: { fields: Object.keys(state) }
      })
    }

    // Check schema version if code version provided
    if (codeSchemaVersion && state.schema_version) {
      const fileVersion = String(state.schema_version)
      if (fileVersion !== codeSchemaVersion) {
        inconsistencies.push({
          type: 'version_mismatch',
          severity: 'warning',
          message: `Schema version mismatch: file has ${fileVersion}, code expects ${codeSchemaVersion}`,
          files: [statePath],
          context: { fileVersion, codeVersion: codeSchemaVersion }
        })
      }
    }

    // Check design phase vs design.md existence
    if (checkDesignPhase) {
      const phase = getWorkflowPhase(state)
      const designPhases = ['design', 'Designing', 'designing', 'DESIGN']

      if (phase && designPhases.includes(phase) && !designExists) {
        inconsistencies.push({
          type: 'design_missing',
          severity: 'warning',
          message: `State indicates "${phase}" phase but design.md does not exist`,
          files: [statePath, designPath],
          context: { detectedPhase: phase }
        })
      }
    }

    // Check sequence consistency between events and state
    if (eventsResult.success && eventsResult.events) {
      const eventCount = eventsResult.events.length
      const stateEventCount = typeof state.event_count === 'number'
        ? state.event_count
        : typeof state.lastEventIndex === 'number'
          ? state.lastEventIndex + 1
          : null

      if (stateEventCount !== null && stateEventCount !== eventCount) {
        inconsistencies.push({
          type: 'sequence_mismatch',
          severity: 'warning',
          message: `Event count mismatch: events.jsonl has ${eventCount}, state.json records ${stateEventCount}`,
          files: [eventsPath, statePath],
          context: { eventsCount: eventCount, stateCount: stateEventCount }
        })
      }
    }
  }

  // Case: Both corrupted
  if (
    eventsResult.success === false &&
    (stateResult.success === false || !stateResult.data)
  ) {
    inconsistencies.push({
      type: 'both_corrupted',
      severity: 'critical',
      message: 'Both events.jsonl and state.json are corrupted or invalid',
      files: [eventsPath, statePath]
    })
  }

  // Determine overall consistency
  const hasInconsistency = inconsistencies.length > 0

  // Add consistent result if no issues found
  if (!hasInconsistency) {
    inconsistencies.push({
      type: 'consistent',
      severity: 'info',
      message: 'events.jsonl and state.json are consistent',
      files: [eventsPath, statePath]
    })
  }

  return {
    hasInconsistency,
    inconsistencies,
    checkedFiles: {
      eventsJsonl: eventsPath,
      stateJson: statePath,
      designMd: checkDesignPhase ? designPath : null
    },
    metadata
  }
}

/**
 * Get severity level for an inconsistency type
 * 
 * Useful for determining repair priority
 */
export function getSeverityForType(type: InconsistencySeverity): InconsistencySeverity {
  return type
}

/**
 * Map inconsistency type to recommended repair action
 * 
 * This is used by the repair engine to determine appropriate fixes
 */
export function getRecommendedRepairAction(type: InconsistencyType): string {
  const actionMap: Record<InconsistencyType, string> = {
    events_missing: 'use_state_fallback',
    events_corrupted: 'use_state_fallback',
    events_empty: 'use_state_fallback',
    state_missing: 'rebuild_from_events',
    state_corrupted: 'rebuild_from_events',
    state_invalid_structure: 'rebuild_from_events',
    both_missing: 'fresh_start',
    both_corrupted: 'fresh_start',
    version_mismatch: 'rebuild_from_events',
    design_missing: 'rollback_to_requirements',
    sequence_mismatch: 'rebuild_from_events',
    consistent: 'no_action'
  }
  return actionMap[type]
}

/**
 * Check if inconsistency is repairable
 * 
 * Returns false for cases that require fresh start
 */
export function isRepairable(inconsistency: Inconsistency): boolean {
  const nonRepairableTypes: InconsistencyType[] = ['both_missing', 'both_corrupted', 'consistent']
  return !nonRepairableTypes.includes(inconsistency.type)
}

// ============================================================================
// InconsistencyDetector Class
// ============================================================================

/**
 * InconsistencyDetector provides a class-based interface for detecting
 * inconsistencies between events.jsonl and state.json
 * 
 * Requirements: 2.1, 2.2
 */
export class InconsistencyDetector {
  private baseDir: string
  private codeSchemaVersion?: string
  private checkDesignPhase: boolean

  /**
   * Create a new InconsistencyDetector
   * 
   * @param options Configuration options
   */
  constructor(options: DetectionOptions) {
    this.baseDir = options.baseDir
    this.codeSchemaVersion = options.codeSchemaVersion
    this.checkDesignPhase = options.checkDesignPhase ?? true
  }

  /**
   * Detect all inconsistencies
   */
  async detect(): Promise<InconsistencyDetectionResult> {
    return detectInconsistencies({
      baseDir: this.baseDir,
      codeSchemaVersion: this.codeSchemaVersion,
      checkDesignPhase: this.checkDesignPhase
    })
  }

  /**
   * Quick check - returns true if any inconsistency exists
   */
  async hasInconsistency(): Promise<boolean> {
    const result = await this.detect()
    return result.hasInconsistency
  }

  /**
   * Get inconsistencies filtered by severity
   */
  async getBySeverity(
    severity: InconsistencySeverity
  ): Promise<Inconsistency[]> {
    const result = await this.detect()
    return result.inconsistencies.filter((i) => i.severity === severity)
  }

  /**
   * Get only critical inconsistencies
   */
  async getCritical(): Promise<Inconsistency[]> {
    return this.getBySeverity('critical')
  }

  /**
   * Get repair recommendation for current inconsistencies
   */
  async getRepairRecommendations(): Promise<string[]> {
    const result = await this.detect()
    const actions = new Set<string>()

    for (const inconsistency of result.inconsistencies) {
      if (inconsistency.type !== 'consistent') {
        actions.add(getRecommendedRepairAction(inconsistency.type))
      }
    }

    return Array.from(actions)
  }

  /**
   * Update configuration
   */
  updateOptions(options: Partial<DetectionOptions>): void {
    if (options.baseDir !== undefined) this.baseDir = options.baseDir
    if (options.codeSchemaVersion !== undefined) {
      this.codeSchemaVersion = options.codeSchemaVersion
    }
    if (options.checkDesignPhase !== undefined) {
      this.checkDesignPhase = options.checkDesignPhase
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format inconsistencies for display/logging
 */
export function formatInconsistencies(
  result: InconsistencyDetectionResult
): string {
  const lines: string[] = []
  lines.push(`Inconsistency Detection Result:`)
  lines.push(`  Base: ${result.checkedFiles.eventsJsonl ? dirname(result.checkedFiles.eventsJsonl) : 'unknown'}`)
  lines.push(`  Has Inconsistency: ${result.hasInconsistency}`)
  lines.push(`  Files Checked:`)
  lines.push(`    - events.jsonl: ${result.checkedFiles.eventsJsonl ?? 'N/A'}`)
  lines.push(`    - state.json: ${result.checkedFiles.stateJson ?? 'N/A'}`)
  if (result.checkedFiles.designMd) {
    lines.push(`    - design.md: ${result.checkedFiles.designMd}`)
  }

  if (result.inconsistencies.length > 0) {
    lines.push(`  Inconsistencies Found (${result.inconsistencies.length}):`)
    for (const inc of result.inconsistencies) {
      if (inc.type === 'consistent') continue
      lines.push(`    - [${inc.severity.toUpperCase()}] ${inc.type}: ${inc.message}`)
    }
  }

  return lines.join('\n')
}

/**
 * Summarize inconsistencies as a simple object
 */
export function summarizeInconsistencies(
  result: InconsistencyDetectionResult
): {
  hasInconsistency: boolean
  criticalCount: number
  warningCount: number
  infoCount: number
  types: InconsistencyType[]
  repairActions: string[]
} {
  const types = new Set<InconsistencyType>()
  const repairActions = new Set<string>()

  let criticalCount = 0
  let warningCount = 0
  let infoCount = 0

  for (const inc of result.inconsistencies) {
    if (inc.type === 'consistent') continue

    types.add(inc.type)
    repairActions.add(getRecommendedRepairAction(inc.type))

    if (inc.severity === 'critical') criticalCount++
    else if (inc.severity === 'warning') warningCount++
    else if (inc.severity === 'info') infoCount++
  }

  return {
    hasInconsistency: result.hasInconsistency,
    criticalCount,
    warningCount,
    infoCount,
    types: Array.from(types),
    repairActions: Array.from(repairActions)
  }
}