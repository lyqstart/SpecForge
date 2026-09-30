import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function locateRepoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'docs', 'product-specification', 'authority-registry.md'))) return cwd;

  const fromDaemonCore = path.resolve(cwd, '..', '..');
  if (existsSync(path.join(fromDaemonCore, 'docs', 'product-specification', 'authority-registry.md'))) {
    return fromDaemonCore;
  }

  throw new Error(`Cannot locate SpecForge repository root from cwd=${cwd}`);
}

const repoRoot = locateRepoRoot();

function read(relativePath: string): string {
  const absolutePath = path.join(repoRoot, relativePath);
  expect(existsSync(absolutePath), `missing file: ${relativePath}`).toBe(true);
  return readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n');
}

const governanceHeadings = [
  'Problem Understanding',
  'Existing Architecture Analysis',
  'Governance Classification',
  'Existing Capability Assessment',
  'Solution Strategy',
  'Impact Analysis',
  'Verification Plan',
];

const skillPaths = {
  featureSpec: 'setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md',
} as const;

describe('Design Governance contract alignment', () => {
  it('registers one product authority and one subordinate technical governance contract', () => {
    const registry = read('docs/product-specification/authority-registry.md');
    const specification = read('docs/product-specification/specforge-product-specification.md');
    const governance = read('docs/design/SpecForge架构一致性治理最终实施方案.md');
    expect(registry).toContain('当前唯一产品规格');
    expect(registry).toContain('架构一致性与契约治理的从属技术合同');
    expect(specification).toContain('# 22. 仓库权威与跨会话连续性');
    expect(governance).toContain('DOCUMENT_ROLE=SUBORDINATE_TECHNICAL_GOVERNANCE_CONTRACT');
  });

  it('makes sf-design responsible for both ordinary design and system governance', () => {
    const agent = read('setup/userlevel-opencode/agents/sf-design.md');
    expect(agent).toContain('# Design Governance 分析范围');
    expect(agent).toContain('analysis_scope: solution_design');
    expect(agent).toContain('analysis_scope: system_governance');
    expect(agent).toContain(
      'capability_verdict: reuse_existing | extend_existing | new_capability_required | blocked'
    );
    expect(agent).toContain('不得看到问题就直接提出新增 Tool、Skill、Router、Agent、模块或治理层');
    expect(agent).toContain('design_delta.md');
    expect(agent).toContain('refactor_analysis.md');
    expect(agent).toContain('不得在 Investigation Workflow 中代写、补写或覆盖调查产物');
    for (const heading of governanceHeadings) expect(agent).toContain(heading);
  });

  it('keeps phase boundaries, target-change classification, and governance capability verdict separate', () => {
    const agent = read('setup/userlevel-opencode/agents/sf-design.md');
    const orchestrator = read('setup/userlevel-opencode/agents/sf-orchestrator.md');

    for (const contract of [agent, orchestrator]) {
      expect(contract).toContain('SpecForge');
      expect(contract).toContain('capability_verdict');
      expect(contract).toContain('Design-Only');
      expect(contract).toContain('classification');
      expect(contract).toContain('unknowns');
    }

    expect(agent).toContain('`capability_verdict` 的裁决对象只能是 **SpecForge 治理链**');
    expect(orchestrator).toContain('分类对象描述的是**用户目标实现后的预期最终语义影响**');
    expect(agent).toContain('每个字段必须独立给出 `basis_refs`');
    expect(agent).toContain('不等于 `capability_verdict: extend_existing`');
  });

  it('requires module routing to follow spec_manifest instead of source directory names', () => {
    const agent = read('setup/userlevel-opencode/agents/sf-design.md');
    const orchestrator = read('setup/userlevel-opencode/agents/sf-orchestrator.md');

    expect(agent).toContain('写入前必须读取 `spec_manifest.json`');
    expect(orchestrator).toContain('生成 Candidate 前必须读取 `spec_manifest.json`');
  });

  it('extends the existing Path Service and routes every runtime Gate through one authority', () => {
    const directoryLayout = read('packages/types/src/directory-layout.ts');
    const runtimeGate = read('packages/daemon-core/src/tools/lib/sf_design_gate_core.ts');
    const runtimePolicy = read(
      'packages/daemon-core/src/tools/lib/sf_design_governance_policy.ts'
    );
    const gateRunner = read('packages/daemon-core/src/tools/lib/gate-runner-v11.ts');
    const governanceInvariants = read(
      'packages/daemon-core/src/tools/lib/governance-invariants-v11.ts'
    );
    const deployedGateWrapper = read('setup/userlevel-opencode/tools/sf_design_gate.ts');
    const deployedGateCore = read('setup/userlevel-opencode/tools/lib/sf_design_gate_core.ts');

    expect(directoryLayout).toContain('单一真相源（Single Source of Truth）');
    expect(directoryLayout).toContain('workItemCandidateDesign');
    expect(directoryLayout).toContain('workItemCandidateRequirements');
    expect(directoryLayout).toContain('workItemCandidateTasks');
    expect(directoryLayout).toContain('workItemCandidateTraceDelta');
    expect(directoryLayout).toContain('workItemSpecArtifactReadCandidates');

    expect(governanceInvariants).toContain('resolveWorkItemSpecArtifacts');
    expect(governanceInvariants).toContain('resolveFrozenManifestArtifacts');
    expect(runtimeGate).toContain('resolveWorkItemSpecArtifacts');
    expect(runtimeGate).toContain('resolveFrozenManifestArtifacts');
    expect(runtimeGate).toContain('governance_candidate_paths');
    expect(runtimePolicy).toContain('workItemTriggerResult');
    expect(runtimePolicy).toContain('resolveSystemGovernanceRequirement');
    expect(runtimeGate).toContain('checkSystemGovernanceContent');
    expect(runtimeGate).toContain('checkSystemGovernanceContent(content, true)');
    expect(runtimeGate).toContain('resolveSystemGovernanceRequirement');
    expect(runtimeGate).not.toMatch(/DesignGateMode\s*=\s*['"]system_governance['"]/);
    expect(runtimeGate).toContain('nextHeading[1].length <= currentLevel');
    expect(deployedGateCore).toContain('nextHeading[1].length <= currentLevel');

    expect(gateRunner).toContain("import { checkDesignGate } from './sf_design_gate_core.js'");
    expect(gateRunner).toContain(
      'return checkDesignGate(ctx.workItemId, ctx.projectRoot, workflowType)'
    );
    expect(gateRunner).not.toContain('Workflow-specific gate (skipped in MVP)');

    expect(deployedGateWrapper).toContain('daemon.invokeTool("sf_design_gate", args');
    expect(
      existsSync(path.join(repoRoot, 'packages/daemon-core/src/tools/lib/sf_artifact_path_core.ts'))
    ).toBe(false);
    expect(
      existsSync(path.join(repoRoot, 'setup/userlevel-opencode/tools/lib/sf_artifact_path_core.ts'))
    ).toBe(false);

    const allChangedContracts = [
      read('setup/userlevel-opencode/agents/sf-design.md'),
      ...Object.values(skillPaths).map(read),
    ].join('\n');

    expect(allChangedContracts).not.toContain('design-analysis skill');
    expect(allChangedContracts).not.toContain('architecture-analysis skill');
    expect(allChangedContracts).not.toContain('design escalation tool');
  });
});
