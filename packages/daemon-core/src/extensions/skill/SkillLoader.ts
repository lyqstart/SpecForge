/**
 * SkillLoader
 * Handles phase-enter skill loading and injection into agent context
 */

import { SkillRegistry } from './SkillRegistry.js';
import { SkillLoadedEvent } from './types.js';

export class SkillLoader {
  private registry: SkillRegistry;
  private eventHandler?: (event: SkillLoadedEvent) => void;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  /**
   * Set event handler for skill.loaded events
   */
  setEventHandler(handler: (event: SkillLoadedEvent) => void): void {
    this.eventHandler = handler;
  }

  /**
   * Load skills for a given phase transition
   * Called by WorkflowEngine after a state transition
   */
  async loadSkillsForPhase(
    workflowId: string,
    phase: string,
  ): Promise<Map<string, string>> {
    const loaded = await this.registry.loadPhaseSkills(workflowId, phase);

    // Emit skill.loaded events for each loaded skill
    for (const [name, content] of loaded) {
      const skill = this.registry.getSkill(name);
      if (skill && this.eventHandler) {
        this.eventHandler({
          skillName: name,
          workflowId,
          phase,
          autoloadStrategy: skill.autoload,
          size: content.length,
        });
      }
    }

    return loaded;
  }

  /**
   * Format loaded skills for injection into agent system prompt
   */
  formatSkillsForPrompt(skills: Map<string, string>): string {
    if (skills.size === 0) {
      return '';
    }

    let prompt = '--- Loaded Skills ---\n\n';

    for (const [name, content] of skills) {
      prompt += `## Skill: ${name}\n\n${content}\n\n---\n\n`;
    }

    return prompt;
  }
}
