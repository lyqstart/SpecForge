/**
 * Module Exports Test
 * 
 * Tests that all public API exports are correctly defined and accessible.
 * This test ensures the module boundary is properly defined and all
 * required types and functions are exported.
 * 
 * Requirements: All
 * Task: 1.2 Define module boundaries and exports
 */

import { describe, it, expect } from 'vitest'
import * as SelfHealing from '../src/index'

describe('Module Exports', () => {
  describe('Core Type Exports', () => {
    it('should export HealingPhase type', () => {
      // TypeScript types are not available at runtime, so we test by using them
      const phase: SelfHealing.HealingPhase = 'idle'
      expect(phase).toBe('idle')
      
      // Test all valid values
      const phases: SelfHealing.HealingPhase[] = ['idle', 'triggered', 'diagnosing', 'blocked']
      expect(phases).toHaveLength(4)
    })

    it('should export RiskTier type', () => {
      const tier: SelfHealing.RiskTier = 'L1'
      expect(tier).toBe('L1')
      
      // Test all valid values
      const tiers: SelfHealing.RiskTier[] = ['L1', 'L2', 'L3']
      expect(tiers).toHaveLength(3)
    })

    it('should export ConfidenceLevel type', () => {
      const level: SelfHealing.ConfidenceLevel = 'high'
      expect(level).toBe('high')
      
      // Test all valid values
      const levels: SelfHealing.ConfidenceLevel[] = ['high', 'medium', 'low']
      expect(levels).toHaveLength(3)
    })

    it('should export HealingState interface', () => {
      const state: SelfHealing.HealingState = {
        schema_version: '1.0',
        workItemId: 'test',
        currentPhase: 'idle',
        iteration: 1,
        history: [
          {
            phase: 'idle',
            enteredAt: Date.now(),
          },
        ],
      }
      expect(state.schema_version).toBe('1.0')
      expect(state.workItemId).toBe('test')
      expect(state.currentPhase).toBe('idle')
      expect(state.iteration).toBe(1)
    })

    it('should export DiagnosisReport interface', () => {
      const report: SelfHealing.DiagnosisReport = {
        schema_version: '1.0',
        reportId: 'test-report',
        workItemId: 'test-work-item',
        rootCause: 'test root cause',
        confidence: 'high',
        evidence: [],
        recommendedActions: [],
        generatedAt: Date.now(),
      }
      expect(report.schema_version).toBe('1.0')
      expect(report.reportId).toBe('test-report')
      expect(report.workItemId).toBe('test-work-item')
      expect(report.confidence).toBe('high')
    })
  })

  describe('Factory Function Exports', () => {
    it('should export createHealingState function', () => {
      expect(SelfHealing).toHaveProperty('createHealingState')
      expect(typeof SelfHealing.createHealingState).toBe('function')
      
      const state = SelfHealing.createHealingState('test-work-item')
      expect(state.schema_version).toBe('1.0')
      expect(state.workItemId).toBe('test-work-item')
      expect(state.currentPhase).toBe('idle')
    })

    it('should export createDiagnosisReport function', () => {
      expect(SelfHealing).toHaveProperty('createDiagnosisReport')
      expect(typeof SelfHealing.createDiagnosisReport).toBe('function')
      
      const report = SelfHealing.createDiagnosisReport({
        workItemId: 'test-work-item',
        rootCause: 'test root cause',
        confidence: 'high',
        evidence: [],
        recommendedActions: [],
      })
      expect(report.schema_version).toBe('1.0')
      expect(report.workItemId).toBe('test-work-item')
      expect(report.confidence).toBe('high')
    })

    it('should export createDiagnosticEvidence function', () => {
      expect(SelfHealing).toHaveProperty('createDiagnosticEvidence')
      expect(typeof SelfHealing.createDiagnosticEvidence).toBe('function')
      
      const evidence = SelfHealing.createDiagnosticEvidence({
        source: 'events',
        blobRef: 'blob://test',
        description: 'test evidence',
      })
      expect(evidence.source).toBe('events')
      expect(evidence.blobRef).toBe('blob://test')
    })

    it('should export createRecommendedAction function', () => {
      expect(SelfHealing).toHaveProperty('createRecommendedAction')
      expect(typeof SelfHealing.createRecommendedAction).toBe('function')
      
      const action = SelfHealing.createRecommendedAction({
        action: 'test action',
        riskTier: 'L1',
        description: 'test description',
      })
      expect(action.action).toBe('test action')
      expect(action.riskTier).toBe('L1')
    })
  })

  describe('Serialization Function Exports', () => {
    it('should export serializeHealingState function', () => {
      expect(SelfHealing).toHaveProperty('serializeHealingState')
      expect(typeof SelfHealing.serializeHealingState).toBe('function')
      
      const state = SelfHealing.createHealingState('test')
      const json = SelfHealing.serializeHealingState(state)
      expect(typeof json).toBe('string')
      expect(json).toContain('schema_version')
    })

    it('should export deserializeHealingState function', () => {
      expect(SelfHealing).toHaveProperty('deserializeHealingState')
      expect(typeof SelfHealing.deserializeHealingState).toBe('function')
      
      const state = SelfHealing.createHealingState('test')
      const json = SelfHealing.serializeHealingState(state)
      const deserialized = SelfHealing.deserializeHealingState(json)
      expect(deserialized.workItemId).toBe('test')
    })

    it('should export serializeDiagnosisReport function', () => {
      expect(SelfHealing).toHaveProperty('serializeDiagnosisReport')
      expect(typeof SelfHealing.serializeDiagnosisReport).toBe('function')
      
      const report = SelfHealing.createDiagnosisReport({
        workItemId: 'test',
        rootCause: 'test',
        confidence: 'high',
        evidence: [],
        recommendedActions: [],
      })
      const json = SelfHealing.serializeDiagnosisReport(report)
      expect(typeof json).toBe('string')
      expect(json).toContain('schema_version')
    })

    it('should export deserializeDiagnosisReport function', () => {
      expect(SelfHealing).toHaveProperty('deserializeDiagnosisReport')
      expect(typeof SelfHealing.deserializeDiagnosisReport).toBe('function')
      
      const report = SelfHealing.createDiagnosisReport({
        workItemId: 'test',
        rootCause: 'test',
        confidence: 'high',
        evidence: [],
        recommendedActions: [],
      })
      const json = SelfHealing.serializeDiagnosisReport(report)
      const deserialized = SelfHealing.deserializeDiagnosisReport(json)
      expect(deserialized.workItemId).toBe('test')
    })
  })

  describe('Validation Function Exports', () => {
    it('should export validateHealingStateInvariants function', () => {
      expect(SelfHealing).toHaveProperty('validateHealingStateInvariants')
      expect(typeof SelfHealing.validateHealingStateInvariants).toBe('function')
      
      const state = SelfHealing.createHealingState('test')
      const isValid = SelfHealing.validateHealingStateInvariants(state)
      expect(isValid).toBe(true)
    })

    it('should export validateDiagnosisReport function', () => {
      expect(SelfHealing).toHaveProperty('validateDiagnosisReport')
      expect(typeof SelfHealing.validateDiagnosisReport).toBe('function')
      
      const report = SelfHealing.createDiagnosisReport({
        workItemId: 'test',
        rootCause: 'test',
        confidence: 'high',
        evidence: [SelfHealing.createDiagnosticEvidence({
          source: 'events',
          blobRef: 'blob://test',
          description: 'test',
        })],
        recommendedActions: [SelfHealing.createRecommendedAction({
          action: 'test',
          riskTier: 'L1',
          description: 'test',
        })],
      })
      const errors = SelfHealing.validateDiagnosisReport(report)
      expect(errors).toHaveLength(0)
    })
  })

  describe('Utility Function Exports', () => {
    it('should export transitionHealingState function', () => {
      expect(SelfHealing).toHaveProperty('transitionHealingState')
      expect(typeof SelfHealing.transitionHealingState).toBe('function')
      
      const state = SelfHealing.createHealingState('test')
      const newState = SelfHealing.transitionHealingState(state, 'triggered', 'test')
      expect(newState.currentPhase).toBe('triggered')
    })

    it('should export getCurrentPhase function', () => {
      expect(SelfHealing).toHaveProperty('getCurrentPhase')
      expect(typeof SelfHealing.getCurrentPhase).toBe('function')
      
      const state = SelfHealing.createHealingState('test')
      const phase = SelfHealing.getCurrentPhase(state)
      expect(phase).toBe('idle')
    })

    it('should export isBlocked function', () => {
      expect(SelfHealing).toHaveProperty('isBlocked')
      expect(typeof SelfHealing.isBlocked).toBe('function')
      
      const state = SelfHealing.createHealingState('test')
      const isBlocked = SelfHealing.isBlocked(state)
      expect(isBlocked).toBe(false)
    })

    it('should export hasReachedIterationLimit function', () => {
      expect(SelfHealing).toHaveProperty('hasReachedIterationLimit')
      expect(typeof SelfHealing.hasReachedIterationLimit).toBe('function')
      
      const state = SelfHealing.createHealingState('test')
      const hasReached = SelfHealing.hasReachedIterationLimit(state)
      expect(hasReached).toBe(false)
    })

    it('should export getLastHistoryEntry function', () => {
      expect(SelfHealing).toHaveProperty('getLastHistoryEntry')
      expect(typeof SelfHealing.getLastHistoryEntry).toBe('function')
      
      const state = SelfHealing.createHealingState('test')
      const entry = SelfHealing.getLastHistoryEntry(state)
      expect(entry.phase).toBe('idle')
    })

    it('should export getActionsByRiskTier function', () => {
      expect(SelfHealing).toHaveProperty('getActionsByRiskTier')
      expect(typeof SelfHealing.getActionsByRiskTier).toBe('function')
      
      const report = SelfHealing.createDiagnosisReport({
        workItemId: 'test',
        rootCause: 'test',
        confidence: 'high',
        evidence: [],
        recommendedActions: [
          SelfHealing.createRecommendedAction({
            action: 'test L1',
            riskTier: 'L1',
            description: 'test',
          }),
          SelfHealing.createRecommendedAction({
            action: 'test L2',
            riskTier: 'L2',
            description: 'test',
          }),
        ],
      })
      const l1Actions = SelfHealing.getActionsByRiskTier(report, 'L1')
      expect(l1Actions).toHaveLength(1)
      expect(l1Actions[0].riskTier).toBe('L1')
    })

    it('should export getDiagnosisReportSummary function', () => {
      expect(SelfHealing).toHaveProperty('getDiagnosisReportSummary')
      expect(typeof SelfHealing.getDiagnosisReportSummary).toBe('function')
      
      const report = SelfHealing.createDiagnosisReport({
        workItemId: 'test',
        rootCause: 'test',
        confidence: 'high',
        evidence: [],
        recommendedActions: [
          SelfHealing.createRecommendedAction({
            action: 'test',
            riskTier: 'L1',
            description: 'test',
          }),
        ],
      })
      const summary = SelfHealing.getDiagnosisReportSummary(report)
      expect(summary.totalActions).toBe(1)
      expect(summary.actionsByTier.L1).toBe(1)
    })
  })

  describe('Constant Exports', () => {
    it('should export BUILTIN_ALLOWED_TYPES constant', () => {
      expect(SelfHealing).toHaveProperty('BUILTIN_ALLOWED_TYPES')
      expect(Array.isArray(SelfHealing.BUILTIN_ALLOWED_TYPES)).toBe(true)
      expect(SelfHealing.BUILTIN_ALLOWED_TYPES).toContain('requirements.missing_section')
      expect(SelfHealing.BUILTIN_ALLOWED_TYPES).toContain('markdown.format_error')
    })

    it('should export BUILTIN_EXCLUDED_TYPES constant', () => {
      expect(SelfHealing).toHaveProperty('BUILTIN_EXCLUDED_TYPES')
      expect(Array.isArray(SelfHealing.BUILTIN_EXCLUDED_TYPES)).toBe(true)
      expect(SelfHealing.BUILTIN_EXCLUDED_TYPES).toContain('code.logic_error')
      expect(SelfHealing.BUILTIN_EXCLUDED_TYPES).toContain('security.violation')
    })
  })

  describe('Interface Exports', () => {
    it('should export SelfHealingStateMachine interface', () => {
      // Test that it can be used as a type
      const machine: SelfHealing.SelfHealingStateMachine = {
        trigger: async () => ({ success: true, newState: SelfHealing.createHealingState('test') }),
        diagnose: async () => SelfHealing.createDiagnosisReport({
          workItemId: 'test',
          rootCause: 'test',
          confidence: 'high',
          evidence: [],
          recommendedActions: [],
        }),
        getState: async () => SelfHealing.createHealingState('test'),
        propose: async () => ({ 
          schema_version: '1.0',
          workItemId: 'test',
          actions: [],
          estimatedImpact: 'low',
        }),
        approve: async () => {},
        apply: async () => ({ success: true, appliedActions: [] }),
        verify: async () => ({ success: true, verifiedAt: Date.now() }),
      }
      expect(typeof machine.trigger).toBe('function')
      expect(typeof machine.diagnose).toBe('function')
      expect(typeof machine.getState).toBe('function')
    })

    it('should export supporting interface types', () => {
      // Test that supporting types can be used
      const triggerResult: SelfHealing.TriggerResult = {
        success: true,
        newState: SelfHealing.createHealingState('test'),
      }
      expect(triggerResult.success).toBe(true)
      
      const proposal: SelfHealing.Proposal = {
        schema_version: '1.0',
        workItemId: 'test',
        actions: [],
        estimatedImpact: 'low',
      }
      expect(proposal.schema_version).toBe('1.0')
      
      const approval: SelfHealing.Approval = {
        approved: true,
        approvedAt: Date.now(),
      }
      expect(approval.approved).toBe(true)
      
      const applyResult: SelfHealing.ApplyResult = {
        success: true,
        appliedActions: [],
      }
      expect(applyResult.success).toBe(true)
      
      const verifyResult: SelfHealing.VerifyResult = {
        success: true,
        verifiedAt: Date.now(),
      }
      expect(verifyResult.success).toBe(true)
      
      const allowedListConfig: SelfHealing.AllowedListConfig = {
        schema_version: '1.0',
        allowedTypes: [],
        excludedTypes: [],
        source: 'builtin',
      }
      expect(allowedListConfig.schema_version).toBe('1.0')
      
      const riskTierRulesConfig: SelfHealing.RiskTierRulesConfig = {
        schema_version: '1.0',
        rules: [],
      }
      expect(riskTierRulesConfig.schema_version).toBe('1.0')
      
      const healingEvent: SelfHealing.HealingEvent = {
        schema_version: '1.0',
        eventId: 'test-event',
        ts: Date.now(),
        projectId: 'test-project',
        workItemId: 'test-work-item',
        actor: null,
        category: 'heal',
        action: 'heal.triggered',
      }
      expect(healingEvent.schema_version).toBe('1.0')
      
      const agentIdentity: SelfHealing.AgentIdentity = {
        type: 'user',
        id: 'test-user',
      }
      expect(agentIdentity.type).toBe('user')
    })

    it('should export type aliases for backward compatibility', () => {
      // Test that type aliases can be used
      const phase: SelfHealing.HealingPhaseType = 'idle'
      expect(phase).toBe('idle')
      
      const tier: SelfHealing.RiskTierType = 'L1'
      expect(tier).toBe('L1')
      
      const level: SelfHealing.ConfidenceLevelType = 'high'
      expect(level).toBe('high')
      
      // Test builtin type aliases
      const allowedType: SelfHealing.BuiltinAllowedType = 'requirements.missing_section'
      expect(allowedType).toBe('requirements.missing_section')
      
      const excludedType: SelfHealing.BuiltinExcludedType = 'code.logic_error'
      expect(excludedType).toBe('code.logic_error')
    })
  })

  describe('Module Structure Validation', () => {
    it('should have schema_version field in all data structures', () => {
      const state = SelfHealing.createHealingState('test')
      expect(state.schema_version).toBe('1.0')
      
      const report = SelfHealing.createDiagnosisReport({
        workItemId: 'test',
        rootCause: 'test',
        confidence: 'high',
        evidence: [],
        recommendedActions: [],
      })
      expect(report.schema_version).toBe('1.0')
    })

    it('should enforce iteration bound in HealingState', () => {
      const state = SelfHealing.createHealingState('test')
      expect(state.iteration).toBe(1)
      
      // Test that iteration is validated
      const invalidState = { ...state, iteration: 5 }
      const isValid = SelfHealing.validateHealingStateInvariants(invalidState)
      expect(isValid).toBe(false)
    })

    it('should support all V6.0 healing phases', () => {
      const phases: SelfHealing.HealingPhase[] = ['idle', 'triggered', 'diagnosing', 'blocked']
      expect(phases).toHaveLength(4)
      
      // P2 phases should also be in the type
      const p2Phases: SelfHealing.HealingPhase[] = ['proposing', 'approving', 'applying', 'verifying']
      expect(p2Phases).toHaveLength(4)
    })

    it('should support all risk tiers', () => {
      const tiers: SelfHealing.RiskTier[] = ['L1', 'L2', 'L3']
      expect(tiers).toHaveLength(3)
    })

    it('should support all confidence levels', () => {
      const levels: SelfHealing.ConfidenceLevel[] = ['high', 'medium', 'low']
      expect(levels).toHaveLength(3)
    })
  })

  describe('Barrel Export Validation', () => {
    it('should re-export all types from healing-state module', () => {
      // Check that types from healing-state are available
      const state: SelfHealing.HealingState = SelfHealing.createHealingState('test')
      expect(state).toHaveProperty('history')
      expect(state.history[0]).toHaveProperty('enteredAt')
    })

    it('should re-export all types from diagnosis-report module', () => {
      // Check that types from diagnosis-report are available
      const evidence: SelfHealing.DiagnosticEvidence = SelfHealing.createDiagnosticEvidence({
        source: 'events',
        blobRef: 'blob://test',
        description: 'test',
      })
      expect(evidence).toHaveProperty('source')
      expect(evidence).toHaveProperty('blobRef')
    })

    it('should provide consistent type definitions across exports', () => {
      // Test that types are consistent
      const state1 = SelfHealing.createHealingState('test1')
      const state2: SelfHealing.HealingState = {
        schema_version: '1.0',
        workItemId: 'test2',
        currentPhase: 'idle',
        iteration: 1,
        history: [{ phase: 'idle', enteredAt: Date.now() }],
      }
      
      expect(state1.schema_version).toBe(state2.schema_version)
      expect(typeof state1.workItemId).toBe(typeof state2.workItemId)
    })
  })
})