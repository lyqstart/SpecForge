import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../../..');

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf-8');
}

describe('semantic closure contract alignment', () => {
  it('exposes the typed semantic_closure argument in the deployed OpenCode tool', () => {
    const wrapper = read('setup/userlevel-opencode/tools/sf_semantic_closure_run.ts');
    expect(wrapper).toContain('semantic_closure: semanticClosureSchema');
    expect(wrapper).toContain('outcomes:');
    expect(wrapper).toContain('design_decisions:');
    expect(wrapper).toContain('project_integration:');
    expect(wrapper).toContain('outcome_refs:');
    expect(wrapper).toContain('requirement_refs:');
    expect(wrapper).toContain('design_refs:');
    expect(wrapper).toContain('task_refs:');
    expect(wrapper).toContain('evidence_refs:');
    expect(wrapper).toContain('required_evidence_refs:');
    expect(wrapper).toContain('status: tool.schema');
    expect(wrapper).toContain('level: tool.schema');
    expect(wrapper).toContain('evidence_type: tool.schema');
    expect(wrapper).toContain('supports: refs()');
    expect(wrapper).toContain('verification_gate 之前调用');
  });

  it('requires Verifier output to include the same closure sections', () => {
    const verifier = read('setup/userlevel-opencode/agents/sf-verifier.md');
    expect(verifier).toContain('"semantic_closure"');
    expect(verifier).toContain('"outcomes"');
    expect(verifier).toContain('"requirements"');
    expect(verifier).toContain('"design_decisions"');
    expect(verifier).toContain('"tasks"');
    expect(verifier).toContain('"evidence"');
    expect(verifier).toContain('"project_integration"');
    expect(verifier).toContain('Knowledge Graph 当作 Semantic Closure 数据源');
    expect(verifier).toContain('sf_artifact_write(file_type="evidence_manifest")');
    expect(verifier).not.toContain('sf_evidence_write');
  });

  it('orders semantic closure before verification_gate in the Orchestrator contract', () => {
    const orchestrator = read('setup/userlevel-opencode/agents/sf-orchestrator.md');
    const closeout = orchestrator.slice(orchestrator.indexOf('实现后的收口顺序是：'));
    expect(closeout.indexOf('sf_semantic_closure_run')).toBeGreaterThanOrEqual(0);
    expect(closeout.indexOf('sf_gate_run(verification_gate)')).toBeGreaterThan(
      closeout.indexOf('sf_semantic_closure_run')
    );
  });

  it('keeps every workflow that runs verification_gate on the typed closeout protocol', () => {
    const skillsRoot = join(repoRoot, 'setup/userlevel-opencode/skills');
    const governedSkills = readdirSync(skillsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(skillsRoot, entry.name, 'SKILL.md'))
      .filter(filePath => {
        try {
          return readFileSync(filePath, 'utf-8').includes('verification_gate');
        } catch {
          return false;
        }
      });

    expect(governedSkills.length).toBeGreaterThan(0);
    for (const filePath of governedSkills) {
      const content = readFileSync(filePath, 'utf-8');
      expect(content, filePath).toContain('sf_semantic_closure_run');
      expect(content, filePath).toContain('semantic_closure=<');
    }
  });
});
