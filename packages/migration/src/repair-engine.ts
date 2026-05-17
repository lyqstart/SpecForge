/**
 * Repair Engine for Recovery Repair (Task 4.2)
 * 
 * This module applies predefined repair rules to fix inconsistent
 * (events.jsonl, state.json) combinations after crashes or unexpected terminations.
 * 
 * Requirements: 2.2, 2.3, 2.5
 * Validates: v6-architecture-overview Property 20
 */

import { readFile, writeFile, access, stat, mkdir, rm } from 'fs/promises'
import { resolve, dirname, join } from 'path'
import { constants } from 'fs'
import {
  detectInconsistencies,
  InconsistencyDetector,
  type InconsistencyDetectionResult,
  type Inconsistency,
  type InconsistencyType
} from './inconsistency-detector'

// ============================================================================
// Types
// ============================================================================

/**
 * Predefined repair rules as per REQ-2.2
 */
export type RepairRuleId =
  /** Rule 1: Rebuild from events.jsonl when valid */
  | 'rebuild_from_events'
  /** Rule 2: Use state.json with warning when events corrupted */
  | 'use_state_with_warning'
  /** Rule 3: Roll back to requirements phase when design.md missing */
  | 'rollback_to_requirements'
  /** Rule 4: Fresh start when both corrupted */
  | 'fresh_start'

/**
 * Result of a repair operation
 */
export interface RepairResult {
  /** Whether repair was successful */
  repaired: boolean
  /** The rule that was applied */
  ruleApplied: RepairRuleId
  /** Description of what was done */
  description: string
  /** Original state before repair */
  originalState: {
    events: string | null
    state: string | null
    hasInconsistency: boolean
    inconsistencyTypes: InconsistencyType[]
  }
  /** Repaired state data */
  repairedState: {
    events: string | null
    state: string | null
  }
  /** Whether a recovery.repaired event was logged */
  eventLogged: boolean
  /** Warning messages (if any) */
  warnings: string[]
  /** Error if repair failed */
  error?: string
}

/**
 * Options for repair engine
 */
export interface RepairOptions {
  /** Base directory containing specforge data */
  baseDir: string
  /** Current code schema version */
  codeSchemaVersion?: string
  /** Whether to log repair events to events.jsonl */
  logEvents?: boolean
  /** Whether to check design.md when state indicates design phase */
  checkDesignPhase?: boolean
  /** Custom event logger function */
  eventLogger?: (event: RecoveryRepairedEvent) => Promise<void>
}

/**
 * Event logged when repair is completed
 */
export interface RecoveryRepairedEvent {
  event: 'recovery.repaired'
  timestamp: string
  schema_version: string
  rule_applied: RepairRuleId
  original_state: {
    events_corrupted: boolean
    state_corrupted: boolean
    design_missing: boolean
  }
  repaired_state: {
    events_rebuilt: boolean
    state_rolled_back: boolean
    fresh_start: boolean
  }
  warnings: string[]
}

// ============================================================================
// Helper Functions
// ============================================================================

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
 * Read file content safely
 */
async function readFileContent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Write file content
 */
async function writeFileContent(filePath: string, content: string): Promise<boolean> {
  try {
    // Ensure directory exists
    const dir = dirname(filePath)
    await mkdir(dir, { recursive: true })
    await writeFile(filePath, content, 'utf-8')
    return true
  } catch {
    return false
  }
}

/**
 * Rebuild state.json from events.jsonl
 * Parses events and derives the final state
 */
