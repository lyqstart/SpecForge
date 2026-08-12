import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const authorityPath = resolve(repoRoot, 'docs/design/SpecForge架构一致性治理最终实施方案.md');
const featureSkillPath = resolve(repoRoot, 'setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md');
const plannerPath = resolve(repoRoot, 'setup/userlevel-opencode/agents/sf-task-planner.md');
const orchestratorPath = resolve(repoRoot, 'setup/userlevel-opencode/agents/sf-orchestrator.md');

describe('Phase 11 agent guidance authority contract', () => {
  it('persists explicit OpenCode and WorkBuddy session modes in the unique authority', async () => {
    const authority = await readFile(authorityPath, 'utf8');
    expect(authority.split('**GOV-STAGE-AGENT-SESSION-001：**').length - 1).toBe(1);
    expect(authority.split('| `GOV-STAGE-AGENT-SESSION-001` | 2.8 Stage Execution Contract |').length - 1).toBe(1);
    for (const token of [
      'OPEN_CODE_SESSION_MODE=CONTINUE_CURRENT_SESSION|START_NEW_SESSION|NOT_APPLICABLE',
      'WORKBUDDY_SESSION_MODE=CONTINUE_CURRENT_SESSION|START_NEW_SESSION|NOT_APPLICABLE',
      'OPEN_CODE_TASK=', 'WORKBUDDY_TASK=', 'USER_TASK=', 'CHATGPT_TASK=', 'STOP_CONDITION=',
    ]) expect(authority, token).toContain(token);
  });

  it('locks feature workflow to the canonical Impact Scope and Runtime-owned manifest', async () => {
    const skill = await readFile(featureSkillPath, 'utf8');
    for (const token of [
      'affected_modules', 'architecture_refs', 'data_model_refs', 'design_refs',
      'project_contract_refs', 'module_contract_refs', 'planned_code_paths',
      'Runtime -> candidate_manifest.json',
      'Orchestrator 不手工写 `candidate_manifest.json`',
      '下一 Attempt 仍失败时停止并报告 blocker',
    ]) expect(skill, token).toContain(token);
    expect(skill).toContain('不使用 `modules`、`declared_modules` 或 `effective_modules` 代替该正式字段');
  });

  it('locks task planner to formal DATA/DD/Contract trace semantics', async () => {
    const planner = await readFile(plannerPath, 'utf8');
    for (const token of [
      'DATA-* | constrained_by | ARCH-*',
      'DD-* | constrained_by | ARCH-*',
      'DD-* | constrained_by | DATA-*',
      'DD-* | constrained_by | <Project 或 Module Contract ID>',
      '<Project Contract ID> | enforces | <其每个 ARCH-/DATA- source_ref>',
      '<Module Contract ID> | enforces | <其每个 DD- source_ref>',
    ]) expect(planner, token).toContain(token);
  });

  it('locks orchestrator to affected_modules instead of invented aliases', async () => {
    const orchestrator = await readFile(orchestratorPath, 'utf8');
    for (const token of [
      'affected_modules', 'architecture_refs', 'data_model_refs', 'design_refs',
      'project_contract_refs', 'module_contract_refs', 'planned_code_paths',
      '不得以 `modules`、`declared_modules`、`effective_modules` 替代正式字段',
    ]) expect(orchestrator, token).toContain(token);
  });
});
