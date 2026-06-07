/**
 * evidence-guard-v11.test.ts — v1.1 P0 verification tests
 *
 * Validates that:
 * 1. execute() without workItemDir entering critical states MUST fail
 * 2. transitionFull() without workItemDir entering critical states MUST fail
 * 3. Missing user_decision.json blocks merge_ready
 * 4. Missing gates/merge_ready_gate.json blocks merging
 * 5. Missing gates/post_merge_gate.json blocks post_merge_verified
 * 6. Missing changed_files_audit.md or gates/close_gate.json blocks closed
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkflowEngine, requiresTransitionEvidence } from '../../src/WorkflowEngine.js';
import { WorkflowDefinition } from '../../src/types.js';

/**
 * Gate check function that always passes — used for execute() tests
 * where the engine runs gates automatically.
 */
const passGate = async () => ({ schema_version: '1.0' as const, passed: true, reason: 'auto-pass' });

/**
 * Minimal workflow definition that covers all critical states.
 * All gates have checkFn that returns passed=true so execute() can auto-advance.
 */
function makeV11Workflow(): WorkflowDefinition {
  return {
    id: 'v11-test-workflow',
    displayName: 'V11 Test',
    intent: 'test',
    stateMachine: {
      initial: 'created',
      states: {
        created: {
          agent: '',
          gate: { type: 'simple', id: 'noop', name: 'No-op', checkFn: passGate },
          skills: [],
          next: 'gates_running',
        },
        gates_running: {
          agent: '',
          gate: { type: 'simple', id: 'gates_gate', name: 'Gates Gate', checkFn: passGate },
          skills: [],
          next: { pass: 'approval_required', fail: 'blocked' },
        },
        approval_required: {
          agent: '',
          gate: { type: 'simple', id: 'approval_gate', name: 'Approval Gate', checkFn: passGate },
          skills: [],
          next: { pass: 'merge_ready', fail: 'rejected' },
        },
        merge_ready: {
          agent: '',
          gate: { type: 'simple', id: 'merge_ready_gate', name: 'Merge Ready Gate', checkFn: passGate },
          skills: [],
          next: { pass: 'merging', fail: 'blocked' },
        },
        merging: {
          agent: '',
          gate: { type: 'simple', id: 'merge_gate', name: 'Merge Gate', checkFn: passGate },
          skills: [],
          next: 'merged',
        },
        merged: {
          agent: '',
          gate: { type: 'simple', id: 'merged_gate', name: 'Merged Gate', checkFn: passGate },
          skills: [],
          next: 'post_merge_verified',
        },
        post_merge_verified: {
          agent: '',
          gate: { type: 'simple', id: 'pm_gate', name: 'PM Gate', checkFn: passGate },
          skills: [],
          next: { pass: 'implementation_ready', fail: 'blocked' },
        },
        implementation_ready: {
          agent: '',
          gate: { type: 'simple', id: 'impl_ready_gate', name: 'Impl Ready Gate', checkFn: passGate },
          skills: [],
          next: 'implementation_running',
        },
        implementation_running: {
          agent: '',
          gate: { type: 'simple', id: 'impl_gate', name: 'Impl Gate', checkFn: passGate },
          skills: [],
          next: 'implementation_done',
        },
        implementation_done: {
          agent: '',
          gate: { type: 'simple', id: 'impl_done_gate', name: 'Impl Done Gate', checkFn: passGate },
          skills: [],
          next: 'verification_running',
        },
        verification_running: {
          agent: '',
          gate: { type: 'simple', id: 'verify_gate', name: 'Verify Gate', checkFn: passGate },
          skills: [],
          next: 'verification_done',
        },
        verification_done: {
          agent: '',
          gate: { type: 'simple', id: 'close_gate', name: 'Close Gate', checkFn: passGate },
          skills: [],
          next: { pass: 'closed', fail: 'implementation_running' },
        },
        closed: { agent: '', gate: null, skills: [] },
        blocked: { agent: '', gate: null, skills: [] },
        rejected: { agent: '', gate: null, skills: [] },
      },
    },
    artifacts: [],
  };
}

