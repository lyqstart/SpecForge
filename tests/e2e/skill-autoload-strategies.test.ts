import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SKILLS_DIR = path.join(REPO_ROOT, 'setup', 'userlevel-opencode', 'skills');

const WORKFLOW_SKILLS = [
  'sf-workflow-feature-spec',
  'sf-workflow-bugfix-spec',
  'sf-workflow-design-first',
  'sf-workflow-quick-change',
  'sf-workflow-change-request',
  'sf-workflow-refactor',
  'sf-workflow-ops-task',
  'sf-workflow-investigation',
];

const SUPERPOWER_SKILLS = [
  'superpowers-engineering-lessons',
  'superpowers-systematic-debugging',
  'superpowers-brainstorming',
  'superpowers-code-review',
  'superpowers-subagent-driven-development',
  'superpowers-verification-before-completion',
  'superpowers-writing-plans',
];

function skillPath(skillName: string): string {
  return path.join(SKILLS_DIR, skillName, 'SKILL.md');
}

function readSkill(skillName: string): string {
  return fs.readFileSync(skillPath(skillName), 'utf-8');
}

function assertFrontmatterName(content: string, skillName: string): void {
  expect(content, `${skillName} should have yaml frontmatter`).toMatch(/^---\r?\n/);
  expect(content, `${skillName} should declare its own name`).toContain(`name: ${skillName}`);
}

describe('Skill Repository Layout', () => {
  it('uses setup/userlevel-opencode/skills as the canonical repository source', () => {
    expect(fs.existsSync(SKILLS_DIR)).toBe(true);
    expect(fs.existsSync(path.resolve(REPO_ROOT, '.opencode', 'skills'))).toBe(false);
  });

  describe('Workflow skills', () => {
    WORKFLOW_SKILLS.forEach((skillName) => {
      it(`${skillName} exists and declares v1.1 governance policy`, () => {
        expect(fs.existsSync(skillPath(skillName)), `${skillName} should exist`).toBe(true);
        const content = readSkill(skillName);

        assertFrontmatterName(content, skillName);
        expect(content, `${skillName} should include generated phase docs`).toMatch(/AUTO-GENERATED:START:(phase-table|skill-matrix)/);
        expect(content, `${skillName} should include Post-P0 governance block`).toContain('SPECFORGE_V11_GOVERNANCE_POLICY_START');
        expect(content, `${skillName} should forbid merge-failed code permission bypass`).toContain('merge failed 不得 enable code_permission');
      });
    });
  });

  describe('Superpower skills', () => {
    SUPERPOWER_SKILLS.forEach((skillName) => {
      it(`${skillName} exists and declares its frontmatter name`, () => {
        expect(fs.existsSync(skillPath(skillName)), `${skillName} should exist`).toBe(true);
        const content = readSkill(skillName);

        assertFrontmatterName(content, skillName);
        expect(content.trim().length, `${skillName} should not be empty`).toBeGreaterThan(256);
      });
    });
  });
});