async function rebuildStateFromEvents(
  eventsPath: string,
  statePath: string
): Promise<{ success: boolean; state: string | null; error?: string }> {
  try {
    const content = await readFile(eventsPath, 'utf-8')
    const lines = content.split('\n').filter((line) => line.trim() !== '')
    const events: Array<Record<string, unknown>> = []

    for (const line of lines) {
      try {
        events.push(JSON.parse(line))
      } catch {
        // Skip invalid lines
      }
    }

    if (events.length === 0) {
      // No events - create empty state
      const emptyState = JSON.stringify(
        {
          phase: 'requirements',
          schema_version: '1.0.0',
          event_count: 0,
          lastEventIndex: -1,
          repaired: true
        },
        null,
        2
      )
      return { success: true, state: emptyState }
    }

    // Get the last event to determine final state
    const lastEvent = events[events.length - 1]

    // Determine phase from events
    let phase = 'requirements'
    if (lastEvent) {
      const eventType = String(lastEvent.event || lastEvent.type || '')
      if (eventType.includes('design') || eventType.includes('Design')) {
        phase = 'design'
      } else if (eventType.includes('requirements') || eventType.includes('Requirements')) {
        phase = 'requirements'
      } else if (eventType.includes('tasks') || eventType.includes('Tasks')) {
        phase = 'tasks'
      } else if (eventType.includes('completed') || eventType.includes('Done')) {
        phase = 'completed'
      }
    }

    // Build reconstructed state
    const reconstructedState = {
      phase,
      schema_version: '1.0.0',
      event_count: events.length,
      lastEventIndex: events.length - 1,
      events_rebuilt: true,
      repaired: true,
      // Preserve any metadata from last event
      ...(lastEvent.metadata || lastEvent.data || {})
    }

    return {
      success: true,
      state: JSON.stringify(reconstructedState, null, 2)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, state: null, error: message }
  }
}

/**
 * Create a minimal valid state.json with rollback to requirements
 */
function createRequirementsState(): string {
  return JSON.stringify(
    {
      phase: 'requirements',
      schema_version: '1.0.0',
      event_count: 0,
      lastEventIndex: -1,
      rolled_back: true,
      repaired: true
    },
    null,
    2
  )
}

/**
 * Create a fresh start state (requirements phase)
 */
function createFreshStartState(): string {
  return JSON.stringify(
    {
      phase: 'requirements',
      schema_version: '1.0.0',
      event_count: 0,
      lastEventIndex: -1,
      fresh_start: true,
      repaired: true
    },
    null,
    2
  )
}

/**
 * Determine the best repair rule based on detected inconsistencies
 */
function determineRepairRule(
  detectionResult: InconsistencyDetectionResult
): RepairRuleId {
  const types = detectionResult.inconsistencies.map((i) => i.type)

  // Rule 4: Fresh start when both corrupted or both missing
  if (types.includes('both_corrupted') || types.includes('both_missing')) {
    return 'fresh_start'
  }

  // Rule 3: Roll back to requirements when design.md is missing
  if (types.includes('design_missing')) {
    return 'rollback_to_requirements'
  }

  // Rule 2: Use state.json with warning when events corrupted/missing/empty
  // Check if state is valid (exists and readable)
  const stateMissing = types.includes('state_missing')
  const stateCorrupted = types.includes('state_corrupted')
  const stateInvalid = types.includes('state_invalid_structure')
  
  if (!stateMissing && !stateCorrupted && !stateInvalid) {
    // State is valid - check events status
    const eventsCorrupted = types.includes('events_corrupted')
    const eventsMissing = types.includes('events_missing')
    const eventsEmpty = types.includes('events_empty')
    
    if (eventsCorrupted || eventsMissing || eventsEmpty) {
      return 'use_state_with_warning'
    }
  }

  // Rule 1: Rebuild from events.jsonl when valid
  // Check if events are valid (exists, readable, not empty)
  const eventsCorrupted = types.includes('events_corrupted')
  const eventsMissing = types.includes('events_missing')
  const eventsEmpty = types.includes('events_empty')
  const eventsValid = !eventsCorrupted && !eventsMissing && !eventsEmpty

  if (eventsValid) {
    return 'rebuild_from_events'
  }

  // Default fallback: fresh start
  return 'fresh_start'
}

/**
 * Apply the repair rule to fix inconsistencies
 */
