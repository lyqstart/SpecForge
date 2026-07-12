import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  projectSpecManifest,
  workItemCandidateDesign,
  workItemCandidateManifest,
  workItemDesign,
  workItemRoot,
} from '@specforge/types/directory-layout';
import '../src/tools/handlers/sf-artifact-write.js';
import '../src/tools/handlers/sf-v11-gate-run.js';
import '../src/tools/handlers/sf-changed-files-audit.js';
import { getHandler } from '../src/tools/ToolDispatcher.js';
import { getRequiredGates } from '../src/tools/lib/required-gates.js';

function completeClassification(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requirement_changed: false,
    acceptance_criteria_changed: true,
    business_rule_changed: false,
    user_visible_behavior_changed: true,
    data_semantics_changed: true,
    design_changed: true,
    module_boundary_changed: false,
    api_contract_changed: false,
    architecture_changed: true,
    unknowns: [
      'Bun runtime support for request-scoped async context is not yet verified',
      'Compatibility requirements for setCurrentTenant/getCurrentTenant are unresolved',
    ],
    ...overrides,
  };
}

function designCandidate(): string {
  return `---
module_id: core
analysis_scope: system_governance
capability_verdict: reuse_existing
---

## 1. Problem Understanding

### Symptom

当前进程级 tenant 状态在异步让出点后可能被其他请求覆盖，导致跨请求串读。

### Target Outcome

每个请求必须在自己的异步调用链中读取自身 tenant，并以并发隔离测试作为验收条件。

## 2. Existing Architecture Analysis

### State Authority

现有唯一状态权威是 StateStore 中的进程级 currentTenant；RequestHandler 在让出点前写入、恢复后读取。

### Write Boundary

当前写入和读取都经过既有 StateStore 接口，但存储槽位由所有请求共享。

## 3. Governance Classification

目标项目问题属于状态权威与架构设计变化。SpecForge 治理层继续使用现有 Design-First Skill、sf-design、Gate Runner、Design Gate Core 和 Audit，不需要新增治理组件。

## 4. Existing Capability Assessment

Standard、Contract、Workflow Skill、Agent、Tool、Runtime 与 Audit 已能直接承载本次系统治理分析、Candidate Gate、approval_required 状态推进和 no-code 审计。

## 5. Solution Strategy

目标项目优先在现有 runtime 模块边界内引入请求级 tenant context；先验证 Bun 异步上下文能力，若不满足则采用显式请求上下文传递。SpecForge 治理链保持不变。

## 6. Impact Analysis

目标项目将影响 StateStore 状态语义、RequestHandler 调用链和并发验收测试；本次 Design-Only 阶段只生成 Candidate，不修改业务源码。

## 7. Verification Plan

验证完整 classification、唯一 design Candidate、真实 Design Gate、approval_required 自动推进、no_code_change 审计，以及后续并发请求隔离和单请求回归测试。
`;
}

async function writeDeclaredCoreManifest(projectRoot: string): Promise<void> {
  const manifestPath = projectSpecManifest(projectRoot);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        schema_version: '1.0',
        project_spec_version: 'PSV-0001',
        project_name: 'live-closure-fixture',
        project: {
          extension_registry: '.specforge/project/extension_registry.json',
          requirements_index: '.specforge/project/requirements_index.md',
          design_index: '.specforge/project/design_index.md',
          architecture: '.specforge/project/architecture.md',
          glossary: '.specforge/project/glossary.md',
          decisions: '.specforge/project/decisions.md',
          trace_matrix: '.specforge/project/trace_matrix.md',
        },
        default_module: 'core',
        modules: [
          {
            name: 'CORE',
            path: 'project/modules/core',
            module_file: 'project/modules/core/module.md',
            requirements: 'project/modules/core/requirements.md',
            design: 'project/modules/core/design.md',
            trace: 'project/trace_matrix.md',
          },
        ],
      },
      null,
      2
    )
  );
}

