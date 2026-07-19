import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function repoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'docs', 'standards', 'fused_standard.md'))) return cwd;
  return path.resolve(cwd, '..', '..');
}

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

describe('Investigation governance contract', () => {
  it('defines one canonical Investigation artifact and ownership model', () => {
    const standard = read('docs/standards/fused_standard.md');
    const investigator = read('setup/userlevel-opencode/agents/sf-investigator.md');
    const design = read('setup/userlevel-opencode/agents/sf-design.md');
    const orchestrator = read('setup/userlevel-opencode/agents/sf-orchestrator.md');

    for (const contract of [standard, investigator, orchestrator]) {
      expect(contract).toContain('investigation_plan.md');
      expect(contract).toContain('findings_report.md');
      expect(contract).toContain('sf-investigator');
    }

    expect(investigator).not.toContain('investigation_report.md');
    expect(design).toContain('不得在 Investigation Workflow 中代写、补写或覆盖调查产物');
    expect(orchestrator).toContain(
      'Investigation 的专业产物 `investigation_plan.md` 和 `findings_report.md` 只能由 `sf-investigator` 写入'
    );
  });

  it('embeds a falsifiable root-cause investigation method in sf-investigator', () => {
    const investigator = read('setup/userlevel-opencode/agents/sf-investigator.md');

    for (const token of [
      'CODE_OBSERVED',
      'RUNTIME_OBSERVED',
      'ENV_OBSERVED',
      'HISTORY_OBSERVED',
      'ASSUMPTION',
      'UNKNOWN',
      '首次偏离点',
      '竞争假设',
      '反证',
      '因果链',
      'ROOT_CAUSE_CONFIRMED',
      'ROOT_CAUSE_PROBABLE',
      'ROOT_CAUSE_UNCONFIRMED',
      'INSUFFICIENT_EVIDENCE',
      'AGENT_CLAIM',
      'PREMISE_REPRODUCED',
      'PREMISE_NOT_REPRODUCED',
      'OBSERVER_EFFECT_NONE',
      'OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE',
    ]) {
      expect(investigator).toContain(token);
    }

    expect(investigator).toContain('必须至少建立两个合理竞争假设');
    expect(investigator).toContain('不得把最先发现的问题或第一个合理解释直接当作根因');
    expect(investigator).toContain('修复该缺陷后能够阻断同类问题以相同机制再次发生');
    expect(investigator).toContain('调查必须独立获取原始证据');
    expect(investigator).toContain('禁止使用 `ROOT_CAUSE_CONFIRMED`');
  });

  it('uses the existing evidence-only lifecycle without implementation or parallel governance', () => {
    const skill = read('setup/userlevel-opencode/skills/sf-workflow-investigation/SKILL.md');
    const workflow = JSON.parse(read('configs/workflows/builtin/investigation.json')) as {
      workflow_path: string;
      stateMachine: { states: Record<string, unknown> };
    };

    expect(skill).toContain('workflow_type=investigation');
    expect(skill).toContain('workflow_path=requirement_change_path');
    expect(skill).toContain('project_integration_effect=evidence_only');
    expect(skill).toContain('sf_changed_files_audit(mode=no_code_change)');
    expect(skill).toContain('verification_done');
    expect(skill).toContain('sf_close_gate');
    expect(skill).toContain('不得在 investigation 中直接实施');
    expect(skill).not.toContain('sf-executor 执行调查');
    expect(skill).toContain('Requirements Gate 未返回 `pass` 时继续执行调查');
    expect(skill).toContain('禁止执行正式调查、写入 `findings_report.md` 或调用 Findings Gate');
    expect(skill).toContain('不得传递 Orchestrator 或其他 Agent 预设的候选根因');
    expect(skill).toContain('HardStop Recovery');
    expect(skill).toContain('operator_error');

    expect(workflow.workflow_path).toBe('requirement_change_path');
    const states = Object.keys(workflow.stateMachine.states);
    expect(states).not.toContain('implementation_ready');
    expect(states).not.toContain('implementation_running');
    expect(states).not.toContain('implementation_done');
    expect(states).toContain('verification_running');
    expect(states).toContain('verification_done');
  });

  it('keeps daemon and deployed Investigation Gate contracts aligned', () => {
    const runtimeRequirements = read(
      'packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts'
    );
    const deployedRequirements = read(
      'setup/userlevel-opencode/tools/lib/sf_requirements_gate_core.ts'
    );
    for (const core of [runtimeRequirements, deployedRequirements]) {
      for (const token of [
        'investigation',
        'investigation_plan.md',
        '候选假设',
        '验证与反证方法',
        'ROOT_CAUSE_CONFIRMED',
        '问题前提与观察者影响',
        '原始证据来源',
        'OBSERVER_EFFECT_NONE',
      ]) {
        expect(core).toContain(token);
      }
    }
    expect(runtimeRequirements).toContain('workItemRoot');
    expect(deployedRequirements).toContain('work-items');
    expect(runtimeRequirements).toContain('const nextHeadingPattern = /^#{1,2}\\s+/m;');
    expect(deployedRequirements).toContain('const nextHeadingPattern = /^#{1,2}\\s+/m;');

    const runtimeDesign = read('packages/daemon-core/src/tools/lib/sf_design_gate_core.ts');
    const deployedDesign = read('setup/userlevel-opencode/tools/lib/sf_design_gate_core.ts');
    for (const core of [runtimeDesign, deployedDesign]) {
      for (const token of [
        'investigation',
        'findings_report.md',
        '首次偏离点',
        '假设验证结果',
        'ROOT_CAUSE_CONFIRMED',
        '问题前提与证据完整性',
        '原始调查问题',
        'OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE',
      ]) {
        expect(core).toContain(token);
      }
    }
    expect(runtimeDesign).toContain('modeDocumentReadPaths');
    expect(deployedDesign).toContain('work-items');
  });
});
