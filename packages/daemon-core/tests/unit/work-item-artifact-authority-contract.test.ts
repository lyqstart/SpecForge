import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../../..');

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf-8');
}

describe('Work Item artifact authority contract', () => {
  it('declares Candidate-first resolution and placeholder rejection in the Path Service', () => {
    const layout = read('packages/types/src/directory-layout.ts');
    expect(layout).toContain('当前发布权威读取路径');
    expect(layout).not.toContain('legacyWorkItemSpecArtifact');
    expect(layout).toContain('isWorkItemSpecArtifactPlaceholder');
    expect(layout).toContain('Reason: Not yet analyzed');
  });

  it('does not synthesize duplicate root tasks/trace placeholders for new Work Items', () => {
    const lifecycle = read(
      'packages/daemon-core/src/tools/lib/work-item-lifecycle-v11.ts',
    );
    expect(lifecycle).not.toContain("ensureFile(path.join(workItemDir, 'tasks.md')");
    expect(lifecycle).not.toContain("ensureFile(path.join(workItemDir, 'trace_delta.md')");
    expect(lifecycle).not.toContain(
      "ensureFile(path.join(workItemDir, 'verification_report.md')",
    );
    expect(lifecycle).not.toContain(
      "ensureFile(path.join(workItemDir, 'evidence', 'evidence_manifest.json')",
    );
  });

  it('routes downstream governance consumers through Candidate-first authority', () => {
    const closeGate = read('packages/daemon-core/src/tools/lib/close-gate.ts');
    const semanticClosure = read(
      'packages/daemon-core/src/tools/handlers/sf-semantic-closure-run.ts',
    );
    const semanticProvenance = read(
      'packages/daemon-core/src/tools/lib/semantic-closure-provenance.ts',
    );

    expect(closeGate).toContain('resolveWorkItemSpecArtifacts');
    expect(closeGate).toContain('close_artifact_${artifact.kind}_authoritative');
    expect(semanticClosure).toContain('resolveWorkItemSpecArtifacts');
    expect(semanticProvenance).toContain("'candidates/trace_delta.md'");
  });

  it('keeps Agent and workflow instructions on the canonical task path', () => {
    const orchestrator = read('setup/userlevel-opencode/agents/sf-orchestrator.md');
    const taskPlanner = read('setup/userlevel-opencode/agents/sf-task-planner.md');
    expect(orchestrator).toContain(
      '`candidates/tasks.md` 和 `candidates/trace_delta.md`',
    );
    expect(taskPlanner).toContain(
      '`candidates/tasks.md` 与 `candidates/trace_delta.md` 是新 Work Item 的唯一写入权威路径',
    );

    const currentWorkflowSkill = read(
      'setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md',
    );
    expect(currentWorkflowSkill).not.toContain(
      '.specforge/work-items/<work_item_id>/tasks.md',
    );
  });

  it('does not retain the legacy repair compatibility surface', () => {
    expect(existsSync(join(repoRoot, 'setup/userlevel-opencode/tools/sf_work_item_repair_closure.ts')))
      .toBe(false);
    expect(read('packages/types/src/directory-layout.ts'))
      .not.toContain('Closure-skeleton marker restored by sf_work_item_repair_closure');
  });
});
