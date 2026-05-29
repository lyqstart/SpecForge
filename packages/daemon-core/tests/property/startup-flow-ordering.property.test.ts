/**
 * CP-1: Startup Flow Ordering Property Test
 *
 * Feature: daemon-core, CP-1: Startup Flow Ordering
 * Derived-From: TASK-6 (启动流程顺序守卫)
 *
 * Property: The orchestrator.md file must enforce startup flow ordering
 * by structural convention. This test verifies:
 * 1. "启动流程" 章节在 "意图分类" 之前（行号验证）
 * 2. 硬性前置条件守卫声明存在
 * 3. "处理用户每条消息的第一步" 声明已被移除
 * 4. manifest.json 创建指令存在
 * 5. PROJECT_NOT_INITIALIZED 错误处理协议存在
 *
 * Targets the user-level orchestrator.md (refactored by TASK-3).
 */

import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// ── Helpers ──

/**
 * Resolve the user-level orchestrator.md path.
 * Mirrors sf_doctor_core.ts: join(homedir(), '.config', 'opencode', 'agents', 'sf-orchestrator.md')
 */
function resolveOrchestratorPath(): string {
  return path.join(os.homedir(), '.config', 'opencode', 'agents', 'sf-orchestrator.md');
}

/**
 * Read orchestrator.md and return its lines.
 */
function readOrchestratorLines(): string[] {
  const filePath = resolveOrchestratorPath();
  if (!fs.existsSync(filePath)) {
    throw new Error(`orchestrator.md not found at: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n');
}

/**
 * Find the line number (1-indexed) of the first line matching a regex.
 * Returns -1 if not found.
 */
function findLineNumber(lines: string[], pattern: RegExp): number {
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i]!)) {
      return i + 1; // 1-indexed for readability
    }
  }
  return -1;
}

/**
 * Find the line number of the first line containing a substring.
 */
function findLineContaining(lines: string[], substring: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(substring)) {
      return i + 1;
    }
  }
  return -1;
}

describe('CP-1: Startup Flow Ordering (orchestrator.md structure)', () => {
  let lines: string[];

  // Read the file once before all tests
  beforeAll(() => {
    lines = readOrchestratorLines();
    expect(lines.length).toBeGreaterThan(0);
  });

  describe('Assertion 1: "启动流程" before "意图分类" (line number)', () => {
    it('should have "启动流程" section appear before "意图分类" section', () => {
      const startupLine = findLineNumber(lines, /^# 启动流程/);
      const intentLine = findLineNumber(lines, /^# 意图分类/);

      expect(startupLine).toBeGreaterThan(0);
      expect(intentLine).toBeGreaterThan(0);
      expect(
        startupLine,
        `"启动流程" at line ${startupLine} must appear before "意图分类" at line ${intentLine}`,
      ).toBeLessThan(intentLine);
    });
  });

  describe('Assertion 2: 硬性前置条件守卫声明存在', () => {
    it('should contain "硬性前置条件守卫" section', () => {
      const guardLine = findLineNumber(lines, /^# 硬性前置条件守卫/);

      expect(guardLine).toBeGreaterThan(0);
    });

    it('should contain guard content about not executing intent classification before startup', () => {
      const guardLine = findLineContaining(lines, '硬性前置条件守卫');

      // The guard section should include a blocking statement about startup flow
      // Check the next few lines after the guard heading contain the key constraint
      const contextStart = Math.max(0, guardLine - 1); // convert to 0-indexed
      const contextEnd = Math.min(lines.length, contextStart + 8);
      const guardContext = lines.slice(contextStart, contextEnd).join('\n');

      const hasStartupGuard =
        guardContext.includes('绝不执行意图分类') ||
        guardContext.includes('绝不创建 Work Item') ||
        guardContext.includes('步骤 1-4 全部完成之前');

      expect(hasStartupGuard).toBe(true);
    });
  });

  describe('Assertion 3: "处理用户每条消息的第一步" 已被移除', () => {
    it('should NOT contain "处理用户每条消息的第一步"', () => {
      const foundLine = findLineContaining(lines, '处理用户每条消息的第一步');

      expect(foundLine).toBe(-1);
    });
  });

  describe('Assertion 4: manifest.json 创建指令存在', () => {
    it('should contain manifest.json creation instruction in startup flow', () => {
      const manifestLine = findLineContaining(lines, 'manifest.json');

      expect(manifestLine).toBeGreaterThan(0);

      // Verify the line contains a creation/initialization instruction (not just a reference)
      const lineContent = lines[manifestLine - 1]!;

      const hasCreationInstruction =
        lineContent.includes('创建') ||
        lineContent.includes('重建') ||
        lineContent.includes('generate') ||
        // Check nearby context for creation semantics
        ((): boolean => {
          // Look at surrounding lines for creation instruction
          const ctxStart = Math.max(0, manifestLine - 3);
          const ctxEnd = Math.min(lines.length, manifestLine + 3);
          const context = lines.slice(ctxStart, ctxEnd).join('\n');
          return context.includes('创建') && context.includes('manifest.json');
        })();

      expect(hasCreationInstruction).toBe(true);
    });
  });

  describe('Assertion 5: PROJECT_NOT_INITIALIZED 错误处理协议存在', () => {
    it('should contain "PROJECT_NOT_INITIALIZED" error handling section', () => {
      const sectionLine = findLineNumber(lines, /^# PROJECT_NOT_INITIALIZED/);

      expect(sectionLine).toBeGreaterThan(0);
    });

    it('should contain recovery actions for PROJECT_NOT_INITIALIZED', () => {
      const sectionLine = findLineNumber(lines, /^# PROJECT_NOT_INITIALIZED/);

      // Get the section content (next ~15 lines)
      const sectionStart = sectionLine - 1; // 0-indexed
      const sectionEnd = Math.min(lines.length, sectionStart + 20);
      const sectionContent = lines.slice(sectionStart, sectionEnd).join('\n');

      const hasRecoveryActions =
        sectionContent.includes('立即暂停') ||
        sectionContent.includes('启动流程恢复') ||
        sectionContent.includes('重建缺失');

      expect(hasRecoveryActions).toBe(true);
    });

    it('should contain trigger scenarios for PROJECT_NOT_INITIALIZED', () => {
      const allContent = lines.join('\n');

      // Extract the PROJECT_NOT_INITIALIZED section
      const sectionStartIdx = allContent.indexOf('# PROJECT_NOT_INITIALIZED');
      expect(sectionStartIdx).toBeGreaterThan(-1);

      // Look for trigger scenarios within reasonable range after the section heading
      const sectionSlice = allContent.substring(
        sectionStartIdx,
        sectionStartIdx + 2000,
      );

      const hasTriggerScenarios =
        sectionSlice.includes('子 Agent 返回') ||
        sectionSlice.includes('sf_state_transition') ||
        sectionSlice.includes('触发场景');

      expect(hasTriggerScenarios).toBe(true);
    });
  });
});
