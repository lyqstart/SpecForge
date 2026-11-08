import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf8');

describe('Candidate runtime truth and exact REQ identity contract', () => {
  it('records the product decision in every active authority layer', () => {
    expect(read('docs/product-specification/authority-registry.md')).toContain('| D16 |');
    expect(read('docs/product-specification/specforge-product-specification.md')).toContain(
      'implementation_baseline.json',
    );
    expect(read('docs/design/SpecForge架构一致性治理最终实施方案.md')).toContain(
      'CANDIDATE-RUNTIME-TRUTH-001',
    );
    expect(read('docs/rule/specforge-active-development-rules.md')).toContain('## EXP-280：');
  });

  it('makes Runtime the baseline owner and seals the baseline with the Candidate', () => {
    const transition = read('packages/daemon-core/src/tools/handlers/sf-state-transition.ts');
    const seal = read('packages/daemon-core/src/tools/lib/candidate-generation-integrity.ts');
    expect(transition).toContain('materializeImplementationBaseline(projectPath, workItemId)');
    expect(transition).toContain('validateImplementationTruthBeforeSeal');
    expect(transition).toContain('CANDIDATE_IMPLEMENTATION_TRUTH_INVALID');
    expect(seal).toContain("'implementation_baseline.json'");
  });

  it('requires Candidate agents to consume one snapshot and exact canonical REQ identities', () => {
    for (const relative of [
      'setup/userlevel-opencode/agents/_AGENT_BASE.md',
      'setup/userlevel-opencode/agents/sf-orchestrator.md',
      'setup/userlevel-opencode/agents/sf-requirements.md',
      'setup/userlevel-opencode/agents/sf-design.md',
      'setup/userlevel-opencode/agents/sf-task-planner.md',
      'setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md',
    ]) {
      expect(read(relative), relative).toContain('implementation_baseline');
    }
    expect(read('setup/userlevel-opencode/agents/_AGENT_BASE.md')).toContain(
      'REQ-<MODULE_CODE>-<NNNN>',
    );
  });

  it('connects centralized ID validation and exact reference resolution to active Gates', () => {
    expect(read('packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts')).toContain(
      'isValidRequirementId',
    );
    const runner = read('packages/daemon-core/src/tools/lib/gate-runner-v11.ts');
    expect(runner).toContain('validateCandidateRequirementReferences');
    expect(runner).toContain("details['requirement_reference_integrity']");
  });
});
