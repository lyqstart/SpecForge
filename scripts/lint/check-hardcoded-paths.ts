#!/usr/bin/env bun
/**
 * check-hardcoded-paths.ts — CI Lint：扫描 .ts 文件中的违规路径字面量
 *
 * 功能：
 *   扫描项目中所有 .ts 文件，检测硬编码的 specforge 路径字符串字面量，
 *   确保所有路径引用通过 directory-layout.ts 的常量/函数进行。
 *
 * 扫描规则（正则匹配）：
 *   - 行内包含 ".specforge" 或 '.specforge' 字符串字面量
 *   - 行内包含 "specforge/" 或 'specforge/'（不带点前缀）
 *   排除：import 语句、注释、SPEC_DIR_NAME 引用、@specforge/（npm scope）
 *
 * 白名单：
 *   通过读取 .lintrc-layout.json 获取
 *
 * CLI：
 *   bun scripts/lint/check-hardcoded-paths.ts              — 扫描并报告违规，exit 1 if found
 *   bun scripts/lint/check-hardcoded-paths.ts --list-violations — 列出所有违规但不 exit 1
 *
 * 退出码：
 *   0: 无违规
 *   1: 发现违规（仅非 --list-violations 模式）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

interface LintrcConfig {
  description: string;
  version: number;
  whitelist: string[];
  note?: string;
}

interface Violation {
  file: string;
  line: number;
  col: number;
  matchedText: string;
  fullLine: string;
}

// ---------------------------------------------------------------------------
// 简易 glob 匹配（支持 ** 和 * 通配符）
// ---------------------------------------------------------------------------

/**
 * 将简易 glob 模式转换为正则表达式。
 * 支持：
 *   ** — 匹配任意层目录（包括 0 层）
 *   *  — 匹配除 / 外的任意字符
 *   其他字符原样转义
 */
function globToRegex(pattern: string): RegExp {
  const parts = pattern.split('**');
  const regexParts = parts.map((part) =>
    part
      .split('*')
      .map((seg) => escapeRegex(seg))
      .join('[^/]*'),
  );
  return new RegExp('^(?:' + regexParts.join('.*') + ')$');
}

