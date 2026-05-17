#!/usr/bin/env bun
/**
 * 输出"派单 prompt 注入段"——给 orchestrator 派 sub-agent 时复制粘贴。
 *
 * 设计原则（来自 ARCHITECTURE.md §15.14）：
 *   - LLM 注意力分配机制下，"派单 prompt 顶部明文重复"比"steering 静默注入"更有效
 *   - 输出**紧凑摘要**（每条 1-3 行），不是完整 lesson（完整 lesson 已在 steering 里）
 *   - 默认只输出 high severity 经验（避免 prompt 过长）
 *
 * 用法：
 *   bun run scripts/lessons/render-prompt-block.ts                    # 全部 high
 *   bun run scripts/lessons/render-prompt-block.ts --role=executor    # 按角色
 *   bun run scripts/lessons/render-prompt-block.ts --tags=shell,async # 按 tag
 *   bun run scripts/lessons/render-prompt-block.ts --severity=medium  # 提到 medium
 *   bun run scripts/lessons/render-prompt-block.ts --max-tokens=300   # 软上限
 *
 * 输出到 stdout，方便 pipe / 复制：
 *   bun run scripts/lessons/render-prompt-block.ts --role=executor | clip
 *
 * 输出格式（粘贴进派单 prompt 顶部即可）：
 *
 *   ## ⚠️ 必读硬规则（违反将立即失败）
 *   1. [HIGH] 不要在 execute_pwsh 用 cd（用 cwd 参数）— Kiro 受控壳禁 cd
 *   2. [HIGH] 不要裸跑 bun test（用 Start-Job + Wait-Job -Timeout 90 包裹）— 防卡死
 *   3. [HIGH] Promise.race 的败者 timer 必须在 finally 里 clearTimeout — 防资源泄漏
 *   ...
 */

import * as path from 'node:path';
import { loadLessons, type Lesson, type Role, type Severity } from './lib/parse-lesson';
import { filterLessons } from './lib/filter';

const REPO_ROOT = process.cwd();
const LESSONS_DIR = path.join(REPO_ROOT, 'docs', 'engineering-lessons');

interface CliArgs {
  role: Role | null;
  tags: string[];
  minSeverity: Severity;
  project: string | null;
  tool: string;
  maxTokens: number;
}

const DEFAULT_MAX_TOKENS = 500;

