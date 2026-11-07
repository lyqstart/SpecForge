import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../../..');

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf-8');
}

describe('semantic closure contract alignment', () => {
  it('keeps deployed trace readers and writer on the canonical Runtime path', () => {
    const consumers = [
      'setup/userlevel-opencode/agents/_AGENT_BASE.md', 'setup/userlevel-opencode/AGENTS.md',
      'setup/userlevel-opencode/agents/sf-debugger.md', 'setup/userlevel-opencode/agents/sf-knowledge.md',
      'setup/userlevel-opencode/agents/sf-reviewer.md',
      'setup/userlevel-opencode/skills/superpowers-knowledge-extraction/SKILL.md',
    ];
    const actualReaders = consumers.filter(path => read(path).includes('trace.jsonl'));
    expect(actualReaders.length).toBeGreaterThan(0);
    for (const path of consumers) expect(read(path), path).not.toContain('.specforge/logs/trace.jsonl');
    for (const path of actualReaders) {
      const content = read(path);
      expect(content, path).toContain('.specforge/runtime/logs/trace.jsonl');
    }
    expect(read('setup/userlevel-opencode/tools/lib/sf_artifact_write_core.ts'))
      .toContain('SPEC_DIR_NAME, "runtime", "logs", "trace.jsonl"');
    expect(read('packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts'))
      .toContain("SPEC_DIR_NAME, 'runtime', 'logs', 'trace.jsonl'");
  });

  it('keeps deployed agents free of missing constitution references and sf-design out of trace_delta ownership', () => {
    const agents = ['sf-debugger.md', 'sf-design.md', 'sf-executor.md', 'sf-requirements.md', 'sf-reviewer.md', 'sf-task-planner.md'];
    for (const agent of agents) expect(read(`setup/userlevel-opencode/agents/${agent}`), agent).not.toContain('AGENT_CONSTITUTION.md');
    const design = read('setup/userlevel-opencode/agents/sf-design.md');
    expect(design).toContain('由 `sf-task-planner` 作为正式 artifact owner 写入');
    expect(design).toContain('sf-design 不拥有该产物的写入权');
  });

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

  it('routes verifier governance reads away from sf_safe_bash', () => {
    const verifier = read('setup/userlevel-opencode/agents/sf-verifier.md');
    expect(verifier).toContain('验证只读工具路由（强制）');
    expect(verifier).toMatch(/sf_safe_bash[^\r\n]*Runtime\s*内部受控(?:只读操作|读取)/);
    expect(verifier).toContain('D23的Node验证仅走正式plan/run');
    expect(verifier).toContain('读取已知文件使用 OpenCode `Read`');
    expect(verifier).toContain('发现路径使用 `Glob`');
    expect(verifier).toContain('搜索内容使用 `Grep`');
    expect(verifier).toContain('权威状态必须使用 `sf_state_read`');
    expect(verifier).toContain('禁止**通过 `sf_safe_bash`');
    expect(verifier).toContain('`.specforge/runtime/logs/trace.jsonl` 的写入与审计属于 Runtime/Orchestrator');
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
