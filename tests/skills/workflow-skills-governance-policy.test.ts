
import { describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../..');
const skillsDir = path.join(repoRoot, 'setup/userlevel-opencode/skills');

const workflowSkills = [
  'sf-workflow-feature-spec',
  'sf-workflow-bugfix-spec',
  'sf-workflow-change-request',
  'sf-workflow-design-first',
  'sf-workflow-refactor',
  'sf-workflow-ops-task',
  'sf-workflow-quick-change',
  'sf-workflow-investigation',
];

const requiredPhrases = [
  'SPECFORGE_V11_GOVERNANCE_POLICY_START',
  'Gate failed 或 gates_running 状态下不得记录 user_approved',
  'decided_by` 必须是 `user`',
  'Agent 只能作为 `recorded_by`',
  'merge failed 不得 enable code_permission',
  'merge success 后才允许 enable code_permission',
  'merge success 后不得 invalidate user_decision',
  'close_gate failed 后不得 invalidate 已 merge 的 user_decision',
  '不得因当前 Work Item 卡住就新建 WI 绕过阻塞',
  '状态滞后时必须调用受控 tool',
  '不得手工猜状态',
  '每阶段最多一次修复',
  'code_permission 必须在实现和验证后 revoke',
  'close_gate 是正式关闭入口',
  'SPECFORGE_V11_GOVERNANCE_POLICY_END',
];

function readSkill(skillName: string): string {
  return fs.readFileSync(path.join(skillsDir, skillName, 'SKILL.md'), 'utf8');
}

describe('workflow skill governance policy', () => {
  for (const skillName of workflowSkills) {
    it(`${skillName} declares v1.1 Post-P0 governance constraints`, () => {
      const content = readSkill(skillName);
      for (const phrase of requiredPhrases) {
        expect(content).toContain(phrase);
      }
    });
  }

  it('investigation workflow explicitly forbids code permission', () => {
    const content = readSkill('sf-workflow-investigation');
    expect(content).toContain('investigation workflow 必须禁止进入 code_permission');
  });

  it('quick_change workflow explicitly stays within fast path boundary', () => {
    const content = readSkill('sf-workflow-quick-change');
    expect(content).toContain('quick_change workflow 必须保持 fast path boundary');
  });
});