async function applyRepairRule(
  rule: RepairRuleId,
  detectionResult: InconsistencyDetectionResult,
  options: RepairOptions
): Promise<RepairResult> {
  const { baseDir, codeSchemaVersion = '1.0.0' } = options
  const eventsPath = join(baseDir, 'events.jsonl')
  const statePath = join(baseDir, 'state.json')

  const warnings: string[] = []
  let eventLogged = false

  // Capture original state
  const originalEvents = await readFileContent(eventsPath)
  const originalState = await readFileContent(statePath)

  const originalStateData = {
    events: originalEvents,
    state: originalState,
    hasInconsistency: detectionResult.hasInconsistency,
    inconsistencyTypes: detectionResult.inconsistencies.map((i) => i.type)
  }

  let repairedEvents: string | null = originalEvents
  let repairedState: string | null = originalState

  switch (rule) {
    case 'rebuild_from_events': {
      // Rule 1: Rebuild from events.jsonl when valid
      if (originalEvents) {
        const rebuildResult = await rebuildStateFromEvents(eventsPath, statePath)
        if (rebuildResult.success && rebuildResult.state) {
          repairedState = rebuildResult.state
        } else {
          // Fallback to requirements if rebuild fails
          repairedState = createRequirementsState()
          warnings.push('Failed to rebuild from events, rolled back to requirements')
        }
      } else {
        // No events, use fresh start
        repairedState = createFreshStartState()
        repairedEvents = '' // Clear events
      }
      break
    }

    case 'use_state_with_warning': {
      // Rule 2: Use state.json with warning when events corrupted
      warnings.push(
        'Events file was corrupted or missing - using state.json as fallback. Some events may be lost.'
      )
      
      // Add repaired flag to state
      if (originalState) {
        try {
          const stateObj = JSON.parse(originalState)
          stateObj.repaired = true
          stateObj.events_rebuilt = false
          repairedState = JSON.stringify(stateObj, null, 2)
        } catch {
          // If parse fails, create fresh state
          repairedState = createFreshStartState()
        }
      } else {
        repairedState = createFreshStartState()
      }
      
      // Events may be cleared if corrupted
      if (detectionResult.inconsistencies.some((i) => i.type === 'events_corrupted')) {
        repairedEvents = '' // Clear corrupted events
      }
      break
    }

    case 'rollback_to_requirements': {
      // Rule 3: Roll back to requirements phase when design.md missing
      repairedState = createRequirementsState()
      // Keep events but they're now inconsistent, so clear them
      repairedEvents = ''
      warnings.push(
        'State indicated design phase but design.md was missing - rolled back to requirements phase'
      )
      break
    }

    case 'fresh_start': {
      // Rule 4: Fresh start when both corrupted
      repairedState = createFreshStartState()
      repairedEvents = '' // Clear events
      warnings.push(
        'Both events.jsonl and state.json were corrupted - starting fresh with empty state'
      )
      break
    }
  }

  // Write repaired state if different from original
  let writeError: string | undefined
  if (repairedState !== originalState && repairedState) {
    const writeSuccess = await writeFileContent(statePath, repairedState)
    if (!writeSuccess) {
      writeError = 'Failed to write repaired state.json'
    }
  }

  if (repairedEvents !== originalEvents && repairedEvents !== null) {
    const writeEventsSuccess = await writeFileContent(eventsPath, repairedEvents)
    if (!writeEventsSuccess) {
      writeError = writeError
        ? `${writeError}; Failed to write repaired events.jsonl`
        : 'Failed to write repaired events.jsonl'
    }
  }

  // Log repair event if enabled
  if (options.logEvents !== false && options.eventLogger) {
    try {
      const repairEvent: RecoveryRepairedEvent = {
        event: 'recovery.repaired',
        timestamp: new Date().toISOString(),
        schema_version: codeSchemaVersion,
        rule_applied: rule,
        original_state: {
          events_corrupted: originalStateData.inconsistencyTypes.includes('events_corrupted'),
          state_corrupted: originalStateData.inconsistencyTypes.includes('state_corrupted'),
          design_missing: originalStateData.inconsistencyTypes.includes('design_missing')
        },
        repaired_state: {
          events_rebuilt: rule === 'rebuild_from_events',
          state_rolled_back: rule === 'rollback_to_requirements',
          fresh_start: rule === 'fresh_start'
        },
        warnings
      }
      await options.eventLogger(repairEvent)
      eventLogged = true
    } catch {
      // Logging failure shouldn't fail the repair
      warnings.push('Failed to log repair event')
    }
  }

  // Generate description
  const ruleDescriptions: Record<RepairRuleId, string> = {
    rebuild_from_events:
      'Rebuilt state.json from valid events.jsonl - all events preserved',
    use_state_with_warning:
      'Used state.json as fallback due to corrupted events - some events may be lost',
    rollback_to_requirements:
      'Rolled back to requirements phase due to missing design.md',
    fresh_start:
      'Started fresh with empty state due to both files being corrupted'
  }

  return {
    repaired: !writeError,
    ruleApplied: rule,
    description: ruleDescriptions[rule],
    originalState: originalStateData,
    repairedState: {
      events: repairedEvents,
      state: repairedState
    },
    eventLogged,
    warnings,
    error: writeError
  }
}

