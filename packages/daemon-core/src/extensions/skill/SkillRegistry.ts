/**
 * SkillRegistry
 * Manages skill registration, lookup and loading
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillDefinition, AutoloadStrategy } from './types.js';
import { SkillMatcher } from './SkillMatcher.js';

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();
  private contentCache: Map<string, string> = new Map();

  /**
   * Scan a directory and register all SKILL.md files found
   * @param dirPath Path to the skills directory (e.g., .opencode/skills/)
   * @returns Number of skills registered
   */
  async registerFromDirectory(dirPath: string): Promise<number> {
    let count = 0;

    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFilePath = path.join(dirPath, entry.name, 'SKILL.md');
        if (fs.existsSync(skillFilePath)) {
          const skill = await this.parseSkillFile(skillFilePath, entry.name);
          if (skill) {
            this.registerSkill(skill);
            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * Parse a SKILL.md file and extract metadata from YAML frontmatter
   */
  private async parseSkillFile(
    filePath: string,
    dirName: string,
  ): Promise<SkillDefinition | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      const fm = this.parseFrontmatter(content);

      const name = (fm['name'] as string) || dirName;
      const description =
        (fm['description'] as string) ||
        content.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
        content.match(/^>\s*(.+)$/m)?.[1]?.trim() ||
        `Skill: ${dirName}`;

      const autoload = this.validateAutoloadStrategy(fm['autoload']);

      const wt = fm['workflow_types'];
      const workflowPattern = wt
        ? Array.isArray(wt)
          ? (wt as string[])
          : [wt as string]
        : undefined;

      const ph = fm['phases'];
      const phasePattern = ph
        ? Array.isArray(ph)
          ? (ph as string[])
          : [ph as string]
        : undefined;

      return {
        name: name as string,
        description: description as string,
        filePath,
        workflowPattern,
        phasePattern,
        autoload,
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse YAML frontmatter from SKILL.md content
   */
  private parseFrontmatter(content: string): Record<string, unknown> {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};

    const yaml = match[1] ?? '';
    const result: Record<string, unknown> = {};

    for (const line of yaml.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (value === '') {
        continue;
      }
      if (value === 'true') {
        result[key] = true;
      } else if (value === 'false') {
        result[key] = false;
      } else {
        result[key] = value;
      }
    }

    const listBlockRegex = /^(\w+):\s*\n((?:\s+- .+\n?)*)/gm;
    let listMatch: RegExpExecArray | null;
    while ((listMatch = listBlockRegex.exec(yaml)) !== null) {
      const listKey = listMatch[1]!;
      const listContent = listMatch[2] ?? '';
      const items = listContent
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2).trim());
      if (items.length > 0) {
        result[listKey] = items;
      }
    }

    return result;
  }

  /**
   * Validate and normalize autoload strategy
   */
  private validateAutoloadStrategy(value: unknown): AutoloadStrategy {
    if (
      value === 'always' ||
      value === 'workflow_match' ||
      value === 'phase_match' ||
      value === 'manual'
    ) {
      return value;
    }
    // Legacy boolean support
    if (value === true) return 'always';
    if (value === false) return 'manual';
    return 'manual';
  }

  /**
   * Register a single skill
   */
  registerSkill(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill);
  }

  /**
   * Find skills matching the given workflow + phase
   */
  findSkills(workflowId: string, phase: string): SkillDefinition[] {
    const allSkills = Array.from(this.skills.values());
    return SkillMatcher.filterMatching(allSkills, workflowId, phase);
  }

  /**
   * Load a skill's content (from cache or file system)
   */
  async loadSkill(name: string): Promise<string> {
    const cached = this.contentCache.get(name);
    if (cached) {
      return cached;
    }

    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }

    const content = fs.readFileSync(skill.filePath, 'utf-8');
    this.contentCache.set(name, content);
    skill.content = content;

    return content;
  }

  /**
   * Load all skills matching the given workflow + phase
   * Returns a map of skill name → content
   */
  async loadPhaseSkills(
    workflowId: string,
    phase: string,
  ): Promise<Map<string, string>> {
    const matching = this.findSkills(workflowId, phase);
    const result = new Map<string, string>();

    for (const skill of matching) {
      const content = await this.loadSkill(skill.name);
      result.set(skill.name, content);
    }

    return result;
  }

  /**
   * Get a registered skill by name
   */
  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /**
   * List all registered skills
   */
  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * Clear all registered skills and cache
   */
  clear(): void {
    this.skills.clear();
    this.contentCache.clear();
  }

  /**
   * Get the number of registered skills
   */
  get size(): number {
    return this.skills.size;
  }
}
