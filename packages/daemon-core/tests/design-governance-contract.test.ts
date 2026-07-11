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

function normalizeGateDeploymentVariant(content: string): string {
  return content
    .replace(
      /^import \{ SPEC_DIR_NAME \} from ["']@specforge\/types\/directory-layout["'];?\n/m,
      ''
    )
    .replace(/^const SPEC_DIR_NAME = ["']\.specforge["'](?: as const)?;?\n/m, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    expect(agent).toContain('findings_report.md');
    for (const heading of governanceHeadings) expect(agent).toContain(heading);
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
      skillPaths.investigation,
    ]) {
      const skill = read(skillPath);
      expect(skill, skillPath).toContain('analysis_scope: solution_design');
      expect(skill, skillPath).toContain('analysis_scope: system_governance');
      expect(skill, skillPath).toContain('sf-design');
    }
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

  it('extends both existing Design Gate copies instead of introducing another tool or mode', () => {
    const runtimeGate = read('packages/daemon-core/src/tools/lib/sf_design_gate_core.ts');
    const deployedGate = read('setup/userlevel-opencode/tools/lib/sf_design_gate_core.ts');

    for (const gate of [runtimeGate, deployedGate]) {
      expect(gate).toContain('checkSystemGovernanceContent');
      expect(gate).toContain('checkSystemGovernanceContent(content, true)');
      expect(gate).toContain('const governanceResult = checkSystemGovernanceContent(content)');
      expect(gate).not.toContain('DesignGateMode = "system_governance"');
    }

    expect(normalizeGateDeploymentVariant(deployedGate)).toBe(
      normalizeGateDeploymentVariant(runtimeGate)
    );

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
