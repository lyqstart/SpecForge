/**
 * HealingState Data Model
 * 
 * Represents the current state of the self-healing system for a work item.
 * Implements schema versioning for future migration support.
 * 
 * Requirements: SH-3, SH-4
 * Property 25: Healing Iteration Bound (iteration ≤ 3)
 */

import { z } from 'zod'

/**
 * Healing phase enumeration
 * V6.0 implements: idle, triggered, diagnosing, blocked
 * P2 stubs: proposing, approving, applying, verifying
 */
export type HealingPhase = 
  | 'idle'
  | 'triggered'
  | 'diagnosing'
  | 'proposing'
  | 'approving'
  | 'applying'
  | 'verifying'
  | 'blocked'

/**
 * Diagnosis report reference
 */
export interface DiagnosisReportRef {
  blobRef: string
  generatedAt: number
}

/**
 * Healing state history entry
 */
export interface HealingStateHistoryEntry {
  phase: HealingPhase
  enteredAt: number
  reason?: string
  diagnosisReportRef?: DiagnosisReportRef
}

/**
 * Blocked state details
 */
export interface BlockedStateDetails {
  reason: string
  blockedAt: number
}

/**
 * HealingState interface
 * 
 * Represents the current state of the self-healing system for a work item.
 * Includes schema versioning for future migration support.
 * 
 * Invariants:
 * - iteration must be between 1 and 3 (Property 25)
 * - currentPhase must be a valid HealingPhase
 * - history must be non-empty (at least one entry)
 * - if currentPhase is 'blocked', blocked field must be present
 */
export interface HealingState {
  schema_version: '1.0'
  workItemId: string
  currentPhase: HealingPhase
  iteration: number  // 1-3, enforced by Property 25
  history: HealingStateHistoryEntry[]
  blocked?: BlockedStateDetails
}

/**
 * Zod schema for HealingState validation
 */
const HealingStateSchema = z.object({
  schema_version: z.literal('1.0'),
  workItemId: z.string().min(1, 'workItemId must not be empty'),
  currentPhase: z.enum([
    'idle',
    'triggered',
    'diagnosing',
    'proposing',
    'approving',
    'applying',
    'verifying',
    'blocked',
  ]),
  iteration: z.number().int().min(1).max(3),
  history: z.array(
    z.object({
      phase: z.enum([
        'idle',
        'triggered',
        'diagnosing',
        'proposing',
        'approving',
        'applying',
        'verifying',
        'blocked',
      ]),
      enteredAt: z.number().positive(),
      reason: z.string().optional(),
      diagnosisReportRef: z.object({
        blobRef: z.string().min(1),
        generatedAt: z.number().positive(),
      }).optional(),
    })
  ).min(1, 'history must have at least one entry'),
  blocked: z.object({
    reason: z.string().min(1),
    blockedAt: z.number().positive(),
  }).optional(),
})

/**
 * Serialize HealingState to JSON string
 * 
 * @param state - The HealingState to serialize
 * @returns JSON string representation
 * @throws Error if state is invalid
 */
export function serializeHealingState(state: HealingState): string {
  // Validate before serialization
  const validated = HealingStateSchema.parse(state)
  return JSON.stringify(validated)
}

/**
 * Deserialize HealingState from JSON string
 * 
 * @param json - JSON string to deserialize
 * @returns Deserialized HealingState
 * @throws Error if JSON is invalid or doesn't match schema
 */
export function deserializeHealingState(json: string): HealingState {
  const parsed = JSON.parse(json)
  return HealingStateSchema.parse(parsed)
}

/**
 * Create a new HealingState for a work item
 * 
 * @param workItemId - The work item ID
 * @returns New HealingState in idle phase
 */
export function createHealingState(workItemId: string): HealingState {
  const now = Date.now()
  return {
    schema_version: '1.0',
    workItemId,
    currentPhase: 'idle',
    iteration: 1,
    history: [
      {
        phase: 'idle',
        enteredAt: now,
      },
    ],
  }
}

/**
 * Transition HealingState to a new phase
 * 
 * @param state - Current HealingState
 * @param newPhase - New phase to transition to
 * @param reason - Optional reason for transition
 * @param diagnosisReportRef - Optional diagnosis report reference
 * @returns New HealingState with updated phase
 * @throws Error if transition is invalid or iteration limit exceeded
 */
export function transitionHealingState(
  state: HealingState,
  newPhase: HealingPhase,
  reason?: string,
  diagnosisReportRef?: DiagnosisReportRef
): HealingState {
  const now = Date.now()
  
  // Validate current state
  HealingStateSchema.parse(state)
  
  // Check iteration bound (Property 25)
  if (newPhase === 'triggered' && state.iteration >= 3) {
    // 4th attempt should be blocked
    const blockedState: HealingState = {
      ...state,
      currentPhase: 'blocked',
      blocked: {
        reason: 'iteration_limit_exceeded',
        blockedAt: now,
      },
      history: [
        ...state.history,
        {
          phase: 'blocked',
          enteredAt: now,
          reason: 'iteration_limit_exceeded',
        },
      ],
    }
    return blockedState
  }
  
  // Increment iteration on triggered transition
  const newIteration = newPhase === 'triggered' ? state.iteration + 1 : state.iteration
  
  const newState: HealingState = {
    ...state,
    currentPhase: newPhase,
    iteration: newIteration,
    history: [
      ...state.history,
      {
        phase: newPhase,
        enteredAt: now,
        reason,
        diagnosisReportRef,
      },
    ],
  }
  
  // Add blocked details if transitioning to blocked
  if (newPhase === 'blocked' && reason) {
    newState.blocked = {
      reason,
      blockedAt: now,
    }
  }
  
  // Validate new state
  HealingStateSchema.parse(newState)
  
  return newState
}

/**
 * Get the current phase of a HealingState
 * 
 * @param state - The HealingState
 * @returns Current phase
 */
export function getCurrentPhase(state: HealingState): HealingPhase {
  return state.currentPhase
}

/**
 * Check if a HealingState is blocked
 * 
 * @param state - The HealingState
 * @returns true if state is blocked
 */
export function isBlocked(state: HealingState): boolean {
  return state.currentPhase === 'blocked'
}

/**
 * Check if a HealingState has reached iteration limit
 * 
 * @param state - The HealingState
 * @returns true if iteration >= 3
 */
export function hasReachedIterationLimit(state: HealingState): boolean {
  return state.iteration >= 3
}

/**
 * Get the last history entry
 * 
 * @param state - The HealingState
 * @returns Last history entry
 */
export function getLastHistoryEntry(state: HealingState): HealingStateHistoryEntry {
  return state.history[state.history.length - 1]
}

/**
 * Validate HealingState invariants
 * 
 * @param state - The HealingState to validate
 * @returns true if all invariants are satisfied
 */
export function validateHealingStateInvariants(state: HealingState): boolean {
  try {
    HealingStateSchema.parse(state)
    
    // Additional invariant checks
    if (state.currentPhase === 'blocked' && !state.blocked) {
      return false
    }
    
    if (state.iteration < 1 || state.iteration > 3) {
      return false
    }
    
    if (state.history.length === 0) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}
