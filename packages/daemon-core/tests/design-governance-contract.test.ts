import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function locateRepoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'docs', 'standards', 'fused_standard.md'))) return cwd;

  const fromDaemonCore = path.resolve(cwd, '..', '..');
  if (existsSync(path.join(fromDaemonCore, 'docs', 'standards', 'fused_standard.md'))) {
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
  designFirst: 'setup/userlevel-opencode/skills/sf-workflow-design-first/SKILL.md',
  featureSpec: 'setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md',
  changeRequest: 'setup/userlevel-opencode/skills/sf-workflow-change-request/SKILL.md',
  refactor: 'setup/userlevel-opencode/skills/sf-workflow-refactor/SKILL.md',
  bugfixSpec: 'setup/userlevel-opencode/skills/sf-workflow-bugfix-spec/SKILL.md',
  investigation: 'setup/userlevel-opencode/skills/sf-workflow-investigation/SKILL.md',
} as const;

describe('Design Governance contract alignment', () => {
  it('defines the governance method once in the authoritative standard', () => {
    const standard = read('docs/standards/fused_standard.md');
    expect(standard).toContain('### 14.5 Design Governance（设计治理）');
    expect(standard).toContain('analysis_scope: solution_design');
    expect(standard).toContain('analysis_scope: system_governance');
    expect(standard).toContain(
      'capability_verdict: reuse_existing | extend_existing | new_capability_required | blocked'
    );
    expect(standard).toContain(
      'Standard → Contract → Workflow Skill → Agent → Tool → Runtime → Audit'
    );
    for (const heading of governanceHeadings) expect(standard).toContain(heading);
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
    const standard = read('docs/standards/fused_standard.md');
    const agent = read('setup/userlevel-opencode/agents/sf-design.md');
    const orchestrator = read('setup/userlevel-opencode/agents/sf-orchestrator.md');
    const skill = read(skillPaths.designFirst);

    for (const contract of [standard, agent, orchestrator, skill]) {
      expect(contract).toContain('SpecForge');
      expect(contract).toContain('capability_verdict');
      expect(contract).toContain('Design-Only');
      expect(contract).toContain('classification');
      expect(contract).toContain('unknowns');
    }

    expect(standard).toContain('`capability_verdict` 的裁决对象必须是 **SpecForge 治理链**');
    expect(agent).toContain('`capability_verdict` 的裁决对象只能是 **SpecForge 治理链**');
    expect(orchestrator).toContain('分类对象描述的是**用户目标实现后的预期最终语义影响**');
    expect(skill).toContain('分类必须按用户目标实现后的最终语义影响填写');
    expect(skill).toContain('不得整表全 `true`/全 `false`');
    expect(agent).toContain('每个字段必须独立给出 `basis_refs`');
    expect(agent).toContain('不等于 `capability_verdict: extend_existing`');
  });

  it('requires module routing to follow spec_manifest instead of source directory names', () => {
    const standard = read('docs/standards/fused_standard.md');
    const agent = read('setup/userlevel-opencode/agents/sf-design.md');
    const orchestrator = read('setup/userlevel-opencode/agents/sf-orchestrator.md');
    const skill = read(skillPaths.designFirst);

    expect(standard).toContain(
      'Candidate 的 `module_id` 是对 canonical `MODULE_CODE` 的引用'
    );
    expect(agent).toContain('写入前必须读取 `spec_manifest.json`');
    expect(orchestrator).toContain('生成 Candidate 前必须读取 `spec_manifest.json`');
    expect(skill).toContain('`<MODULE>` 必须来自 `spec_manifest.json`');
  });

  it('forces design-first to use system_governance', () => {
    const skill = read(skillPaths.designFirst);
    expect(skill).toContain('本 Workflow 固定进入系统治理分析');
    expect(skill).toContain('analysis_scope: system_governance');
    expect(skill).toContain('capability_verdict');
  });

  it('keeps existing workflows and selects analysis scope instead of adding new skills', () => {
    for (const skillPath of [
      skillPaths.featureSpec,
      skillPaths.changeRequest,
      skillPaths.refactor,
      skillPaths.bugfixSpec,
    ]) {
      const skill = read(skillPath);
      expect(skill, skillPath).toContain('analysis_scope: solution_design');
      expect(skill, skillPath).toContain('analysis_scope: system_governance');
      expect(skill, skillPath).toContain('sf-design');
    }

    const investigation = read(skillPaths.investigation);
    expect(investigation).toContain('workflow_type=investigation');
    expect(investigation).toContain('workflow_path=requirement_change_path');
    expect(investigation).toContain('sf-investigator');
    expect(investigation).toContain('sf-design` 可以消费结论进行后续设计，但不得生成调查产物');
  });

  it('preserves workflow-specific escalation boundaries', () => {
    expect(read(skillPaths.featureSpec)).toContain(
      '新模块、模块边界、数据模型或数据语义、权限、状态机或状态权威、核心流程'
    );
    expect(read(skillPaths.changeRequest)).toContain('Runtime 行为或治理规则变化');
    expect(read(skillPaths.refactor)).toContain('治理责任迁移或跨模块协议');
    expect(read(skillPaths.bugfixSpec)).toContain('根因仍为未知、推测或未被证据验证时');
    expect(read(skillPaths.investigation)).toContain('不得在 investigation 中直接实施');
  });

  it('extends the existing Path Service and routes every runtime Gate through one authority', () => {
    const directoryLayout = read('packages/types/src/directory-layout.ts');
    const runtimeGate = read('packages/daemon-core/src/tools/lib/sf_design_gate_core.ts');
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
    expect(runtimeGate).toContain('resolveWorkItemSpecArtifacts');
    expect(runtimeGate).toContain('workItemTriggerResult');
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
      read('docs/standards/fused_standard.md'),
      read('setup/userlevel-opencode/agents/sf-design.md'),
      ...Object.values(skillPaths).map(read),
    ].join('\n');

    expect(allChangedContracts).not.toContain('design-analysis skill');
    expect(allChangedContracts).not.toContain('architecture-analysis skill');
    expect(allChangedContracts).not.toContain('design escalation tool');
  });
});