/** 转义正则特殊字符（不含 * 和 **，它们在 globToRegex 中处理） */
function escapeRegex(str: string): string {
  return str.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/** 测试文件路径是否匹配某个 glob 模式 */
function matchesGlob(filePath: string, pattern: string): boolean {
  // 统一使用 / 分隔符进行匹配
  const normalizedPath = filePath.replace(/\\/g, '/');
  const regex = globToRegex(pattern);
  return regex.test(normalizedPath);
}

/** 测试文件路径是否匹配白名单中的任一模式 */
function isWhitelisted(filePath: string, whitelist: string[]): boolean {
  // filePath 已经是相对路径（相对于项目根）
  return whitelist.some((pattern) => matchesGlob(filePath, pattern));
}

// ---------------------------------------------------------------------------
// 违规检测正则
// ---------------------------------------------------------------------------

/**
 * 检测行内是否包含违规的 specforge 路径字符串字面量。
 *
 * 匹配规则：
 *   1. `".specforge"` 或 `'.specforge'` — 点开头的 specforge 字符串字面量
 *   2. `"specforge/"` 或 `'specforge/'` — 不带点的 specforge 路径前缀
 *
 * 排除：
 *   - import 语句（行以 import 开头）
 *   - 注释（// 或 /* 或 * 开头）
 *   - SPEC_DIR_NAME / SPEC_USER_DIR_NAME 引用（赋值或比较上下文）
 *   - @specforge/ npm scope
 */
export const VIOLATION_PATTERNS: {
  regex: RegExp;
  description: string;
}[] = [
  {
    // 匹配 ".specforge" 或 '.specforge' 字符串字面量（含后续路径分隔符或引号结束）
    regex: /['"]\.specforge[/'"\\][^'"]*['"]/g,
    description: '".specforge" 字符串字面量',
  },
  {
    // 匹配 "specforge/" 或 'specforge/'（不带点前缀，作为路径前缀使用）
    regex: /['"]specforge\/[^'"]*['"]/g,
    description: '"specforge/" 路径前缀',
  },
];

/** 判断一行是否应被跳过（import、注释、常量定义等） */
export function shouldSkipLine(trimmedLine: string, fileExt: string = '.ts'): boolean {
  // 跳过 import 语句
  if (/^\s*import\s/.test(trimmedLine)) return true;
  // 跳过行注释
  if (/^\s*\/\//.test(trimmedLine)) return true;
  // 跳过块注释行
  if (/^\s*\*\s/.test(trimmedLine)) return true;
  if (/^\s*\/\*/.test(trimmedLine)) return true;
  // 跳过 @specforge/ npm scope 引用
  if (/@specforge\//.test(trimmedLine)) return true;
  // 跳过 SPEC_DIR_NAME / SPEC_USER_DIR_NAME 常量定义或引用
  if (/SPEC_DIR_NAME|SPEC_USER_DIR_NAME/.test(trimmedLine)) return true;

  // Markdown 特有规则（仅 .md 文件）
  if (fileExt === '.md') {
    // 跳过 HTML 注释整行（如 <!-- ... -->）
    if (/^\s*<!--.*-->\s*$/.test(trimmedLine)) return true;
    // 跳过代码围栏行（```）
    if (/^\s*```/.test(trimmedLine)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// 文件扫描
// ---------------------------------------------------------------------------

/** 递归收集目录下所有 .ts 和 .md 文件（排除 node_modules、.git、dist） */
function collectTargetFiles(rootDir: string): string[] {
  const results: string[] = [];
  const excludeDirs = new Set(['node_modules', '.git', '.kiro', 'dist']);

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!excludeDirs.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.md'))) {
        results.push(path.join(dir, entry.name));
      }
    }
  }

  walk(rootDir);
  return results;
}

/** 扫描单个文件内容，返回违规列表 */
function scanFile(filePath: string, fileExt: string): Violation[] {
  const violations: Violation[] = [];
  let content: string;

  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return violations;
  }

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (shouldSkipLine(trimmed, fileExt)) continue;

    for (const pattern of VIOLATION_PATTERNS) {
      // 重置 lastIndex
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.regex.exec(line)) !== null) {
        // 获取匹配的上下文（去除外围引号取核心匹配文本）
        const matchedText = match[0];

        violations.push({
          file: filePath,
          line: i + 1,
          col: match.index + 1,
          matchedText,
          fullLine: trimmed,
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 白名单加载
// ---------------------------------------------------------------------------

function loadWhitelist(projectRoot: string): string[] {
  const configPath = path.join(projectRoot, '.lintrc-layout.json');

  if (!fs.existsSync(configPath)) {
    console.error(`Warning: ${configPath} not found, using empty whitelist.`);
    return [];
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config: LintrcConfig = JSON.parse(raw);

    if (config.version !== 1) {
      console.error(`Warning: Unsupported .lintrc-layout.json version: ${config.version}`);
      return [];
    }

    return config.whitelist;
  } catch (err) {
    console.error(`Error reading ${configPath}:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list-violations');

  const projectRoot = path.resolve(import.meta.dir, '..', '..');
  const whitelist = loadWhitelist(projectRoot);
  const targetFiles = collectTargetFiles(projectRoot);

  // 过滤掉白名单文件
  const filesToScan = targetFiles.filter((fp) => {
    const relativePath = path.relative(projectRoot, fp).replace(/\\/g, '/');
    return !isWhitelisted(relativePath, whitelist);
  });

  const allViolations: Violation[] = [];

  for (const filePath of filesToScan) {
    const fileExt = path.extname(filePath);
    const violations = scanFile(filePath, fileExt);
    allViolations.push(...violations);
  }

  if (allViolations.length > 0) {
    for (const v of allViolations) {
      const relPath = path.relative(projectRoot, v.file).replace(/\\/g, '/');
      console.log(
        `VIOLATION: ${relPath}:${v.line}: ${v.matchedText}\n  → 建议：使用 directory-layout.ts 的常量/函数调用替代`,
      );
    }

    const summary = `\nFound ${allViolations.length} violation(s) in ${new Set(allViolations.map((v) => v.file)).size} file(s).`;
    console.log(summary);

    if (listOnly) {
      console.log('(list-only mode: not blocking)');
      process.exit(0);
    } else {
      process.exit(1);
    }
  } else {
    console.log('✓ No hardcoded path violations found.');
    process.exit(0);
  }
}

if (import.meta.main) {
  main();
}
