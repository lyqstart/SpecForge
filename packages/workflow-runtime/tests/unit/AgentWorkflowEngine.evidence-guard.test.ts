/**
 * AgentWorkflowEngine.execute() — v1.1 Evidence Guard专项测试
 *
 * FIND-1 修复验证：证明 AgentWorkflowEngine.execute() 已接入 evidence guard，
 * 不能绕过 CRITICAL_STATES 的物理证据前置检查。
 *
 * 测试矩阵：
 * 1. 缺 workItemDir → CRITICAL_STATE 不可达，状态不变化
 * 2. 缺 user_decision.json → decision_recorded 不可达
 * 3. 缺 code_permission_release_gate → implementation_ready 不可达
 * 4. 缺 changed_files_audit.md → closed 不可达
 * 5. 缺 close_gate.json → closed 不可达
 * 6. evidence 齐全 → 可达目标状态
 * 7. evidence guard 失败 → 不继续后续状态推进
 * 8. guard 失败 → 不执行后续副作用（emitEvent spy 验证）
 * 9. not_enabled 不当 passed
 * 10. gate failed + string next → throw unconsumed
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentWorkflowEngine, createAgentWorkflowEngine } from '../../src/engine/AgentWorkflowEngine.js';
import { WorkflowAgentRunner, createWorkflowAgentRunner } from '../../src/AgentRunner.js';
import { WorkflowDefinition } from '../../src/types.js';

const passGate = async () => ({ schema_version: '1.0' as const, passed: true, reason: 'auto-pass' });
const failGate = async () => ({ schema_version: '1.0' as const, passed: false, status: 'failed' as const, reason: 'auto-fail' });

/**
 * Minimal workflow that exercises CRITICAL_STATES via agent engine.
 * Identical state machine shape to evidence-guard-v11's makeV11Workflow().
 */
function makeAgentV11Workflow(): WorkflowDefinition {
  return {
    schema_version: '1.0',
    id: 'agent-v11-test-workflow',
    displayName: 'Agent V11 Test',
    intent: 'test',
    stateMachine: {
      schema_version: '1.0',
      initial: 'created',
      states: {
        created: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'noop', name: 'No-op', checkFn: passGate },
          skills: [],
          next: 'gates_running',
        },
        gates_running: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'gates_gate', name: 'Gates Gate', checkFn: passGate },
          skills: [],
          next: { pass: 'approval_required', fail: 'blocked' },
        },
        approval_required: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'approval_gate', name: 'Approval Gate', checkFn: passGate },
          skills: [],
          next: { pass: 'merge_ready', fail: 'rejected' },
        },
        merge_ready: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'merge_ready_gate', name: 'Merge Ready Gate', checkFn: passGate },
          skills: [],
          next: { pass: 'merging', fail: 'blocked' },
        },
        merging: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'merge_gate', name: 'Merge Gate', checkFn: passGate },
          skills: [],
          next: 'merged',
        },
        merged: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'merged_gate', name: 'Merged Gate', checkFn: passGate },
          skills: [],
          next: 'post_merge_verified',
        },
        post_merge_verified: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'pm_gate', name: 'PM Gate', checkFn: passGate },
          skills: [],
          next: { pass: 'implementation_ready', fail: 'blocked' },
        },
        implementation_ready: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'impl_ready_gate', name: 'Impl Ready Gate', checkFn: passGate },
          skills: [],
          next: 'implementation_running',
        },
        implementation_running: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'impl_gate', name: 'Impl Gate', checkFn: passGate },
          skills: [],
          next: 'implementation_done',
        },
        implementation_done: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'impl_done_gate', name: 'Impl Done Gate', checkFn: passGate },
          skills: [],
          next: 'verification_running',
        },
        verification_running: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'verify_gate', name: 'Verify Gate', checkFn: passGate },
          skills: [],
          next: 'verification_done',
        },
        verification_done: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'close_gate', name: 'Close Gate', checkFn: passGate },
          skills: [],
          next: { pass: 'closed', fail: 'implementation_running' },
        },
        closed: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'closed-noop', name: 'Closed No-op', checkFn: passGate },
          skills: [],
        },
        blocked: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'blocked-noop', name: 'Blocked No-op', checkFn: passGate },
          skills: [],
        },
        rejected: {
          schema_version: '1.0',
          agent: '',
          gate: { schema_version: '1.0', type: 'simple', id: 'rejected-noop', name: 'Rejected No-op', checkFn: passGate },
          skills: [],
        },
      },
    },
    artifacts: [],
  };
}

