#!/usr/bin/env bun
/**
 * render-layout.ts — 从 directory-layout.ts 自动生成目录布局文档
 *
 * 用法：
 *   bun run scripts/render-layout.ts                  # 生成 docs/conventions/directory-layout.md + 更新 marker
 *   bun run scripts/render-layout.ts --dry-run         # 只输出到 stdout，不写文件
 *
 * 功能：
 *   1. 读取 packages/types/src/directory-layout.ts 的 LAYOUT / USER_LAYOUT / SPEC_DIR_NAME 常量
 *   2. 生成 docs/conventions/directory-layout.md
 *   3. 更新目标文件中 <!-- BEGIN: directory-layout --> ... <!-- END: directory-layout --> 之间的内容
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// 类型定义（与 directory-layout.ts 保持同步）
// ---------------------------------------------------------------------------

type LayoutEntry = { [key: string]: string | LayoutEntry };

interface LayoutConst {
  [key: string]: string | LayoutEntry;
}

// ---------------------------------------------------------------------------
// 从源文件提取常量（运行时反射方案）
// ---------------------------------------------------------------------------

/**
 * 通过动态 import 加载 directory-layout.ts 的导出常量。
 * bun 支持直接 import TypeScript 文件。
 */
async function loadLayoutConstants(projectRoot: string): Promise<{
  SPEC_DIR_NAME: string;
  LAYOUT: LayoutConst;
  USER_LAYOUT: LayoutConst;
}> {
  const layoutPath = path.join(
    projectRoot,
    'packages/types/src/directory-layout.ts',
  );

  if (!fs.existsSync(layoutPath)) {
    throw new Error(`directory-layout.ts not found at: ${layoutPath}`);
  }

  // bun 可以直接 import .ts 文件
  const mod = await import(layoutPath);

  return {
    SPEC_DIR_NAME: mod.SPEC_DIR_NAME as string,
    LAYOUT: mod.LAYOUT as LayoutConst,
    USER_LAYOUT: mod.USER_LAYOUT as LayoutConst,
  };
}

// ---------------------------------------------------------------------------
// Markdown 生成
// ---------------------------------------------------------------------------

/** 从 LAYOUT 常量中提取带注释说明的条目 */
function extractEntries(
  layout: LayoutConst,
  sourceContent: string,
  scopeLabel: string,
): { key: string; value: string; comment: string }[] {
  const entries: { key: string; value: string; comment: string }[] = [];

  // 找到该常量在源码中的起始位置，限定搜索范围
  const scopeStart = sourceContent.indexOf(`${scopeLabel} = {`);
  // 找到该常量块的结束位置（下一个 export const 或文件末尾）
  const nextExport = sourceContent.indexOf('export const', scopeStart + 1);
  const scopeEnd =
    nextExport === -1 ? sourceContent.length : nextExport;

  for (const [key, value] of Object.entries(layout)) {
    if (typeof value === 'string') {
      // 从源码中提取该 key 的 JSDoc 注释（限定在 scope 范围内）
      const comment = extractCommentForKey(
        sourceContent,
        key,
        scopeStart,
        scopeEnd,
      );
      entries.push({ key, value, comment });
    }
    // 嵌套对象（如 configFiles）单独处理
  }
  return entries;
}

/** 从源码字符串中提取指定 key 的 JSDoc 注释 */
function extractCommentForKey(
  source: string,
  targetKey: string,
  searchStart: number = 0,
  searchEnd: number = source.length,
): string {
  // 源码中每个属性前都有单行 /** comment */ 或多行 /** \n * comment \n */ 注释
  // 策略：先找到 "targetKey:" 或 "targetKey =" 的位置，然后向前搜索最近的 /** ... */ 块

  const scopedSource = source.substring(searchStart, searchEnd);

  // 先找 key 出现的位置（在限定范围内）
  const keyPattern = new RegExp(
    `\\b${targetKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*`,
  );
  const keyMatch = keyPattern.exec(scopedSource);
  if (!keyMatch) return '';

  const keyPos = keyMatch.index;

  // 从 key 位置向前搜索最近的 */
  const beforeKey = scopedSource.substring(0, keyPos);
  const commentEnd = beforeKey.lastIndexOf('*/');
  if (commentEnd === -1) return '';

  // 从 */ 向前搜索对应的 /**
  const commentStart = beforeKey.lastIndexOf('/**', commentEnd);
  if (commentStart === -1) return '';

  const commentBlock = beforeKey.substring(commentStart, commentEnd + 2);

  // 提取注释内容（去掉 /** 和 */ 和 * 前缀）
  const content = commentBlock
    .replace(/^\/\*\*?\s*/, '')
    .replace(/\s*\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('@'))
    .join(' ');

  return content;
}

