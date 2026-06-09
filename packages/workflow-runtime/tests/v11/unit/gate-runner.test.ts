/**
 * Feature: specforge-v1-1-compliance-remediation
 * Unit tests for Gate Runner
 *
 * Requirements: 3.5-3.9
 */

import { describe, it, expect } from 'vitest';
import { GateRunner } from '@/v11/runtime/GateRunner';
import type { GateDefinition } from '@/v11/runtime/GateRunner';

describe('GateRunner', () => {
  describe('Gate execution', () => {
    it('should execute gates and collect results', async () => {
      const runner = new GateRunner();
      runner.registerGate({
        gate_id: 'test_gate',
        gate_type: 'hard_gate',
        required: true,
        checkFn: () => ({
          gate_id: 'test_gate',
          passed: true,
          status: 'passed' as const,
          reason: 'All checks passed',
          executed_at: new Date().toISOString(),
        }),
      });

      const result = await runner.runGates();
      expect(result.all_passed).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].gate_id).toBe('test_gate');
      expect(result.results[0].passed).toBe(true);
    });

    it('should detect failed gates', async () => {
      const runner = new GateRunner();
      runner.registerGate({
        gate_id: 'failing_gate',
        gate_type: 'hard_gate',
        required: true,
        checkFn: () => ({
          gate_id: 'failing_gate',
          passed: false,
          status: 'failed' as const,
          reason: 'Missing required section',
          executed_at: new Date().toISOString(),
        }),
      });

      const result = await runner.runGates();
      expect(result.all_passed).toBe(false);
      expect(result.summary.failed).toBe(1);
    });

    it('should handle gate execution errors', async () => {
      const runner = new GateRunner();
      runner.registerGate({
        gate_id: 'error_gate',
        gate_type: 'hard_gate',
        required: true,
        checkFn: () => {
          throw new Error('Gate crashed');
        },
      });

      const result = await runner.runGates();
      expect(result.all_passed).toBe(false);
      expect(result.results[0].status).toBe('failed');
    });
  });

  describe('Gate summary generation', () => {
    it('should generate readable gate summary markdown', async () => {
      const runner = new GateRunner();
      runner.registerGate({
        gate_id: 'gate_1',
        gate_type: 'hard_gate',
        required: true,
        checkFn: () => ({
          gate_id: 'gate_1',
          passed: true,
          status: 'passed' as const,
          reason: 'OK',
          executed_at: new Date().toISOString(),
        }),
      });

      const result = await runner.runGates();
      const markdown = runner.generateGateSummaryMarkdown(result);

      expect(markdown).toContain('# Gate Summary');
      expect(markdown).toContain('gate_1');
      expect(markdown).toContain('PASSED');
    });
  });

  describe('State transition determination', () => {
    it('should transition to approval_required when all pass', async () => {
      const runner = new GateRunner();
      runner.registerGate({
        gate_id: 'test',
        gate_type: 'hard_gate',
        required: true,
        checkFn: () => ({
          gate_id: 'test',
          passed: true,
          status: 'passed' as const,
          reason: 'OK',
          executed_at: new Date().toISOString(),
        }),
      });

      const result = await runner.runGates();
      expect(runner.determineNextState(result)).toBe('approval_required');
    });

    it('should transition to gates_failed when any fails', async () => {
      const runner = new GateRunner();
      runner.registerGate({
        gate_id: 'test',
        gate_type: 'hard_gate',
        required: true,
        checkFn: () => ({
          gate_id: 'test',
          passed: false,
          status: 'failed' as const,
          reason: 'Failed',
          executed_at: new Date().toISOString(),
        }),
      });

      const result = await runner.runGates();
      expect(runner.determineNextState(result)).toBe('gates_failed');
    });
  });
});
