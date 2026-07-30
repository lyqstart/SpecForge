import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../../..');

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf-8');
}

describe('Work Item artifact authority contract', () => {
  it('declares Candidate-first resolution and placeholder rejection in the Path Service', () => {
    const layout = read('packages/types/src/directory-layout.ts');
    expect(layout).toContain('Candidate 权威路径 → Work Item 顶层兼容路径');
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
    const contextBuilder = read(
      'packages/daemon-core/src/tools/lib/sf_context_build_core.ts',
    );
    const knowledgeGraph = read(
      'packages/daemon-core/src/tools/lib/sf_knowledge_graph_core.ts',
    );

    expect(closeGate).toContain('resolveWorkItemSpecArtifacts');
    expect(closeGate).toContain('close_artifact_${artifact.kind}_authoritative');
    expect(semanticClosure).toContain('resolveWorkItemSpecArtifacts');
    expect(semanticProvenance).toContain("'candidates/trace_delta.md'");
    expect(contextBuilder).toContain('workItemSpecArtifactReadCandidates');
    expect(knowledgeGraph).toContain('workItemSpecArtifactReadCandidates');
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

    const skillsRoot = join(repoRoot, 'setup/userlevel-opencode/skills');
    const workflowSkills = readdirSync(skillsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('sf-workflow-'))
      .map(entry => join(skillsRoot, entry.name, 'SKILL.md'));

    for (const filePath of workflowSkills) {
      const content = readFileSync(filePath, 'utf-8');
      expect(content, filePath).not.toContain(
        '.specforge/work-items/<work_item_id>/tasks.md',
      );
    }
  });

  it('describes the legacy repair tool as a read-only audit', () => {
    const wrapper = read(
      'setup/userlevel-opencode/tools/sf_work_item_repair_closure.ts',
    );
    expect(wrapper).toContain('只读审计');
    expect(wrapper).toContain('已停止修复写入');
    expect(wrapper).not.toContain('才在根目录补一个骨架标记');
  });
});
