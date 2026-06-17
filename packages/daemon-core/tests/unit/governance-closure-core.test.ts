/**
 * governance-closure-core.test.ts — Core layer governance tests
 *
 * Tests that seal transitions and Write Guard are enforced at the
 * WorkflowEngine/Runtime level, not just in handler wrappers.
 *
 * Coverage:
 * - WorkflowEngine.transitionFull seal transition enforcement
 * - Write Guard log factual audit
 * - Write Guard integration (checkWrite → log → audit → close_gate)
 * - Daemon-level E2E lifecycle
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { WorkflowEngine } from '@specforge/workflow-runtime';
import { checkWrite, type WriteGuardContext } from '../../src/tools/lib/write-guard-v11.js';
import {
  appendWriteGuardLog,
  readWriteGuardLog,
  getFactualChangedFiles,
  summarizeWriteGuardLog,
} from '../../src/tools/lib/write-guard-log.js';
import { runChangedFilesAudit } from '../../src/tools/lib/changed-files-audit.js';
import { ACTOR_ROLES } from '@specforge/types/actor-roles';

// Import close gate handler
import '../../src/tools/handlers/sf-v11-close-gate.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeV11Workflow() {
  return {
    schema_version: '1.0' as const,
    id: 'v11-test',
    name: 'v1.1 Test Workflow',
    description: 'Test',
    version: '1.0.0',
    stateMachine: {
      schema_version: '1.0' as const,
      initial: 'created',
      states: {
        created: { schema_version: '1.0' as const, agent: 'orchestrator', gate: { schema_version: '1.0' as const, id: 'g1', type: 'simple' as const, required: false }, skills: [], next: 'gates_running' },
        gates_running: { schema_version: '1.0' as const, agent: 'gate_runner', gate: { schema_version: '1.0' as const, id: 'g2', type: 'simple' as const, required: false }, skills: [], next: { pass: 'approval_required', fail: 'gates_failed' } },
        gates_failed: { schema_version: '1.0' as const, agent: 'orchestrator', gate: { schema_version: '1.0' as const, id: 'g3', type: 'simple' as const, required: false }, skills: [], next: 'candidate_preparing' },
        approval_required: { schema_version: '1.0' as const, agent: 'user_decision_recorder', gate: { schema_version: '1.0' as const, id: 'g4', type: 'simple' as const, required: false }, skills: [], next: { pass: 'approved', fail: 'rejected' } },
        approved: { schema_version: '1.0' as const, agent: 'orchestrator', gate: { schema_version: '1.0' as const, id: 'g5', type: 'simple' as const, required: false }, skills: [], next: 'merge_ready' },
        merge_ready: { schema_version: '1.0' as const, agent: 'merge_runner', gate: { schema_version: '1.0' as const, id: 'g6', type: 'simple' as const, required: false }, skills: [], next: 'merging' },
        merging: { schema_version: '1.0' as const, agent: 'merge_runner', gate: { schema_version: '1.0' as const, id: 'g7', type: 'simple' as const, required: false }, skills: [], next: { pass: 'merged', fail: 'gates_failed' } },
        merged: { schema_version: '1.0' as const, agent: 'orchestrator', gate: { schema_version: '1.0' as const, id: 'g8', type: 'simple' as const, required: false }, skills: [], next: 'post_merge_verified' },
        post_merge_verified: { schema_version: '1.0' as const, agent: 'orchestrator', gate: { schema_version: '1.0' as const, id: 'g9', type: 'simple' as const, required: false }, skills: [], next: 'implementation_ready' },
        implementation_ready: { schema_version: '1.0' as const, agent: 'orchestrator', gate: { schema_version: '1.0' as const, id: 'g10', type: 'simple' as const, required: false }, skills: [], next: 'implementation_running' },
        implementation_running: { schema_version: '1.0' as const, agent: 'agent', gate: { schema_version: '1.0' as const, id: 'g11', type: 'simple' as const, required: false }, skills: [], next: 'implementation_done' },
        implementation_done: { schema_version: '1.0' as const, agent: 'orchestrator', gate: { schema_version: '1.0' as const, id: 'g12', type: 'simple' as const, required: false }, skills: [], next: 'verification_running' },
        verification_running: { schema_version: '1.0' as const, agent: 'orchestrator', gate: { schema_version: '1.0' as const, id: 'g13', type: 'simple' as const, required: false }, skills: [], next: { pass: 'verification_done', fail: 'implementation_running' } },
        verification_done: { schema_version: '1.0' as const, agent: 'close_gate', gate: { schema_version: '1.0' as const, id: 'g14', type: 'simple' as const, required: false }, skills: [], next: 'closed' },
        closed: { schema_version: '1.0' as const, agent: 'system', gate: { schema_version: '1.0' as const, id: 'g15', type: 'simple' as const, required: false }, skills: [] },
        rejected: { schema_version: '1.0' as const, agent: 'system', gate: { schema_version: '1.0' as const, id: 'g16', type: 'simple' as const, required: false }, skills: [] },
        candidate_preparing: { schema_version: '1.0' as const, agent: 'orchestrator', gate: { schema_version: '1.0' as const, id: 'g17', type: 'simple' as const, required: false }, skills: [], next: 'candidate_prepared' },
        candidate_prepared: { schema_version: '1.0' as const, agent: 'orchestrator', gate: { schema_version: '1.0' as const, id: 'g18', type: 'simple' as const, required: false }, skills: [], next: 'gates_running' },
      },
    },
  };
}

async function createWorkItemEvidence(wiDir: string): Promise<void> {
  await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });
  await fs.writeFile(path.join(wiDir, 'changed_files_audit.md'), '# Audit\n- Status: PASSED\n');
  await fs.writeFile(path.join(wiDir, 'gates', 'close_gate.json'), JSON.stringify({ status: 'passed' }));
}

// ---------------------------------------------------------------------------
// A. WorkflowEngine.transitionFull seal transition tests
// ---------------------------------------------------------------------------

describe('A. WorkflowEngine.transitionFull — seal transition enforcement (core layer)', () => {
  let engine: InstanceType<typeof WorkflowEngine>;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-core-seal-'));
    engine = new WorkflowEngine();
    engine.loadWorkflow(makeV11Workflow());
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function forceState(instanceId: string, state: string) {
    const inst = engine.getInstance(instanceId) as any;
    if (inst) inst.currentState = state;
  }

  it('blocks verification_done → closed without close_gate actor', async () => {
    const wiDir = path.join(tmpDir, 'WI-001');
    await fs.mkdir(wiDir, { recursive: true });
    await createWorkItemEvidence(wiDir);

    await engine.transitionFull({
      workItemId: 'WI-001', fromState: '', toState: 'created', workflowType: 'v11-test',
    });
    forceState('WI-001', 'verification_done');

    await expect(
      engine.transitionFull({
        workItemId: 'WI-001',
        fromState: 'verification_done',
        toState: 'closed',
        actor: 'sf-orchestrator',
        workItemDir: wiDir,
      }),
    ).rejects.toThrow(/Seal transition.*close_gate/);
  });

  it('blocks verification_done → closed with agent actor', async () => {
    const wiDir = path.join(tmpDir, 'WI-002');
    await fs.mkdir(wiDir, { recursive: true });
    await createWorkItemEvidence(wiDir);

    await engine.transitionFull({
      workItemId: 'WI-002', fromState: '', toState: 'created', workflowType: 'v11-test',
    });
    forceState('WI-002', 'verification_done');

    await expect(
      engine.transitionFull({
        workItemId: 'WI-002',
        fromState: 'verification_done',
        toState: 'closed',
        actor: 'agent',
        workItemDir: wiDir,
      }),
    ).rejects.toThrow(/Seal transition.*close_gate/);
  });

  it('blocks verification_done → closed with no actor', async () => {
    const wiDir = path.join(tmpDir, 'WI-003');
    await fs.mkdir(wiDir, { recursive: true });
    await createWorkItemEvidence(wiDir);

    await engine.transitionFull({
      workItemId: 'WI-003', fromState: '', toState: 'created', workflowType: 'v11-test',
    });
    forceState('WI-003', 'verification_done');

    await expect(
      engine.transitionFull({
        workItemId: 'WI-003',
        fromState: 'verification_done',
        toState: 'closed',
        workItemDir: wiDir,
      }),
    ).rejects.toThrow(/Seal transition.*close_gate/);
  });

  it('allows verification_done → closed WITH close_gate actor', async () => {
    const wiDir = path.join(tmpDir, 'WI-004');
    await fs.mkdir(wiDir, { recursive: true });
    await createWorkItemEvidence(wiDir);

    await engine.transitionFull({
      workItemId: 'WI-004', fromState: '', toState: 'created', workflowType: 'v11-test',
    });
    forceState('WI-004', 'verification_done');

    const result = await engine.transitionFull({
      workItemId: 'WI-004',
      fromState: 'verification_done',
      toState: 'closed',
      actor: 'close_gate',
      workItemDir: wiDir,
    });

    expect(result.currentState).toBe('closed');
  });

  it('blocks gates_running → approval_required without gate_runner actor', async () => {
    const wiDir = path.join(tmpDir, 'WI-005');
    await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });
    await fs.writeFile(path.join(wiDir, 'gate_summary.md'), '# Gate Summary');
    await fs.writeFile(path.join(wiDir, 'gates', 'gate_summary_gate.json'), JSON.stringify({ status: 'passed' }));

    await engine.transitionFull({
      workItemId: 'WI-005', fromState: '', toState: 'created', workflowType: 'v11-test',
    });
    forceState('WI-005', 'gates_running');

    await expect(
      engine.transitionFull({
        workItemId: 'WI-005',
        fromState: 'gates_running',
        toState: 'approval_required',
        actor: 'agent',
        workItemDir: wiDir,
      }),
    ).rejects.toThrow(/Seal transition.*gate_runner/);
  });

  it('allows gates_running → approval_required WITH gate_runner actor', async () => {
    const wiDir = path.join(tmpDir, 'WI-006');
    await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });
    await fs.writeFile(path.join(wiDir, 'gate_summary.md'), '# Gate Summary');
    await fs.writeFile(path.join(wiDir, 'gates', 'gate_summary_gate.json'), JSON.stringify({ status: 'passed' }));

    await engine.transitionFull({
      workItemId: 'WI-006', fromState: '', toState: 'created', workflowType: 'v11-test',
    });
    forceState('WI-006', 'gates_running');

    const result = await engine.transitionFull({
      workItemId: 'WI-006',
      fromState: 'gates_running',
      toState: 'approval_required',
      actor: 'gate_runner',
      workItemDir: wiDir,
    });

    expect(result.currentState).toBe('approval_required');
  });

  it('closed → any is forbidden at core level', async () => {
    await engine.transitionFull({
      workItemId: 'WI-007', fromState: '', toState: 'created', workflowType: 'v11-test',
    });
    forceState('WI-007', 'closed');

    await expect(
      engine.transitionFull({
        workItemId: 'WI-007',
        fromState: 'closed',
        toState: 'created',
        actor: 'close_gate',
      }),
    ).rejects.toThrow(/Forbidden transition/);
  });

  it('blocked → closed is forbidden at core level', async () => {
    await engine.transitionFull({
      workItemId: 'WI-008', fromState: '', toState: 'created', workflowType: 'v11-test',
    });
    forceState('WI-008', 'blocked');

    await expect(
      engine.transitionFull({
        workItemId: 'WI-008',
        fromState: 'blocked',
        toState: 'closed',
        actor: 'close_gate',
      }),
    ).rejects.toThrow(/Forbidden transition/);
  });

  it('supports actor as object with agentRole field', async () => {
    const wiDir = path.join(tmpDir, 'WI-009');
    await fs.mkdir(wiDir, { recursive: true });
    await createWorkItemEvidence(wiDir);

    await engine.transitionFull({
      workItemId: 'WI-009', fromState: '', toState: 'created', workflowType: 'v11-test',
    });
    forceState('WI-009', 'verification_done');

    const result = await engine.transitionFull({
      workItemId: 'WI-009',
      fromState: 'verification_done',
      toState: 'closed',
      actor: { agentRole: 'close_gate', sessionId: 'test-session' },
      workItemDir: wiDir,
    });

    expect(result.currentState).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// B. Write Guard Log — factual audit source
// ---------------------------------------------------------------------------

describe('B. Write Guard Log — append-only factual source', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-wg-log-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('appendWriteGuardLog creates log file and writes entries', () => {
    appendWriteGuardLog(tmpDir, {
      timestamp: '2026-06-11T00:00:00Z',
      path: 'src/main.ts',
      operation: 'modify',
      actor: 'agent',
      allowed: true,
      violations: [],
    });

    const entries = readWriteGuardLog(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('src/main.ts');
    expect(entries[0].allowed).toBe(true);
  });

  it('logs multiple entries (append-only)', () => {
    appendWriteGuardLog(tmpDir, { timestamp: 'T1', path: 'a.ts', operation: 'create', actor: 'agent', allowed: true, violations: [] });
    appendWriteGuardLog(tmpDir, { timestamp: 'T2', path: 'b.ts', operation: 'modify', actor: 'agent', allowed: true, violations: [] });
    appendWriteGuardLog(tmpDir, { timestamp: 'T3', path: 'c.ts', operation: 'modify', actor: 'agent', allowed: false, violations: ['not in allowed_write_files'] });

    const entries = readWriteGuardLog(tmpDir);
    expect(entries).toHaveLength(3);
  });

  it('getFactualChangedFiles returns only allowed writes', () => {
    appendWriteGuardLog(tmpDir, { timestamp: 'T1', path: 'src/ok.ts', operation: 'modify', actor: 'agent', allowed: true, violations: [] });
    appendWriteGuardLog(tmpDir, { timestamp: 'T2', path: 'src/blocked.ts', operation: 'modify', actor: 'agent', allowed: false, violations: ['blocked'] });
    appendWriteGuardLog(tmpDir, { timestamp: 'T3', path: 'src/ok2.ts', operation: 'create', actor: 'agent', allowed: true, violations: [] });

    const factual = getFactualChangedFiles(tmpDir);
    expect(factual).toHaveLength(2);
    expect(factual.map(f => f.path)).toContain('src/ok.ts');
    expect(factual.map(f => f.path)).toContain('src/ok2.ts');
    expect(factual.map(f => f.path)).not.toContain('src/blocked.ts');
  });

  it('summarizeWriteGuardLog provides blocked vs allowed breakdown', () => {
    appendWriteGuardLog(tmpDir, { timestamp: 'T1', path: 'a.ts', operation: 'modify', actor: 'agent', allowed: true, violations: [] });
    appendWriteGuardLog(tmpDir, { timestamp: 'T2', path: 'b.ts', operation: 'modify', actor: 'agent', allowed: false, violations: ['v1'] });

    const summary = summarizeWriteGuardLog(tmpDir);
    expect(summary.totalEntries).toBe(2);
    expect(summary.allowedWrites).toHaveLength(1);
    expect(summary.blockedWrites).toHaveLength(1);
    expect(summary.uniqueBlockedPaths).toContain('b.ts');
  });

  it('returns empty when log does not exist', () => {
    const nonExist = path.join(tmpDir, 'nonexistent');
    expect(readWriteGuardLog(nonExist)).toEqual([]);
    expect(getFactualChangedFiles(nonExist)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C. Write Guard Integration (checkWrite → log → audit → close_gate)
// ---------------------------------------------------------------------------

describe('C. Write Guard integration — real checkWrite → log → audit chain', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-wg-integ-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('allowed write → logged → appears in factual changed files', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-INT-001',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/main.ts', operation: 'modify' }],
        workflow_path: 'code_only_fast_path',
      },
      callerRole: ACTOR_ROLES.agent,
      isFrozen: false,
    };

    const result = checkWrite(ctx, 'src/main.ts', 'modify');
    expect(result.allowed).toBe(true);

    // Log the decision (simulating what HTTPServer does)
    appendWriteGuardLog(tmpDir, {
      timestamp: new Date().toISOString(),
      path: 'src/main.ts',
      operation: 'modify',
      actor: ACTOR_ROLES.agent,
      allowed: result.allowed,
      violations: result.violations,
    });

    const factual = getFactualChangedFiles(tmpDir);
    expect(factual).toHaveLength(1);
    expect(factual[0].path).toBe('src/main.ts');
  });

  it('blocked write → logged → does NOT appear in factual changed files', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-INT-002',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/main.ts', operation: 'modify' }],
        workflow_path: 'code_only_fast_path',
      },
      callerRole: ACTOR_ROLES.agent,
      isFrozen: false,
    };

    const result = checkWrite(ctx, 'src/unauthorized.ts', 'modify');
    expect(result.allowed).toBe(false);

    appendWriteGuardLog(tmpDir, {
      timestamp: new Date().toISOString(),
      path: 'src/unauthorized.ts',
      operation: 'modify',
      actor: ACTOR_ROLES.agent,
      allowed: result.allowed,
      violations: result.violations,
    });

    const factual = getFactualChangedFiles(tmpDir);
    expect(factual).toHaveLength(0);

    const summary = summarizeWriteGuardLog(tmpDir);
    expect(summary.blockedWrites).toHaveLength(1);
    expect(summary.blockedWrites[0].violations[0]).toContain('not in allowed_write_files');
  });

  it('.specforge/project/ write by agent → blocked → logged as violation', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-INT-003',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [],
        workflow_path: 'code_only_fast_path',
      },
      callerRole: ACTOR_ROLES.agent,
      isFrozen: false,
    };

    const result = checkWrite(ctx, '.specforge/project/architecture.md', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('merge_runner');

    appendWriteGuardLog(tmpDir, {
      timestamp: new Date().toISOString(),
      path: '.specforge/project/architecture.md',
      operation: 'modify',
      actor: ACTOR_ROLES.agent,
      allowed: result.allowed,
      violations: result.violations,
    });

    const summary = summarizeWriteGuardLog(tmpDir);
    expect(summary.blockedWrites).toHaveLength(1);
  });

  it('closed WI → all writes blocked → logged', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-INT-004',
        status: 'closed',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: null,
      },
      callerRole: ACTOR_ROLES.agent,
      isFrozen: false,
    };

    const result = checkWrite(ctx, 'src/main.ts', 'modify');
    expect(result.allowed).toBe(false);

    appendWriteGuardLog(tmpDir, {
      timestamp: new Date().toISOString(),
      path: 'src/main.ts',
      operation: 'modify',
      actor: ACTOR_ROLES.agent,
      allowed: result.allowed,
      violations: result.violations,
    });

    const summary = summarizeWriteGuardLog(tmpDir);
    expect(summary.blockedWrites).toHaveLength(1);
    expect(summary.blockedWrites[0].violations[0]).toContain('closed');
  });

  it('full chain: allowed writes + violation → audit uses factual log → close_gate handles violation', async () => {
    // Simulate implementation phase: 2 allowed writes, 1 violation
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'WI-CHAIN',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [
          { path: 'src/app.ts', operation: 'modify' },
          { path: 'src/util.ts', operation: 'create' },
        ],
        workflow_path: 'code_only_fast_path',
      },
      callerRole: ACTOR_ROLES.agent,
      isFrozen: false,
    };

    // Write 1: allowed
    const r1 = checkWrite(ctx, 'src/app.ts', 'modify');
    appendWriteGuardLog(tmpDir, { timestamp: 'T1', path: 'src/app.ts', operation: 'modify', actor: 'agent', allowed: r1.allowed, violations: r1.violations });

    // Write 2: allowed
    const r2 = checkWrite(ctx, 'src/util.ts', 'create');
    appendWriteGuardLog(tmpDir, { timestamp: 'T2', path: 'src/util.ts', operation: 'create', actor: 'agent', allowed: r2.allowed, violations: r2.violations });

    // Write 3: BLOCKED (out of scope)
    const r3 = checkWrite(ctx, 'package.json', 'modify');
    appendWriteGuardLog(tmpDir, { timestamp: 'T3', path: 'package.json', operation: 'modify', actor: 'agent', allowed: r3.allowed, violations: r3.violations });

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);

    // Now: audit uses factual log
    const factual = getFactualChangedFiles(tmpDir);
    expect(factual).toHaveLength(2); // only allowed writes
    expect(factual.map(f => f.path)).toContain('src/app.ts');
    expect(factual.map(f => f.path)).toContain('src/util.ts');
    expect(factual.map(f => f.path)).not.toContain('package.json');

    // Audit against allowed_write_files snapshot
    const auditResult = runChangedFilesAudit(
      factual,
      [{ path: 'src/app.ts', operation: 'modify' }, { path: 'src/util.ts', operation: 'create' }],
      'agent',
    );
    expect(auditResult.passed).toBe(true);
    expect(auditResult.total_files).toBe(2);
    expect(auditResult.in_scope).toBe(2);
    expect(auditResult.out_of_scope).toBe(0);

    // Write Guard summary shows the blocked write
    const summary = summarizeWriteGuardLog(tmpDir);
    expect(summary.blockedWrites).toHaveLength(1);
    expect(summary.blockedWrites[0].path).toBe('package.json');
  });
});

// ---------------------------------------------------------------------------
// D. Daemon-level E2E — full lifecycle
// ---------------------------------------------------------------------------

describe('D. Daemon-level E2E — code_only_fast_path lifecycle', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-daemon-e2e-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('full lifecycle: create WI → permission → write guard → audit → close_gate → closed', async () => {
    const workItemId = 'WI-E2E-001';
    const wiDir = path.join(tmpDir, '.specforge', 'work-items', workItemId);
    await fs.mkdir(wiDir, { recursive: true });
    await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
    await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });

    // --- Phase 1: Create WI ---
    const workItem: Record<string, unknown> = {
      work_item_id: workItemId,
      status: 'verification_done', // Pre-set for close_gate test
      code_change_allowed: true,
      allowed_write_files: [
        { path: 'src/main.ts', operation: 'modify' },
        { path: 'src/helper.ts', operation: 'create' },
      ],
      workflow_path: 'code_only_fast_path',
      updated_at: new Date().toISOString(),
    };
    await fs.writeFile(path.join(wiDir, 'work_item.json'), JSON.stringify(workItem, null, 2) + '\n');

    // --- Phase 2: Simulate Write Guard during implementation ---
    const writeCtx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: workItemId,
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [
          { path: 'src/main.ts', operation: 'modify' },
          { path: 'src/helper.ts', operation: 'create' },
        ],
        workflow_path: 'code_only_fast_path',
      },
      callerRole: ACTOR_ROLES.agent,
      isFrozen: false,
    };

    // Allowed writes
    const w1 = checkWrite(writeCtx, 'src/main.ts', 'modify');
    appendWriteGuardLog(wiDir, { timestamp: 'T1', path: 'src/main.ts', operation: 'modify', actor: 'agent', allowed: w1.allowed, violations: w1.violations });
    expect(w1.allowed).toBe(true);

    const w2 = checkWrite(writeCtx, 'src/helper.ts', 'create');
    appendWriteGuardLog(wiDir, { timestamp: 'T2', path: 'src/helper.ts', operation: 'create', actor: 'agent', allowed: w2.allowed, violations: w2.violations });
    expect(w2.allowed).toBe(true);

    // Blocked write attempt
    const w3 = checkWrite(writeCtx, 'src/unauthorized.ts', 'create');
    appendWriteGuardLog(wiDir, { timestamp: 'T3', path: 'src/unauthorized.ts', operation: 'create', actor: 'agent', allowed: w3.allowed, violations: w3.violations });
    expect(w3.allowed).toBe(false);

    // --- Phase 3: Generate evidence files ---
    await fs.writeFile(path.join(wiDir, 'intake.md'), '# Intake');
    await fs.writeFile(path.join(wiDir, 'change_classification.md'), '# CC\ncode_only');
    await fs.writeFile(path.join(wiDir, 'impact_analysis.md'), '# IA');
    await fs.writeFile(path.join(wiDir, 'trigger_result.json'), JSON.stringify({ work_item_id: workItemId, workflow_path: 'code_only_fast_path', triggered: true }));
    await fs.writeFile(path.join(wiDir, 'tasks.md'), '# Tasks\n- [x] Done');
    await fs.writeFile(path.join(wiDir, 'trace_delta.md'), '# Trace\nNo spec impact');
    await fs.writeFile(path.join(wiDir, 'candidate_manifest.json'), JSON.stringify({ work_item_id: workItemId, entries: [], workflow_path: 'code_only_fast_path' }));
    await fs.writeFile(path.join(wiDir, 'gate_summary.md'), '# Gate Summary\n- Overall Status: passed');
    await fs.writeFile(path.join(wiDir, 'verification_report.md'), '# Verification\nAll evidence reviewed.');
    await fs.writeFile(path.join(wiDir, 'merge_report.md'), '# Merge\nMerge Status: not_applicable');
    await fs.writeFile(path.join(wiDir, 'evidence', 'evidence_manifest.json'), JSON.stringify({ work_item_id: workItemId, entries: [{ type: 'log', path: 'test.log' }] }));
    await fs.writeFile(path.join(wiDir, 'user_decision.json'), JSON.stringify({ decision_status: 'approved' }));

    // --- Phase 4: Execute close_gate ---
    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    // --- Phase 5: Verify closure ---
    expect(result.success).toBe(true);
    expect(result.state_advanced).toBe(true);
    expect(result.code_permission_revoked).toBe(true);

    // Verify WI is closed
    const finalWi = JSON.parse(await fs.readFile(path.join(wiDir, 'work_item.json'), 'utf-8'));
    expect(finalWi.status).toBe('closed');
    expect(finalWi.closed_at).toBeDefined();
    expect(finalWi.code_change_allowed).toBe(false);
    expect(finalWi.allowed_write_files).toEqual([]);

    // Verify changed_files_audit used Write Guard log
    const auditMd = await fs.readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf-8');
    expect(auditMd).toContain('write_guard_log.jsonl');
    expect(auditMd).toContain('src/main.ts');
    expect(auditMd).toContain('src/helper.ts');
    expect(auditMd).toContain('PASSED');
    // Should NOT contain unauthorized file in File Entries table (only allowed writes)
    // But it MAY appear in Write Guard Violations section (that's expected)
    const fileEntriesSection = auditMd.split('## File Entries')[1] ?? '';
    expect(fileEntriesSection).not.toContain('src/unauthorized.ts');

    // Verify close_gate.json
    const gateJson = JSON.parse(await fs.readFile(path.join(wiDir, 'gates', 'close_gate.json'), 'utf-8'));
    expect(gateJson.status).toBe('passed');

    // --- Phase 6: Verify closed WI blocks further writes ---
    const closedCtx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: workItemId,
        status: 'closed',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: 'code_only_fast_path',
      },
      callerRole: ACTOR_ROLES.agent,
      isFrozen: false,
    };

    const postCloseWrite = checkWrite(closedCtx, 'src/main.ts', 'modify');
    expect(postCloseWrite.allowed).toBe(false);
    expect(postCloseWrite.violations[0]).toContain('closed');
  });
});
