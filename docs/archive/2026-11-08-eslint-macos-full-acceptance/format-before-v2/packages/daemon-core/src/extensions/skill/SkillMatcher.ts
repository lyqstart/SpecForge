/**
 * SkillMatcher
 * Determines which skills match the current workflow + phase context
 */

import { SkillDefinition } from './types.js';

export class SkillMatcher {
  /**
   * Check if a skill matches the given workflow + phase context
   */
  static match(workflowId: string, phase: string, skill: SkillDefinition): boolean {
    switch (skill.autoload) {
      case 'always':
        return true;

      case 'workflow_match':
        if (!skill.workflowPattern || skill.workflowPattern.length === 0) {
          return true;
        }
        return skill.workflowPattern.includes(workflowId);

      case 'phase_match':
        if (!skill.phasePattern || skill.phasePattern.length === 0) {
          return true;
        }
        return skill.phasePattern.includes(phase);

      case 'manual':
        return false;

      default:
        return false;
    }
  }

  /**
   * Filter skills that match the current context
   */
  static filterMatching(
    skills: SkillDefinition[],
    workflowId: string,
    phase: string,
  ): SkillDefinition[] {
    return skills.filter((skill) => SkillMatcher.match(workflowId, phase, skill));
  }
}