/** 生成 committed 区条目的 markdown 表格行 */
function makeTableRows(
  entries: { key: string; value: string; comment: string }[],
): string {
  return entries
    .map(
      (e) =>
        `| ${e.key} | \`${e.value}\` | ${e.comment || '—'} |`,
    )
    .join('\n');
}

/** 生成嵌套对象（如 configFiles）的 markdown 表格行 */
function makeNestedTableRows(
  parentKey: string,
  nested: LayoutEntry,
): string {
  return Object.entries(nested)
    .map(
      ([key, value]) =>
        `| ${parentKey}.${key} | \`${value}\` | — |`,
    )
    .join('\n');
}

/** 生成完整的 directory-layout.md 内容 */
function generateMarkdown(
  SPEC_DIR_NAME: string,
  LAYOUT: LayoutConst,
  USER_LAYOUT: LayoutConst,
  sourceContent: string,
): string {
  // 确定 LAYOUT 和 USER_LAYOUT 在源码中的范围
  const layoutStart = sourceContent.indexOf('export const LAYOUT = {');
  const userLayoutStart = sourceContent.indexOf('export const USER_LAYOUT = {');
  const layoutEnd = userLayoutStart !== -1 ? userLayoutStart : sourceContent.length;
  const userLayoutEnd = sourceContent.length;

  // 分类 LAYOUT 条目
  const committedKeys = [
    'manifest',
    'project',
    'workItems',
    'config',
    'specs',
    'specsReadme',
    'knowledge',
    'knowledgeGraph',
  ];
  const gitignoredKeys = [
    'runtime',
    'runtimeWal',
    'runtimeState',
    'runtimeCheckpoints',
    'logs',
    'logsTelemetry',
    'logsTrace',
    'logsToolCalls',
    'logsCost',
    'logsConversations',
    'logsGate',
    'logsShellHistory',
    'archive',
    'archiveAgentRuns',
    'archiveRetro',
    'sessions',
    'cas',
  ];

  const committedEntries = committedKeys
    .filter((k) => typeof LAYOUT[k] === 'string')
    .map((k) => ({
      key: k,
      value: LAYOUT[k] as string,
      comment: extractCommentForKey(sourceContent, k, layoutStart, layoutEnd),
    }));

  const gitignoredEntries = gitignoredKeys
    .filter((k) => typeof LAYOUT[k] === 'string')
    .map((k) => ({
      key: k,
      value: LAYOUT[k] as string,
      comment: extractCommentForKey(sourceContent, k, layoutStart, layoutEnd),
    }));

  // configFiles 嵌套条目
  const configFiles = LAYOUT.configFiles as LayoutEntry | undefined;
  const configFilesSection = configFiles
    ? `\n### configFiles 分组\n\n| Key | 路径 | 说明 |\n|-----|------|------|\n${makeNestedTableRows('configFiles', configFiles)}\n`
    : '';

  // projectFiles 嵌套条目（v1.1 §2.1）
  const projectFiles = LAYOUT.projectFiles as LayoutEntry | undefined;
  const projectFilesSection = projectFiles
    ? `\n### projectFiles 分组\n\n| Key | 路径 | 说明 |\n|-----|------|------|\n${makeNestedTableRows('projectFiles', projectFiles)}\n`
    : '';

  // workItemFiles 嵌套条目（v1.1 §4.2）
  const workItemFiles = LAYOUT.workItemFiles as LayoutEntry | undefined;
  const workItemFilesSection = workItemFiles
    ? `\n### workItemFiles 分组\n\n| Key | 路径 | 说明 |\n|-----|------|------|\n${makeNestedTableRows('workItemFiles', workItemFiles)}\n`
    : '';

  // USER_LAYOUT 条目
  const userEntries = Object.entries(USER_LAYOUT)
    .filter(([, v]) => typeof v === 'string')
    .map(([k]) => ({
      key: k,
      value: USER_LAYOUT[k] as string,
      comment: extractCommentForKey(sourceContent, k, userLayoutStart, userLayoutEnd),
    }));

  return `# SpecForge 目录布局

> ⚠️ 本文档由 \`scripts/render-layout.ts\` 从 \`packages/types/src/directory-layout.ts\` 自动生成。
> 不要手动编辑。

## 项目目录名

\`\`\`
SPEC_DIR_NAME = '${SPEC_DIR_NAME}'
\`\`\`

## 项目级路径 (${SPEC_DIR_NAME}/)

### committed 区（提交到 Git）

| Key | 路径 | 说明 |
|-----|------|------|
${makeTableRows(committedEntries)}
${projectFilesSection}${workItemFilesSection}${configFilesSection}
### gitignored 区（运行时数据）

| Key | 路径 | 说明 |
|-----|------|------|
${makeTableRows(gitignoredEntries)}

## 用户级路径 (~/${SPEC_DIR_NAME}/)

| Key | 路径 | 说明 |
|-----|------|------|
${makeTableRows(userEntries)}

---
`;
}