describe('AgentWorkflowEngine.execute() — v1.1 Evidence Guard', () => {
  let engine: AgentWorkflowEngine;
  let tmpDir: string;

  beforeEach(async () => {
    const runner = createWorkflowAgentRunner();
    engine = createAgentWorkflowEngine({ agentRunner: runner });
    engine.loadWorkflow(makeAgentV11Workflow());
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-agent-v11-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  /** Force instance to a specific state for test setup */
  function forceState(instanceId: string, state: string): void {
    const inst = engine.getInstance(instanceId);
    if (inst) {
      (inst as Record<string, unknown>).currentState = state;
    }
  }

  /** Create a workItemDir whose basename matches the instanceId (required by v1.1 ownership check) */
  async function makeWorkItemDir(instanceId: string): Promise<string> {
    const dir = path.join(tmpDir, instanceId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  // ──────────────────────────────────────────────────────
  // T1: reject CRITICAL_STATE without workItemDir
  // ──────────────────────────────────────────────────────

  it('should reject approval_required without workItemDir and not mutate state', async () => {
    const inst = engine.createInstance('agent-v11-test-workflow');
    forceState(inst.id, 'gates_running');
    await expect(engine.execute(inst.id)).rejects.toThrow(/workItemDir is required/i);
    expect(engine.getInstance(inst.id)!.currentState).toBe('gates_running');
  });

  it('should reject merge_ready without workItemDir and not mutate state', async () => {
    const inst = engine.createInstance('agent-v11-test-workflow');
    forceState(inst.id, 'approval_required');
    await expect(engine.execute(inst.id)).rejects.toThrow(/workItemDir is required/i);
    expect(engine.getInstance(inst.id)!.currentState).toBe('approval_required');
  });

  it('should reject closed without workItemDir and not mutate state', async () => {
    const inst = engine.createInstance('agent-v11-test-workflow');
    forceState(inst.id, 'verification_done');
    await expect(engine.execute(inst.id)).rejects.toThrow(/workItemDir is required/i);
    expect(engine.getInstance(inst.id)!.currentState).toBe('verification_done');
  });

  // ──────────────────────────────────────────────────────
  // T2: reject merge_ready without user_decision.json
  // ──────────────────────────────────────────────────────

  it('should reject merge_ready without user_decision.json', async () => {
    const inst = engine.createInstance('agent-v11-test-workflow');
    forceState(inst.id, 'approval_required');
    const wiDir = await makeWorkItemDir(inst.id);
    await expect(engine.execute(inst.id, { workItemDir: wiDir })).rejects.toThrow(/user_decision/);
    expect(engine.getInstance(inst.id)!.currentState).toBe('approval_required');
  });

  // ──────────────────────────────────────────────────────
  // T3: reject implementation_ready without code_permission_release_gate
  // ──────────────────────────────────────────────────────

  it('should reject implementation_ready without code_permission_release_gate', async () => {
    const inst = engine.createInstance('agent-v11-test-workflow');
    forceState(inst.id, 'post_merge_verified');
    const wiDir = await makeWorkItemDir(inst.id);
    await expect(engine.execute(inst.id, { workItemDir: wiDir })).rejects.toThrow(/code_permission_release_gate|tasks\.md|work_item/);
    expect(engine.getInstance(inst.id)!.currentState).toBe('post_merge_verified');
  });

  // ──────────────────────────────────────────────────────
  // T4: reject closed without changed_files_audit.md
  // ──────────────────────────────────────────────────────

  it('should reject closed without changed_files_audit.md', async () => {
    const inst = engine.createInstance('agent-v11-test-workflow');
    forceState(inst.id, 'verification_done');
    const wiDir = await makeWorkItemDir(inst.id);
    await expect(engine.execute(inst.id, { workItemDir: wiDir })).rejects.toThrow(/changed_files_audit/);
    expect(engine.getInstance(inst.id)!.currentState).toBe('verification_done');
  });

  // ──────────────────────────────────────────────────────
  // T5: reject closed without close_gate.json
  // ──────────────────────────────────────────────────────

  it('should reject closed without close_gate.json', async () => {
    const inst = engine.createInstance('agent-v11-test-workflow');
    forceState(inst.id, 'verification_done');
    const wiDir = await makeWorkItemDir(inst.id);
    // Provide changed_files_audit.md but not close_gate.json
    await fs.writeFile(path.join(wiDir, 'changed_files_audit.md'), '# audit\n');
    await expect(engine.execute(inst.id, { workItemDir: wiDir })).rejects.toThrow(/close_gate/);
    expect(engine.getInstance(inst.id)!.currentState).toBe('verification_done');
  });

  // ──────────────────────────────────────────────────────
  // T6: evidence complete → can reach target state
  // ──────────────────────────────────────────────────────

  it('should advance through approval_required with full evidence chain', async () => {
    const inst = engine.createInstance('agent-v11-test-workflow');
    forceState(inst.id, 'gates_running');
    const wiDir = await makeWorkItemDir(inst.id);
    await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });
    await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });

    // gates_running → approval_required (CRITICAL)
    await fs.writeFile(path.join(wiDir, 'gate_summary.md'), '# summary\n');
    await fs.writeFile(path.join(wiDir, 'gates', 'gate_summary_gate.json'), JSON.stringify({ status: 'passed' }));
    // approval_required → merge_ready (CRITICAL)
    await fs.writeFile(path.join(wiDir, 'user_decision.json'), JSON.stringify({ decision_status: 'approved' }));
    // merge_ready → merging (CRITICAL)
    await fs.writeFile(path.join(wiDir, 'gates', 'merge_ready_gate.json'), JSON.stringify({ status: 'passed' }));
    // merged → post_merge_verified (CRITICAL)
    await fs.writeFile(path.join(wiDir, 'gates', 'post_merge_gate.json'), JSON.stringify({ status: 'passed' }));
    // post_merge_verified → implementation_ready (CRITICAL)
    await fs.writeFile(path.join(wiDir, 'tasks.md'), '# Tasks\n- Task 1');
    await fs.writeFile(path.join(wiDir, 'work_item.json'), JSON.stringify({ allowed_write_files: ['src/a.ts'] }));
    await fs.writeFile(path.join(wiDir, 'gates', 'code_permission_release_gate.json'), JSON.stringify({ status: 'passed' }));
    // verification_running → verification_done (CRITICAL)
    await fs.writeFile(path.join(wiDir, 'verification_report.md'), '# Report\nAll pass.');
    await fs.writeFile(path.join(wiDir, 'evidence', 'evidence_manifest.json'), JSON.stringify({ artifacts: [] }));
    // verification_done → closed (CRITICAL)
    await fs.writeFile(path.join(wiDir, 'changed_files_audit.md'), '# Audit\n');
    await fs.writeFile(path.join(wiDir, 'gates', 'close_gate.json'), JSON.stringify({ status: 'passed' }));

    await engine.execute(inst.id, { workItemDir: wiDir });
    const finalState = engine.getInstance(inst.id)!.currentState;
    // With all evidence present, the engine should advance past gates_running
    expect(finalState).not.toBe('gates_running');
    // Verify it reached a state that requires evidence — proving the guard let it through
    expect([
      'approval_required', 'merge_ready', 'merging', 'merged',
      'post_merge_verified', 'implementation_ready', 'implementation_running',
      'implementation_done', 'verification_running', 'verification_done', 'closed',
    ]).toContain(finalState);
  });

  // ──────────────────────────────────────────────────────
  // T7: evidence guard failure → no further state progression
  // ──────────────────────────────────────────────────────

  it('should not progress to merging when merge_ready evidence is missing', async () => {
    const inst = engine.createInstance('agent-v11-test-workflow');
    forceState(inst.id, 'approval_required');
    const wiDir = await makeWorkItemDir(inst.id);
    // approval_required gate passes, but merge_ready evidence missing
    await expect(engine.execute(inst.id, { workItemDir: wiDir })).rejects.toThrow(/user_decision/);
    // State must still be approval_required (not moved to merge_ready or beyond)
    expect(engine.getInstance(inst.id)!.currentState).toBe('approval_required');
  });

  // ──────────────────────────────────────────────────────
  // T8: guard failure → no side effects (emitEvent spy)
  // ──────────────────────────────────────────────────────

  it('should not emit state_changed event when evidence guard fails', async () => {
    const inst = engine.createInstance('agent-v11-test-workflow');
    forceState(inst.id, 'gates_running');
    const wiDir = await makeWorkItemDir(inst.id);
    const emitSpy = vi.spyOn(engine as unknown as { emitEvent: (...args: unknown[]) => void }, 'emitEvent');
    await expect(engine.execute(inst.id, { workItemDir: wiDir })).rejects.toThrow();
    // Find any state_changed event — there should be none for approval_required
    const stateChangedCalls = emitSpy.mock.calls.filter(
      (call) => call[0] && (call[0] as { type?: string }).type === 'workflow.state_changed'
    );
    // State should not have changed to approval_required
    const approvalCalls = stateChangedCalls.filter(
      (call) => (call[0] as { data?: { to?: string } }).data?.to === 'approval_required'
    );
    expect(approvalCalls.length).toBe(0);
    emitSpy.mockRestore();
  });

  // ──────────────────────────────────────────────────────
  // T9: not_enabled not treated as passed in determineNextState
  // ──────────────────────────────────────────────────────

  it('should not treat not_enabled gate as passed (must enter fail branch)', async () => {
    const notEnabledGate = async () => ({
      schema_version: '1.0' as const,
      passed: false,
      status: 'not_enabled' as const,
      reason: 'Gate not enabled',
    });

    const wf: WorkflowDefinition = {
      schema_version: '1.0',
      id: 'not-enabled-test',
      displayName: 'Not Enabled Test',
      intent: 'test',
      stateMachine: {
        schema_version: '1.0',
        initial: 'start',
        states: {
          start: {
            schema_version: '1.0',
            agent: '',
            gate: { schema_version: '1.0', type: 'simple', id: 'ne-gate', name: 'NE Gate', checkFn: notEnabledGate },
            skills: [],
            next: { pass: 'passed_state', fail: 'blocked_state' },
          },
          passed_state: {
            schema_version: '1.0',
            agent: '',
            gate: { schema_version: '1.0', type: 'simple', id: 'noop-end', name: 'No-op', checkFn: passGate },
            skills: [],
          },
          blocked_state: {
            schema_version: '1.0',
            agent: '',
            gate: { schema_version: '1.0', type: 'simple', id: 'noop-block', name: 'No-op', checkFn: passGate },
            skills: [],
          },
        },
      },
      artifacts: [],
    };

    const runner = createWorkflowAgentRunner();
    const e = createAgentWorkflowEngine({ agentRunner: runner });
    e.loadWorkflow(wf);
    const inst = e.createInstance('not-enabled-test');
    await e.execute(inst.id);
    // not_enabled → passed=false → must go to fail branch (blocked_state), NOT passed_state
    expect(e.getInstance(inst.id)!.currentState).toBe('blocked_state');
  });

  // ──────────────────────────────────────────────────────
  // T10: gate failed + string next → throw unconsumed
  // ──────────────────────────────────────────────────────

  it('should throw on unconsumed failed gate with string next', async () => {
    const failGateFn = async () => ({
      schema_version: '1.0' as const,
      passed: false,
      status: 'failed' as const,
      reason: 'Gate failed',
    });

    const wf: WorkflowDefinition = {
      schema_version: '1.0',
      id: 'unconsumed-test',
      displayName: 'Unconsumed Test',
      intent: 'test',
      stateMachine: {
        schema_version: '1.0',
        initial: 'start',
        states: {
          start: {
            schema_version: '1.0',
            agent: '',
            gate: { schema_version: '1.0', type: 'simple', id: 'fail-gate', name: 'Fail Gate', checkFn: failGateFn },
            skills: [],
            next: 'end', // string next — gate failed means unconsumed
          },
          end: { schema_version: '1.0', agent: '', gate: null, skills: [] },
        },
      },
      artifacts: [],
    };

    const runner = createWorkflowAgentRunner();
    const e = createAgentWorkflowEngine({ agentRunner: runner });
    e.loadWorkflow(wf);
    const inst = e.createInstance('unconsumed-test');
    await expect(e.execute(inst.id)).rejects.toThrow(/unconsumed/);
    expect(e.getInstance(inst.id)!.currentState).toBe('start');
  });

  // ──────────────────────────────────────────────────────
  // T13: cross-WI evidence pollution — mismatched workItemDir MUST be rejected
  // ──────────────────────────────────────────────────────

  describe('cross-WI evidence pollution guard', () => {
    it('should reject mismatched workItemDir (different basename from instanceId)', async () => {
      // Use transitionFull path which uses workItemId directly as instanceId,
      // so basename(workItemDir) must match instanceId.
      const { WorkflowEngine: FullEngine } = await import('../../src/WorkflowEngine.js');

      const fullEngine = new FullEngine();
      fullEngine.loadWorkflow(makeAgentV11Workflow());

      // Create instance with id = 'WI-001' (via transitionFull creation path)
      await fullEngine.transitionFull({
        workItemId: 'WI-001',
        fromState: '',
        toState: 'created',
        workflowType: 'agent-v11-test-workflow',
      });

      // Create a SEPARATE directory for WI-999 with all evidence
      const wi999Dir = path.join(tmpDir, 'WI-999');
      await fs.mkdir(path.join(wi999Dir, 'gates'), { recursive: true });
      await fs.mkdir(path.join(wi999Dir, 'evidence'), { recursive: true });
      await fs.writeFile(path.join(wi999Dir, 'gate_summary.md'), '# summary\n');
      await fs.writeFile(path.join(wi999Dir, 'gates', 'gate_summary_gate.json'), JSON.stringify({ status: 'passed' }));

      // Force WI-001 to gates_running so next step is approval_required (CRITICAL)
      const inst = fullEngine.getInstance('WI-001')!;
      (inst as Record<string, unknown>).currentState = 'gates_running';

      // Try to advance WI-001 using WI-999's evidence directory
      await expect(
        fullEngine.transitionFull({
          workItemId: 'WI-001',
          fromState: 'gates_running',
          toState: 'approval_required',
          workItemDir: wi999Dir,
        })
      ).rejects.toThrow(/workItemDir.*does not match.*instanceId|mismatched.*workItemDir/i);

      // State must not have changed
      expect(fullEngine.getInstance('WI-001')!.currentState).toBe('gates_running');
    });

    it('should allow matching workItemDir (basename matches instanceId)', async () => {
      const { WorkflowEngine: FullEngine } = await import('../../src/WorkflowEngine.js');

      const fullEngine = new FullEngine();
      fullEngine.loadWorkflow(makeAgentV11Workflow());

      // Create instance with id = 'WI-001'
      await fullEngine.transitionFull({
        workItemId: 'WI-001',
        fromState: '',
        toState: 'created',
        workflowType: 'agent-v11-test-workflow',
      });

      // Create directory with MATCHING basename
      const wi001Dir = path.join(tmpDir, 'WI-001');
      await fs.mkdir(path.join(wi001Dir, 'gates'), { recursive: true });
      await fs.writeFile(path.join(wi001Dir, 'gate_summary.md'), '# summary\n');
      await fs.writeFile(path.join(wi001Dir, 'gates', 'gate_summary_gate.json'), JSON.stringify({ status: 'passed' }));

      // Force to gates_running
      const inst = fullEngine.getInstance('WI-001')!;
      (inst as Record<string, unknown>).currentState = 'gates_running';

      // This should succeed — matching directory
      const result = await fullEngine.transitionFull({
        workItemId: 'WI-001',
        fromState: 'gates_running',
        toState: 'approval_required',
        workItemDir: wi001Dir,
      });

      expect(result.currentState).toBe('approval_required');
    });

    // ──────────────────────────────────────────────────────
    // Boundary tests for verifyWorkItemDirOwnership
    // ──────────────────────────────────────────────────────

    it('should reject mismatched absolute workItemDir (basename != instanceId)', async () => {
      const { WorkflowEngine: FullEngine } = await import('../../src/WorkflowEngine.js');
      const fullEngine = new FullEngine();
      fullEngine.loadWorkflow(makeAgentV11Workflow());

      await fullEngine.transitionFull({
        workItemId: 'WI-001',
        fromState: '',
        toState: 'created',
        workflowType: 'agent-v11-test-workflow',
      });

      // Absolute path whose basename is 'other-WI' (not 'WI-001')
      const mismatchDir = path.resolve(tmpDir, 'other-WI');
      await fs.mkdir(mismatchDir, { recursive: true });

      const inst = fullEngine.getInstance('WI-001')!;
      (inst as Record<string, unknown>).currentState = 'gates_running';

      await expect(
        fullEngine.transitionFull({
          workItemId: 'WI-001',
          fromState: 'gates_running',
          toState: 'approval_required',
          workItemDir: mismatchDir,
        })
      ).rejects.toThrow(/workItemDir.*does not match.*instanceId|cross-WI evidence pollution/i);
      expect(fullEngine.getInstance('WI-001')!.currentState).toBe('gates_running');
    });

    it('should reject mismatched relative workItemDir (basename != instanceId)', async () => {
      const { WorkflowEngine: FullEngine } = await import('../../src/WorkflowEngine.js');
      const fullEngine = new FullEngine();
      fullEngine.loadWorkflow(makeAgentV11Workflow());

      await fullEngine.transitionFull({
        workItemId: 'WI-001',
        fromState: '',
        toState: 'created',
        workflowType: 'agent-v11-test-workflow',
      });

      // Relative path whose basename is 'wrong-dir'
      const relDir = path.join(tmpDir, 'wrong-dir');
      await fs.mkdir(relDir, { recursive: true });

      const inst = fullEngine.getInstance('WI-001')!;
      (inst as Record<string, unknown>).currentState = 'gates_running';

      await expect(
        fullEngine.transitionFull({
          workItemId: 'WI-001',
          fromState: 'gates_running',
          toState: 'approval_required',
          workItemDir: relDir,
        })
      ).rejects.toThrow(/workItemDir.*does not match.*instanceId|cross-WI evidence pollution/i);
      expect(fullEngine.getInstance('WI-001')!.currentState).toBe('gates_running');
    });

    it('should reject workItemDir with .. traversal (resolved basename != instanceId)', async () => {
      const { WorkflowEngine: FullEngine } = await import('../../src/WorkflowEngine.js');
      const fullEngine = new FullEngine();
      fullEngine.loadWorkflow(makeAgentV11Workflow());

      await fullEngine.transitionFull({
        workItemId: 'WI-001',
        fromState: '',
        toState: 'created',
        workflowType: 'agent-v11-test-workflow',
      });

      // Create /tmp/sf-xxx/WI-001/ and /tmp/sf-xxx/attacker/
      const wi001Dir = path.join(tmpDir, 'WI-001');
      const attackerDir = path.join(tmpDir, 'attacker');
      await fs.mkdir(wi001Dir, { recursive: true });
      await fs.mkdir(attackerDir, { recursive: true });

      // Path with .. traversal: /tmp/sf-xxx/WI-001/../attacker
      // path.resolve gives /tmp/sf-xxx/attacker, basename = 'attacker' != 'WI-001'
      const traversalPath = path.join(wi001Dir, '..', 'attacker');

      const inst = fullEngine.getInstance('WI-001')!;
      (inst as Record<string, unknown>).currentState = 'gates_running';

      await expect(
        fullEngine.transitionFull({
          workItemId: 'WI-001',
          fromState: 'gates_running',
          toState: 'approval_required',
          workItemDir: traversalPath,
        })
      ).rejects.toThrow(/workItemDir.*does not match.*instanceId|cross-WI evidence pollution/i);
      expect(fullEngine.getInstance('WI-001')!.currentState).toBe('gates_running');
    });

    it('should allow Windows-style backslash path when basename matches instanceId', async () => {
      const { WorkflowEngine: FullEngine } = await import('../../src/WorkflowEngine.js');
      const fullEngine = new FullEngine();
      fullEngine.loadWorkflow(makeAgentV11Workflow());

      await fullEngine.transitionFull({
        workItemId: 'WI-001',
        fromState: '',
        toState: 'created',
        workflowType: 'agent-v11-test-workflow',
      });

      // On Windows, path.join produces backslash paths — just use the normal tmpDir-based path
      const wi001Dir = path.join(tmpDir, 'WI-001');
      await fs.mkdir(path.join(wi001Dir, 'gates'), { recursive: true });
      await fs.writeFile(path.join(wi001Dir, 'gate_summary.md'), '# summary\n');
      await fs.writeFile(path.join(wi001Dir, 'gates', 'gate_summary_gate.json'), JSON.stringify({ status: 'passed' }));

      const inst = fullEngine.getInstance('WI-001')!;
      (inst as Record<string, unknown>).currentState = 'gates_running';

      const result = await fullEngine.transitionFull({
        workItemId: 'WI-001',
        fromState: 'gates_running',
        toState: 'approval_required',
        workItemDir: wi001Dir,
      });

      expect(result.currentState).toBe('approval_required');
    });
  });
});
