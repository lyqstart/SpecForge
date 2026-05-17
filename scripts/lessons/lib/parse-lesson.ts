/**
 * Lesson 文件解析器
 *
 * 解析格式：
 *   ---
 *   key: value
 *   list: [a, b, c]
 *   ---
 *   markdown body...
 *
 * 设计原则：
 *   - 零依赖（不引 js-yaml / gray-matter，避免污染 dependencies）
 *   - 容错：格式错误时记录到 warnings，不抛异常
 *   - 只支持 YAML 子集：标量 / 内联数组 / 字符串值，足够 lesson 用
 *
 * 不支持的 YAML 特性（lesson 不需要）：
 *   - 嵌套对象
 *   - 多行字符串（| > 等）
 *   - 锚点 / 引用
 *   - 注释（# 开头会被当成 body 内容）
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type Scope = 'universal' | 'tool-specific' | 'project-specific';
export type Severity = 'high' | 'medium' | 'low';
export type Role = 'executor' | 'orchestrator' | 'reviewer' | 'debugger' | 'architect' | '*';

export interface LessonMeta {
  id: string;
  scope: Scope;
  tool?: string;
  project?: string;
  roles: Role[];
  severity: Severity;
  tags?: string[];
  created?: string;
  updated?: string;
  supersedes?: string;
  related?: string[];
  /** 原始 frontmatter（保留未识别字段供未来扩展） */
  raw: Record<string, unknown>;
}

export interface Lesson {
  /** 仓库相对路径，如 docs/engineering-lessons/universal/foo.md */
  path: string;
  meta: LessonMeta;
  /** 不含 frontmatter 的 markdown body */
  body: string;
  /** 解析过程中的警告（不阻止使用） */
  warnings: string[];
}

export interface ParseResult {
  lessons: Lesson[];
  errors: Array<{ path: string; message: string }>;
}

const VALID_SCOPES: Scope[] = ['universal', 'tool-specific', 'project-specific'];
const VALID_SEVERITIES: Severity[] = ['high', 'medium', 'low'];
const VALID_ROLES: Role[] = ['executor', 'orchestrator', 'reviewer', 'debugger', 'architect', '*'];

/**
 * 解析单个 lesson 文件。
 * @param absPath 绝对路径
 * @param repoRoot 仓库根（用于生成相对路径展示）
 */
export async function parseLessonFile(absPath: string, repoRoot: string): Promise<Lesson | null> {
  const content = await fs.readFile(absPath, 'utf-8');
  const relPath = path.relative(repoRoot, absPath).replace(/\\/g, '/');
  const warnings: string[] = [];

  // 提取 frontmatter
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) {
    return null; // 无 frontmatter 的文件忽略（可能是 README / schema 之类）
  }

  const [, fmText, body] = fmMatch;
  const raw = parseSimpleYaml(fmText, warnings);

  // 必填字段校验
  const required: Array<keyof LessonMeta> = ['id', 'scope', 'roles', 'severity'];
  for (const field of required) {
    if (raw[field] === undefined) {
      warnings.push(`缺少必填字段 "${String(field)}"`);
      return null; // 必填缺失，跳过
    }
  }

  // 类型/枚举校验
  const scope = String(raw['scope']);
  if (!VALID_SCOPES.includes(scope as Scope)) {
    warnings.push(`scope "${scope}" 不在合法集合 [${VALID_SCOPES.join(', ')}]`);
    return null;
  }

  const severity = String(raw['severity']);
  if (!VALID_SEVERITIES.includes(severity as Severity)) {
    warnings.push(`severity "${severity}" 不在合法集合 [${VALID_SEVERITIES.join(', ')}]`);
    return null;
  }

  const rolesRaw = raw['roles'];
  if (!Array.isArray(rolesRaw)) {
    warnings.push(`roles 必须是数组，得到 ${typeof rolesRaw}`);
    return null;
  }
  const roles: Role[] = [];
  for (const r of rolesRaw) {
    const rs = String(r);
    if (!VALID_ROLES.includes(rs as Role)) {
      warnings.push(`未知 role "${rs}"，忽略`);
      continue;
    }
    roles.push(rs as Role);
  }
  if (roles.length === 0) {
    warnings.push('roles 数组为空（去除非法值后）');
    return null;
  }

  // scope 与 tool/project 一致性
  if (scope === 'tool-specific' && !raw['tool']) {
    warnings.push('scope=tool-specific 但缺 tool 字段');
    return null;
  }
  if (scope === 'project-specific' && !raw['project']) {
    warnings.push('scope=project-specific 但缺 project 字段');
    return null;
  }

  const meta: LessonMeta = {
    id: String(raw['id']),
    scope: scope as Scope,
    severity: severity as Severity,
    roles,
    raw,
  };
  if (raw['tool']) meta.tool = String(raw['tool']);
  if (raw['project']) meta.project = String(raw['project']);
  if (Array.isArray(raw['tags'])) meta.tags = raw['tags'].map(String);
  if (raw['created']) meta.created = String(raw['created']);
  if (raw['updated']) meta.updated = String(raw['updated']);
  if (raw['supersedes']) meta.supersedes = String(raw['supersedes']);
  if (Array.isArray(raw['related'])) meta.related = raw['related'].map(String);

  return {
    path: relPath,
    meta,
    body: body.trim(),
    warnings,
  };
}

/**
 * 递归扫描目录，解析所有 .md lesson 文件。
 */
export async function loadLessons(lessonsDir: string, repoRoot: string): Promise<ParseResult> {
  const lessons: Lesson[] = [];
  const errors: Array<{ path: string; message: string }> = [];
  const seenIds = new Set<string>();

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 跳过 _meta（schema 不是 lesson）
        if (entry.name.startsWith('_')) continue;
        await walk(abs);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // 跳过 README
        if (entry.name.toLowerCase() === 'readme.md') continue;
        try {
          const lesson = await parseLessonFile(abs, repoRoot);
          if (!lesson) continue; // 无 frontmatter 或校验失败
          if (seenIds.has(lesson.meta.id)) {
            errors.push({
              path: lesson.path,
              message: `重复 id "${lesson.meta.id}"`,
            });
            continue;
          }
          seenIds.add(lesson.meta.id);
          lessons.push(lesson);
        } catch (err) {
          errors.push({
            path: path.relative(repoRoot, abs).replace(/\\/g, '/'),
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  await walk(lessonsDir);
  return { lessons, errors };
}

// ---------------------------------------------------------------------------
// 简单 YAML 解析器（标量 + 内联数组）
// ---------------------------------------------------------------------------

function parseSimpleYaml(text: string, warnings: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.replace(/\s+$/, ''); // 去尾空白
    if (!line.trim()) continue;
    if (line.trimStart().startsWith('#')) continue; // YAML 注释

    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) {
      warnings.push(`第 ${i + 1} 行无冒号，忽略：${line}`);
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const valueRaw = line.slice(colonIdx + 1).trim();

    if (!key) {
      warnings.push(`第 ${i + 1} 行 key 为空，忽略`);
      continue;
    }

    if (!valueRaw) {
      // 空值（暂不支持块级数组 / 嵌套对象）
      warnings.push(`第 ${i + 1} 行 "${key}" 值为空，仅支持单行值`);
      continue;
    }

    result[key] = parseValue(valueRaw);
  }

  return result;
}

function parseValue(s: string): unknown {
  // 内联数组 [a, b, c]
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => unquote(item.trim()));
  }
  // 双引号字符串
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  // 单引号字符串
  if (s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1);
  }
  // 布尔 / null
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  // 数字
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  // 普通字符串
  return s;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