// ---------------------------------------------------------------------------
// Marker 更新机制
// ---------------------------------------------------------------------------

const BEGIN_MARKER = '<!-- BEGIN: directory-layout -->';
const END_MARKER = '<!-- END: directory-layout -->';

/**
 * 更新目标文件中 marker 之间的内容。
 * 如果 marker 不存在，跳过该文件。
 */
function updateMarkersInFile(
  filePath: string,
  content: string,
): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const beginIdx = fileContent.indexOf(BEGIN_MARKER);
  const endIdx = fileContent.indexOf(END_MARKER);

  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
    return false;
  }

  const newContent =
    fileContent.substring(0, beginIdx + BEGIN_MARKER.length) +
    '\n' +
    content +
    '\n' +
    fileContent.substring(endIdx);

  fs.writeFileSync(filePath, newContent, 'utf-8');
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const projectRoot = path.resolve(import.meta.dir, '..');

  // 读取源文件内容（用于提取注释）
  const sourcePath = path.join(
    projectRoot,
    'packages/types/src/directory-layout.ts',
  );
  const sourceContent = fs.readFileSync(sourcePath, 'utf-8');

  // 加载常量
  const { SPEC_DIR_NAME, LAYOUT, USER_LAYOUT } =
    await loadLayoutConstants(projectRoot);

  // 生成 markdown
  const markdown = generateMarkdown(
    SPEC_DIR_NAME,
    LAYOUT,
    USER_LAYOUT,
    sourceContent,
  );

  if (dryRun) {
    console.log(markdown);
    return;
  }

  // 1. 写入 docs/conventions/directory-layout.md
  const outputDir = path.join(projectRoot, 'docs/conventions');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, 'directory-layout.md');
  fs.writeFileSync(outputPath, markdown, 'utf-8');
  console.log(`✓ Generated: ${path.relative(projectRoot, outputPath)}`);

  // 2. 更新带 marker 的目标文件
  const markerTargets = [
    'README.md',
    'AGENTS.md',
  ];

  const markerContent = markdown
    .replace(/^# .*\n/m, '')
    .trim();

  for (const relPath of markerTargets) {
    const targetPath = path.join(projectRoot, relPath);
    const updated = updateMarkersInFile(targetPath, markerContent);
    if (updated) {
      console.log(`✓ Updated markers in: ${relPath}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
