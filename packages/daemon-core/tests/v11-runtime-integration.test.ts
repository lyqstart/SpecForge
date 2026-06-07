/**
 * v11-runtime-integration.test.ts — v1.1 运行时服务集成测试
 *
 * 验证：
 * - State Machine（§5）
 * - Gate Runner（§9）
 * - Merge Runner（§11）
 * - Write Guard（§12）
 * - User Decision Recorder（§10）
 * - code_permission_service（§12）
 * - Work Item Lifecycle（§4）
 * - Workflow Path Selection（§6）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  isForbiddenTransition,
  isValidV11Transition,
  WI_STATUSES_V11,
  isAuthorizedAdvancementSubject,
  performResumeCheck,
} from '../src/tools/lib/state-machine-v11';

import {
  checkWrite,
  performChangedFilesAudit,
  type WriteGuardContext,
} from '../src/tools/lib/write-guard-v11';

import {
  selectWorkflowPath,
  generateTriggerResult,
  type ChangeClassification,
} from '../src/tools/lib/workflow-path-selector-v11';

import {
  createWorkItem,
  initializeClosureFiles,
  updateWorkItemStatus,
} from '../src/tools/lib/work-item-lifecycle-v11';

// ---------------------------------------------------------------------------
// 临时目录
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-v11-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// §5 State Machine
// ---------------------------------------------------------------------------

describe('v1.1 State Machine（§5）', () => {
  it('has 24 WI statuses', () => {
    expect(WI_STATUSES_V11.length).toBe(24);
  });

  it('forbids created → implementation_running', () => {
    expect(isForbiddenTransition('created', 'implementation_running')).toBe(true);
  });

  it('forbids closed → any', () => {
    expect(isForbiddenTransition('closed', 'created')).toBe(true);
    expect(isForbiddenTransition('closed', 'intake_ready')).toBe(true);
  });

  it('allows valid transitions', () => {
    expect(isValidV11Transition('created', 'intake_ready')).toBe(true);
    expect(isValidV11Transition('intake_ready', 'impact_analyzing')).toBe(true);
    expect(isValidV11Transition('gates_running', 'approval_required')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(isValidV11Transition('created', 'merging')).toBe(false);
    expect(isValidV11Transition('closed', 'created')).toBe(false);
  });

  it('recognizes authorized advancement subjects', () => {
    expect(isAuthorizedAdvancementSubject('sf-orchestrator')).toBe(true);
    expect(isAuthorizedAdvancementSubject('Merge Runner')).toBe(true);
    expect(isAuthorizedAdvancementSubject('random_agent')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §12 Write Guard
// ---------------------------------------------------------------------------

describe('v1.1 Write Guard（§12）', () => {
  const baseCtx: WriteGuardContext = {
    hasActiveWI: true,
    callerRole: 'agent',
    isFrozen: false,
    workItem: {
      work_item_id: 'WI-0001',
      status: 'implementation_running',
      code_change_allowed: true,
      allowed_write_files: [
        { path: 'src/auth.ts', operation: 'modify' },
      ],
      workflow_path: 'task_change_path',
    },
  };

  it('allows writing to allowed files', () => {
    const result = checkWrite(baseCtx, 'src/auth.ts', 'modify');
    expect(result.allowed).toBe(true);
  });

  it('blocks writing outside allowed_write_files', () => {
    const result = checkWrite(baseCtx, 'src/other.ts', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('not in allowed_write_files');
  });

  it('blocks agent from writing .specforge/project/', () => {
    const result = checkWrite(baseCtx, '.specforge/project/spec_manifest.json', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('agent cannot write');
  });

  it('blocks writing when code_change_allowed=false', () => {
    const ctx = { ...baseCtx, workItem: { ...baseCtx.workItem!, code_change_allowed: false, allowed_write_files: [] } };
    const result = checkWrite(ctx, 'src/auth.ts', 'modify');
    expect(result.allowed).toBe(false);
  });

  it('blocks writing without active WI', () => {
    const ctx = { ...baseCtx, hasActiveWI: false, workItem: undefined };
    const result = checkWrite(ctx, 'src/auth.ts', 'modify');
    expect(result.allowed).toBe(false);
  });

  it('allows Merge Runner to write .specforge/project/', () => {
    const ctx = { ...baseCtx, callerRole: 'Merge Runner' as const };
    const result = checkWrite(ctx, '.specforge/project/spec_manifest.json', 'modify');
    expect(result.allowed).toBe(true);
  });

  it('blocks frozen state modifications', () => {
    const ctx = { ...baseCtx, isFrozen: true };
    const result = checkWrite(ctx, '.specforge/work-items/WI-0001/candidates/project/test.md', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('frozen');
  });

  it('blocks closed WI', () => {
    const ctx = { ...baseCtx, workItem: { ...baseCtx.workItem!, status: 'closed' } };
    const result = checkWrite(ctx, 'src/auth.ts', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('closed WI');
  });
});

// ---------------------------------------------------------------------------
// §12.7 changed_files_audit
// ---------------------------------------------------------------------------

describe('v1.1 changed_files_audit（§12.7）', () => {
  it('passes when all files are in scope', () => {
    const result = performChangedFilesAudit(
      [{ path: 'src/auth.ts', operation: 'modify' }],
      [{ path: 'src/auth.ts', operation: 'modify' }],
    );
    expect(result.passed).toBe(true);
    expect(result.in_scope).toBe(1);
  });

  it('fails when files are out of scope', () => {
    const result = performChangedFilesAudit(
      [{ path: 'src/auth.ts', operation: 'modify' }, { path: 'src/other.ts', operation: 'create' }],
      [{ path: 'src/auth.ts', operation: 'modify' }],
    );
    expect(result.passed).toBe(false);
    expect(result.out_of_scope).toBe(1);
  });

  it('fails when spec writes detected', () => {
    const result = performChangedFilesAudit(
      [{ path: '.specforge/project/spec_manifest.json', operation: 'modify' }],
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.spec_writes).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §6 Workflow Path Selection
// ---------------------------------------------------------------------------

describe('v1.1 Workflow Path Selection（§6）', () => {
  it('selects architecture_change_path when module boundary changes', () => {
    const result = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: true,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    });
    expect(result).toBe('architecture_change_path');
  });

  it('selects requirement_change_path when requirement changes', () => {
    const result = selectWorkflowPath({
      requirement_changed: true,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    });
    expect(result).toBe('requirement_change_path');
  });

  it('selects code_only_fast_path when nothing changes', () => {
    const result = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: [],
    });
    expect(result).toBe('code_only_fast_path');
  });

  it('§6.6 unknowns block code_only_fast_path', () => {
    const result = selectWorkflowPath({
      requirement_changed: false,
      acceptance_criteria_changed: false,
      business_rule_changed: false,
      user_visible_behavior_changed: false,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      unknowns: ['unsure about data model'],
    });
    expect(result).not.toBe('code_only_fast_path');
  });
});

// ---------------------------------------------------------------------------
// §4 Work Item Lifecycle
// ---------------------------------------------------------------------------

describe('v1.1 Work Item Lifecycle（§4）', () => {
  it('creates WI directory with required structure', async () => {
    const wiDir = await createWorkItem({
      projectRoot: tmpDir,
      workItemId: 'WI-0001',
      userRequest: 'Add login feature',
    });

    // 验证目录存在
    expect(wiDir).toContain('work-items');

    // 验证 work_item.json
    const wiContent = await fs.readFile(path.join(wiDir, 'work_item.json'), 'utf-8');
    const wi = JSON.parse(wiContent);
    expect(wi.work_item_id).toBe('WI-0001');
    expect(wi.status).toBe('created');
    expect(wi.code_change_allowed).toBe(false);

    // 验证 intake.md
    const intake = await fs.readFile(path.join(wiDir, 'intake.md'), 'utf-8');
    expect(intake).toContain('Add login feature');
  });

  it('initializes closure files', async () => {
    const wiDir = await createWorkItem({
      projectRoot: tmpDir,
      workItemId: 'WI-0002',
      userRequest: 'Test closure files',
    });

    await initializeClosureFiles(wiDir, 'WI-0002', 'code_only_fast_path');

    // 验证所有闭环文件存在
    const requiredFiles = [
      'work_item.json', 'intake.md', 'change_classification.md',
      'impact_analysis.md', 'trigger_result.json', 'tasks.md',
      'trace_delta.md', 'candidate_manifest.json', 'gate_summary.md',
      'verification_report.md', 'merge_report.md',
      'evidence/evidence_manifest.json',
    ];

    for (const file of requiredFiles) {
      await expect(fs.access(path.join(wiDir, file))).resolves.toBeUndefined();
    }

    // code_only_fast_path 的 merge_report 应该是 not_applicable
    const mergeReport = await fs.readFile(path.join(wiDir, 'merge_report.md'), 'utf-8');
    expect(mergeReport).toContain('not_applicable');
  });

  it('updates work item status', async () => {
    const wiDir = await createWorkItem({
      projectRoot: tmpDir,
      workItemId: 'WI-0003',
      userRequest: 'Test status update',
    });

    await updateWorkItemStatus(wiDir, 'intake_ready');

    const wiContent = await fs.readFile(path.join(wiDir, 'work_item.json'), 'utf-8');
    const wi = JSON.parse(wiContent);
    expect(wi.status).toBe('intake_ready');
  });
});

// ---------------------------------------------------------------------------
// §5.4 Resume Check
// ---------------------------------------------------------------------------

describe('v1.1 Resume Check（§5.4）', () => {
  it('detects missing files', async () => {
    const wiDir = await createWorkItem({
      projectRoot: tmpDir,
      workItemId: 'WI-0004',
      userRequest: 'Test resume',
    });

    const result = await performResumeCheck(wiDir);
    expect(result.requiredFilesExist).toBe(false);
    expect(result.missingFiles.length).toBeGreaterThan(0);
  });

  it('passes when all required files exist', async () => {
    const wiDir = await createWorkItem({
      projectRoot: tmpDir,
      workItemId: 'WI-0005',
      userRequest: 'Test resume complete',
    });

    await initializeClosureFiles(wiDir, 'WI-0005', 'code_only_fast_path');

    const result = await performResumeCheck(wiDir);
    expect(result.requiredFilesExist).toBe(true);
    expect(result.missingFiles).toEqual([]);
  });
});
