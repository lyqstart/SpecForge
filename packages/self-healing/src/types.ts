export type HealingPhase = 'idle' | 'triggered' | 'diagnosing' | 'blocked'
export type RiskTier = 'L1' | 'L2' | 'L3'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface HealingState {
  schema_version: '1.0'
  workItemId: string
  currentPhase: HealingPhase
  iteration: number
}

export interface DiagnosisReport {
  schema_version: '1.0'
  workItemId: string
  rootCause: string
  confidence: ConfidenceLevel
  generatedAt: number
}

export interface SelfHealingStateMachine {
  trigger(params: any): Promise<any>
  diagnose(workItemId: string): Promise<DiagnosisReport>
  getState(workItemId: string): Promise<HealingState>
}