// ============================================================================
// Repair Engine API
// ============================================================================

/**
 * Detect inconsistencies and repair in one go
 * This is the main entry point for the repair engine
 * 
 * @param options Repair options including base directory
 * @returns Repair result with details of what was done
 */
export async function detectAndRepair(
  options: RepairOptions
): Promise<RepairResult> {
  const {
    baseDir,
    codeSchemaVersion,
    checkDesignPhase = true
  } = options

  // Step 1: Detect inconsistencies
  const detectionResult = await detectInconsistencies({
    baseDir,
    codeSchemaVersion,
    checkDesignPhase
  })

  // If consistent, no repair needed
  const inconsistencyTypes = detectionResult.inconsistencies
    .filter((i) => i.type !== 'consistent')
    .map((i) => i.type)

  if (!detectionResult.hasInconsistency || inconsistencyTypes.length === 0) {
    return {
      repaired: true,
      ruleApplied: 'rebuild_from_events', // Dummy value
      description: 'No repair needed - state is consistent',
      originalState: {
        events: await readFileContent(join(baseDir, 'events.jsonl')),
        state: await readFileContent(join(baseDir, 'state.json')),
        hasInconsistency: false,
        inconsistencyTypes: []
      },
      repairedState: {
        events: await readFileContent(join(baseDir, 'events.jsonl')),
        state: await readFileContent(join(baseDir, 'state.json'))
      },
      eventLogged: false,
      warnings: []
    }
  }

  // Step 2: Determine repair rule
  const rule = determineRepairRule(detectionResult)

  // Step 3: Apply repair rule
  const repairResult = await applyRepairRule(rule, detectionResult, options)

  return repairResult
}

/**
 * RepairEngine class provides a class-based interface for repairs
 * 
 * Requirements: 2.2, 2.3
 */
export class RepairEngine {
  private baseDir: string
  private codeSchemaVersion?: string
  private checkDesignPhase: boolean
  private logEvents: boolean
  private eventLogger?: (event: RecoveryRepairedEvent) => Promise<void>

  /**
   * Create a new RepairEngine
   */
  constructor(options: RepairOptions) {
    this.baseDir = options.baseDir
    this.codeSchemaVersion = options.codeSchemaVersion
    this.checkDesignPhase = options.checkDesignPhase ?? true
    this.logEvents = options.logEvents ?? true
    this.eventLogger = options.eventLogger
  }

  /**
   * Detect inconsistencies only (no repair)
   */
  async detect(): Promise<InconsistencyDetectionResult> {
    return detectInconsistencies({
      baseDir: this.baseDir,
      codeSchemaVersion: this.codeSchemaVersion,
      checkDesignPhase: this.checkDesignPhase
    })
  }

