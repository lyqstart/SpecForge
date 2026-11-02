import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('D18 verification guidance consumers', () => {
  it('keeps the executor and TDD skill from running shell-based verification', () => {
    const executor = read('setup/userlevel-opencode/agents/sf-executor.md');
    const tdd = read('setup/userlevel-opencode/skills/superpowers-tdd/SKILL.md');
    expect(executor).toMatch(/permission:[\s\S]*?bash:\s*deny/);
    expect(executor).toContain('命令状态只能记录为 `not_executed` 或 `blocked`');
    expect(executor).toContain('不得在终端运行 verification_command');
    expect(tdd).toContain('当前 SpecForge D18 禁止 Agent');
    expect(tdd).toContain('`not_executed`');
    expect(tdd).not.toContain('运行测试，确认测试失败');
    expect(tdd).not.toContain('运行测试，确认测试通过');
  });

  it('carries the execution limit and missing-evidence outcome through delegation and loading', () => {
    for (const file of [
      'agents/sf-verifier.md',
      'agents/sf-orchestrator.md',
      'agents/_AGENT_BASE.md',
      'skills/sf-workflow-feature-spec/SKILL.md',
      'skills/superpowers-verification-before-completion/SKILL.md',
    ]) {
      const text = read(`setup/userlevel-opencode/${file}`);
      expect(text, file).toContain('D18');
      expect(text, file).toContain('blocked');
    }
    const verifier = read('setup/userlevel-opencode/agents/sf-verifier.md');
    const skill = read('setup/userlevel-opencode/skills/superpowers-verification-before-completion/SKILL.md');
    for (const text of [verifier, skill]) {
      expect(text).toContain('skipped');
      expect(text).toContain('not_executed');
      expect(text).toContain('sf_artifact_write');
      expect(text).toContain('evidence_manifest');
    }
  });

  it('removes the observed executable instructions rather than appending an override', () => {
    const verifier = read('setup/userlevel-opencode/agents/sf-verifier.md');
    const skill = read('setup/userlevel-opencode/skills/superpowers-verification-before-completion/SKILL.md');
    // Scope is the current verification instructions, not historical examples or tests.
    for (const text of [verifier, skill]) {
      expect(text).not.toMatch(/```(?:powershell|bash|sh)\b/i);
      expect(text).not.toMatch(/`(?:docker run|bun test)\b/);
      expect(text).not.toContain('你可以读取文件和运行测试命令');
      expect(text).not.toContain('通过 `sf_safe_bash` 等受控工具取得真实命令输出、测试结果');
      expect(text).not.toContain('由 Orchestrator 决定是否豁免');
    }
    expect(read('setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md'))
      .not.toContain('skill，执行所有验证命令');
    expect(verifier).not.toContain('runCloseGate');
    expect(verifier).not.toContain('sf_git_diff');
    expect(verifier).not.toContain('.specforge/logs/trace.jsonl');
    expect(verifier).not.toContain('.specforge/agents/AGENT_CONSTITUTION.md');
    expect(verifier).not.toContain('推进到 completed');
    expect(verifier).toContain('原子写入由 `sf_artifact_write`');
    expect(verifier).toContain('不得自行写入或替代 changed_files_audit');
  });
});
