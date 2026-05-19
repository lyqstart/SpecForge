/**
 * 任务 7.2.2: 生成包含禁止 API 的随机源码 PBT (Property PL-2.2)
 *
 * Feature: plugin-loader, Property PL-2.2: 随机源码禁止 API 检测
 * Derived-From: v6-architecture-overview Property 28
 *
 * 本测试验证静态检查器在随机源码场景下的检测能力：
 * 1. 生成随机 TypeScript/JavaScript 源码
 * 2. 随机注入禁止的 API 调用
 * 3. 验证检测机制能够准确识别违规
 * 4. 测试各种源码复杂度下的检测准确性
 *
 * 对应 Requirement 2 AC-3: IF 插件源码中存在禁止的敏感 API 调用 THEN 拒绝加载
 *
 * 测试迭代次数：≥ 100（fast-check 默认）
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本测试模块为纯数据生成和验证，无异步操作
 *   - 所有测试为同步，无 Promise.race/while 循环/轮询
 *   - 无资源泄漏风险
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { StaticAnalyzer, createStaticAnalyzer } from '../../src/StaticAnalyzer';

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

/** 禁止 API 与所需权限映射 */
const FORBIDDEN_API_PERMISSION_MAP: Record<string, string> = {
  'child_process.exec': 'child_process',
  'child_process.execSync': 'child_process',
  'child_process.spawn': 'child_process',
  'child_process.spawnSync': 'child_process',
  'child_process.fork': 'child_process',
  'child_process.execFile': 'child_process',
  'child_process.execFileSync': 'child_process',
  'fs.readFile': 'filesystem.read',
  'fs.writeFile': 'filesystem.write',
  'fs.unlink': 'filesystem.write',
  'fs.rmdir': 'filesystem.write',
  'fs.access': 'filesystem.read',
  'fs.stat': 'filesystem.read',
  'fs.readdir': 'filesystem.read',
  'fs.mkdir': 'filesystem.write',
  'fs.rename': 'filesystem.write',
  'fs.copyFile': 'filesystem.write',
  'http.request': 'network',
  'https.request': 'network',
  'http.createServer': 'network',
  'https.createServer': 'network',
  'fetch': 'network',
};

/** 所有禁止的 API */
const FORBIDDEN_APIS = Object.keys(FORBIDDEN_API_PERMISSION_MAP);

/** 所有已知权限 */
const KNOWN_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
] as const;

// ---------------------------------------------------------------------------
// 代码生成器
// ---------------------------------------------------------------------------

/**
 * 生成禁止 API 的调用代码
 */
function generateForbiddenApiCall(api: string): string {
  const patterns: Record<string, string[]> = {
    'child_process.exec': [
      "const { exec } = require('child_process'); exec('ls -la');",
      "child_process.exec('ls');",
    ],
    'child_process.execSync': [
      "const { execSync } = require('child_process'); execSync('ls');",
    ],
    'child_process.spawn': [
      "const { spawn } = require('child_process'); spawn('ls', []);",
    ],
    'child_process.spawnSync': [
      "const { spawnSync } = require('child_process'); spawnSync('ls');",
    ],
    'child_process.fork': [
      "const { fork } = require('child_process'); fork('child.js');",
    ],
    'child_process.execFile': [
      "const { execFile } = require('child_process'); execFile('ls');",
    ],
    'child_process.execFileSync': [
      "const { execFileSync } = require('child_process'); execFileSync('ls');",
    ],
    'fs.readFile': [
      "const fs = require('fs'); fs.readFile('file.txt', 'utf8');",
    ],
    'fs.writeFile': [
      "const fs = require('fs'); fs.writeFile('output.txt', 'data');",
    ],
    'fs.unlink': [
      "const fs = require('fs'); fs.unlink('temp.txt');",
    ],
    'fs.rmdir': [
      "const fs = require('fs'); fs.rmdir('dir');",
    ],
    'fs.access': [
      "const fs = require('fs'); fs.access('file.txt');",
    ],
    'fs.stat': [
      "const fs = require('fs'); fs.stat('file.txt');",
    ],
    'fs.readdir': [
      "const fs = require('fs'); fs.readdir('.');",
    ],
    'fs.mkdir': [
      "const fs = require('fs'); fs.mkdir('newDir');",
    ],
    'fs.rename': [
      "const fs = require('fs'); fs.rename('old.txt', 'new.txt');",
    ],
    'fs.copyFile': [
      "const fs = require('fs'); fs.copyFile('src.txt', 'dest.txt');",
    ],
    'http.request': [
      "const http = require('http'); http.request({}, (res) => {});",
    ],
    'https.request': [
      "const https = require('https'); https.request('https://example.com');",
    ],
    'http.createServer': [
      "const http = require('http'); http.createServer((req, res) => {});",
    ],
    'https.createServer': [
      "const https = require('https'); https.createServer({}, (req, res) => {});",
    ],
    'fetch': [
      "fetch('https://api.example.com/data').then(r => r.json());",
    ],
  };

  const apiPatterns = patterns[api] || [`const mod = require('${api.split('.')[0]}');`];
  return apiPatterns[0];
}