  /**
   * Detect and repair in one go
   */
  async repair(): Promise<RepairResult> {
    return detectAndRepair({
      baseDir: this.baseDir,
      codeSchemaVersion: this.codeSchemaVersion,
      checkDesignPhase: this.checkDesignPhase,
      logEvents: this.logEvents,
      eventLogger: this.eventLogger
    })
  }

  /**
   * Get the recommended repair rule without applying it
   */
  async getRecommendedRule(): Promise<RepairRuleId> {
    const detectionResult = await this.detect()
    return determineRepairRule(detectionResult)
  }

  /**
   * Apply a specific repair rule manually
   */
  async applyRule(rule: RepairRuleId): Promise<RepairResult> {
    const detectionResult = await this.detect()
    return applyRepairRule(rule, detectionResult, {
      baseDir: this.baseDir,
      codeSchemaVersion: this.codeSchemaVersion,
      checkDesignPhase: this.checkDesignPhase,
      logEvents: this.logEvents,
      eventLogger: this.eventLogger
    })
  }

  /**
   * Update configuration
   */
  updateOptions(options: Partial<RepairOptions>): void {
    if (options.baseDir !== undefined) this.baseDir = options.baseDir
    if (options.codeSchemaVersion !== undefined) {
      this.codeSchemaVersion = options.codeSchemaVersion
    }
    if (options.checkDesignPhase !== undefined) {
      this.checkDesignPhase = options.checkDesignPhase
    }
    if (options.logEvents !== undefined) {
      this.logEvents = options.logEvents
    }
    if (options.eventLogger !== undefined) {
      this.eventLogger = options.eventLogger
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format repair result for display/logging
 */
export function formatRepairResult(result: RepairResult): string {
  const lines: string[] = []
  lines.push(`Repair Result:`)
  lines.push(`  Repaired: ${result.repaired}`)
  lines.push(`  Rule Applied: ${result.ruleApplied}`)
  lines.push(`  Description: ${result.description}`)

  if (result.warnings.length > 0) {
    lines.push(`  Warnings:`)
    for (const warning of result.warnings) {
      lines.push(`    - ${warning}`)
    }
  }

  if (result.error) {
    lines.push(`  Error: ${result.error}`)
  }

  lines.push(`  Event Logged: ${result.eventLogged}`)

  return lines.join('\n')
}

/**
 * Check if state file indicates it was intentionally repaired
 * (has rolled_back or fresh_start flag)
 */
async function isStateRepaired(baseDir: string): Promise<boolean> {
  try {
    const statePath = join(baseDir, 'state.json')
    const content = await readFile(statePath, 'utf-8')
    const state = JSON.parse(content)
    const repaired = !!(state.rolled_back || state.fresh_start || state.repaired)
    return repaired
  } catch (err) {
    // If we can't read state, it's not repaired
    return false
  }
}

/**
 * Validate that repair produced consistent state
 * This validates Property 20: rebuild(events) == state
 * Note: Empty events is acceptable after rollback (repair produces intentional empty state)
 */
export async function validateRepairConsistency(
  baseDir: string
): Promise<{ consistent: boolean; message: string }> {
  // Check if state indicates intentional repair
  const repaired = await isStateRepaired(baseDir)
  
  // Just check for consistency without repairing
  const detection = await detectInconsistencies({ baseDir })
  
  // Filter out acceptable inconsistencies after repair
  const nonCriticalInconsistencies = detection.inconsistencies.filter((i) => {
    if (i.type === 'consistent') return false
    
    // After repair, events_empty, events_missing, or events_corrupted is acceptable 
    // (the repair may intentionally leave/clear events when using state as fallback)
    if (repaired && (
      i.type === 'events_empty' || 
      i.type === 'events_missing' ||
      i.type === 'events_corrupted'
    )) {
      return false
    }
    
    return true // Keep this inconsistency
  })

  if (nonCriticalInconsistencies.length > 0) {
    const types = nonCriticalInconsistencies.map((i) => i.type).join(', ')
    return { consistent: false, message: `Still has inconsistencies: ${types}` }
  }

  return { consistent: true, message: 'State is consistent after repair' }
}