async function writeBaseWorkItem(projectRoot: string, workItemId: string): Promise<void> {
  await writeDeclaredCoreManifest(projectRoot);
  const wiDir = workItemRoot(projectRoot, workItemId);
  await mkdir(wiDir, { recursive: true });
  await writeFile(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify(
      {
        schema_version: '1.1',
        work_item_id: workItemId,
        status: 'gates_running',
        workflow_type: 'feature_spec_design_first',
        workflow_path: 'design_change_path',
        code_change_allowed: false,
        allowed_write_files: [],
      },
      null,
      2
    )
  );
  await writeFile(path.join(wiDir, 'intake.md'), '# Intake\n\nDesign-only live acceptance.\n');
  await writeFile(
    path.join(wiDir, 'change_classification.md'),
    '# Change Classification\n\narchitecture_change\n'
  );
  await writeFile(
    path.join(wiDir, 'impact_analysis.md'),
    '# Impact Analysis\n\nState authority and Gate chain.\n'
  );
  await writeFile(
    path.join(wiDir, 'trigger_result.json'),
    JSON.stringify(
      {
        schema_version: '1.1',
        work_item_id: workItemId,
        status: 'triggered',
        workflow_type: 'feature_spec_design_first',
        workflow_path: 'design_change_path',
        classification: completeClassification(),
      },
      null,
      2
    )
  );
}

function mockDeps(initialState = 'gates_running') {
  let currentState = initialState;
  const transitions: Array<{ from: string; to: string }> = [];
  const stateManager = {
    async rebuildFromEventsFile() {},
    async getState() {
      return { current_state: currentState };
    },
    async transition(_workItemId: string, from: string, to: string) {
      if (currentState !== from) {
        throw new Error(`unexpected transition source: expected ${currentState}, got ${from}`);
      }
      transitions.push({ from, to });
      currentState = to;
    },
  };
  return {
    deps: {
      projectManager: {
        async getProjectStateManager() {
          return stateManager;
        },
      },
    } as any,
    getState: () => currentState,
    transitions,
  };
}

