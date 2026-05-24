import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SKILLS_DIR = path.resolve(__dirname, '../../.opencode/skills');

const WORKFLOW_SKILLS = [
  'sf-workflow-feature-spec', 'sf-workflow-bugfix-spec', 'sf-workflow-design-first',
  'sf-workflow-quick-change', 'sf-workflow-change-request', 'sf-workflow-refactor',
  'sf-workflow-ops-task', 'sf-workflow-investigation'
];

describe('Skill Autoload Strategies', () => {
  describe('Workflow skills', () => {
    WORKFLOW_SKILLS.forEach(skillName => {
      it(`${skillName} should have autoload: workflow_match`, () => {
        const content = fs.readFileSync(path.join(SKILLS_DIR, skillName, 'SKILL.md'), 'utf-8');
        expect(content).toMatch(/autoload:\s*workflow_match/);
      });
    });
  });

  it('superpowers-engineering-lessons should have autoload: always', () => {
    const content = fs.readFileSync(path.join(SKILLS_DIR, 'superpowers-engineering-lessons', 'SKILL.md'), 'utf-8');
    expect(content).toMatch(/autoload:\s*always/);
  });

  it('superpowers-systematic-debugging should have autoload: manual', () => {
    const content = fs.readFileSync(path.join(SKILLS_DIR, 'superpowers-systematic-debugging', 'SKILL.md'), 'utf-8');
    expect(content).toMatch(/autoload:\s*manual/);
  });

  const PHASE_MATCH_SKILLS = [
    { name: 'superpowers-brainstorming', phase: 'requirements' },
    { name: 'superpowers-code-review', phase: 'review' },
    { name: 'superpowers-subagent-driven-development', phase: 'development' },
    { name: 'superpowers-verification-before-completion', phase: 'verification' },
    { name: 'superpowers-writing-plans', phase: 'tasks' }
  ];

  PHASE_MATCH_SKILLS.forEach(({ name, phase }) => {
    it(`${name} should have autoload: phase_match with ${phase}`, () => {
      const content = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf-8');
      expect(content).toMatch(/autoload:\s*phase_match/);
      expect(content).toContain(phase);
    });
  });
});