function parseArgs(argv: string[]): CliArgs {
  let role: Role | null = null;
  let tags: string[] = [];
  let minSeverity: Severity = 'high';
  let project: string | null = 'specforge';
  let tool = 'kiro';
  let maxTokens = DEFAULT_MAX_TOKENS;

  for (const arg of argv) {
    if (arg.startsWith('--role=')) {
      role = arg.split('=')[1] as Role;
    } else if (arg.startsWith('--tags=')) {
      tags = arg.split('=')[1].split(',').map((t) => t.trim()).filter(Boolean);
    } else if (arg.startsWith('--severity=')) {
      minSeverity = arg.split('=')[1] as Severity;
    } else if (arg === '--no-project') {
      project = null;
    } else if (arg.startsWith('--project=')) {
      project = arg.split('=')[1];
    } else if (arg.startsWith('--tool=')) {
      tool = arg.split('=')[1];
    } else if (arg.startsWith('--max-tokens=')) {
      maxTokens = parseInt(arg.split('=')[1], 10) || DEFAULT_MAX_TOKENS;
    }
  }

  return { role, tags, minSeverity, project, tool, maxTokens };
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function meetsMinSeverity(lessonSeverity: Severity, minSeverity: Severity): boolean {
  return SEVERITY_ORDER[lessonSeverity] <= SEVERITY_ORDER[minSeverity];
}

function matchesTags(lessonTags: string[] | undefined, queryTags: string[]): boolean {
  if (queryTags.length === 0) return true;
  if (!lessonTags) return false;
  // 任一 tag 匹配即算
  return queryTags.some((q) => lessonTags.includes(q));
}

/**
 * 从 lesson body 提取一句话摘要：
 *   1. 如果有 `> ...` 引用块作为 lead，用第一行
 *   2. 否则取 H1 标题
 *   3. 失败 fallback 到 id
 */
function extractSummary(lesson: Lesson, maxChars = 100): string {
  const body = lesson.body;

  // 尝试取 H1 标题
  const h1Match = body.match(/^#\s+(.+)$/m);
  if (h1Match) {
    let title = h1Match[1].trim();
    if (title.length > maxChars) title = title.slice(0, maxChars - 1) + '…';
    return title;
  }

  // fallback：用 id
  return lesson.meta.id;
}

/**
 * 从 lesson 提取"避免做什么"的核心警告：
 *   优先抓 `## 解决方案` 段中的 ❌ 行，提取其后内容
 *   否则用 summary
 */
function extractWarning(lesson: Lesson, maxChars = 120): string {
  const body = lesson.body;

  // 找 ## 解决方案 段
  const solMatch = body.match(/##\s+解决方案[\s\S]*?(?=\n##\s+|\n---\n|$)/);
  if (solMatch) {
    const solBlock = solMatch[0];
    // 取第一个 ❌ 之后到行尾的内容（最直接的警告）
    const errMatch = solBlock.match(/❌[^\n]*\n([^\n`]+)/);
    if (errMatch) {
      let line = errMatch[1].replace(/^[\s>*-]+/, '').trim();
      if (line.length > 0) {
        if (line.length > maxChars) line = line.slice(0, maxChars - 1) + '…';
        return line;
      }
    }
  }

  return extractSummary(lesson, maxChars);
}

/**
 * 把 lesson 渲染为单行 prompt 条目：
 *   N. [SEVERITY] 警告 — 来源
 */
function renderLine(index: number, lesson: Lesson): string {
  const sev = lesson.meta.severity.toUpperCase();
  const summary = extractSummary(lesson, 80);
  const warning = extractWarning(lesson, 100);
  const ref = lesson.meta.id;

  // 如果 warning 和 summary 重叠，简化
  if (warning === summary || warning.length < 30) {
    return `${index}. [${sev}] ${summary} (来源: ${ref})`;
  }

  return `${index}. [${sev}] ${summary}\n   ⚠️ ${warning} (来源: ${ref})`;
}

function estimateTokens(text: string): number {
  // 粗略估算：1 token ≈ 4 字符（中文偏向 1 token / 字，英文 1 token / 4 字）
  // 取折中：1 token ≈ 2.5 字符
  return Math.ceil(text.length / 2.5);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  const { lessons, errors } = await loadLessons(LESSONS_DIR, REPO_ROOT);

  if (errors.length > 0) {
    console.error('// 解析过程发现错误（输出仍可用）：');
    for (const e of errors) console.error(`//   ${e.path}: ${e.message}`);
  }

  // 应用工具/项目/角色过滤
  let filtered = filterLessons(lessons, {
    tool: args.tool,
    project: args.project,
    role: args.role,
  });

  // severity 二次过滤（filterLessons 不过滤 severity，自己来）
  filtered = filtered.filter((l) => meetsMinSeverity(l.meta.severity, args.minSeverity));

  // tags 三次过滤
  if (args.tags.length > 0) {
    filtered = filtered.filter((l) => matchesTags(l.meta.tags, args.tags));
  }

  // 渲染输出
  const headerLines: string[] = [];
  headerLines.push('## ⚠️ 必读硬规则（违反将导致任务失败）');
  headerLines.push('');
  if (filtered.length === 0) {
    headerLines.push('（当前过滤条件下无相关经验）');
    process.stdout.write(headerLines.join('\n') + '\n');
    return 0;
  }

  const itemLines: string[] = [];
  filtered.forEach((lesson, i) => {
    itemLines.push(renderLine(i + 1, lesson));
  });

  const footerLines = [
    '',
    `<!-- ${filtered.length} 条经验 / 来自 docs/engineering-lessons/ / 详细规则见 .kiro/steering/lessons-injected.md -->`,
  ];

  const output = [...headerLines, ...itemLines, ...footerLines].join('\n');
  const tokens = estimateTokens(output);

  process.stdout.write(output + '\n');

  // 容量警告写到 stderr，不污染粘贴内容
  if (tokens > args.maxTokens) {
    process.stderr.write(
      `\n[WARN] prompt-block 估算 ${tokens} tokens，超过 --max-tokens=${args.maxTokens}\n`,
    );
    process.stderr.write('       建议：缩小 --role / --tags 或调高 --severity 阈值\n');
  } else {
    process.stderr.write(`\n[OK] ${filtered.length} 条经验，约 ${tokens} tokens (≤ ${args.maxTokens})\n`);
  }

  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
