#!/usr/bin/env bun
/**
 * 异步资源规范审查脚本
 *
 * 根据 docs/engineering-lessons/async-resource-lifecycle.md 中的经验，
 * 扫描 packages/ 下所有源码和测试文件，报告违反规则的位置。
 *
 * 用法：
 *   bun run scripts/audit-async-resources.ts
 *   bun run scripts/audit-async-resources.ts --fix-config   # 自动修复 vitest.config.ts
 *
 * 规则对照：
 *   C1 - Promise.race 必须在 finally 中 clearTimeout
 *   C2 - while 循环不能用 setTimeout 轮询
 *   C3 - 超时错误必须包含根因（不能只是 'Timeout'）
 *   T1 - afterEach 不能用硬编码 ID 清理动态资源
 *   T3 - vitest.config.ts 必须设置 testTimeout
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dir, '..');
const PACKAGES_DIR = join(ROOT, 'packages');
const FIX_CONFIG = process.argv.includes('--fix-config');

// ─── 颜色输出 ────────────────────────────────────────────────────────────────
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

// ─── 结果收集 ────────────────────────────────────────────────────────────────
interface Finding {
  rule: string;
  severity: 'error' | 'warning';
  file: string;
  line: number;
  message: string;
  snippet: string;
  suggestion: string;
}

const findings: Finding[] = [];

function addFinding(f: Finding) { findings.push(f); }

// ─── 文件遍历 ────────────────────────────────────────────────────────────────
function walkFiles(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry)) continue;
      results.push(...walkFiles(full, ext));
    } else if (ext.some(e => full.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

// ─── 规则 C1：Promise.race 必须在 finally 中 clearTimeout ───────────────────
function checkC1(file: string, lines: string[]) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.includes('Promise.race')) continue;

    // 向后扫描 30 行，检查是否有 finally + clearTimeout
    const window = lines.slice(i, Math.min(i + 30, lines.length)).join('\n');
    const hasFinally = window.includes('finally');
    const hasClearTimeout = window.includes('clearTimeout');

    // 检查 race 中是否有 setTimeout（才需要清理）
    const raceBlock = lines.slice(i, Math.min(i + 20, lines.length)).join('\n');
    if (!raceBlock.includes('setTimeout')) continue;

    if (!hasFinally || !hasClearTimeout) {
      addFinding({
        rule: 'C1',
        severity: 'error',
        file,
        line: i + 1,
        message: 'Promise.race 中有 setTimeout，但附近没有 finally + clearTimeout',
        snippet: line.trim(),
        suggestion: '在 Promise.race 外层加 try/finally，在 finally 中 clearTimeout 所有 timer',
      });
    }
  }
}

// ─── 规则 C2：while 循环不能用 setTimeout 轮询 ──────────────────────────────
function checkC2(file: string, lines: string[]) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.match(/while\s*\(/)) continue;

    // 向后扫描 10 行，检查是否有 setTimeout 轮询
    const window = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
    if (!window.includes('setTimeout')) continue;

    // 检查是否有 signal.aborted 或其他终止条件
    const hasAbortCheck = window.includes('signal.aborted') ||
                          window.includes('cancel') ||
                          window.includes('break') ||
                          window.includes('return');

    if (!hasAbortCheck) {
      addFinding({
        rule: 'C2',
        severity: 'error',
        file,
        line: i + 1,
        message: 'while 循环中使用 setTimeout 轮询，且没有明确的终止条件',
        snippet: line.trim(),
        suggestion: '改用事件通知（notify/EventEmitter）替代轮询，并加 AbortSignal 终止条件',
      });
    } else {
      // 有终止条件，但检查是否有超时兜底
      const hasTimeoutGuard = window.includes('30_000') ||
                              window.includes('30000') ||
                              window.includes('timeout') ||
                              window.includes('Promise.race');
      if (!hasTimeoutGuard) {
        addFinding({
          rule: 'C2',
          severity: 'warning',
          file,
          line: i + 1,
          message: 'while 循环有终止条件，但缺少超时兜底（防止信号永远不来）',
          snippet: line.trim(),
          suggestion: '在 while 内加 Promise.race([waitForNotify(), timeoutPromise]) 作为兜底',
        });
      }
    }
  }
}

// ─── 规则 C3：超时错误必须包含根因 ──────────────────────────────────────────
function checkC3(file: string, lines: string[]) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // 匹配简单的超时错误抛出
    if (!line.match(/reject\(new Error\(|throw new Error\(/)) continue;
    if (!line.match(/[Tt]imeout|超时/)) continue;

    // 检查错误信息是否足够详细（包含 ms/s 数值或操作名）
    const hasMs = line.includes('ms') || line.includes('Ms') || line.includes('s)') || line.includes('s:');
    const hasOperation = line.includes('operation') || line.includes('操作') ||
                         line.match(/\w+\.\w+/); // 如 daemon.healthCheck

    if (!hasMs && !hasOperation) {
      addFinding({
        rule: 'C3',
        severity: 'warning',
        file,
        line: i + 1,
        message: '超时错误信息过于简单，缺少操作名或超时时长',
        snippet: line.trim(),
        suggestion: '错误信息应包含：操作名、超时时长(ms)、重试次数、行动建议',
      });
    }
  }
}

// ─── 规则 T1：afterEach 不能用硬编码 ID 清理动态资源 ────────────────────────
function checkT1(file: string, lines: string[]) {
  if (!file.includes('/tests/')) return;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.includes('afterEach')) continue;

    // 扫描 afterEach 块（向后 15 行）
    const block = lines.slice(i, Math.min(i + 15, lines.length)).join('\n');

    // 检查是否有 unsubscribe/cancel/close 调用
    const hasCleanup = block.match(/unsubscribe|cancel|close|dispose|cleanup/);
    if (!hasCleanup) continue;

    // 检查是否用了硬编码字符串 ID（引号包裹的非变量）
    const hardcodedIdPattern = /(?:unsubscribe|cancel|close|dispose)\s*\(\s*['"`][^'"`]+['"`]/;
    if (block.match(hardcodedIdPattern)) {
      addFinding({
        rule: 'T1',
        severity: 'error',
        file,
        line: i + 1,
        message: 'afterEach 中使用硬编码 ID 清理资源，无法覆盖动态生成的 ID',
        snippet: line.trim(),
        suggestion: '改用追踪列表：创建时 push(id)，afterEach 中遍历清理',
      });
    }
  }
}

// ─── 规则 T3：vitest.config.ts 必须设置 testTimeout ─────────────────────────
function checkT3(file: string, content: string) {
  if (!file.endsWith('vitest.config.ts')) return;

  const hasTestTimeout = content.includes('testTimeout');
  const hasHookTimeout = content.includes('hookTimeout');

  if (!hasTestTimeout) {
    addFinding({
      rule: 'T3',
      severity: 'error',
      file,
      line: 1,
      message: 'vitest.config.ts 缺少 testTimeout 配置',
      snippet: '（整个文件）',
      suggestion: '在 test: {} 中加入 testTimeout: 10000, hookTimeout: 5000, teardownTimeout: 3000',
    });

    if (FIX_CONFIG) {
      autoFixVitestConfig(file, content);
    }
  } else if (!hasHookTimeout) {
    addFinding({
      rule: 'T3',
      severity: 'warning',
      file,
      line: 1,
      message: 'vitest.config.ts 有 testTimeout 但缺少 hookTimeout',
      snippet: '（整个文件）',
      suggestion: '加入 hookTimeout: 5000 和 teardownTimeout: 3000',
    });
  }
}

// ─── 自动修复 vitest.config.ts ───────────────────────────────────────────────
function autoFixVitestConfig(file: string, content: string) {
  // 在 test: { 后插入超时配置
  const fixed = content.replace(
    /test:\s*\{/,
    `test: {\n    testTimeout: 10000,\n    hookTimeout: 5000,\n    teardownTimeout: 3000,`
  );
  if (fixed !== content) {
    writeFileSync(file, fixed, 'utf-8');
    console.log(`${GREEN}  ✓ 已自动修复: ${relative(ROOT, file)}${RESET}`);
  }
}

// ─── 主扫描逻辑 ──────────────────────────────────────────────────────────────
console.log(`\n${BOLD}${CYAN}═══ 异步资源规范审查 ═══${RESET}\n`);
console.log(`扫描目录: ${PACKAGES_DIR}\n`);

const allTs = walkFiles(PACKAGES_DIR, ['.ts']);
const vitestConfigs = allTs.filter(f => f.endsWith('vitest.config.ts'));
const sourceFiles = allTs.filter(f =>
  (f.includes('/src/') || f.includes('\\src\\')) && !f.endsWith('.d.ts')
);
const testFiles = allTs.filter(f =>
  f.includes('/tests/') || f.includes('/test/') ||
  f.includes('\\tests\\') || f.includes('\\test\\')
);

console.log(`发现文件：源码 ${sourceFiles.length} 个，测试 ${testFiles.length} 个，vitest 配置 ${vitestConfigs.length} 个\n`);

// 扫描源码
for (const file of sourceFiles) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  checkC1(file, lines);
  checkC2(file, lines);
  checkC3(file, lines);
}

// 扫描测试文件
for (const file of testFiles) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  checkT1(file, lines);
}

// 扫描 vitest 配置（--fix-config 模式下先修复再重新读取检查）
for (const file of vitestConfigs) {
  const content = readFileSync(file, 'utf-8');
  checkT3(file, content);
}

// --fix-config 模式：修复后重新扫描，移除已修复的 T3 findings
if (FIX_CONFIG) {
  const t3Findings = findings.filter(f => f.rule === 'T3');
  for (const f of t3Findings) {
    const freshContent = readFileSync(f.file, 'utf-8');
    if (freshContent.includes('testTimeout')) {
      const idx = findings.indexOf(f);
      if (idx !== -1) findings.splice(idx, 1);
    }
  }
}

// ─── 输出报告 ────────────────────────────────────────────────────────────────
const errors   = findings.filter(f => f.severity === 'error');
const warnings = findings.filter(f => f.severity === 'warning');

// 按规则分组
const byRule = new Map<string, Finding[]>();
for (const f of findings) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, []);
  byRule.get(f.rule)!.push(f);
}

const ruleDescriptions: Record<string, string> = {
  C1: 'Promise.race 败者 timer 必须在 finally 中 clearTimeout',
  C2: 'while 循环不能用 setTimeout 轮询，必须有终止条件',
  C3: '超时错误必须包含根因和行动建议',
  T1: 'afterEach 不能用硬编码 ID 清理动态资源',
  T3: 'vitest.config.ts 必须设置 testTimeout',
};

for (const [rule, ruleFindings] of byRule) {
  const icon = ruleFindings.some(f => f.severity === 'error') ? `${RED}✗${RESET}` : `${YELLOW}⚠${RESET}`;
  console.log(`${icon} ${BOLD}规则 ${rule}${RESET}：${ruleDescriptions[rule] ?? ''}`);
  console.log(`  发现 ${ruleFindings.length} 处问题\n`);

  for (const f of ruleFindings) {
    const relPath = relative(ROOT, f.file);
    const color = f.severity === 'error' ? RED : YELLOW;
    console.log(`  ${color}${f.severity.toUpperCase()}${RESET} ${relPath}:${f.line}`);
    console.log(`  ${CYAN}代码${RESET}：${f.snippet}`);
    console.log(`  ${CYAN}问题${RESET}：${f.message}`);
    console.log(`  ${GREEN}建议${RESET}：${f.suggestion}`);
    console.log();
  }
}

// ─── 汇总 ────────────────────────────────────────────────────────────────────
console.log(`${BOLD}═══ 审查结果汇总 ═══${RESET}`);
console.log(`总计：${findings.length} 个问题`);
console.log(`  ${RED}错误${RESET}：${errors.length} 个（必须修复）`);
console.log(`  ${YELLOW}警告${RESET}：${warnings.length} 个（建议修复）`);

if (findings.length === 0) {
  console.log(`\n${GREEN}✓ 所有检查通过！${RESET}\n`);
} else {
  console.log(`\n完整经验文档：docs/engineering-lessons/async-resource-lifecycle.md`);
  console.log(`规范文档：.kiro/steering/async-resource-coding-standards.md`);
  if (!FIX_CONFIG && errors.some(f => f.rule === 'T3')) {
    console.log(`\n提示：运行 ${CYAN}bun run scripts/audit-async-resources.ts --fix-config${RESET} 可自动修复 vitest.config.ts`);
  }
  console.log();
}

// 有 error 时以非零退出码退出（可集成到 CI）
process.exit(errors.length > 0 ? 1 : 0);
