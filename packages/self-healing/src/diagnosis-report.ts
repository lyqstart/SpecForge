/**
 * DiagnosisReport Data Model
 *
 * Represents the structured analysis output of the self-healing diagnosis phase.
 * Includes root cause hypothesis, evidence, and recommended repair actions.
 *
 * Validates: Requirements SH-3, SH-4
 */

import { v4 as uuidv4 } from 'uuid'

/**
 * Confidence level for diagnosis analysis
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

/**
 * Risk tier classification for repair actions
 */
export type RiskTier = 'L1' | 'L2' | 'L3'

/**
 * Evidence source type
 */
export type EvidenceSource = 'events' | 'state' | 'artifacts' | 'analysis'

/**
 * Individual piece of evidence supporting the diagnosis
 */
export interface DiagnosticEvidence {
  /** Source of the evidence */
  source: EvidenceSource

  /** CAS blob reference for the evidence data */
  blobRef: string

  /** Human-readable description of the evidence */
  description: string

  /** Optional: Confidence in this evidence (0-1) */
  confidence?: number

  /** Optional: Timestamp when evidence was collected */
  collectedAt?: number
}

/**
 * Recommended repair action with risk assessment
 */
export interface RecommendedAction {
  /** Unique identifier for this action */
  id: string

  /** Description of the action to take */
  action: string

  /** Risk tier of this action (L1/L2/L3) */
  riskTier: RiskTier

  /** Detailed description of what this action does */
  description: string

  /** Optional: Estimated effort to implement (in minutes) */
  estimatedEffort?: number

  /** Optional: Preconditions that must be met before applying this action */
  preconditions?: string[]

  /** Optional: Expected outcome if action is successful */
  expectedOutcome?: string
}

/**
 * Structured diagnosis report containing root cause analysis and recommendations
 *
 * Schema version: 1.0
 * Validates: Requirements SH-3, SH-4
 */
export interface DiagnosisReport {
  /** Schema version for migration support */
  schema_version: '1.0'

  /** Unique identifier for this report */
  reportId: string

  /** Work item ID that triggered this diagnosis */
  workItemId: string

  /** Root cause hypothesis */
  rootCause: string

  /** Confidence level in the root cause analysis */
  confidence: ConfidenceLevel

  /** Collection of evidence supporting the diagnosis */
  evidence: DiagnosticEvidence[]

  /** Recommended repair actions */
  recommendedActions: RecommendedAction[]

  /** Timestamp when report was generated (milliseconds since epoch) */
  generatedAt: number

  /** Optional: Iteration number if this is a retry diagnosis */
  iteration?: number

  /** Optional: Additional context or notes */
  notes?: string

  /** Optional: CAS blob reference to full analysis data */
  analysisDataRef?: string
}

/**
 * Factory function to create a new DiagnosisReport
 *
 * @param params - Report creation parameters
 * @returns A new DiagnosisReport instance
 */
export function createDiagnosisReport(params: {
  workItemId: string
  rootCause: string
  confidence: ConfidenceLevel
  evidence: DiagnosticEvidence[]
  recommendedActions: RecommendedAction[]
  iteration?: number
  notes?: string
  analysisDataRef?: string
}): DiagnosisReport {
  return {
    schema_version: '1.0',
    reportId: uuidv4(),
    workItemId: params.workItemId,
    rootCause: params.rootCause,
    confidence: params.confidence,
    evidence: params.evidence,
    recommendedActions: params.recommendedActions,
    generatedAt: Date.now(),
    iteration: params.iteration,
    notes: params.notes,
    analysisDataRef: params.analysisDataRef,
  }
}

/**
 * Factory function to create a DiagnosticEvidence instance
 *
 * @param params - Evidence creation parameters
 * @returns A new DiagnosticEvidence instance
 */
export function createDiagnosticEvidence(params: {
  source: EvidenceSource
  blobRef: string
  description: string
  confidence?: number
  collectedAt?: number
}): DiagnosticEvidence {
  return {
    source: params.source,
    blobRef: params.blobRef,
    description: params.description,
    confidence: params.confidence,
    collectedAt: params.collectedAt ?? Date.now(),
  }
}

/**
 * Factory function to create a RecommendedAction instance
 *
 * @param params - Action creation parameters
 * @returns A new RecommendedAction instance
 */
export function createRecommendedAction(params: {
  action: string
  riskTier: RiskTier
  description: string
  estimatedEffort?: number
  preconditions?: string[]
  expectedOutcome?: string
}): RecommendedAction {
  return {
    id: uuidv4(),
    action: params.action,
    riskTier: params.riskTier,
    description: params.description,
    estimatedEffort: params.estimatedEffort,
    preconditions: params.preconditions,
    expectedOutcome: params.expectedOutcome,
  }
}

/**
 * Serialize a DiagnosisReport to JSON string
 *
 * @param report - The report to serialize
 * @returns JSON string representation
 */
export function serializeDiagnosisReport(report: DiagnosisReport): string {
  return JSON.stringify(report)
}

/**
 * Deserialize a DiagnosisReport from JSON string
 *
 * @param json - JSON string to deserialize
 * @returns Parsed DiagnosisReport
 * @throws Error if JSON is invalid or schema_version is not '1.0'
 */