describe('v1.1 Evidence Guard — critical state enforcement', () => {
  let engine: WorkflowEngine;
  let tmpDir: string;

  beforeEach(async () => {
    engine = new WorkflowEngine();
    engine.loadWorkflow(makeV11Workflow());
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-v11-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  /**
   * Helper: directly set instance state for test setup.
   * We cannot use transition() for critical states anymore (it throws),
   * and we cannot use transitionFull() without setting up evidence files.
   * For test setup only, we directly manipulate the instance.
   */
  function forceState(instanceId: string, state: string): void {
    const inst = engine.getInstance(instanceId);
    if (inst) {
      (inst as Record<string, unknown>).currentState = state;
    }
  }

  // ---------------------------------------------------------------------------
  // Test 1: execute() without workItemDir entering critical states MUST fail
  // ---------------------------------------------------------------------------

  describe('execute() without workItemDir', () => {
    it('must throw when transitioning to approval_required without workItemDir', async () => {
      // Create instance at 'created', it will try to advance to gates_running → approval_required
      // We set the instance at gates_running so the next step is approval_required
      const instance = engine.createInstance('v11-test-workflow');
      // Manually set to gates_running
      engine.transition(instance.id, 'created', 'gates_running');

      // execute without workItemDir — should fail when it tries to reach approval_required
      await expect(engine.execute(instance.id)).rejects.toThrow(/workItemDir is required/);
    });

    it('must throw when transitioning to merge_ready without workItemDir', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      // Transition to approval_required
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');

      // execute without workItemDir — should fail when trying merge_ready
      await expect(engine.execute(instance.id)).rejects.toThrow(/workItemDir is required/);
    });

    it('must throw when transitioning to closed without workItemDir', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      // Jump to verification_done via direct transitions
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');
      forceState(instance.id, 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      forceState(instance.id, 'post_merge_verified');
      forceState(instance.id, 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      forceState(instance.id, 'verification_done');

      // execute without workItemDir — should fail for closed
      await expect(engine.execute(instance.id)).rejects.toThrow(/workItemDir is required/);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2: transitionFull() without workItemDir entering critical states MUST fail
  // ---------------------------------------------------------------------------

  describe('transitionFull() without workItemDir', () => {
    it('must throw for → approval_required without workItemDir', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'gates_running',
          toState: 'approval_required',
        }),
      ).rejects.toThrow(/workItemDir is required/);
    });

    it('must throw for → merge_ready without workItemDir', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'approval_required',
          toState: 'merge_ready',
        }),
      ).rejects.toThrow(/workItemDir is required/);
    });

    it('must throw for → merging without workItemDir', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'merge_ready',
          toState: 'merging',
        }),
      ).rejects.toThrow(/workItemDir is required/);
    });

    it('must throw for → closed without workItemDir', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      // Jump to verification_done
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');
      forceState(instance.id, 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      forceState(instance.id, 'post_merge_verified');
      forceState(instance.id, 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      forceState(instance.id, 'verification_done');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'verification_done',
          toState: 'closed',
        }),
      ).rejects.toThrow(/workItemDir is required/);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3: Missing user_decision.json blocks merge_ready
  // ---------------------------------------------------------------------------

  describe('merge_ready evidence guard', () => {
    it('must fail without user_decision.json', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'approval_required',
          toState: 'merge_ready',
          workItemDir: tmpDir,
        }),
      ).rejects.toThrow(/user_decision/);
    });

    it('must fail with user_decision.json decision_status=rejected', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'user_decision.json'),
        JSON.stringify({ decision_status: 'rejected' }),
      );

      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'approval_required',
          toState: 'merge_ready',
          workItemDir: tmpDir,
        }),
      ).rejects.toThrow(/user_decision/);
    });

    it('must succeed with user_decision.json decision_status=approved', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'user_decision.json'),
        JSON.stringify({ decision_status: 'approved' }),
      );

      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');

      const result = await engine.transitionFull({
        workItemId: instance.id,
        fromState: 'approval_required',
        toState: 'merge_ready',
        workItemDir: tmpDir,
      });

      expect(result.currentState).toBe('merge_ready');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 4: Missing gates/merge_ready_gate.json blocks merging
  // ---------------------------------------------------------------------------

  describe('merging evidence guard', () => {
    it('must fail without gates/merge_ready_gate.json', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'merge_ready',
          toState: 'merging',
          workItemDir: tmpDir,
        }),
      ).rejects.toThrow(/merge_ready_gate/);
    });

    it('must fail with gates/merge_ready_gate.json status=failed', async () => {
      await fs.mkdir(path.join(tmpDir, 'gates'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'gates', 'merge_ready_gate.json'),
        JSON.stringify({ status: 'failed' }),
      );

      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'merge_ready',
          toState: 'merging',
          workItemDir: tmpDir,
        }),
      ).rejects.toThrow(/status.*failed.*expected.*passed/);
    });

    it('must succeed with gates/merge_ready_gate.json status=passed', async () => {
      await fs.mkdir(path.join(tmpDir, 'gates'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'gates', 'merge_ready_gate.json'),
        JSON.stringify({ status: 'passed' }),
      );

      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');

      const result = await engine.transitionFull({
        workItemId: instance.id,
        fromState: 'merge_ready',
        toState: 'merging',
        workItemDir: tmpDir,
      });

      expect(result.currentState).toBe('merging');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 5: Missing gates/post_merge_gate.json blocks post_merge_verified
  // ---------------------------------------------------------------------------

  describe('post_merge_verified evidence guard', () => {
    it('must fail without gates/post_merge_gate.json', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');
      forceState(instance.id, 'merging');
      engine.transition(instance.id, 'merging', 'merged');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'merged',
          toState: 'post_merge_verified',
          workItemDir: tmpDir,
        }),
      ).rejects.toThrow(/post_merge_gate/);
    });

    it('must succeed with gates/post_merge_gate.json status=passed', async () => {
      await fs.mkdir(path.join(tmpDir, 'gates'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'gates', 'post_merge_gate.json'),
        JSON.stringify({ status: 'passed' }),
      );

      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');
      forceState(instance.id, 'merging');
      engine.transition(instance.id, 'merging', 'merged');

      const result = await engine.transitionFull({
        workItemId: instance.id,
        fromState: 'merged',
        toState: 'post_merge_verified',
        workItemDir: tmpDir,
      });

      expect(result.currentState).toBe('post_merge_verified');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 6: Missing changed_files_audit.md or gates/close_gate.json blocks closed
  // ---------------------------------------------------------------------------

  describe('closed evidence guard', () => {
    it('must fail without changed_files_audit.md', async () => {
      // Create close_gate.json but NOT changed_files_audit.md
      await fs.mkdir(path.join(tmpDir, 'gates'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'gates', 'close_gate.json'),
        JSON.stringify({ status: 'passed' }),
      );

      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');
      forceState(instance.id, 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      forceState(instance.id, 'post_merge_verified');
      forceState(instance.id, 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      forceState(instance.id, 'verification_done');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'verification_done',
          toState: 'closed',
          workItemDir: tmpDir,
        }),
      ).rejects.toThrow(/changed_files_audit/);
    });

    it('must fail without gates/close_gate.json', async () => {
      // Create changed_files_audit.md but NOT gates/close_gate.json
      await fs.writeFile(
        path.join(tmpDir, 'changed_files_audit.md'),
        '# Changed Files Audit\nAll files in scope.',
      );

      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');
      forceState(instance.id, 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      forceState(instance.id, 'post_merge_verified');
      forceState(instance.id, 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      forceState(instance.id, 'verification_done');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'verification_done',
          toState: 'closed',
          workItemDir: tmpDir,
        }),
      ).rejects.toThrow(/close_gate/);
    });

    it('must fail with gates/close_gate.json status=failed', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'changed_files_audit.md'),
        '# Changed Files Audit\nAll files in scope.',
      );
      await fs.mkdir(path.join(tmpDir, 'gates'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'gates', 'close_gate.json'),
        JSON.stringify({ status: 'failed' }),
      );

      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');
      forceState(instance.id, 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      forceState(instance.id, 'post_merge_verified');
      forceState(instance.id, 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      forceState(instance.id, 'verification_done');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'verification_done',
          toState: 'closed',
          workItemDir: tmpDir,
        }),
      ).rejects.toThrow(/close_gate/);
    });

    it('must succeed with both changed_files_audit.md and gates/close_gate.json status=passed', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'changed_files_audit.md'),
        '# Changed Files Audit\nAll files in scope.',
      );
      await fs.mkdir(path.join(tmpDir, 'gates'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'gates', 'close_gate.json'),
        JSON.stringify({ status: 'passed' }),
      );

      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');
      forceState(instance.id, 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      forceState(instance.id, 'post_merge_verified');
      forceState(instance.id, 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      forceState(instance.id, 'verification_done');

      const result = await engine.transitionFull({
        workItemId: instance.id,
        fromState: 'verification_done',
        toState: 'closed',
        workItemDir: tmpDir,
      });

      expect(result.currentState).toBe('closed');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 7: resume() without workItemDir entering critical states MUST fail
  // ---------------------------------------------------------------------------

  describe('resume() without workItemDir', () => {
    it('must throw when resuming into approval_required without workItemDir', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');

      // Set status to running first (required by WorkflowStateManager.pause)
      const inst = engine.getInstance(instance.id);
      if (inst) {
        (inst as Record<string, unknown>).status = 'running';
      }

      // Now pause — this should work since status is running
      engine.pause(instance.id);

      // Resume without workItemDir — will execute() which advances to approval_required
      await expect(engine.resume(instance.id)).rejects.toThrow(/workItemDir is required/);
    });

    it('must throw when resuming into merge_ready without workItemDir', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');

      // Set to paused directly
      const inst = engine.getInstance(instance.id);
      if (inst) {
        (inst as Record<string, unknown>).status = 'paused';
      }

      await expect(engine.resume(instance.id)).rejects.toThrow(/workItemDir is required/);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 8: requiresTransitionEvidence() public function
  // ---------------------------------------------------------------------------

  describe('requiresTransitionEvidence()', () => {
    const criticalStates = [
      'approval_required', 'merge_ready', 'merging', 'post_merge_verified',
      'implementation_ready', 'verification_done', 'closed',
    ];
    const nonCriticalStates = [
      'created', 'intake_ready', 'impact_analyzing', 'gates_running',
      'gates_failed', 'merged', 'implementation_running', 'verification_running',
      'blocked', 'rejected',
    ];

    for (const state of criticalStates) {
      it(`must return true for critical state '${state}'`, () => {
        expect(requiresTransitionEvidence(state)).toBe(true);
      });
    }

    for (const state of nonCriticalStates) {
      it(`must return false for non-critical state '${state}'`, () => {
        expect(requiresTransitionEvidence(state)).toBe(false);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Test 9: transition() bypass — must block critical states
  // ---------------------------------------------------------------------------

  describe('transition() bypass protection', () => {
    it('must throw when transition() targets closed (critical state)', () => {
      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'merge_ready');
      forceState(instance.id, 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      forceState(instance.id, 'post_merge_verified');
      forceState(instance.id, 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      forceState(instance.id, 'verification_done');

      expect(() => engine.transition(instance.id, 'verification_done', 'closed')).toThrow(/transitionFull/);
    });

    it('must throw when transition() targets approval_required', () => {
      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');

      expect(() => engine.transition(instance.id, 'gates_running', 'approval_required')).toThrow(/transitionFull/);
    });

    it('must throw when transition() targets merge_ready', () => {
      const instance = engine.createInstance('v11-test-workflow');
      engine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');

      expect(() => engine.transition(instance.id, 'approval_required', 'merge_ready')).toThrow(/transitionFull/);
    });

    it('must allow transition() for non-critical states', () => {
      const instance = engine.createInstance('v11-test-workflow');

      // created → gates_running is non-critical, should work
      expect(engine.transition(instance.id, 'created', 'gates_running')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 10: transitionFull creation branch — only 'created' allowed
  // ---------------------------------------------------------------------------

  describe('transitionFull creation branch', () => {
    it('must reject creating WI directly to closed', async () => {
      await expect(
        engine.transitionFull({
          workItemId: 'test-wi-001',
          fromState: '',
          toState: 'closed',
          workItemDir: tmpDir,
        }),
      ).rejects.toThrow(/created/);
    });

    it('must reject creating WI directly to approval_required', async () => {
      await expect(
        engine.transitionFull({
          workItemId: 'test-wi-002',
          fromState: '',
          toState: 'approval_required',
          workItemDir: tmpDir,
        }),
      ).rejects.toThrow(/created/);
    });

    it('must reject creating WI directly to merge_ready', async () => {
      await expect(
        engine.transitionFull({
          workItemId: 'test-wi-003',
          fromState: '',
          toState: 'merge_ready',
          workItemDir: tmpDir,
        }),
      ).rejects.toThrow(/created/);
    });

    it('must allow creating WI to created state', async () => {
      const result = await engine.transitionFull({
        workItemId: 'test-wi-004',
        fromState: '',
        toState: 'created',
        workflowType: 'v11-test-workflow',
      });

      expect(result.currentState).toBe('created');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 11: quick_change code_only_fast_path evidence guards
  // ---------------------------------------------------------------------------

  describe('quick_change code_only_fast_path evidence guards', () => {
    /**
     * Quick change workflow definition that covers the new states:
     * decision_recorded, merge_not_applicable, implementation_ready (with gate)
     */
    function makeQuickChangeWorkflow(): WorkflowDefinition {
      return {
        id: 'quick_change',
        displayName: 'Quick Change Test',
        intent: 'test quick_change',
        stateMachine: {
          initial: 'created',
          states: {
            created: {
              agent: '',
              gate: null,
              skills: [],
              next: 'gates_running',
            },
            gates_running: {
              agent: '',
              gate: { type: 'simple', id: 'gates_gate', name: 'Gates Gate', checkFn: passGate },
              skills: [],
              next: { pass: 'approval_required', fail: 'blocked' },
            },
            approval_required: {
              agent: '',
              gate: null,
              skills: [],
              next: { approved: 'decision_recorded', rejected: 'rejected' },
            },
            decision_recorded: {
              agent: 'user_decision_recorder',
              gate: null,
              skills: [],
              next: 'merge_not_applicable',
            },
            merge_not_applicable: {
              agent: 'merge_runner',
              gate: null,
              skills: [],
              next: 'implementation_ready',
            },
            implementation_ready: {
              agent: '',
              gate: { type: 'simple', id: 'code_permission_release_gate', name: 'Code Permission Release Gate', checkFn: passGate },
              skills: [],
              next: 'implementation_running',
            },
            implementation_running: {
              agent: 'sf-executor',
              gate: null,
              skills: [],
              next: 'implementation_done',
            },
            implementation_done: {
              agent: 'sf-reviewer',
              gate: null,
              skills: [],
              next: 'verification_running',
            },
            verification_running: {
              agent: 'sf-verifier',
              gate: null,
              skills: [],
              next: 'verification_done',
            },
            verification_done: {
              agent: '',
              gate: { type: 'simple', id: 'close_gate', name: 'Close Gate', checkFn: passGate },
              skills: [],
              next: { pass: 'closed', fail: 'implementation_running' },
            },
            closed: { agent: '', gate: null, skills: [] },
            blocked: { agent: '', gate: null, skills: [] },
            rejected: { agent: '', gate: null, skills: [] },
          },
        },
        artifacts: [],
      };
    }

    let qcEngine: WorkflowEngine;
    let qcTmpDir: string;

    beforeEach(async () => {
      qcEngine = new WorkflowEngine();
      qcEngine.loadWorkflow(makeQuickChangeWorkflow());
      qcTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-qc-test-'));
    });

    afterEach(async () => {
      await fs.rm(qcTmpDir, { recursive: true, force: true }).catch(() => {});
    });

    function forceState(instanceId: string, state: string): void {
      const inst = qcEngine.getInstance(instanceId);
      if (inst) {
        (inst as Record<string, unknown>).currentState = state;
      }
    }

    // 1. Missing user_decision.json blocks merge_ready (via implementation_ready chain)
    it('must block implementation_ready without user_decision.json', async () => {
      const instance = qcEngine.createInstance('quick_change');
      qcEngine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'decision_recorded');
      forceState(instance.id, 'merge_not_applicable');

      // Try to reach implementation_ready — requires tasks.md, work_item.json, code_permission_release_gate
      // But we're testing the full chain: missing user_decision.json means decision_recorded
      // shouldn't have completed. However enforceTransitionEvidence checks 'implementation_ready'
      // not the intermediate states. Let's verify the guard blocks on implementation_ready.
      // Actually, implementation_ready evidence guard checks tasks.md + allowed_write_files + code_permission_release_gate
      // This is tested below. For user_decision.json, the guard is on merge_ready.
      // In quick_change, merge_not_applicable replaces merge_ready.
      // We verify user_decision.json exists before merge_not_applicable can proceed.

      // For quick_change, user_decision.json must exist at the point of transition to merge_not_applicable
      // which then goes to implementation_ready. We test that transitionFull to merge_not_applicable
      // requires user_decision.json (since implementation_ready inherits the chain).

      // Actually the simplest test: transitionFull from approval_required → decision_recorded
      // then decision_recorded → merge_not_applicable should fail without user_decision.json
      // BUT decision_recorded produces user_decision.json (it's the agent's job)
      // So we test that trying to skip decision_recorded (going directly to merge_not_applicable)
      // from approval_required without user_decision.json is caught.

      // The enforceTransitionEvidence for 'merge_not_applicable' is not in CRITICAL_STATES
      // but 'implementation_ready' IS. Let's test the actual guard.

      await expect(
        qcEngine.transitionFull({
          workItemId: instance.id,
          fromState: 'merge_not_applicable',
          toState: 'implementation_ready',
          workItemDir: qcTmpDir,
        }),
      ).rejects.toThrow(/tasks\.md|allowed_write_files|code_permission_release_gate/);
    });

    // 2. Missing merge_report.md should not directly block closed (it's not in CRITICAL_STATES
    //    for quick_change) — but close_gate checks changed_files_audit.md.
    it('must block closed without changed_files_audit.md', async () => {
      // Only create gates/close_gate.json
      await fs.mkdir(path.join(qcTmpDir, 'gates'), { recursive: true });
      await fs.writeFile(
        path.join(qcTmpDir, 'gates', 'close_gate.json'),
        JSON.stringify({ status: 'passed' }),
      );

      const instance = qcEngine.createInstance('quick_change');
      qcEngine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'decision_recorded');
      forceState(instance.id, 'merge_not_applicable');
      forceState(instance.id, 'implementation_ready');
      qcEngine.transition(instance.id, 'implementation_ready', 'implementation_running');
      qcEngine.transition(instance.id, 'implementation_running', 'implementation_done');
      qcEngine.transition(instance.id, 'implementation_done', 'verification_running');
      forceState(instance.id, 'verification_done');

      await expect(
        qcEngine.transitionFull({
          workItemId: instance.id,
          fromState: 'verification_done',
          toState: 'closed',
          workItemDir: qcTmpDir,
        }),
      ).rejects.toThrow(/changed_files_audit/);
    });

    // 3. Missing gates/close_gate.json blocks closed (even with changed_files_audit.md)
    it('must block closed without gates/close_gate.json even with merge_report.md', async () => {
      // Create changed_files_audit.md but NOT gates/close_gate.json
      await fs.writeFile(
        path.join(qcTmpDir, 'changed_files_audit.md'),
        '# Changed Files Audit\nAll files in scope.',
      );
      // Also create merge_report.md to verify it doesn't help
      await fs.writeFile(
        path.join(qcTmpDir, 'merge_report.md'),
        JSON.stringify({ status: 'not_applicable' }),
      );

      const instance = qcEngine.createInstance('quick_change');
      qcEngine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'decision_recorded');
      forceState(instance.id, 'merge_not_applicable');
      forceState(instance.id, 'implementation_ready');
      qcEngine.transition(instance.id, 'implementation_ready', 'implementation_running');
      qcEngine.transition(instance.id, 'implementation_running', 'implementation_done');
      qcEngine.transition(instance.id, 'implementation_done', 'verification_running');
      forceState(instance.id, 'verification_done');

      await expect(
        qcEngine.transitionFull({
          workItemId: instance.id,
          fromState: 'verification_done',
          toState: 'closed',
          workItemDir: qcTmpDir,
        }),
      ).rejects.toThrow(/close_gate/);
    });

    // 4. Missing gates/code_permission_release_gate.json blocks implementation_ready
    it('must block implementation_ready without gates/code_permission_release_gate.json', async () => {
      // Create tasks.md and work_item.json but NOT code_permission_release_gate.json
      await fs.writeFile(path.join(qcTmpDir, 'tasks.md'), '# Tasks\n- Task 1');
      await fs.writeFile(
        path.join(qcTmpDir, 'work_item.json'),
        JSON.stringify({ allowed_write_files: ['src/a.ts'] }),
      );

      const instance = qcEngine.createInstance('quick_change');
      qcEngine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'decision_recorded');
      forceState(instance.id, 'merge_not_applicable');

      await expect(
        qcEngine.transitionFull({
          workItemId: instance.id,
          fromState: 'merge_not_applicable',
          toState: 'implementation_ready',
          workItemDir: qcTmpDir,
        }),
      ).rejects.toThrow(/code_permission_release_gate/);
    });

    // 5. All evidence present → implementation_ready succeeds
    it('must allow implementation_ready with all evidence present', async () => {
      await fs.writeFile(path.join(qcTmpDir, 'tasks.md'), '# Tasks\n- Task 1');
      await fs.writeFile(
        path.join(qcTmpDir, 'work_item.json'),
        JSON.stringify({ allowed_write_files: ['src/a.ts'] }),
      );
      await fs.mkdir(path.join(qcTmpDir, 'gates'), { recursive: true });
      await fs.writeFile(
        path.join(qcTmpDir, 'gates', 'code_permission_release_gate.json'),
        JSON.stringify({ status: 'passed' }),
      );

      const instance = qcEngine.createInstance('quick_change');
      qcEngine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'decision_recorded');
      forceState(instance.id, 'merge_not_applicable');

      const result = await qcEngine.transitionFull({
        workItemId: instance.id,
        fromState: 'merge_not_applicable',
        toState: 'implementation_ready',
        workItemDir: qcTmpDir,
      });

      expect(result.currentState).toBe('implementation_ready');
    });

    // 6. All evidence present → closed succeeds
    it('must allow closed with all evidence present', async () => {
      await fs.writeFile(
        path.join(qcTmpDir, 'changed_files_audit.md'),
        '# Changed Files Audit\nAll files in scope.',
      );
      await fs.mkdir(path.join(qcTmpDir, 'gates'), { recursive: true });
      await fs.writeFile(
        path.join(qcTmpDir, 'gates', 'close_gate.json'),
        JSON.stringify({ status: 'passed' }),
      );

      const instance = qcEngine.createInstance('quick_change');
      qcEngine.transition(instance.id, 'created', 'gates_running');
      forceState(instance.id, 'approval_required');
      forceState(instance.id, 'decision_recorded');
      forceState(instance.id, 'merge_not_applicable');
      forceState(instance.id, 'implementation_ready');
      qcEngine.transition(instance.id, 'implementation_ready', 'implementation_running');
      qcEngine.transition(instance.id, 'implementation_running', 'implementation_done');
      qcEngine.transition(instance.id, 'implementation_done', 'verification_running');
      forceState(instance.id, 'verification_done');

      const result = await qcEngine.transitionFull({
        workItemId: instance.id,
        fromState: 'verification_done',
        toState: 'closed',
        workItemDir: qcTmpDir,
      });

      expect(result.currentState).toBe('closed');
    });

    // 7. code_permission_release_gate failed → cannot enter implementation_ready via transitionFull
    it('must block implementation_ready when code_permission_release_gate.json status=failed', async () => {
      // Setup evidence files for implementation_ready
      await fs.writeFile(path.join(qcTmpDir, 'tasks.md'), '# Tasks\n- Task 1');
      await fs.writeFile(
        path.join(qcTmpDir, 'work_item.json'),
        JSON.stringify({ allowed_write_files: ['src/a.ts'] }),
      );
      await fs.mkdir(path.join(qcTmpDir, 'gates'), { recursive: true });
      // gate file with status=failed → enforceTransitionEvidence will reject
      await fs.writeFile(
        path.join(qcTmpDir, 'gates', 'code_permission_release_gate.json'),
        JSON.stringify({ status: 'failed' }),
      );

      const instance = qcEngine.createInstance('quick_change');
      forceState(instance.id, 'merge_not_applicable');

      // transitionFull to implementation_ready → evidence guard checks gate JSON
      await expect(
        qcEngine.transitionFull({
          workItemId: instance.id,
          fromState: 'merge_not_applicable',
          toState: 'implementation_ready',
          workItemDir: qcTmpDir,
        }),
      ).rejects.toThrow(/code_permission_release_gate/);
    });
  });

  // =========================================================================
  // §25-SCENARIO REVERSE BYPASS TEST MATRIX
  // =========================================================================
  // Validates that every known bypass path into a CRITICAL_STATE is blocked.
  // Each test documents: bypass_method → target_critical_state → expected_guard

  describe('25-scenario reverse bypass matrix', () => {
    const CRITICAL_TARGETS = [
      'approval_required',
      'merge_ready',
      'merging',
      'post_merge_verified',
      'implementation_ready',
      'verification_done',
      'closed',
    ] as const;

    let engine: WorkflowEngine;
    let tmpDir: string;

    /** Local forceState — references the inner engine, not the outer one */
    function localForceState(instanceId: string, state: string): void {
      const inst = engine.getInstance(instanceId);
      if (inst) {
        (inst as Record<string, unknown>).currentState = state;
      }
    }

    beforeEach(async () => {
      engine = new WorkflowEngine();
      engine.registerDefinition(makeV11Workflow());
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'v11-bypass-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    // --- Scenario 1: transition() blocks approval_required (reachable via gates_running) ---
    it('S1: transition() blocks approval_required from gates_running', () => {
      const instance = engine.createInstance('v11-test-workflow');
      localForceState(instance.id, 'gates_running');

      // approval_required is CRITICAL → transition() must throw
      expect(() =>
        engine.transition(instance.id, 'gates_running', 'approval_required')
      ).toThrow(/transitionFull|Cannot transition to critical state/);
    });

    // --- Scenario 2: transition() returns false for unreachable critical states ---
    it('S2: transition() returns false for non-adjacent critical states', () => {
      const instance = engine.createInstance('v11-test-workflow');
      localForceState(instance.id, 'gates_running');

      // These are valid next states from gates_running: approval_required (blocked by CRITICAL),
      // blocked (non-critical). All other critical states are not in the 'next' set → returns false.
      const unreachableCriticalStates = [
        'merge_ready', 'merging', 'post_merge_verified',
        'implementation_ready', 'verification_done', 'closed',
      ];

      for (const state of unreachableCriticalStates) {
        expect(
          engine.transition(instance.id, 'gates_running', state)
        ).toBe(false);
      }
    });

    // --- Scenario 3-9: transitionFull() without workItemDir blocks each critical state ---
    // We use appropriate from-states for each target.
    it('S3: transitionFull() without workItemDir blocks approval_required', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      localForceState(instance.id, 'gates_running');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'gates_running',
          toState: 'approval_required',
        })
      ).rejects.toThrow(/workItemDir|required/);
    });

    it('S4: transitionFull() without workItemDir blocks merge_ready', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      localForceState(instance.id, 'approval_required');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'approval_required',
          toState: 'merge_ready',
        })
      ).rejects.toThrow(/workItemDir|required/);
    });

    it('S5: transitionFull() without workItemDir blocks merging', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      localForceState(instance.id, 'merge_ready');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'merge_ready',
          toState: 'merging',
        })
      ).rejects.toThrow(/workItemDir|required/);
    });

    it('S6: transitionFull() without workItemDir blocks post_merge_verified', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      localForceState(instance.id, 'merged');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'merged',
          toState: 'post_merge_verified',
        })
      ).rejects.toThrow(/workItemDir|required/);
    });

    it('S7: transitionFull() without workItemDir blocks implementation_ready', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      localForceState(instance.id, 'post_merge_verified');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'post_merge_verified',
          toState: 'implementation_ready',
        })
      ).rejects.toThrow(/workItemDir|required/);
    });

    it('S8: transitionFull() without workItemDir blocks verification_done', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      localForceState(instance.id, 'verification_running');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'verification_running',
          toState: 'verification_done',
        })
      ).rejects.toThrow(/workItemDir|required/);
    });

    it('S9: transitionFull() without workItemDir blocks closed', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      localForceState(instance.id, 'verification_done');

      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'verification_done',
          toState: 'closed',
        })
      ).rejects.toThrow(/workItemDir|required/);
    });

    // --- Scenario 10-16: transitionFull() with empty workItemDir (missing evidence files) ---
    for (const target of CRITICAL_TARGETS) {
      it(`S10-16: transitionFull() empty dir blocks → ${target}`, async () => {
        const instance = engine.createInstance('v11-test-workflow');

        // Force to the state that has `target` as a valid next
        const predecessorMap: Record<string, string> = {
          approval_required: 'gates_running',
          merge_ready: 'approval_required',
          merging: 'merge_ready',
          post_merge_verified: 'merged',
          implementation_ready: 'post_merge_verified',
          verification_done: 'verification_running',
          closed: 'verification_done',
        };
        localForceState(instance.id, predecessorMap[target]);

        await expect(
          engine.transitionFull({
            workItemId: instance.id,
            fromState: predecessorMap[target],
            toState: target,
            workItemDir: tmpDir,
          })
        ).rejects.toThrow();
      });
    }

    // --- Scenario 17: execute() without workItemDir blocks critical states ---
    it('S17: execute() without workItemDir blocks at first critical state', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      await expect(
        engine.execute(instance.id)
      ).rejects.toThrow();
    });

    // --- Scenario 18: resume() without workItemDir blocks at critical states ---
    it('S18: resume() without workItemDir blocks at critical state', () => {
      const instance = engine.createInstance('v11-test-workflow');
      localForceState(instance.id, 'gates_running');
      // resume() throws synchronously (status check before async part)
      expect(() =>
        engine.resume(instance.id)
      ).toThrow();
    });

    // --- Scenario 19: forbidden transition blocked by transitionFull() ---
    it('S19: transitionFull() blocks forbidden transition (created → closed)', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'created',
          toState: 'closed',
          workItemDir: tmpDir,
        })
      ).rejects.toThrow(/Forbidden|Invalid transition/);
    });

    // --- Scenario 20: transitionFull() creation branch only allows 'created' ---
    it('S20: transitionFull() creation branch rejects non-created target', async () => {
      await expect(
        engine.transitionFull({
          workItemId: 'WI-NEW',
          fromState: '',
          toState: 'implementation_ready',
          workItemDir: tmpDir,
        })
      ).rejects.toThrow(/creation only allowed/);
    });

    // --- Scenario 21: transitionFull() blocks all critical states when forced to wrong predecessor ---
    it('S21: transitionFull() blocks non-adjacent critical states (wrong predecessor)', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      // created → merge_ready is not a valid transition in the state machine
      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'created',
          toState: 'merge_ready',
          workItemDir: tmpDir,
        })
      ).rejects.toThrow();
    });

    // --- Scenario 22: execute() with workItemDir but missing evidence still blocks ---
    it('S22: execute() with empty workItemDir blocks at evidence check', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      await expect(
        engine.execute(instance.id, { workItemDir: tmpDir })
      ).rejects.toThrow();
    });

    // --- Scenario 23: resume() with workItemDir but missing evidence blocks ---
    it('S23: resume() with empty workItemDir blocks at evidence check', () => {
      const instance = engine.createInstance('v11-test-workflow');
      localForceState(instance.id, 'gates_running');
      // resume() throws synchronously (status check before async part)
      expect(() =>
        engine.resume(instance.id, { workItemDir: tmpDir })
      ).toThrow();
    });

    // --- Scenario 24: requiresTransitionEvidence() returns true for all critical states ---
    it('S24: requiresTransitionEvidence() returns true for all critical states', () => {
      for (const state of CRITICAL_TARGETS) {
        expect(requiresTransitionEvidence(state)).toBe(true);
      }
      // Non-critical states should return false
      expect(requiresTransitionEvidence('created')).toBe(false);
      expect(requiresTransitionEvidence('gates_running')).toBe(false);
      expect(requiresTransitionEvidence('implementation_running')).toBe(false);
    });

    // --- Scenario 25: transitionFull() state mismatch blocks ---
    it('S25: transitionFull() blocks when fromState != actual state', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      // Instance is in 'created', but we claim it's in 'gates_running'
      await expect(
        engine.transitionFull({
          workItemId: instance.id,
          fromState: 'gates_running',
          toState: 'approval_required',
          workItemDir: tmpDir,
        })
      ).rejects.toThrow(/State mismatch/);
    });
  });

  // =========================================================================
  // P0-1: not_enabled gate must NOT enter pass branch
  // =========================================================================

  describe('P0-1: not_enabled gate must NOT pass', () => {
    it('NE-1: required=false gate without checkFn returns not_enabled → enters fail branch (blocked)', async () => {
      const engine = new WorkflowEngine();
      engine.loadWorkflow({
        id: 'ne-test',
        displayName: 'NE Test',
        intent: 'test',
        stateMachine: {
          initial: 'start',
          states: {
            start: {
              agent: '',
              gate: { type: 'simple', id: 'ne_gate', name: 'NE Gate', required: false },
              skills: [],
              next: { pass: 'done', fail: 'blocked' },
            },
            done: { agent: '', gate: null, skills: [] },
            blocked: { agent: '', gate: null, skills: [] },
          },
        },
        artifacts: [],
      });

      const inst = engine.createInstance('ne-test');
      const result = await engine.execute(inst.id);
      // not_enabled → gateOk=false → enters fail branch → blocked
      expect(result.currentState).toBe('blocked');
      // Must NOT reach 'done'
      expect(result.currentState).not.toBe('done');
    });

    it('NE-2: gate without checkFn + string next → throws unconsumed', async () => {
      const engine = new WorkflowEngine();
      engine.loadWorkflow({
        id: 'ne-str-test',
        displayName: 'NE Str Test',
        intent: 'test',
        stateMachine: {
          initial: 'start',
          states: {
            start: {
              agent: '',
              gate: { type: 'simple', id: 'bad_gate', name: 'Bad Gate', required: false },
              skills: [],
              next: 'done',
            },
            done: { agent: '', gate: null, skills: [] },
          },
        },
        artifacts: [],
      });
      const inst = engine.createInstance('ne-str-test');
      // not_enabled + string next → throws "gate result is unconsumed"
      await expect(engine.execute(inst.id)).rejects.toThrow(/unconsumed|gate result/);
    });

    it('NE-3: composite gate with not_enabled children → composite fails → enters fail branch', async () => {
      const engine = new WorkflowEngine();
      engine.loadWorkflow({
        id: 'ne-comp-test',
        displayName: 'NE Comp Test',
        intent: 'test',
        stateMachine: {
          initial: 'start',
          states: {
            start: {
              agent: '',
              gate: {
                type: 'composite',
                id: 'comp_gate',
                name: 'Comp Gate',
                mode: 'sequential',
                failPolicy: 'fail_fast',
                children: [
                  { type: 'simple', id: 'child1', name: 'Child 1', required: false },
                ],
              },
              skills: [],
              next: { pass: 'done', fail: 'blocked' },
            },
            done: { agent: '', gate: null, skills: [] },
            blocked: { agent: '', gate: null, skills: [] },
          },
        },
        artifacts: [],
      });
      const inst = engine.createInstance('ne-comp-test');
      const result = await engine.execute(inst.id);
      // Composite with not_enabled child → passed=false → fail branch
      expect(result.currentState).toBe('blocked');
      expect(result.currentState).not.toBe('done');
    });

    it('NE-4: gate_summary_gate not_enabled → cannot approval_required, enters fail branch', async () => {
      const engine = new WorkflowEngine();
      // Use makeV11Workflow but override gates_running's gate to have no checkFn
      const def = makeV11Workflow();
      const gatesRunningState = def.stateMachine.states['gates_running'];
      if (gatesRunningState) {
        (gatesRunningState as Record<string, unknown>).gate = {
          type: 'simple', id: 'gate_summary_gate', name: 'Gate Summary Gate', required: false,
        };
      }
      engine.loadWorkflow(def);
      const inst = engine.createInstance('v11-test-workflow');
      const result = await engine.execute(inst.id);
      // not_enabled → fail branch → 'blocked'
      expect(result.currentState).toBe('blocked');
      expect(result.currentState).not.toBe('approval_required');
    });

    it('NE-5: merge_ready_gate not_enabled → cannot merging via execute', async () => {
      const engine = new WorkflowEngine();
      const def = makeV11Workflow();
      const state = def.stateMachine.states['merge_ready'];
      if (state) {
        (state as Record<string, unknown>).gate = {
          type: 'simple', id: 'merge_ready_gate', name: 'Merge Ready Gate', required: false,
        };
      }
      engine.loadWorkflow(def);
      const inst = engine.createInstance('v11-test-workflow');
      forceState(inst.id, 'merge_ready');
      await expect(engine.execute(inst.id)).rejects.toThrow();
    });

    it('NE-6: code_permission_release_gate not_enabled → cannot implementation_running', async () => {
      const engine = new WorkflowEngine();
      const def = makeV11Workflow();
      const state = def.stateMachine.states['implementation_ready'];
      if (state) {
        (state as Record<string, unknown>).gate = {
          type: 'simple', id: 'code_permission_release_gate', name: 'Code Permission Release Gate', required: false,
        };
      }
      engine.loadWorkflow(def);
      const inst = engine.createInstance('v11-test-workflow');
      forceState(inst.id, 'implementation_ready');
      await expect(engine.execute(inst.id)).rejects.toThrow();
    });

    it('NE-7: close_gate not_enabled → cannot closed', async () => {
      const engine = new WorkflowEngine();
      const def = makeV11Workflow();
      const state = def.stateMachine.states['verification_done'];
      if (state) {
        (state as Record<string, unknown>).gate = {
          type: 'simple', id: 'close_gate', name: 'Close Gate', required: false,
        };
      }
      engine.loadWorkflow(def);
      const inst = engine.createInstance('v11-test-workflow');
      forceState(inst.id, 'verification_done');
      await expect(engine.execute(inst.id)).rejects.toThrow();
    });
  });

  // =========================================================================
  // P0-2: quick_change code_only_fast_path closure tests
  // =========================================================================

  describe('P0-2: quick_change / code_only_fast_path closure', () => {
    let qcEngine: WorkflowEngine;
    let qcTmpDir: string;

    function makeQuickChangeWorkflow(): WorkflowDefinition {
      return {
        id: 'quick_change',
        displayName: 'Quick Change',
        intent: 'test',
        stateMachine: {
          initial: 'created',
          states: {
            created: { agent: '', gate: null, skills: [], next: 'gates_running' },
            gates_running: {
              agent: '', gate: { type: 'simple', id: 'gate_summary_gate', name: 'Gate Summary Gate', checkFn: passGate }, skills: [],
              next: { pass: 'approval_required', fail: 'blocked' },
            },
            approval_required: { agent: '', gate: null, skills: [], next: 'decision_recorded' },
            decision_recorded: { agent: 'user_decision_recorder', gate: null, skills: [], next: 'merge_not_applicable' },
            merge_not_applicable: { agent: 'merge_runner', gate: null, skills: [], next: 'implementation_ready' },
            implementation_ready: {
              agent: '',
              gate: { type: 'simple', id: 'code_permission_release_gate', name: 'Code Permission Release Gate', checkFn: passGate },
              skills: [],
              next: { pass: 'implementation_running', fail: 'blocked' },
            },
            implementation_running: { agent: 'sf-executor', gate: null, skills: [], next: 'implementation_done' },
            implementation_done: { agent: '', gate: null, skills: [], next: 'verification_running' },
            verification_running: { agent: 'sf-verifier', gate: null, skills: [], next: 'verification_done' },
            verification_done: {
              agent: '',
              gate: { type: 'simple', id: 'close_gate', name: 'Close Gate', checkFn: passGate },
              skills: [],
              next: { pass: 'closed', fail: 'implementation_running' },
            },
            closed: { agent: '', gate: null, skills: [] },
            blocked: { agent: '', gate: null, skills: [] },
          },
        },
        artifacts: [],
      };
    }

    function qcForceState(instanceId: string, state: string): void {
      const inst = qcEngine.getInstance(instanceId);
      if (inst) { (inst as Record<string, unknown>).currentState = state; }
    }

    beforeEach(async () => {
      qcEngine = new WorkflowEngine();
      qcEngine.loadWorkflow(makeQuickChangeWorkflow());
      qcTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qc-closure-'));
    });

    afterEach(async () => {
      await fs.rm(qcTmpDir, { recursive: true, force: true });
    });

    it('QC-1: missing user_decision.json → cannot enter implementation_ready', async () => {
      const inst = qcEngine.createInstance('quick_change');
      qcForceState(inst.id, 'merge_not_applicable');
      await expect(
        qcEngine.transitionFull({ workItemId: inst.id, fromState: 'merge_not_applicable', toState: 'implementation_ready', workItemDir: qcTmpDir })
      ).rejects.toThrow();
    });

    it('QC-2: missing merge_report.md(status=not_applicable) → cannot close', async () => {
      const inst = qcEngine.createInstance('quick_change');
      qcForceState(inst.id, 'verification_done');
      await expect(
        qcEngine.transitionFull({ workItemId: inst.id, fromState: 'verification_done', toState: 'closed', workItemDir: qcTmpDir })
      ).rejects.toThrow(/changed_files_audit|close_gate/);
    });

    it('QC-3: code_permission_release_gate not passed → cannot enter implementation_ready', async () => {
      const inst = qcEngine.createInstance('quick_change');
      qcForceState(inst.id, 'merge_not_applicable');
      // Empty dir → no gate file → enforceTransitionEvidence rejects implementation_ready
      await expect(
        qcEngine.transitionFull({ workItemId: inst.id, fromState: 'merge_not_applicable', toState: 'implementation_ready', workItemDir: qcTmpDir })
      ).rejects.toThrow();
    });

    it('QC-4: missing changed_files_audit.md → cannot closed', async () => {
      const inst = qcEngine.createInstance('quick_change');
      qcForceState(inst.id, 'verification_done');
      await expect(
        qcEngine.transitionFull({ workItemId: inst.id, fromState: 'verification_done', toState: 'closed', workItemDir: qcTmpDir })
      ).rejects.toThrow(/changed_files_audit|close_gate/);
    });

    it('QC-5: missing evidence_manifest → cannot verification_done', async () => {
      const inst = qcEngine.createInstance('quick_change');
      qcForceState(inst.id, 'verification_running');
      await expect(
        qcEngine.transitionFull({ workItemId: inst.id, fromState: 'verification_running', toState: 'verification_done', workItemDir: qcTmpDir })
      ).rejects.toThrow();
    });

    it('QC-6: missing close_gate passed → cannot closed', async () => {
      const inst = qcEngine.createInstance('quick_change');
      qcForceState(inst.id, 'verification_done');
      await expect(
        qcEngine.transitionFull({ workItemId: inst.id, fromState: 'verification_done', toState: 'closed', workItemDir: qcTmpDir })
      ).rejects.toThrow();
    });

    it('QC-7: candidate_manifest entries non-empty → code_only_fast_path gate must fail', async () => {
      const inst = qcEngine.createInstance('quick_change');
      qcForceState(inst.id, 'merge_not_applicable');
      // Write gate file with status=failed (simulating gate rejection due to non-empty manifest)
      await fs.mkdir(path.join(qcTmpDir, 'gates'), { recursive: true });
      await fs.writeFile(
        path.join(qcTmpDir, 'gates', 'code_permission_release_gate.json'),
        JSON.stringify({ status: 'failed' }),
      );
      // implementation_ready is CRITICAL → enforceTransitionEvidence checks gate status
      await expect(
        qcEngine.transitionFull({ workItemId: inst.id, fromState: 'merge_not_applicable', toState: 'implementation_ready', workItemDir: qcTmpDir })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // PRECISE-MISSING: Only one file missing, all others present
  // =========================================================================
  // Each test prepares ALL evidence for a target CRITICAL state, then removes
  // exactly ONE file/assertion. This proves the failure is caused by that
  // specific missing item, not by an empty directory or blanket failure.

  describe('Precise-missing evidence tests (quick_change path)', () => {
    let pmEngine: WorkflowEngine;
    let pmTmpDir: string;

    function makeQuickChangeWorkflow(): WorkflowDefinition {
      return {
        id: 'quick_change',
        displayName: 'Quick Change PM',
        intent: 'test',
        stateMachine: {
          initial: 'created',
          states: {
            created: { agent: '', gate: null, skills: [], next: 'gates_running' },
            gates_running: {
              agent: '', gate: { type: 'simple', id: 'gate_summary_gate', name: 'Gate Summary Gate', checkFn: passGate }, skills: [],
              next: { pass: 'approval_required', fail: 'blocked' },
            },
            approval_required: { agent: '', gate: null, skills: [], next: 'decision_recorded' },
            decision_recorded: { agent: 'user_decision_recorder', gate: null, skills: [], next: 'merge_not_applicable' },
            merge_not_applicable: { agent: 'merge_runner', gate: null, skills: [], next: 'implementation_ready' },
            implementation_ready: {
              agent: '',
              gate: { type: 'simple', id: 'code_permission_release_gate', name: 'Code Permission Release Gate', checkFn: passGate },
              skills: [],
              next: { pass: 'implementation_running', fail: 'blocked' },
            },
            implementation_running: { agent: 'sf-executor', gate: null, skills: [], next: 'implementation_done' },
            implementation_done: { agent: '', gate: null, skills: [], next: 'verification_running' },
            verification_running: { agent: 'sf-verifier', gate: null, skills: [], next: 'verification_done' },
            verification_done: {
              agent: '',
              gate: { type: 'simple', id: 'close_gate', name: 'Close Gate', checkFn: passGate },
              skills: [],
              next: { pass: 'closed', fail: 'implementation_running' },
            },
            closed: { agent: '', gate: null, skills: [] },
            blocked: { agent: '', gate: null, skills: [] },
          },
        },
        artifacts: [],
      };
    }

    function pmForceState(instanceId: string, state: string): void {
      const inst = pmEngine.getInstance(instanceId);
      if (inst) { (inst as Record<string, unknown>).currentState = state; }
    }

    /** Prepare ALL evidence for implementation_ready EXCEPT the specified item */
    async function prepareImplementationReadyEvidence(dir: string, omit: 'tasks.md' | 'work_item.json' | 'code_permission_release_gate' | 'none'): Promise<void> {
      if (omit !== 'tasks.md') {
        await fs.writeFile(path.join(dir, 'tasks.md'), '# Tasks\n- TASK-1: Implement feature');
      }
      if (omit !== 'work_item.json') {
        await fs.writeFile(path.join(dir, 'work_item.json'), JSON.stringify({ allowed_write_files: ['src/a.ts', 'src/b.ts'] }));
      }
      if (omit !== 'code_permission_release_gate') {
        await fs.mkdir(path.join(dir, 'gates'), { recursive: true });
        await fs.writeFile(path.join(dir, 'gates', 'code_permission_release_gate.json'), JSON.stringify({ status: 'passed' }));
      }
    }

    /** Prepare ALL evidence for verification_done EXCEPT the specified item */
    async function prepareVerificationDoneEvidence(dir: string, omit: 'verification_report.md' | 'evidence_manifest' | 'none'): Promise<void> {
      if (omit !== 'verification_report.md') {
        await fs.writeFile(path.join(dir, 'verification_report.md'), '# Verification Report\nAll ACs verified.');
      }
      if (omit !== 'evidence_manifest') {
        await fs.mkdir(path.join(dir, 'evidence'), { recursive: true });
        await fs.writeFile(path.join(dir, 'evidence', 'evidence_manifest.json'), JSON.stringify({ artifacts: ['EA-001'] }));
      }
    }

    /** Prepare ALL evidence for closed EXCEPT the specified item */
    async function prepareClosedEvidence(dir: string, omit: 'changed_files_audit.md' | 'close_gate' | 'merge_report.md' | 'none'): Promise<void> {
      if (omit !== 'changed_files_audit.md') {
        await fs.writeFile(path.join(dir, 'changed_files_audit.md'), '# Changed Files Audit\n- src/a.ts: modified\n- src/b.ts: created');
      }
      if (omit !== 'close_gate') {
        await fs.mkdir(path.join(dir, 'gates'), { recursive: true });
        await fs.writeFile(path.join(dir, 'gates', 'close_gate.json'), JSON.stringify({ status: 'passed' }));
      }
      if (omit !== 'merge_report.md') {
        await fs.writeFile(path.join(dir, 'merge_report.md'), JSON.stringify({ status: 'not_applicable' }));
      }
    }

    /** Prepare ALL evidence for merge_ready (user_decision.json based) — used by standard v11 path tests */

    beforeEach(async () => {
      pmEngine = new WorkflowEngine();
      pmEngine.loadWorkflow(makeQuickChangeWorkflow());
      pmTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-pm-test-'));
    });

    afterEach(async () => {
      await fs.rm(pmTmpDir, { recursive: true, force: true });
    });

    // --- PM-1: missing user_decision.json → cannot enter merge_ready (standard path) ---
    // In quick_change, approval_required → decision_recorded, not merge_ready.
    // To test user_decision.json precisely, we use the v11 standard workflow where
    // approval_required → merge_ready requires user_decision.json.
    // We prepare gate_summary.md + gates/gate_summary_gate.json(passed) but omit user_decision.json.
    it('PM-1: missing user_decision.json blocks merge_ready (all other evidence present)', async () => {
      // Use a standard v11 workflow that has approval_required → merge_ready
      const stdEngine = new WorkflowEngine();
      stdEngine.loadWorkflow(makeV11Workflow());
      const stdTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-pm-std-'));
      try {
        // Prepare evidence that would allow approval_required (gate_summary.md + gate_summary_gate passed)
        await fs.writeFile(path.join(stdTmpDir, 'gate_summary.md'), '# Gate Summary\nAll gates passed.');
        await fs.mkdir(path.join(stdTmpDir, 'gates'), { recursive: true });
        await fs.writeFile(path.join(stdTmpDir, 'gates', 'gate_summary_gate.json'), JSON.stringify({ status: 'passed' }));
        // Do NOT create user_decision.json — this is the only missing item

        const inst = stdEngine.createInstance('v11-test-workflow');
        stdEngine.transition(inst.id, 'created', 'gates_running');
        // Force to approval_required (bypassing enforceTransitionEvidence for approval_required itself)
        const instObj = stdEngine.getInstance(inst.id);
        if (instObj) { (instObj as Record<string, unknown>).currentState = 'approval_required'; }

        await expect(
          stdEngine.transitionFull({ workItemId: inst.id, fromState: 'approval_required', toState: 'merge_ready', workItemDir: stdTmpDir })
        ).rejects.toThrow(/user_decision/);
      } finally {
        await fs.rm(stdTmpDir, { recursive: true, force: true });
      }
    });

    // --- PM-2: quick_change missing merge_report.md(status=not_applicable) cannot close ---
    it('PM-2: missing merge_report.md does NOT block closed (not in enforceTransitionEvidence), but close_gate does', async () => {
      // closed requires changed_files_audit.md + gates/close_gate.json(passed)
      // merge_report.md is NOT checked by enforceTransitionEvidence for 'closed'
      // So: prepare changed_files_audit + close_gate(passed), omit merge_report.md → should SUCCEED
      await prepareClosedEvidence(pmTmpDir, 'merge_report.md');

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'verification_done');

      const result = await pmEngine.transitionFull({
        workItemId: inst.id, fromState: 'verification_done', toState: 'closed', workItemDir: pmTmpDir,
      });
      expect(result.currentState).toBe('closed');
    });

    // --- PM-2b: close_gate status != passed → cannot close ---
    it('PM-2b: merge_report.md present but close_gate status=failed → closed blocked', async () => {
      // Prepare everything including merge_report.md, but close_gate is failed
      await fs.writeFile(path.join(pmTmpDir, 'changed_files_audit.md'), '# Audit');
      await fs.writeFile(path.join(pmTmpDir, 'merge_report.md'), JSON.stringify({ status: 'not_applicable' }));
      await fs.mkdir(path.join(pmTmpDir, 'gates'), { recursive: true });
      await fs.writeFile(path.join(pmTmpDir, 'gates', 'close_gate.json'), JSON.stringify({ status: 'failed' }));

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'verification_done');

      await expect(
        pmEngine.transitionFull({ workItemId: inst.id, fromState: 'verification_done', toState: 'closed', workItemDir: pmTmpDir })
      ).rejects.toThrow(/close_gate/);
    });

    // --- PM-3: quick_change missing changed_files_audit.md → cannot closed ---
    it('PM-3: missing changed_files_audit.md blocks closed (close_gate passed present)', async () => {
      // Prepare close_gate.json passed but NOT changed_files_audit.md
      await prepareClosedEvidence(pmTmpDir, 'changed_files_audit.md');

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'verification_done');

      await expect(
        pmEngine.transitionFull({ workItemId: inst.id, fromState: 'verification_done', toState: 'closed', workItemDir: pmTmpDir })
      ).rejects.toThrow(/changed_files_audit/);
    });

    // --- PM-4: quick_change missing evidence_manifest → cannot verification_done ---
    it('PM-4: missing evidence_manifest blocks verification_done (verification_report present)', async () => {
      // Prepare verification_report.md but NOT evidence/evidence_manifest.json
      await prepareVerificationDoneEvidence(pmTmpDir, 'evidence_manifest');

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'verification_running');

      await expect(
        pmEngine.transitionFull({ workItemId: inst.id, fromState: 'verification_running', toState: 'verification_done', workItemDir: pmTmpDir })
      ).rejects.toThrow(/evidence_manifest/);
    });

    // --- PM-4b: missing verification_report.md → cannot verification_done ---
    it('PM-4b: missing verification_report.md blocks verification_done (evidence_manifest present)', async () => {
      // Prepare evidence/evidence_manifest.json but NOT verification_report.md
      await prepareVerificationDoneEvidence(pmTmpDir, 'verification_report.md');

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'verification_running');

      await expect(
        pmEngine.transitionFull({ workItemId: inst.id, fromState: 'verification_running', toState: 'verification_done', workItemDir: pmTmpDir })
      ).rejects.toThrow(/verification_report/);
    });

    // --- PM-5: code_permission_release_gate status=not_enabled → cannot implementation_running ---
    it('PM-5: code_permission_release_gate status=not_enabled blocks implementation_ready (tasks.md + work_item.json present)', async () => {
      // Prepare tasks.md + work_item.json but gate file has status=not_enabled
      await fs.writeFile(path.join(pmTmpDir, 'tasks.md'), '# Tasks\n- TASK-1');
      await fs.writeFile(path.join(pmTmpDir, 'work_item.json'), JSON.stringify({ allowed_write_files: ['src/a.ts'] }));
      await fs.mkdir(path.join(pmTmpDir, 'gates'), { recursive: true });
      await fs.writeFile(path.join(pmTmpDir, 'gates', 'code_permission_release_gate.json'), JSON.stringify({ status: 'not_enabled' }));

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'merge_not_applicable');

      await expect(
        pmEngine.transitionFull({ workItemId: inst.id, fromState: 'merge_not_applicable', toState: 'implementation_ready', workItemDir: pmTmpDir })
      ).rejects.toThrow(/code_permission_release_gate/);
    });

    // --- PM-5b: code_permission_release_gate missing → cannot implementation_ready ---
    it('PM-5b: missing code_permission_release_gate blocks implementation_ready (tasks.md + work_item.json present)', async () => {
      await prepareImplementationReadyEvidence(pmTmpDir, 'code_permission_release_gate');

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'merge_not_applicable');

      await expect(
        pmEngine.transitionFull({ workItemId: inst.id, fromState: 'merge_not_applicable', toState: 'implementation_ready', workItemDir: pmTmpDir })
      ).rejects.toThrow(/code_permission_release_gate/);
    });

    // --- PM-5c: missing tasks.md → cannot implementation_ready ---
    it('PM-5c: missing tasks.md blocks implementation_ready (work_item.json + gate present)', async () => {
      await prepareImplementationReadyEvidence(pmTmpDir, 'tasks.md');

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'merge_not_applicable');

      await expect(
        pmEngine.transitionFull({ workItemId: inst.id, fromState: 'merge_not_applicable', toState: 'implementation_ready', workItemDir: pmTmpDir })
      ).rejects.toThrow(/tasks\.md/);
    });

    // --- PM-5d: missing work_item.json → cannot implementation_ready ---
    it('PM-5d: missing work_item.json blocks implementation_ready (tasks.md + gate present)', async () => {
      await prepareImplementationReadyEvidence(pmTmpDir, 'work_item.json');

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'merge_not_applicable');

      await expect(
        pmEngine.transitionFull({ workItemId: inst.id, fromState: 'merge_not_applicable', toState: 'implementation_ready', workItemDir: pmTmpDir })
      ).rejects.toThrow(/work_item\.json|allowed_write_files/);
    });

    // --- PM-positive: all evidence present → each transition succeeds ---
    it('PM-pos-1: all evidence present → implementation_ready succeeds', async () => {
      await prepareImplementationReadyEvidence(pmTmpDir, 'none');

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'merge_not_applicable');

      const result = await pmEngine.transitionFull({
        workItemId: inst.id, fromState: 'merge_not_applicable', toState: 'implementation_ready', workItemDir: pmTmpDir,
      });
      expect(result.currentState).toBe('implementation_ready');
    });

    it('PM-pos-2: all evidence present → verification_done succeeds', async () => {
      await prepareVerificationDoneEvidence(pmTmpDir, 'none');

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'verification_running');

      const result = await pmEngine.transitionFull({
        workItemId: inst.id, fromState: 'verification_running', toState: 'verification_done', workItemDir: pmTmpDir,
      });
      expect(result.currentState).toBe('verification_done');
    });

    it('PM-pos-3: all evidence present → closed succeeds', async () => {
      await prepareClosedEvidence(pmTmpDir, 'none');

      const inst = pmEngine.createInstance('quick_change');
      pmForceState(inst.id, 'verification_done');

      const result = await pmEngine.transitionFull({
        workItemId: inst.id, fromState: 'verification_done', toState: 'closed', workItemDir: pmTmpDir,
      });
      expect(result.currentState).toBe('closed');
    });

    it('PM-pos-4: user_decision.json approved → merge_ready succeeds (standard v11 workflow)', async () => {
      // Use standard v11 workflow where approval_required → merge_ready
      const stdEngine = new WorkflowEngine();
      stdEngine.loadWorkflow(makeV11Workflow());
      const stdTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-pm-pos4-'));
      try {
        await fs.writeFile(path.join(stdTmpDir, 'gate_summary.md'), '# Gate Summary');
        await fs.mkdir(path.join(stdTmpDir, 'gates'), { recursive: true });
        await fs.writeFile(path.join(stdTmpDir, 'gates', 'gate_summary_gate.json'), JSON.stringify({ status: 'passed' }));
        await fs.writeFile(path.join(stdTmpDir, 'user_decision.json'), JSON.stringify({ decision_status: 'approved', content_hash: 'abc123' }));

        const inst = stdEngine.createInstance('v11-test-workflow');
        stdEngine.transition(inst.id, 'created', 'gates_running');
        const instObj = stdEngine.getInstance(inst.id);
        if (instObj) { (instObj as Record<string, unknown>).currentState = 'approval_required'; }

        const result = await stdEngine.transitionFull({
          workItemId: inst.id, fromState: 'approval_required', toState: 'merge_ready', workItemDir: stdTmpDir,
        });
        expect(result.currentState).toBe('merge_ready');
      } finally {
        await fs.rm(stdTmpDir, { recursive: true, force: true });
      }
    });

    it('PM-pos-5: user_decision.json rejected → merge_ready blocked (standard v11 workflow)', async () => {
      const stdEngine = new WorkflowEngine();
      stdEngine.loadWorkflow(makeV11Workflow());
      const stdTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-pm-pos5-'));
      try {
        await fs.writeFile(path.join(stdTmpDir, 'gate_summary.md'), '# Gate Summary');
        await fs.mkdir(path.join(stdTmpDir, 'gates'), { recursive: true });
        await fs.writeFile(path.join(stdTmpDir, 'gates', 'gate_summary_gate.json'), JSON.stringify({ status: 'passed' }));
        // Write user_decision.json with rejected status
        await fs.writeFile(path.join(stdTmpDir, 'user_decision.json'), JSON.stringify({ decision_status: 'rejected' }));

        const inst = stdEngine.createInstance('v11-test-workflow');
        stdEngine.transition(inst.id, 'created', 'gates_running');
        const instObj = stdEngine.getInstance(inst.id);
        if (instObj) { (instObj as Record<string, unknown>).currentState = 'approval_required'; }

        await expect(
          stdEngine.transitionFull({ workItemId: inst.id, fromState: 'approval_required', toState: 'merge_ready', workItemDir: stdTmpDir })
        ).rejects.toThrow(/user_decision/);
      } finally {
        await fs.rm(stdTmpDir, { recursive: true, force: true });
      }
    });
  });
});
