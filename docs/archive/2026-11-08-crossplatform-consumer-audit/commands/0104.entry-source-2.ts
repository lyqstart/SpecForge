import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDesignGate } from '../src/tools/lib/sf_design_gate_core';
import { resolveFrozenManifestArtifacts } from '../src/tools/lib/governance-invariants-v11';

function completeClassification(): Record<string, unknown> {
  return {
    requirement_changed: false,
    acceptance_criteria_changed: false,
    business_rule_changed: false,
    user_visible_behavior_changed: false,
    data_semantics_changed: false,
    design_changed: true,
    module_boundary_changed: false,
    api_contract_changed: true,
    architecture_changed: true,
    unknowns: [],
  };
}

function architectureGovernanceCandidate(): string {
  return `analysis_scope: system_governance
capability_verdict: extend_existing

## 1. Problem Understanding

当前变更需要在项目级架构中统一Contract消费者和模块责任，不能由单个模块设计重复承担。

## 2. Existing Architecture Analysis

现有Project Architecture负责模块边界、跨模块依赖和系统级约束，Module Design负责模块内部实现设计。

## 3. Governance Classification

本次属于architecture_change_path，Project Architecture是系统治理分析的正式承载产物。

## 4. Existing Capability Assessment

现有Standard、Contract、Workflow、Agent、Tool、Runtime和Audit能够通过最小扩展完成治理闭环。

## 5. Solution Strategy — 架构决策（逐字继承现有设计事实）

复用现有Project Architecture Candidate承担system_governance，模块投影继续使用solution_design。

## 6. Impact Analysis

影响Project Architecture、DOMAIN Module Design、Contract消费者和相关Gate，不改变状态机与业务代码。

## 7. Verification Plan

验证冻结Manifest、Architecture治理内容、Module Design职责、Candidate Gate和approval_required状态。
`;
}

function moduleDesignCandidate(): string {
  return `analysis_scope: solution_design

# DOMAIN Design Candidate

refs: [REQ-WD-001]

## Design

DOMAIN模块只描述WorkItemStatus在模块内部的类型绑定、状态校验和消费者接口，不重复项目级系统治理分析。
`;
}

async function prepareFixture(
  root: string,
  options: { includeArchitectureInManifest: boolean; architectureContent?: string }
): Promise<void> {
  const workItemId = 'WI-ARCH';
  const wiDir = path.join(root, '.specforge', 'work-items', workItemId);
  const architecturePath = path.join(wiDir, 'candidates', 'project', 'architecture.candidate.md');
  const designPath = path.join(
    wiDir,
    'candidates',
    'project',
    'modules',
    'DOMAIN',
    'design.candidate.md'
  );
  await mkdir(path.dirname(architecturePath), { recursive: true });
  await mkdir(path.dirname(designPath), { recursive: true });
  await writeFile(
    path.join(wiDir, 'trigger_result.json'),
    JSON.stringify({
      schema_version: '1.1',
      work_item_id: workItemId,
      workflow_type: 'architecture_change',
      workflow_path: 'architecture_change_path',
      classification: completeClassification(),
    }),
    'utf8'
  );
  await writeFile(
    architecturePath,
    options.architectureContent ?? architectureGovernanceCandidate(),
    'utf8'
  );
  await writeFile(designPath, moduleDesignCandidate(), 'utf8');

  const entries: Array<Record<string, unknown>> = [
    {
      candidate_path: 'candidates/project/modules/DOMAIN/design.candidate.md',
      target_path: '.specforge/project/modules/DOMAIN/design.md',
      operation: 'replace',
      type: 'design',
      module_id: 'DOMAIN',
    },
  ];
  if (options.includeArchitectureInManifest) {
    entries.unshift({
      candidate_path: 'candidates/project/architecture.candidate.md',
      target_path: '.specforge/project/architecture.md',
      operation: 'replace',
      type: 'architecture',
    });
  }
  await writeFile(
    path.join(wiDir, 'candidate_manifest.json'),
    JSON.stringify({
      schema_version: '1.1',
      work_item_id: workItemId,
      workflow_type: 'architecture_change',
      workflow_path: 'architecture_change_path',
      candidate_phase: 'full',
      entries,
    }),
    'utf8'
  );
}

describe('Project Architecture system-governance carrier', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'sf-architecture-carrier-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('accepts a frozen Project Architecture Candidate as the system governance carrier while module Design remains solution_design', async () => {
    await prepareFixture(root, { includeArchitectureInManifest: true });

    const result = await checkDesignGate('WI-ARCH', root, 'architecture_change');

    expect(result.status).toBe('pass');
    const governancePaths = result.details?.governance_candidate_paths as string[];
    const designPaths = result.details?.design_candidate_paths as string[];
    expect(governancePaths).toHaveLength(1);
    expect(governancePaths[0]?.replace(/\\/g, '/')).toContain(
      'candidates/project/architecture.candidate.md'
    );
    expect(designPaths).toHaveLength(1);
    expect(designPaths[0]?.replace(/\\/g, '/')).toContain(
      'candidates/project/modules/DOMAIN/design.candidate.md'
    );
    expect(result.details?.analysis_scope).toBe('system_governance');
  });

  it('does not count an unmanifested historical Architecture file as a current governance Candidate', async () => {
    await prepareFixture(root, { includeArchitectureInManifest: false });

    const resolved = await resolveFrozenManifestArtifacts({
      projectRoot: root,
      workItemId: 'WI-ARCH',
      artifactTypes: ['architecture'],
    });
    const result = await checkDesignGate('WI-ARCH', root, 'architecture_change');

    expect(resolved).toEqual([]);
    expect(result.status).toBe('fail');
    expect(result.blocking_issues).toContain(
      '当前 Work Item 需要系统治理分析，但冻结 Candidate Manifest 中没有合规的 Project Architecture Candidate，且没有允许承载 system_governance 的 Design Candidate'
    );
  });

  it('fails closed when the frozen Project Architecture Candidate does not satisfy the system governance contract', async () => {
    await prepareFixture(root, {
      includeArchitectureInManifest: true,
      architectureContent: 'analysis_scope: solution_design\n\n# Architecture\n\nIncomplete.',
    });

    const result = await checkDesignGate('WI-ARCH', root, 'architecture_change');

    expect(result.status).toBe('fail');
    expect(
      result.blocking_issues.some(
        issue =>
          issue.includes('architecture.candidate.md') && issue.includes('analysis_scope: system_governance')
      )
    ).toBe(true);
  });
});
