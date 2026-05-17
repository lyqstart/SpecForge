/**
 * Lesson 过滤器：按工具/项目/角色筛选，支持 supersedes 链。
 */

import type { Lesson, Role, Scope } from './parse-lesson';

export interface FilterOptions {
  /** 当前 AI 工具名（如 'kiro' / 'opencode' / 'codex'）。null = 不限工具，universal + 所有 tool-specific 都包含 */
  tool: string | null;
  /** 当前项目名。null = 不限项目，universal + 所有 project-specific 都包含 */
  project: string | null;
  /** 目标角色。null = 所有角色（用于 system prompt 全集） */
  role: Role | null;
  /** 是否包含其他工具的 tool-specific（默认 false） */
  includeOtherTools?: boolean;
  /** 是否包含其他项目的 project-specific（默认 false） */
  includeOtherProjects?: boolean;
}

/**
 * 过滤适用的 lessons，按 severity 排序（high → low），并处理 supersedes。
 */
export function filterLessons(lessons: Lesson[], opts: FilterOptions): Lesson[] {
  // 1. 收集被 supersedes 的 id（这些 lesson 应该被忽略）
  const superseded = new Set<string>();
  for (const l of lessons) {
    if (l.meta.supersedes) {
      superseded.add(l.meta.supersedes);
    }
  }

  // 2. 按选项过滤
  const matched: Lesson[] = [];
  for (const lesson of lessons) {
    if (superseded.has(lesson.meta.id)) continue;

    // scope 过滤
    if (!matchScope(lesson.meta.scope, lesson.meta.tool, lesson.meta.project, opts)) {
      continue;
    }

    // role 过滤
    if (!matchRole(lesson.meta.roles, opts.role)) {
      continue;
    }

    matched.push(lesson);
  }

  // 3. 按 severity → path 字典序排序
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  matched.sort((a, b) => {
    const sa = order[a.meta.severity] ?? 99;
    const sb = order[b.meta.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.path.localeCompare(b.path);
  });

  return matched;
}

function matchScope(
  scope: Scope,
  tool: string | undefined,
  project: string | undefined,
  opts: FilterOptions,
): boolean {
  if (scope === 'universal') return true;

  if (scope === 'tool-specific') {
    if (opts.tool === null) return true; // 不限工具时全收
    if (opts.includeOtherTools) return true;
    return tool === opts.tool;
  }

  if (scope === 'project-specific') {
    if (opts.project === null) return true;
    if (opts.includeOtherProjects) return true;
    return project === opts.project;
  }

  return false;
}

function matchRole(lessonRoles: Role[], targetRole: Role | null): boolean {
  if (targetRole === null) return true;
  if (lessonRoles.includes('*')) return true;
  return lessonRoles.includes(targetRole);
}
