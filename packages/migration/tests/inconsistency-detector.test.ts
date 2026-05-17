/**
 * Unit tests for InconsistencyDetector
 * 
 * Task 4.1: Implement inconsistency detection
 * Requirements: 2.1, 2.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import {
  detectInconsistencies,
  InconsistencyDetector,
  formatInconsistencies,
  summarizeInconsistencies,
  getRecommendedRepairAction,
  isRepairable,
  type InconsistencyType,
  type InconsistencyDetectionResult
} from '../src/inconsistency-detector'

// Helper to create temp directory
async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `migration-test-${Date.now()}`)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

// Helper to create test files
async function createTestFile(dir: string, filename: string, content: string): Promise<void> {
  await fs.writeFile(join(dir, filename), content, 'utf-8')
}

// Helper to delete test directory
async function cleanupDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

describe('InconsistencyDetector', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupDir(testDir)
  })

  describe('detectInconsistencies', () => {
    it('should detect both_missing when both files are absent', async () => {
      const result = await detectInconsistencies({ baseDir: testDir })

      expect(result.hasInconsistency).toBe(true)
      expect(result.inconsistencies).toHaveLength(1)
      expect(result.inconsistencies[0].type).toBe('both_missing')
      expect(result.inconsistencies[0].severity).toBe('critical')
    })

    it('should detect events_missing when only state.json exists', async () => {
      await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'requirements' }))

      const result = await detectInconsistencies({ baseDir: testDir })

      expect(result.hasInconsistency).toBe(true)
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('events_missing')
      // state.json exists, so no state_missing - just events_missing
    })

    it('should detect state_missing when only events.jsonl exists', async () => {
      await createTestFile(testDir, 'events.jsonl', '{"event": "test", "schema_version": "1.0.0"}')

      const result = await detectInconsistencies({ baseDir: testDir })

      expect(result.hasInconsistency).toBe(true)
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('state_missing')
    })

    it('should detect events_corrupted when events.jsonl has invalid JSON', async () => {
      await createTestFile(testDir, 'events.jsonl', 'not valid json{')
      await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'requirements', schema_version: '1.0.0' }))

      const result = await detectInconsistencies({ baseDir: testDir })

      expect(result.hasInconsistency).toBe(true)
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('events_corrupted')
    })

    it('should detect state_corrupted when state.json has invalid JSON', async () => {
      await createTestFile(testDir, 'events.jsonl', '{"event": "test"}')
      await createTestFile(testDir, 'state.json', 'not valid json{')

      const result = await detectInconsistencies({ baseDir: testDir })

      expect(result.hasInconsistency).toBe(true)
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('state_corrupted')
    })

    it('should detect events_empty when events.jsonl is empty', async () => {
      await createTestFile(testDir, 'events.jsonl', '')
      await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'requirements' }))

      const result = await detectInconsistencies({ baseDir: testDir })

      expect(result.hasInconsistency).toBe(true)
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('events_empty')
    })

    it('should detect version_mismatch when schema versions differ', async () => {
      await createTestFile(testDir, 'events.jsonl', '{"event": "test", "schema_version": "1.0.0"}')
      await createTestFile(testDir, 'state.json', JSON.stringify({ 
        phase: 'requirements', 
        schema_version: '1.0.0' 
      }))

      const result = await detectInconsistencies({ 
        baseDir: testDir, 
        codeSchemaVersion: '2.0.0' 
      })

      expect(result.hasInconsistency).toBe(true)
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('version_mismatch')
    })

    it('should detect design_missing when state says design but design.md missing', async () => {
      await createTestFile(testDir, 'events.jsonl', '{"event": "test"}')
      await createTestFile(testDir, 'state.json', JSON.stringify({ 
        phase: 'design',
        schema_version: '1.0.0' 
      }))

      const result = await detectInconsistencies({ baseDir: testDir, checkDesignPhase: true })

      expect(result.hasInconsistency).toBe(true)
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('design_missing')
    })

    it('should detect design_missing for various phase naming conventions', async () => {
      await createTestFile(testDir, 'events.jsonl', '{"event": "test"}')
      await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'Designing' }))

      const result = await detectInconsistencies({ baseDir: testDir })

      expect(result.hasInconsistency).toBe(true)
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('design_missing')
    })

    it('should NOT detect design_missing when design.md exists', async () => {
      await createTestFile(testDir, 'events.jsonl', '{"event": "test"}')
      await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'design' }))
      await createTestFile(testDir, 'design.md', '# Design Document')

      const result = await detectInconsistencies({ baseDir: testDir })

      const types = result.inconsistencies.map(i => i.type)
      expect(types).not.toContain('design_missing')
    })

    it('should detect sequence_mismatch when event counts differ', async () => {
      // Create events with 5 events
      const events = [
        { event: 'start', schema_version: '1.0.0' },
        { event: 'step1', schema_version: '1.0.0' },
        { event: 'step2', schema_version: '1.0.0' },
        { event: 'step3', schema_version: '1.0.0' },
        { event: 'end', schema_version: '1.0.0' }
      ]
      await createTestFile(testDir, 'events.jsonl', events.map(e => JSON.stringify(e)).join('\n'))
      
      // State says only 3 events
      await createTestFile(testDir, 'state.json', JSON.stringify({ 
        phase: 'completed', 
        event_count: 3 
      }))

      const result = await detectInconsistencies({ baseDir: testDir })

      expect(result.hasInconsistency).toBe(true)
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('sequence_mismatch')
    })

    it('should return consistent when both files are valid and matching', async () => {
      const events = [
        { event: 'start', schema_version: '1.0.0' },
        { event: 'end', schema_version: '1.0.0' }
      ]
      await createTestFile(testDir, 'events.jsonl', events.map(e => JSON.stringify(e)).join('\n'))
      await createTestFile(testDir, 'state.json', JSON.stringify({ 
        phase: 'completed', 
        schema_version: '1.0.0',
        event_count: 2 
      }))

      const result = await detectInconsistencies({ 
        baseDir: testDir, 
        codeSchemaVersion: '1.0.0' 
      })

      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('consistent')
      expect(result.hasInconsistency).toBe(false)
    })

    it('should detect state_invalid_structure when required fields missing', async () => {
      await createTestFile(testDir, 'events.jsonl', '{"event": "test"}')
      await createTestFile(testDir, 'state.json', JSON.stringify({ 
        data: 'some data',
        timestamp: 1234567890
      }))

      const result = await detectInconsistencies({ baseDir: testDir })

      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('state_invalid_structure')
    })
  })

  describe('InconsistencyDetector class', () => {
    it('should create detector with options', () => {
      const detector = new InconsistencyDetector({
        baseDir: '/test/dir',
        codeSchemaVersion: '1.0.0',
        checkDesignPhase: false
      })

      expect(detector).toBeDefined()
    })

    it('should detect using class interface', async () => {
      const detector = new InconsistencyDetector({ baseDir: testDir })
      const result = await detector.detect()

      expect(result.hasInconsistency).toBe(true)
      expect(result.inconsistencies[0].type).toBe('both_missing')
    })

    it('should have quick check method', async () => {
      await createTestFile(testDir, 'events.jsonl', '{"event": "test"}')
      await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'requirements' }))

      const detector = new InconsistencyDetector({ baseDir: testDir })
      const hasInconsistency = await detector.hasInconsistency()

      expect(hasInconsistency).toBe(false)
    })

    it('should filter by severity', async () => {
      await createTestFile(testDir, 'events.jsonl', '') // Empty causes events_empty (info)
      await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'design' })) 
      // design_missing is warning

      const detector = new InconsistencyDetector({ baseDir: testDir })
      const warnings = await detector.getBySeverity('warning')

      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0].severity).toBe('warning')
    })

    it('should get critical inconsistencies', async () => {
      await createTestFile(testDir, 'events.jsonl', 'invalid{')
      await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'requirements' }))

      const detector = new InconsistencyDetector({ baseDir: testDir })
      const critical = await detector.getCritical()

      expect(critical.length).toBeGreaterThan(0)
      expect(critical[0].severity).toBe('critical')
    })

    it('should get repair recommendations', async () => {
      // No files = fresh_start recommended
      const detector = new InconsistencyDetector({ baseDir: testDir })
      const recommendations = await detector.getRepairRecommendations()

      expect(recommendations).toContain('fresh_start')
    })

    it('should update options', async () => {
      const detector = new InconsistencyDetector({ baseDir: testDir })
      detector.updateOptions({ codeSchemaVersion: '2.0.0' })

      // Should not throw, options updated
      expect(detector).toBeDefined()
    })
  })

  describe('Utility functions', () => {
    it('getRecommendedRepairAction should return correct action for each type', () => {
      expect(getRecommendedRepairAction('events_missing')).toBe('use_state_fallback')
      expect(getRecommendedRepairAction('events_corrupted')).toBe('use_state_fallback')
      expect(getRecommendedRepairAction('events_empty')).toBe('use_state_fallback')
      expect(getRecommendedRepairAction('state_missing')).toBe('rebuild_from_events')
      expect(getRecommendedRepairAction('state_corrupted')).toBe('rebuild_from_events')
      expect(getRecommendedRepairAction('both_missing')).toBe('fresh_start')
      expect(getRecommendedRepairAction('both_corrupted')).toBe('fresh_start')
      expect(getRecommendedRepairAction('design_missing')).toBe('rollback_to_requirements')
      expect(getRecommendedRepairAction('sequence_mismatch')).toBe('rebuild_from_events')
      expect(getRecommendedRepairAction('version_mismatch')).toBe('rebuild_from_events')
      expect(getRecommendedRepairAction('consistent')).toBe('no_action')
    })

    it('isRepairable should correctly identify repairable types', () => {
      // Non-repairable
      expect(isRepairable({ type: 'both_missing', severity: 'critical', message: '', files: [] })).toBe(false)
      expect(isRepairable({ type: 'both_corrupted', severity: 'critical', message: '', files: [] })).toBe(false)
      expect(isRepairable({ type: 'consistent', severity: 'info', message: '', files: [] })).toBe(false)

      // Repairable
      expect(isRepairable({ type: 'events_missing', severity: 'critical', message: '', files: [] })).toBe(true)
      expect(isRepairable({ type: 'events_corrupted', severity: 'critical', message: '', files: [] })).toBe(true)
      expect(isRepairable({ type: 'state_missing', severity: 'warning', message: '', files: [] })).toBe(true)
      expect(isRepairable({ type: 'design_missing', severity: 'warning', message: '', files: [] })).toBe(true)
    })

    it('formatInconsistencies should produce readable output', async () => {
      const result = await detectInconsistencies({ baseDir: testDir })
      const formatted = formatInconsistencies(result)

      expect(formatted).toContain('Inconsistency Detection Result:')
      expect(formatted).toContain('Has Inconsistency: true')
    })

    it('summarizeInconsistencies should produce correct counts', async () => {
      await createTestFile(testDir, 'events.jsonl', '') // events_empty (info)
      await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'design' })) // design_missing (warning)

      const result = await detectInconsistencies({ baseDir: testDir })
      const summary = summarizeInconsistencies(result)

      expect(summary.hasInconsistency).toBe(true)
      expect(summary.warningCount).toBe(1)
      expect(summary.infoCount).toBe(1)
      expect(summary.types).toContain('design_missing')
      expect(summary.types).toContain('events_empty')
    })
  })

  describe('Edge cases', () => {
    it('should handle events with partial JSON lines', async () => {
      const content = '{"event": "start"}\n{"event": "middle"}\ninvalid json here\n{"event": "end"}'
      await createTestFile(testDir, 'events.jsonl', content)
      await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'requirements' }))

      const result = await detectInconsistencies({ baseDir: testDir })

      expect(result.hasInconsistency).toBe(true)
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('events_corrupted')
    })

    it('should handle state.json with _schema_version alternative', async () => {
      await createTestFile(testDir, 'events.jsonl', '{"event": "test"}')
      await createTestFile(testDir, 'state.json', JSON.stringify({ 
        phase: 'requirements',
        _schema_version: '1.0.0'
      }))

      // Should not throw
      const result = await detectInconsistencies({ 
        baseDir: testDir, 
        codeSchemaVersion: '1.0.0' 
      })

      expect(result).toBeDefined()
    })

    it('should handle state with nested workflow object', async () => {
      await createTestFile(testDir, 'events.jsonl', '{"event": "test"}')
      await createTestFile(testDir, 'state.json', JSON.stringify({
        workflow: {
          phase: 'design',
          status: 'in_progress'
        },
        schema_version: '1.0.0'
      }))

      const result = await detectInconsistencies({ baseDir: testDir, checkDesignPhase: true })

      // Should detect design_missing because nested phase is 'design' but design.md doesn't exist
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('design_missing')
    })

    it('should handle state with lastEventIndex as alternative to event_count', async () => {
      const events = [
        { event: 'start' },
        { event: 'middle' },
        { event: 'end' }
      ]
      await createTestFile(testDir, 'events.jsonl', events.map(e => JSON.stringify(e)).join('\n'))
      await createTestFile(testDir, 'state.json', JSON.stringify({ 
        lastEventIndex: 4  // This should be interpreted as 5 events (index 4 = 5th event)
      }))

      const result = await detectInconsistencies({ baseDir: testDir })

      // Should detect sequence mismatch because events has 3 but state says 5
      const types = result.inconsistencies.map(i => i.type)
      expect(types).toContain('sequence_mismatch')
    })

    it('should handle disabled design phase check', async () => {
      await createTestFile(testDir, 'events.jsonl', '{"event": "test"}')
      await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'design' }))

      const result = await detectInconsistencies({ baseDir: testDir, checkDesignPhase: false })

      const types = result.inconsistencies.map(i => i.type)
      expect(types).not.toContain('design_missing')
    })
  })
})