describe('Design Governance live closure', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'sf-design-live-closure-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('writes design once to the canonical Candidate path and never mirrors work-item design.md', async () => {
    const workItemId = 'WI-0001';
    await writeBaseWorkItem(projectRoot, workItemId);
    const handler = getHandler('sf_artifact_write');
    expect(handler).toBeDefined();

    const result = await handler!(
      {
        work_item_id: workItemId,
        file_type: 'design',
        content: designCandidate(),
      },
      { directory: projectRoot, agent: 'sf-design' },
      {} as any
    );

    expect((result as any).success).toBe(true);
    expect((result as any).path.replace(/\\/g, '/')).toContain(
      '.specforge/work-items/WI-0001/candidates/project/modules/core/design.candidate.md'
    );
    expect(existsSync(workItemCandidateDesign(projectRoot, workItemId, 'core'))).toBe(true);
    expect(existsSync(workItemDesign(projectRoot, workItemId))).toBe(false);

    const manifestResult = await handler!(
      {
        work_item_id: workItemId,
        file_type: 'candidate_manifest',
        content: JSON.stringify({
          schema_version: '1.1',
          work_item_id: workItemId,
          workflow_type: 'feature_spec_design_first',
          workflow_path: 'design_change_path',
          candidate_phase: 'design',
          entries: [
            {
              path: 'design.md',
              target_path: '.specforge/project/modules/core/design.md',
              operation: 'replace',
              type: 'design',
              module_id: 'core',
            },
          ],
        }),
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    );

    expect((manifestResult as any).success).toBe(true);
    const manifest = JSON.parse(
      await readFile(workItemCandidateManifest(projectRoot, workItemId), 'utf8')
    );
    expect(manifest.candidate_phase).toBe('design');
    expect(manifest.entries[0].candidate_path).toBe(
      'candidates/project/modules/core/design.candidate.md'
    );
    expect(manifest.entries[0].path).toBeUndefined();
    expect(manifest.entries[0].operation).toBe('replace');
  });

  it('blocks module-scoped Candidates when an existing manifest declares no modules', async () => {
    const workItemId = 'WI-0001';
    await writeBaseWorkItem(projectRoot, workItemId);
    await writeFile(
      projectSpecManifest(projectRoot),
      JSON.stringify({
        schema_version: '1.0',
        project_spec_version: 'PSV-0001',
        project_name: 'legacy-empty-modules',
        project: {},
        modules: [],
      })
    );

    const handler = getHandler('sf_artifact_write');
    const result = await handler!(
      {
        work_item_id: workItemId,
        file_type: 'design',
        content: designCandidate(),
      },
      { directory: projectRoot, agent: 'sf-design' },
      {} as any
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('MODULE_OWNERSHIP_UNRESOLVED');
    expect(existsSync(workItemCandidateDesign(projectRoot, workItemId, 'core'))).toBe(false);
  });

  it('runs the real Design Gate through sf_gate_run, uses the design phase profile, and stops at approval_required', async () => {
    const workItemId = 'WI-0001';
    await writeBaseWorkItem(projectRoot, workItemId);
    const designPath = workItemCandidateDesign(projectRoot, workItemId, 'core');
    await mkdir(path.dirname(designPath), { recursive: true });
    await writeFile(designPath, designCandidate());
    await writeFile(
      workItemCandidateManifest(projectRoot, workItemId),
      JSON.stringify(
        {
          schema_version: '1.1',
          work_item_id: workItemId,
          workflow_path: 'design_change_path',
          workflow_type: 'feature_spec_design_first',
          candidate_phase: 'design',
          entries: [
            {
              candidate_path: 'candidates/project/modules/core/design.candidate.md',
              target_path: '.specforge/project/modules/core/design.md',
              operation: 'replace',
              type: 'design',
              module_id: 'core',
            },
          ],
        },
        null,
        2
      )
    );

    const triggerResult = JSON.parse(
      await readFile(
        path.join(workItemRoot(projectRoot, workItemId), 'trigger_result.json'),
        'utf8'
      )
    );
    expect(triggerResult.classification.architecture_changed).toBe(true);
    expect(triggerResult.classification.acceptance_criteria_changed).toBe(true);
    expect(triggerResult.classification.unknowns).toHaveLength(2);
    expect(designCandidate()).toContain('capability_verdict: reuse_existing');

    const required = getRequiredGates('design_change_path', 'candidate', 'design');
    expect(required).toContain('workflow_specific_gate');
    expect(required).not.toContain('trace_gate');

    const state = mockDeps();
    const handler = getHandler('sf_v11_gate_run');
    expect(handler).toBeDefined();
    const result = await handler!(
      { work_item_id: workItemId, gate_type: 'candidate' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      state.deps
    );

    expect((result as any).success).toBe(true);
    expect((result as any).summary_status).toBe('passed');
    expect((result as any).candidate_phase).toBe('design');
    expect((result as any).normalized_gate_ids).not.toContain('trace_gate');
    expect((result as any).reports).toContainEqual(
      expect.objectContaining({ gate_id: 'workflow_specific_gate', status: 'passed' })
    );
    expect(state.getState()).toBe('approval_required');
    expect(state.transitions).toEqual([{ from: 'gates_running', to: 'approval_required' }]);

    const workflowReport = JSON.parse(
      await readFile(
        path.join(workItemRoot(projectRoot, workItemId), 'gates', 'workflow_specific_gate.json'),
        'utf8'
      )
    );
    expect(workflowReport.status).toBe('passed');
    expect(workflowReport.input_files).toContain(designPath);

    expect(existsSync(path.join(workItemRoot(projectRoot, workItemId), 'requirements.md'))).toBe(
      false
    );
    expect(existsSync(path.join(workItemRoot(projectRoot, workItemId), 'tasks.md'))).toBe(false);
    expect(existsSync(path.join(workItemRoot(projectRoot, workItemId), 'trace_delta.md'))).toBe(
      false
    );
  });

  it('fails candidate_manifest_gate when a module-scoped Candidate is not declared', async () => {
    const workItemId = 'WI-0001';
    await writeBaseWorkItem(projectRoot, workItemId);
    await writeFile(
      projectSpecManifest(projectRoot),
      JSON.stringify({
        schema_version: '1.0',
        project_spec_version: 'PSV-0001',
        project_name: 'legacy-empty-modules',
        project: {},
        modules: [],
      })
    );

    const designPath = workItemCandidateDesign(projectRoot, workItemId, 'core');
    await mkdir(path.dirname(designPath), { recursive: true });
    await writeFile(designPath, designCandidate());
    await writeFile(
      workItemCandidateManifest(projectRoot, workItemId),
      JSON.stringify({
        schema_version: '1.1',
        work_item_id: workItemId,
        workflow_path: 'design_change_path',
        workflow_type: 'feature_spec_design_first',
        candidate_phase: 'design',
        entries: [
          {
            candidate_path: 'candidates/project/modules/core/design.candidate.md',
            target_path: '.specforge/project/modules/core/design.md',
            operation: 'replace',
            type: 'design',
          },
        ],
      })
    );

    const state = mockDeps();
    const result = await getHandler('sf_v11_gate_run')!(
      { work_item_id: workItemId, gate_type: 'candidate' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      state.deps
    );

    expect((result as any).summary_status).toBe('failed');
    const manifestReportSummary = (result as any).reports.find(
      (report: any) => report.gate_id === 'candidate_manifest_gate'
    );
    expect(manifestReportSummary.status).toBe('failed');

    const manifestReport = JSON.parse(
      await readFile(
        path.join(workItemRoot(projectRoot, workItemId), 'gates', 'candidate_manifest_gate.json'),
        'utf-8'
      )
    );
    expect(manifestReport.checks).toContainEqual(
      expect.objectContaining({ check_id: 'entry_0_module_declared', passed: false })
    );
    expect(state.getState()).toBe('gates_failed');
  });

  it('rejects an incomplete trigger classification through the same sf_gate_run path', async () => {
    const workItemId = 'WI-0001';
    await writeBaseWorkItem(projectRoot, workItemId);
    const wiDir = workItemRoot(projectRoot, workItemId);
    await writeFile(
      path.join(wiDir, 'trigger_result.json'),
      JSON.stringify({
        schema_version: '1.1',
        work_item_id: workItemId,
        status: 'triggered',
        workflow_type: 'feature_spec_design_first',
        workflow_path: 'design_change_path',
        classification: 'architecture_change',
      })
    );
    const designPath = workItemCandidateDesign(projectRoot, workItemId, 'core');
    await mkdir(path.dirname(designPath), { recursive: true });
    await writeFile(designPath, designCandidate());
    await writeFile(
      workItemCandidateManifest(projectRoot, workItemId),
      JSON.stringify({
        schema_version: '1.1',
        work_item_id: workItemId,
        workflow_path: 'design_change_path',
        workflow_type: 'feature_spec_design_first',
        candidate_phase: 'design',
        entries: [
          {
            candidate_path: 'candidates/project/modules/core/design.candidate.md',
            target_path: '.specforge/project/modules/core/design.md',
            operation: 'replace',
            type: 'design',
          },
        ],
      })
    );

    const state = mockDeps();
    const result = await getHandler('sf_v11_gate_run')!(
      { work_item_id: workItemId, gate_type: 'candidate' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      state.deps
    );

    expect((result as any).summary_status).toBe('failed');
    expect((result as any).reports).toContainEqual(
      expect.objectContaining({ gate_id: 'schema_gate', status: 'failed' })
    );
    expect((result as any).reports).toContainEqual(
      expect.objectContaining({ gate_id: 'workflow_specific_gate', status: 'failed' })
    );
    expect(state.getState()).toBe('gates_failed');
  });

  it('passes no_code_change audit for the approved design-only phase without enabling code permission', async () => {
    const workItemId = 'WI-0001';
    await writeBaseWorkItem(projectRoot, workItemId);
    await writeFile(
      workItemCandidateManifest(projectRoot, workItemId),
      JSON.stringify({
        schema_version: '1.1',
        work_item_id: workItemId,
        workflow_path: 'design_change_path',
        workflow_type: 'feature_spec_design_first',
        candidate_phase: 'design',
        entries: [],
      })
    );

    const state = mockDeps('approval_required');
    const result = await getHandler('sf_changed_files_audit')!(
      { work_item_id: workItemId, mode: 'no_code_change' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      state.deps
    );

    expect((result as any).success).toBe(true);
    expect((result as any).passed).toBe(true);
    expect((result as any).pre_implementation_spec_phase).toBe(true);
    expect((result as any).candidate_phase).toBe('design');
    expect((result as any).code_permission_was_never_enabled).toBe(true);
    expect(existsSync(path.join(workItemRoot(projectRoot, workItemId), 'hard_stop.json'))).toBe(
      false
    );
  });

  it('rejects no_code_change once the authoritative state has entered implementation', async () => {
    const workItemId = 'WI-0001';
    await writeBaseWorkItem(projectRoot, workItemId);
    await writeFile(
      workItemCandidateManifest(projectRoot, workItemId),
      JSON.stringify({
        schema_version: '1.1',
        work_item_id: workItemId,
        workflow_path: 'design_change_path',
        workflow_type: 'feature_spec_design_first',
        candidate_phase: 'design',
        entries: [],
      })
    );

    const state = mockDeps('implementation_running');
    const result = await getHandler('sf_changed_files_audit')!(
      { work_item_id: workItemId, mode: 'no_code_change' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      state.deps
    );

    expect((result as any).success).toBe(true);
    expect((result as any).passed).toBe(false);
    expect((result as any).pre_implementation_spec_phase).toBe(false);
    expect((result as any).violations.join('\n')).toContain(
      'workflow_type/workflow_path is not allowed'
    );
  });
});
