import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
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
    acceptance_criteria_changed: false,
    business_rule_changed: false,
    user_visible_behavior_changed: false,
    data_semantics_changed: false,
    design_changed: true,
    module_boundary_changed: true,
    api_contract_changed: false,
    architecture_changed: true,
    unknowns: [],
    ...overrides,
  };
}

function designCandidate(): string {
  return `---
module_id: core
analysis_scope: system_governance
capability_verdict: extend_existing
---

## 1. Problem Understanding

当前进程级 tenant 状态在异步让出点后可能被其他请求覆盖，必须建立请求级隔离。

## 2. Existing Architecture Analysis

现有 Architecture 由 RequestHandler、StateStore 组件和进程级状态权威组成；模块边界与 Interface 已依据真实代码核对。

## 3. Governance Classification

问题属于现有 Runtime 与 Audit 闭环的架构治理扩展，不是缺少新的 Tool、Skill、Agent 或 Router。

## 4. Existing Capability Assessment

Standard、Contract、Workflow Skill、Agent、Tool、Runtime 与 Audit 均已存在；现有体系可以通过最小扩展承载，无需新增治理层。

## 5. Solution Strategy

保留现有治理链，只扩展既有路径消费者、Gate Runner 和阶段审计，使所有组件复用统一路径服务与设计门禁。

## 6. Impact Analysis

影响 Design Gate、统一 Gate Runner、Candidate 阶段配置和 changed-files Audit，不改变状态机、Agent 数量或 Tool 注册。

## 7. Verification Plan

验证 canonical design candidate、固定七章节、完整 classification、Design-Only Gate Profile、approval_required 状态和无代码审计。
`;
}

async function writeBaseWorkItem(projectRoot: string, workItemId: string): Promise<void> {
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
              candidate_path: 'design.md',
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
