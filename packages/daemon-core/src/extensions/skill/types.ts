/**
 * Skill Loader Types
 * Type definitions for Skill Registry, Skill Matching and Autoload strategies
 */

/** Autoload strategy for skills */
export type AutoloadStrategy = 'always' | 'workflow_match' | 'phase_match' | 'manual';

/** Skill definition */
export interface SkillDefinition {
  /** Unique skill name */
  name: string;
  /** Description */
  description: string;
  /** File path to SKILL.md */
  filePath: string;
  /** Workflow type patterns to match (empty = match all) */
  workflowPattern?: string[];
  /** Phase patterns to match (empty = match all) */
  phasePattern?: string[];
  /** Autoload strategy */
  autoload: AutoloadStrategy;
  /** Cached content */
  content?: string;
}

/** Skill loaded event payload */
export interface SkillLoadedEvent {
  skillName: string;
  workflowId: string;
  phase: string;
  autoloadStrategy: AutoloadStrategy;
  size: number;
}