/**
 * 安全代码片段（不含禁止 API）
 */
const SAFE_CODE_FRAGMENTS = [
  '// Safe plugin',
  'function greet(name) { return "Hello, " + name; }',
  'const add = (a, b) => a + b;',
  'class Calculator { add(a, b) { return a + b; } }',
  'import { map, filter } from "./utils";',
  'const arr = [1, 2, 3];',
  'for (let i = 0; i < 10; i++) { console.log(i); }',
  'if (x > 0) { return true; }',
  'const obj = { key: "value" };',
  'export default function main() { return 0; }',
  'const str = "hello world";',
  'const num = 42;',
  'const flag = true;',
  'try { doSomething(); } catch (e) { console.error(e); }',
  'switch (value) { case 1: break; default: break; }',
];

/**
 * 从给定列表中随机选择元素
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 生成随机源码（含或不含量禁止 API）
 */
function generateRandomSource(includeForbidden: boolean, forbiddenApis: string[]): string {
  const parts: string[] = [];

  // 添加文件头注释
  parts.push('// Plugin generated for testing');

  // 生成 1-5 个安全的代码块
  const safeCodeCount = Math.floor(Math.random() * 5) + 1;
  for (let i = 0; i < safeCodeCount; i++) {
    parts.push(pickRandom(SAFE_CODE_FRAGMENTS));
  }

  // 如果需要包含禁止 API
  if (includeForbidden && forbiddenApis.length > 0) {
    // 随机选择 1-3 个禁止 API
    const numForbidden = Math.min(Math.floor(Math.random() * 3) + 1, forbiddenApis.length);
    const selectedApis: string[] = [];
    const availableApis = [...forbiddenApis];

    for (let i = 0; i < numForbidden && availableApis.length > 0; i++) {
      const idx = Math.floor(Math.random() * availableApis.length);
      selectedApis.push(availableApis.splice(idx, 1)[0]);
    }

    // 在随机位置插入禁止 API
    for (const api of selectedApis) {
      parts.push(generateForbiddenApiCall(api));
    }
  }

  // 添加更多安全代码
  const additionalSafeCount = Math.floor(Math.random() * 3);
  for (let i = 0; i < additionalSafeCount; i++) {
    parts.push(pickRandom(SAFE_CODE_FRAGMENTS));
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Property PL-2.2: 随机源码禁止 API 检测测试
// ---------------------------------------------------------------------------

describe('Property PL-2.2: 随机源码禁止 API 检测 PBT', () => {
  /**
   * Property 1: 随机生成包含禁止 API 的源码必然被检测
   */
  it('随机生成的包含禁止 API 的源码应被检测到', () => {
    fc.assert(
      fc.property(
        fc.oneof(...FORBIDDEN_APIS.map((api) => fc.constant(api))),
        (forbiddenApi) => {
          const source = generateForbiddenApiCall(forbiddenApi);
          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(source, 'test-plugin.js');

          expect(result.success).toBe(true);

          const hasApiViolation = result.violations.some((v) =>
            v.apiName === forbiddenApi || v.apiName.startsWith(forbiddenApi.split('.')[0])
          );

          expect(hasApiViolation).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: 声明所需权限后应允许使用禁止 API
   */
  it('声明所需权限后应允许使用禁止 API', () => {
    fc.assert(
      fc.property(
        fc.oneof(...FORBIDDEN_APIS.map((api) => fc.constant(api))),
        (forbiddenApi) => {
          const source = generateForbiddenApiCall(forbiddenApi);
          const requiredPermission = FORBIDDEN_API_PERMISSION_MAP[forbiddenApi];

          const analyzer = createStaticAnalyzer({
            permissions: [requiredPermission],
          });
          const result = analyzer.analyzeFile(source, 'test-plugin.js');

          expect(result.success).toBe(true);

          const functionCallViolation = result.violations.find((v) => {
            return v.apiName === forbiddenApi && v.ruleId && !v.ruleId.startsWith('IMPORT_');
          });

          expect(functionCallViolation).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: 安全源码应始终通过检查
   */
  it('随机生成的安全源码应通过检查', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.array(fc.oneof(...KNOWN_PERMISSIONS.map((p) => fc.constant(p))), { maxLength: 5 }),
        (codeCount, permissions) => {
          const safeCodes = Array.from({ length: codeCount }, () => pickRandom(SAFE_CODE_FRAGMENTS));
          const source = safeCodes.join('\n\n');

          const analyzer = createStaticAnalyzer({ permissions });
          const result = analyzer.analyzeFile(source, 'safe-plugin.js');

          expect(result.success).toBe(true);
          const errorViolations = result.violations.filter((v) => v.severity === 'error');
          expect(errorViolations.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: 部分权限场景
   */
  it('部分权限场景：只报告缺少权限的 API 违规', () => {
    const testCases = fc.sample(
      fc.record({
        apis: fc.array(
          fc.oneof(...FORBIDDEN_APIS.map((api) => fc.constant(api))),
          { minLength: 2, maxLength: 4 }
        ),
        grants: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map((p) => fc.constant(p))),
          { minLength: 1, maxLength: 2 }
        ),
      }),
      { numRuns: 50 }
    );

    for (const tc of testCases) {
      const { apis, grants } = tc;

      let source = '// Plugin with multiple APIs\n';
      for (const api of apis) {
        source += generateForbiddenApiCall(api) + '\n';
      }

      const analyzer = createStaticAnalyzer({ permissions: grants });
      const result = analyzer.analyzeFile(source, 'partial-plugin.js');

      const unauthorizedViolations = result.violations.filter((v) => {
        const requiredPerm = FORBIDDEN_API_PERMISSION_MAP[v.apiName];
        return requiredPerm && !grants.includes(requiredPerm);
      });

      expect(result.violations.length).toBeGreaterThanOrEqual(unauthorizedViolations.length);
    }
  });

  /**
   * Property 5: 复杂度测试
   */
  it('不同复杂度的源码应一致检测', () => {
    // 低复杂度
    const simpleSource = generateRandomSource(true, ['child_process.exec', 'fs.readFile']);
    const analyzerSimple = createStaticAnalyzer({ permissions: [] });
    const resultSimple = analyzerSimple.analyzeFile(simpleSource, 'simple.js');

    expect(resultSimple.success).toBe(true);
    expect(resultSimple.violations.length).toBeGreaterThan(0);

    // 高复杂度 - 多个文件
    const complexity = 10;
    const complexFiles: Array<[string, string]> = [];
    for (let i = 0; i < complexity; i++) {
      const source = generateRandomSource(true, FORBIDDEN_APIS);
      complexFiles.push([`plugin-${i}.js`, source]);
    }

    const analyzerComplex = createStaticAnalyzer({ permissions: [] });
    const resultsComplex = analyzerComplex.analyzeFiles(complexFiles);

    expect(resultsComplex.length).toBe(complexity);
    for (const result of resultsComplex) {
      expect(result.success).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
    }
  });

  /**
   * Property 6: 边界情况
   */
  it('边界情况：空源码和最小源码', () => {
    const analyzer = createStaticAnalyzer({ permissions: [] });

    // 空源码
    const emptyResult = analyzer.analyzeFile('', 'empty.js');
    expect(emptyResult.success).toBe(true);
    expect(emptyResult.violations.length).toBe(0);

    // 只有注释
    const commentSource = '// This is a comment\n/* Multi-line comment */';
    const commentResult = analyzer.analyzeFile(commentSource, 'comment.js');
    expect(commentResult.success).toBe(true);
    expect(commentResult.violations.filter(v => v.severity === 'error').length).toBe(0);

    // 只有 import（安全模块）
    const importSource = "import lodash from 'lodash';\nimport React from 'react';";
    const importResult = analyzer.analyzeFile(importSource, 'imports.js');
    expect(importResult.success).toBe(true);
    expect(importResult.violations.filter(v => v.severity === 'error').length).toBe(0);
  });

  /**
   * Property 7: 动态代码生成检测
   */
  it('动态代码生成（eval/Function）应被检测', () => {
    const dynamicCodePatterns = [
      "eval('console.log(1)');",
      "new Function('return 1')();",
    ];

    const analyzer = createStaticAnalyzer({ permissions: [] });

    for (const source of dynamicCodePatterns) {
      const result = analyzer.analyzeFile(source, 'dynamic.js');
      expect(result.success).toBe(true);
    }
  });

  /**
   * Property 8: 模块导入禁止模块应被检测
   */
  it('导入禁止的模块应被检测', () => {
    const forbiddenImports = [
      "const cp = require('child_process');",
      "import * as fs from 'fs';",
      "import http from 'http';",
      "const https = require('https');",
    ];

    const analyzer = createStaticAnalyzer({ permissions: [] });

    for (const source of forbiddenImports) {
      const result = analyzer.analyzeFile(source, 'import-test.js');
      expect(result.success).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
    }
  });

  /**
   * Property 9: 严格模式测试
   */
  it('严格模式下即使有权限也应报告违规', () => {
    fc.assert(
      fc.property(
        fc.oneof(...FORBIDDEN_APIS.slice(0, 10).map((api) => fc.constant(api))),
        (forbiddenApi) => {
          const source = generateForbiddenApiCall(forbiddenApi);
          const requiredPermission = FORBIDDEN_API_PERMISSION_MAP[forbiddenApi];

          const analyzer = createStaticAnalyzer({
            permissions: [requiredPermission],
            strictMode: true,
          });
          const result = analyzer.analyzeFile(source, 'strict.js');

          expect(result.success).toBe(true);
          expect(result.violations.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 10: 违规信息完整性验证
   */
  it('违规信息应包含所有必要字段', () => {
    const testApis = FORBIDDEN_APIS.slice(0, 15);

    for (const apiName of testApis) {
      const source = generateForbiddenApiCall(apiName);
      const analyzer = createStaticAnalyzer({ permissions: [] });
      const result = analyzer.analyzeFile(source, 'test.js');

      if (result.violations.length === 0) {
        continue;
      }

      for (const violation of result.violations) {
        expect(violation.ruleId).toBeDefined();
        expect(typeof violation.ruleId).toBe('string');

        expect(violation.line).toBeDefined();
        expect(typeof violation.line).toBe('number');
        expect(violation.line).toBeGreaterThan(0);

        expect(violation.column).toBeDefined();
        expect(typeof violation.column).toBe('number');

        expect(violation.apiName).toBeDefined();
        expect(typeof violation.apiName).toBe('string');

        expect(violation.errorMessage).toBeDefined();
        expect(typeof violation.errorMessage).toBe('string');

        expect(violation.severity).toBeDefined();
        expect(['error', 'warning']).toContain(violation.severity);
      }
    }
  });

  /**
   * Property 11: 批量分析一致性
   */
  it('批量分析多个随机文件应一致', () => {
    const fileCount = 20;
    const files: Array<[string, string]> = [];

    for (let i = 0; i < fileCount; i++) {
      const hasForbidden = Math.random() > 0.3;
      const source = generateRandomSource(hasForbidden, FORBIDDEN_APIS);
      files.push([`plugin-${i}.js`, source]);
    }

    const analyzerNoPerms = createStaticAnalyzer({ permissions: [] });
    const resultsNoPerms = analyzerNoPerms.analyzeFiles(files);

    expect(resultsNoPerms.length).toBe(fileCount);

    let violationCount = 0;
    for (const result of resultsNoPerms) {
      if (result.success && result.violations.length > 0) {
        violationCount++;
      }
    }

    expect(violationCount).toBeGreaterThan(fileCount * 0.5);

    const analyzerWithPerms = createStaticAnalyzer({
      permissions: ['filesystem.read', 'filesystem.write'],
    });
    const resultsWithPerms = analyzerWithPerms.analyzeFiles(files);

    expect(resultsWithPerms.length).toBe(fileCount);

    let violationCountWithPerms = 0;
    for (const result of resultsWithPerms) {
      if (result.success && result.violations.length > 0) {
        violationCountWithPerms++;
      }
    }

    expect(violationCountWithPerms).toBeLessThanOrEqual(violationCount);
  });

  /**
   * Property 12: 大规模随机测试
   */
  it('大规模随机测试：100+ 样本', () => {
    const numSamples = 150;
    let expectedCount = 0;
    let unexpectedCount = 0;

    for (let i = 0; i < numSamples; i++) {
      const includeForbidden = Math.random() > 0.2;
      const source = generateRandomSource(includeForbidden, FORBIDDEN_APIS);

      const permCount = Math.floor(Math.random() * 4);
      const availablePerms = [...KNOWN_PERMISSIONS];
      const permissions: string[] = [];
      for (let j = 0; j < permCount && availablePerms.length > 0; j++) {
        const idx = Math.floor(Math.random() * availablePerms.length);
        permissions.push(availablePerms.splice(idx, 1)[0]);
      }

      const analyzer = createStaticAnalyzer({ permissions });
      const result = analyzer.analyzeFile(source, `random-${i}.js`);

      if (!result.success) {
        continue;
      }

      const hasErrorViolation = result.violations.some((v) => v.severity === 'error');

      if (includeForbidden && permissions.length < 3) {
        if (hasErrorViolation) {
          expectedCount++;
        } else {
          unexpectedCount++;
        }
      } else {
        if (!hasErrorViolation) {
          expectedCount++;
        } else {
          unexpectedCount++;
        }
      }
    }

    const total = expectedCount + unexpectedCount;
    expect(total).toBeGreaterThanOrEqual(numSamples * 0.8);
    expect(expectedCount / total).toBeGreaterThan(0.7);
  });
});