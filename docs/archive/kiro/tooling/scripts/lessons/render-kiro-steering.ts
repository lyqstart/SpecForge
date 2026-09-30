#!/usr/bin/env bun
/**
 * 把 docs/engineering-lessons/ 下符合 Kiro 工具的经验渲染到 .kiro/steering/lessons-injected.md
 *
 * 使用：
 *   bun run scripts/lessons/render-kiro-steering.ts            # 默认输出
 *   bun run scripts/lessons/render-kiro-steering.ts --project=specforge
 *   bun run scripts/lessons/render-kiro-steering.ts --no-project    # 不含项目专属
 *   bun run scripts/lessons/render-kiro-steering.ts --check         # 只校验，不写文件
 *
 * 输出文件头部加 AUTO-GENERATED 标注；用户禁止手改，下次跑会被覆盖。
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadLessons } from './lib/parse-lesson';
import { filterLessons } from './lib/filter';

const REPO_ROOT = process.cwd();
const LESSONS_DIR = path.join(REPO_ROOT, 'docs', 'engineering-lessons');
const OUTPUT_PATH = path.join(REPO_ROOT, '.kiro', 'steering', 'lessons-injected.md');

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

  // Kiro 当前没有正式的 agent 角色区分，把所有角色都拉进来
  const filtered = filterLessons(lessons, {
    tool: 'kiro',
    project: args.project,
    role: null, // null = 不按角色过滤，把所有角色的经验都注入主提示词
  });

  console.log(`找到 ${lessons.length} 条 lesson，匹配 Kiro 上下文 ${filtered.length} 条`);
  for (const l of filtered) {
    console.log(`  [${l.meta.severity}] ${l.meta.scope}/${l.meta.id}  (${l.path})`);
  }

  if (args.check) {
    const exit = errors.length > 0 ? 1 : 0;
    console.log(`\n--check 模式：${exit === 0 ? '通过' : '失败'}`);
    return exit;
  }

  // 渲染输出
  const output = renderSteering(filtered, args.project);
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, output, 'utf-8');

  console.log(`\n已写入：${path.relative(REPO_ROOT, OUTPUT_PATH).replace(/\\/g, '/')}`);
  console.log(`总字符数：${output.length}`);

  return errors.length > 0 ? 1 : 0;
}

function renderSteering(lessons: ReturnType<typeof filterLessons>, project: string | null): string {
  const now = new Date().toISOString().slice(0, 10);
  const projectLabel = project ?? '（无项目专属）';

  const lines: string[] = [];

  // Kiro 自动注入头
  lines.push('---');
  lines.push('inclusion: always');
  lines.push('---');
  lines.push('');
  lines.push('<!-- AUTO-GENERATED — 不要手动编辑，运行 `bun run scripts/lessons/render-kiro-steering.ts` 重新生成 -->');
  lines.push('<!-- 源：docs/engineering-lessons/ — 改源文件再 rerun 适配器 -->');
  lines.push('');
  lines.push('# 工程经验注入（AI 必读）');
  lines.push('');
  lines.push(`**生成日期**：${now}  `);
  lines.push(`**适配工具**：Kiro  `);
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
    'tool-specific': '## Kiro 工具专属经验',
    'project-specific': '## 当前项目专属经验',
  };

  for (const [scope, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    lines.push(groupLabels[scope]);
    lines.push('');
    for (const lesson of items) {
      lines.push(`### [${lesson.meta.severity.toUpperCase()}] ${lesson.meta.id}`);
      lines.push('');
      lines.push(`**源**：[${lesson.path}](../../${lesson.path})  `);
      if (lesson.meta.tags && lesson.meta.tags.length > 0) {
        lines.push(`**标签**：${lesson.meta.tags.join(', ')}`);
      }
      lines.push('');
      // 直接嵌入 lesson body（去掉原 H1 避免标题层级冲突）
      const body = lesson.body.replace(/^# .+$/m, '').trim();
      lines.push(body);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
