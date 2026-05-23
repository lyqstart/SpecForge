#!/usr/bin/env bun
/**
 * 把 docs/engineering-lessons/ 下符合 OpenCode 工具的经验渲染到
 * .opencode/skills/superpowers-engineering-lessons/SKILL.md
 *
 * 使用：
 *   bun run scripts/lessons/render-opencode-skill.ts            # 默认输出
 *   bun run scripts/lessons/render-opencode-skill.ts --project=specforge
 *   bun run scripts/lessons/render-opencode-skill.ts --no-project    # 不含项目专属
 *   bun run scripts/lessons/render-opencode-skill.ts --check         # 只校验，不写文件
 *
 * 输出文件头部加 AUTO-GENERATED 标注；用户禁止手改，下次跑会被覆盖。
 *
 * 设计原则（来自 ARCHITECTURE.md §15.3）：
 *   - OpenCode 适配器按 skill 形式注入（autoload: true），所有 agent 自动获得经验
 *   - 输出完整 lesson body（不像 prompt-block 只输出摘要）
 *   - 按 scope 分组：universal → tool-specific → project-specific
 *   - 过滤逻辑：universal + opencode tool-specific + 当前项目 project-specific
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadLessons } from './lib/parse-lesson';
import { filterLessons } from './lib/filter';

const REPO_ROOT = process.cwd();
const LESSONS_DIR = path.join(REPO_ROOT, 'docs', 'engineering-lessons');
const OUTPUT_PATH = path.join(
  REPO_ROOT,
  '.opencode',
  'skills',
  'superpowers-engineering-lessons',
  'SKILL.md',
);

interface CliArgs {
  project: string | null;
  check: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let project: string | null = 'specforge'; // 默认本仓库
  let check = false;

  for (const arg of argv) {
    if (arg === '--no-project') project = null;
    else if (arg.startsWith('--project=')) project = arg.split('=')[1];
    else if (arg === '--check') check = true;
  }
  return { project, check };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  const stat = await fs.stat(LESSONS_DIR).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    console.error(`经验库目录不存在：${LESSONS_DIR}`);
    return 2;
  }

  const { lessons, errors } = await loadLessons(LESSONS_DIR, REPO_ROOT);

  if (errors.length > 0) {
    console.error('解析过程中发现错误：');
    for (const e of errors) {
      console.error(`  ${e.path}: ${e.message}`);
    }
  }

  // OpenCode：拉 universal + opencode tool-specific + 项目专属
  const filtered = filterLessons(lessons, {
    tool: 'opencode',
    project: args.project,
    role: null, // 所有角色都注入（OpenCode 没有 agent 级别的角色区分）
  });

  console.log(`找到 ${lessons.length} 条 lesson，匹配 OpenCode 上下文 ${filtered.length} 条`);
  for (const l of filtered) {
    console.log(`  [${l.meta.severity}] ${l.meta.scope}/${l.meta.id}  (${l.path})`);
  }

  if (args.check) {
    const exit = errors.length > 0 ? 1 : 0;
    console.log(`\n--check 模式：${exit === 0 ? '通过' : '失败'}`);
    return exit;
  }

  // 渲染输出
  const output = renderSkill(filtered, args.project);
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, output, 'utf-8');

  console.log(`\n已写入：${path.relative(REPO_ROOT, OUTPUT_PATH).replace(/\\/g, '/')}`);
  console.log(`总字符数：${output.length}`);

  return errors.length > 0 ? 1 : 0;
}

function renderSkill(
  lessons: ReturnType<typeof filterLessons>,
  project: string | null,
): string {
  const now = new Date().toISOString().slice(0, 10);
  const projectLabel = project ?? '（无项目专属）';

  const lines: string[] = [];

  // OpenCode Skill frontmatter
  lines.push('---');
  lines.push('name: superpowers-engineering-lessons');
  lines.push(
    'description: 工程经验库自动注入 — 把团队踩过的坑结构化注入所有 Agent，避免重复犯错',
  );
  lines.push('autoload: true');
  lines.push('---');
  lines.push('');
  lines.push(
    '<!-- AUTO-GENERATED — 不要手动编辑，运行 `bun run scripts/lessons/render-opencode-skill.ts` 重新生成 -->',
  );
  lines.push('<!-- 源：docs/engineering-lessons/ — 改源文件再 rerun 适配器 -->');
  lines.push('');
  lines.push('# 工程经验注入（AI 必读）');
  lines.push('');
  lines.push(`**生成日期**：${now}  `);
  lines.push(`**适配工具**：OpenCode  `);
  lines.push(`**当前项目**：${projectLabel}  `);
  lines.push(`**注入条数**：${lessons.length}`);
  lines.push('');
  lines.push('本文件由经验库适配器自动生成，从 `docs/engineering-lessons/` 渲染而来。');
  lines.push('要修改某条经验，编辑对应源文件后重新运行适配器；**禁止直接改本文件**。');
  lines.push('');
  lines.push('---');
  lines.push('');

  if (lessons.length === 0) {
    lines.push('*（暂无经验匹配当前过滤条件）*');
    return lines.join('\n');
  }

  // 按 scope 分组：universal → tool-specific → project-specific
  const groups: Record<string, typeof lessons> = {
    universal: [],
    'tool-specific': [],
    'project-specific': [],
  };
  for (const l of lessons) {
    groups[l.meta.scope].push(l);
  }

  const groupLabels: Record<string, string> = {
    universal: '## 通用经验（所有项目所有工具）',
    'tool-specific': '## OpenCode 工具专属经验',
    'project-specific': '## 当前项目专属经验',
  };

  for (const [scope, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    lines.push(groupLabels[scope]);
    lines.push('');
    for (const lesson of items) {
      lines.push(`### [${lesson.meta.severity.toUpperCase()}] ${lesson.meta.id}`);
      lines.push('');
      lines.push(`**源**：${lesson.path}  `);
      if (lesson.meta.tags && lesson.meta.tags.length > 0) {
        lines.push(`**标签**：${lesson.meta.tags.join(', ')}  `);
      }
      if (lesson.meta.roles.length > 0) {
        lines.push(`**适用角色**：${lesson.meta.roles.join(', ')}`);
      }
      lines.push('');
      // 嵌入 lesson body（去掉原 H1 避免标题层级冲突）
      const body = lesson.body.replace(/^# .+$/m, '').trim();
      lines.push(body);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  // 速查表
  lines.push('## 经验速查表');
  lines.push('');
  lines.push('| # | ID | Severity | 一句话 |');
  lines.push('|---|-----|----------|--------|');
  for (let i = 0; i < lessons.length; i++) {
    const l = lessons[i];
    // 从 body 提取 H1 标题作为一句话
    const h1 = l.body.match(/^#\s+(.+)$/m)?.[1] ?? l.meta.id;
    const short = h1.length > 60 ? h1.slice(0, 57) + '…' : h1;
    lines.push(`| ${i + 1} | ${l.meta.id} | ${l.meta.severity.toUpperCase()} | ${short} |`);
  }
  lines.push('');

  return lines.join('\n');
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
