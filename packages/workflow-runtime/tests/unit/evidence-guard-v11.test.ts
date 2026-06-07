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
import { WorkflowEngine } from '../../src/WorkflowEngine.js';
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
      engine.transition(instance.id, 'gates_running', 'approval_required');

      // execute without workItemDir — should fail when trying merge_ready
      await expect(engine.execute(instance.id)).rejects.toThrow(/workItemDir is required/);
    });

    it('must throw when transitioning to closed without workItemDir', async () => {
      const instance = engine.createInstance('v11-test-workflow');
      // Jump to verification_done via direct transitions
      engine.transition(instance.id, 'created', 'gates_running');
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');
      engine.transition(instance.id, 'merge_ready', 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      engine.transition(instance.id, 'merged', 'post_merge_verified');
      engine.transition(instance.id, 'post_merge_verified', 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      engine.transition(instance.id, 'verification_running', 'verification_done');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');
      engine.transition(instance.id, 'merge_ready', 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      engine.transition(instance.id, 'merged', 'post_merge_verified');
      engine.transition(instance.id, 'post_merge_verified', 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      engine.transition(instance.id, 'verification_running', 'verification_done');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');
      engine.transition(instance.id, 'merge_ready', 'merging');
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
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');
      engine.transition(instance.id, 'merge_ready', 'merging');
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
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');
      engine.transition(instance.id, 'merge_ready', 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      engine.transition(instance.id, 'merged', 'post_merge_verified');
      engine.transition(instance.id, 'post_merge_verified', 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      engine.transition(instance.id, 'verification_running', 'verification_done');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');
      engine.transition(instance.id, 'merge_ready', 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      engine.transition(instance.id, 'merged', 'post_merge_verified');
      engine.transition(instance.id, 'post_merge_verified', 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      engine.transition(instance.id, 'verification_running', 'verification_done');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');
      engine.transition(instance.id, 'merge_ready', 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      engine.transition(instance.id, 'merged', 'post_merge_verified');
      engine.transition(instance.id, 'post_merge_verified', 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      engine.transition(instance.id, 'verification_running', 'verification_done');

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
      engine.transition(instance.id, 'gates_running', 'approval_required');
      engine.transition(instance.id, 'approval_required', 'merge_ready');
      engine.transition(instance.id, 'merge_ready', 'merging');
      engine.transition(instance.id, 'merging', 'merged');
      engine.transition(instance.id, 'merged', 'post_merge_verified');
      engine.transition(instance.id, 'post_merge_verified', 'implementation_ready');
      engine.transition(instance.id, 'implementation_ready', 'implementation_running');
      engine.transition(instance.id, 'implementation_running', 'implementation_done');
      engine.transition(instance.id, 'implementation_done', 'verification_running');
      engine.transition(instance.id, 'verification_running', 'verification_done');

      const result = await engine.transitionFull({
        workItemId: instance.id,
        fromState: 'verification_done',
        toState: 'closed',
        workItemDir: tmpDir,
      });

      expect(result.currentState).toBe('closed');
    });
  });
});