export function deserializeDiagnosisReport(json: string): DiagnosisReport {
  const parsed = JSON.parse(json)

  // Validate schema version
  if (parsed.schema_version !== '1.0') {
    throw new Error(
      `Invalid schema_version: expected '1.0', got '${parsed.schema_version}'`
    )
  }

  // Validate required fields
  const requiredFields = [
    'reportId',
    'workItemId',
    'rootCause',
    'confidence',
    'evidence',
    'recommendedActions',
    'generatedAt',
  ]

  for (const field of requiredFields) {
    if (!(field in parsed)) {
      throw new Error(`Missing required field: ${field}`)
    }
  }

  // Validate confidence level
  const validConfidenceLevels: ConfidenceLevel[] = ['high', 'medium', 'low']
  if (!validConfidenceLevels.includes(parsed.confidence)) {
    throw new Error(
      `Invalid confidence level: ${parsed.confidence}. Must be one of: ${validConfidenceLevels.join(', ')}`
    )
  }

  // Validate evidence array
  if (!Array.isArray(parsed.evidence)) {
    throw new Error('evidence must be an array')
  }

  // Validate recommended actions array
  if (!Array.isArray(parsed.recommendedActions)) {
    throw new Error('recommendedActions must be an array')
  }

  return parsed as DiagnosisReport
}

/**
 * Validate a DiagnosisReport for consistency and completeness
 *
 * @param report - The report to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateDiagnosisReport(report: DiagnosisReport): string[] {
  const errors: string[] = []

  // Validate schema version
  if (report.schema_version !== '1.0') {
    errors.push(`Invalid schema_version: ${report.schema_version}`)
  }

  // Validate reportId is non-empty
  if (!report.reportId || report.reportId.trim() === '') {
    errors.push('reportId must be non-empty')
  }

  // Validate workItemId is non-empty
  if (!report.workItemId || report.workItemId.trim() === '') {
    errors.push('workItemId must be non-empty')
  }

  // Validate rootCause is non-empty
  if (!report.rootCause || report.rootCause.trim() === '') {
    errors.push('rootCause must be non-empty')
  }

  // Validate confidence level
  const validConfidenceLevels: ConfidenceLevel[] = ['high', 'medium', 'low']
  if (!validConfidenceLevels.includes(report.confidence)) {
    errors.push(
      `Invalid confidence level: ${report.confidence}. Must be one of: ${validConfidenceLevels.join(', ')}`
    )
  }

  // Validate evidence array is not empty
  if (!Array.isArray(report.evidence) || report.evidence.length === 0) {
    errors.push('evidence array must not be empty')
  }

  // Validate each evidence item
  for (let i = 0; i < report.evidence.length; i++) {
    const evidence = report.evidence[i]
    if (!evidence.blobRef || evidence.blobRef.trim() === '') {
      errors.push(`evidence[${i}].blobRef must be non-empty`)
    }
    if (!evidence.description || evidence.description.trim() === '') {
      errors.push(`evidence[${i}].description must be non-empty`)
    }
    if (evidence.confidence !== undefined) {
      if (
        typeof evidence.confidence !== 'number' ||
        evidence.confidence < 0 ||
        evidence.confidence > 1
      ) {
        errors.push(`evidence[${i}].confidence must be a number between 0 and 1`)
      }
    }
  }

  // Validate recommended actions array is not empty
  if (!Array.isArray(report.recommendedActions) || report.recommendedActions.length === 0) {
    errors.push('recommendedActions array must not be empty')
  }

  // Validate each recommended action
  const validRiskTiers: RiskTier[] = ['L1', 'L2', 'L3']
  for (let i = 0; i < report.recommendedActions.length; i++) {
    const action = report.recommendedActions[i]
    if (!action.id || action.id.trim() === '') {
      errors.push(`recommendedActions[${i}].id must be non-empty`)
    }
    if (!action.action || action.action.trim() === '') {
      errors.push(`recommendedActions[${i}].action must be non-empty`)
    }
    if (!validRiskTiers.includes(action.riskTier)) {
      errors.push(
        `recommendedActions[${i}].riskTier must be one of: ${validRiskTiers.join(', ')}`
      )
    }
    if (!action.description || action.description.trim() === '') {
      errors.push(`recommendedActions[${i}].description must be non-empty`)
    }
  }

  // Validate generatedAt is a valid timestamp
  if (typeof report.generatedAt !== 'number' || report.generatedAt <= 0) {
    errors.push('generatedAt must be a positive number (milliseconds since epoch)')
  }

  // Validate iteration if present
  if (report.iteration !== undefined) {
    if (typeof report.iteration !== 'number' || report.iteration < 1 || report.iteration > 3) {
      errors.push('iteration must be a number between 1 and 3')
    }
  }

  return errors
}

/**
 * Get all recommended actions for a specific risk tier
 *
 * @param report - The diagnosis report
 * @param tier - The risk tier to filter by
 * @returns Array of recommended actions for the specified tier
 */
export function getActionsByRiskTier(
  report: DiagnosisReport,
  tier: RiskTier
): RecommendedAction[] {
  return report.recommendedActions.filter((action) => action.riskTier === tier)
}

/**
 * Get summary statistics for a diagnosis report
 *
 * @param report - The diagnosis report
 * @returns Summary object with counts and statistics
 */
export function getDiagnosisReportSummary(report: DiagnosisReport): {
  totalEvidence: number
  totalActions: number
  actionsByTier: Record<RiskTier, number>
  averageEvidenceConfidence: number
} {
  const actionsByTier: Record<RiskTier, number> = {
    L1: 0,
    L2: 0,
    L3: 0,
  }

  for (const action of report.recommendedActions) {
    actionsByTier[action.riskTier]++
  }

  const evidenceWithConfidence = report.evidence.filter((e) => e.confidence !== undefined)
  const averageEvidenceConfidence =
    evidenceWithConfidence.length > 0
      ? evidenceWithConfidence.reduce((sum, e) => sum + (e.confidence ?? 0), 0) /
        evidenceWithConfidence.length
      : 0

  return {
    totalEvidence: report.evidence.length,
    totalActions: report.recommendedActions.length,
    actionsByTier,
    averageEvidenceConfidence,
  }
}
