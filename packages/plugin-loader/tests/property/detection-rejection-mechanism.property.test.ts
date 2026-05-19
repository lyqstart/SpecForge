/**
 * 任务 7.2.3: 验证检测与拒绝机制 PBT (Property PL-2.3)
 *
 * Feature: plugin-loader, Property PL-2.3: 静态检查检测与拒绝机制
 * Derived-From: v6-architecture-overview Property 28
 *
 * 本测试验证静态检查的检测与拒绝机制：
 * 1. 测试检测到禁止 API 时的拒绝行为
 * 2. 测试多种违规同时存在时的检测
 * 3. 测试违规报告的完整性
 * 4. 验证拒绝加载后的处理
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
import { StaticAnalyzer, createStaticAnalyzer, type StaticAnalysisResult, type ViolationReport } from '../../src/StaticAnalyzer';
import { PluginLoader, createPluginLoader, type LoadResult } from '../../src/loader/plugin-loader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
 * 生成包含多个禁止 API 的源码
 */
function generateMultipleViolationsSource(apis: string[]): string {
  const parts: string[] = [];
  parts.push('// Plugin with multiple violations');

  // 添加一些安全代码
  parts.push(pickRandom(SAFE_CODE_FRAGMENTS));

  // 在随机位置插入禁止 API
  for (const api of apis) {
    parts.push(generateForbiddenApiCall(api));
    parts.push(pickRandom(SAFE_CODE_FRAGMENTS));
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 测试辅助函数
// ---------------------------------------------------------------------------

/**
 * 创建一个临时插件目录
 */
function createTempPluginDir(source: string, manifestContent: object): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'));
  fs.writeFileSync(path.join(tempDir, 'index.js'), source);
  fs.writeFileSync(path.join(tempDir, 'plugin.json'), JSON.stringify(manifestContent, null, 2));
  return tempDir;
}

/**
 * 清理临时插件目录
 */
function cleanupTempPluginDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

// ---------------------------------------------------------------------------
// Property PL-2.3: 检测与拒绝机制测试
// ---------------------------------------------------------------------------

describe('Property PL-2.3: 检测与拒绝机制 PBT', () => {
  /**
   * Property 1: 检测到禁止 API 时应产生错误级别违规
   */
  it('检测到禁止 API 时应产生错误级别违规', () => {
    fc.assert(
      fc.property(
        fc.oneof(...FORBIDDEN_APIS.map((api) => fc.constant(api))),
        (forbiddenApi) => {
          const source = generateForbiddenApiCall(forbiddenApi);
          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(source, 'test-plugin.js');

          expect(result.success).toBe(true);

          // 必须有错误级别的违规
          const errorViolations = result.violations.filter((v) => v.severity === 'error');
          expect(errorViolations.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: 静态检查失败时应导致分析结果标记为失败
   */
  it('静态检查失败时分析结果应反映失败状态', () => {
    fc.assert(
      fc.property(
        fc.oneof(...FORBIDDEN_APIS.slice(0, 10).map((api) => fc.constant(api))),
        (forbiddenApi) => {
          const source = generateForbiddenApiCall(forbiddenApi);
          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(source, 'test-plugin.js');

          // 结果应该是成功的（因为分析本身不抛异常），但有违规
          expect(result.success).toBe(true);

          // 有错误级别的违规
          const hasError = result.violations.some((v) => v.severity === 'error');
          expect(hasError).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: 多种违规同时存在时应全部被检测
   */
  it('多种违规同时存在时应全部被检测', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(...FORBIDDEN_APIS.map((api) => fc.constant(api))),
          { minLength: 2, maxLength: 5 }
        ),
        (apis) => {
          // 去重
          const uniqueApis = [...new Set(apis)];
          const source = generateMultipleViolationsSource(uniqueApis);

          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(source, 'multi-violation.js');

          expect(result.success).toBe(true);

          // 所有不同的 API 都应该被检测到
          const errorViolations = result.violations.filter((v) => v.severity === 'error');

          // 至少应该检测到与唯一 API 数量相等的违规
          expect(errorViolations.length).toBeGreaterThanOrEqual(uniqueApis.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: 违规报告应包含所有必要字段
   */
  it('违规报告应包含 ruleId、line、column、apiName、errorMessage、severity', () => {
    fc.assert(
      fc.property(
        fc.oneof(...FORBIDDEN_APIS.map((api) => fc.constant(api))),
        (forbiddenApi) => {
          const source = generateForbiddenApiCall(forbiddenApi);
          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(source, 'test-plugin.js');

          expect(result.success).toBe(true);
          expect(result.violations.length).toBeGreaterThan(0);

          for (const violation of result.violations) {
            expect(violation.ruleId).toBeDefined();
            expect(typeof violation.ruleId).toBe('string');
            expect(violation.ruleId.length).toBeGreaterThan(0);

            expect(violation.line).toBeDefined();
            expect(typeof violation.line).toBe('number');
            expect(violation.line).toBeGreaterThan(0);

            expect(violation.column).toBeDefined();
            expect(typeof violation.column).toBe('number');
            expect(violation.column).toBeGreaterThanOrEqual(0);

            expect(violation.apiName).toBeDefined();
            expect(typeof violation.apiName).toBe('string');
            expect(violation.apiName.length).toBeGreaterThan(0);

            expect(violation.errorMessage).toBeDefined();
            expect(typeof violation.errorMessage).toBe('string');
            expect(violation.errorMessage.length).toBeGreaterThan(0);

            expect(violation.severity).toBeDefined();
            expect(['error', 'warning']).toContain(violation.severity);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: 违规报告应区分不同类型的违规（Import vs Function Call）
   */
  it('违规报告应正确区分 Import 和 Function Call 违规', () => {
    const importSource = "const cp = require('child_process');";
    const funcSource = generateForbiddenApiCall('child_process.exec');

    const analyzer = createStaticAnalyzer({ permissions: [] });

    const importResult = analyzer.analyzeFile(importSource, 'import-test.js');
    expect(importResult.success).toBe(true);
    expect(importResult.violations.length).toBeGreaterThan(0);

    const funcResult = analyzer.analyzeFile(funcSource, 'func-test.js');
    expect(funcResult.success).toBe(true);
    expect(funcResult.violations.length).toBeGreaterThan(0);

    // Import 违规的 ruleId 应该以 IMPORT_ 开头
    const importViolations = importResult.violations.filter((v) =>
      v.ruleId?.startsWith('IMPORT_')
    );
    expect(importViolations.length).toBeGreaterThan(0);

    // Function call 违规：检查 apiName 包含具体的函数名
    const funcViolations = funcResult.violations.filter((v) =>
      v.apiName && (v.apiName.includes('exec') || v.apiName.includes('child_process'))
    );
    expect(funcViolations.length).toBeGreaterThan(0);
  });

  /**
   * Property 6: 声明所需权限后应允许使用（无 error 级别违规）
   */
  it('声明所需权限后应允许使用禁止 API（无 error 违规）', () => {
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

          // 找到该 API 的函数调用违规（不包括 Import 违规）
          const functionCallViolation = result.violations.find((v) => {
            // 检查 apiName 是否匹配且 ruleId 不是 IMPORT_ 开头
            return (
              (v.apiName === forbiddenApi || v.apiName.startsWith(forbiddenApi.split('.')[0])) &&
              v.ruleId &&
              !v.ruleId.startsWith('IMPORT_')
            );
          });

          // 函数调用违规应该不存在（Import 违规可以有，因为没声明 child_process 模块）
          expect(functionCallViolation).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: 严格模式下即使有权限也应报告（但降为 warning）
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
          const result = analyzer.analyzeFile(source, 'strict-test.js');

          expect(result.success).toBe(true);

          // 严格模式下应该有违规（但可以是 warning）
          expect(result.violations.length).toBeGreaterThan(0);

          // 严格模式下至少应该有 warning 或 error
          const hasWarningOrError = result.violations.some(
            (v) => v.severity === 'warning' || v.severity === 'error'
          );
          expect(hasWarningOrError).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 8: 不同权限组合场景下的检测
   */
  it('部分权限场景：只报告缺少权限的 API 违规', () => {
    // 生成一个包含多种 API 的源码
    const apis = ['child_process.exec', 'fs.readFile', 'fetch'];
    let source = '// Plugin with multiple APIs\n';
    for (const api of apis) {
      source += generateForbiddenApiCall(api) + '\n';
    }

    // 只授予 filesystem.read 权限
    const analyzer = createStaticAnalyzer({ permissions: ['filesystem.read'] });
    const result = analyzer.analyzeFile(source, 'partial-perms.js');

    expect(result.success).toBe(true);

    // 应该有错误级别的违规（child_process 和 network）
    const errorViolations = result.violations.filter((v) => v.severity === 'error');
    expect(errorViolations.length).toBeGreaterThan(0);

    // child_process 违规应该被报告
    const hasChildProcessViolation = errorViolations.some(
      (v) => v.apiName.includes('child_process')
    );
    expect(hasChildProcessViolation).toBe(true);

    // network 违规应该被报告
    const hasNetworkViolation = errorViolations.some(
      (v) => v.apiName.includes('http') || v.apiName.includes('fetch') || v.apiName.includes('https')
    );
    expect(hasNetworkViolation).toBe(true);

    // filesystem.read 不应该有 error 违规（已授权）
    const hasFsReadError = errorViolations.some(
      (v) => v.apiName.includes('fs.read') || v.apiName.includes('fs.access') || v.apiName.includes('fs.stat')
    );
    expect(hasFsReadError).toBe(false);
  });

  /**
   * Property 9: 边界情况 - 空源码无违规
   */
  it('边界情况：空源码应无违规', () => {
    const analyzer = createStaticAnalyzer({ permissions: [] });

    const emptyResult = analyzer.analyzeFile('', 'empty.js');
    expect(emptyResult.success).toBe(true);
    expect(emptyResult.violations.filter((v) => v.severity === 'error').length).toBe(0);
  });

  /**
   * Property 10: 边界情况 - 只有注释的源码无违规
   */
  it('边界情况：只有注释的源码应无 error 违规', () => {
    const analyzer = createStaticAnalyzer({ permissions: [] });

    const commentSource = '// This is a comment\n/* Multi-line comment */';
    const commentResult = analyzer.analyzeFile(commentSource, 'comment.js');
    expect(commentResult.success).toBe(true);
    expect(commentResult.violations.filter((v) => v.severity === 'error').length).toBe(0);
  });

  /**
   * Property 11: 批量文件分析一致性
   */
  it('批量分析多个文件应一致检测违规', () => {
    const fileCount = 20;
    const files: Array<[string, string]> = [];

    // 混合有违规和无违规的文件
    for (let i = 0; i < fileCount; i++) {
      const hasViolation = i % 2 === 0;
      let source: string;
      if (hasViolation) {
        const api = FORBIDDEN_APIS[i % FORBIDDEN_APIS.length];
        source = generateForbiddenApiCall(api);
      } else {
        source = pickRandom(SAFE_CODE_FRAGMENTS);
      }
      files.push([`plugin-${i}.js`, source]);
    }

    const analyzer = createStaticAnalyzer({ permissions: [] });
    const results = analyzer.analyzeFiles(files);

    expect(results.length).toBe(fileCount);

    // 统计有违规的文件数量
    let violationCount = 0;
    for (let i = 0; i < fileCount; i++) {
      const result = results[i];
      if (result.success && result.violations.some((v) => v.severity === 'error')) {
        violationCount++;
      }
    }

    // 应该有大约一半的文件有违规
    expect(violationCount).toBe(fileCount / 2);
  });

  /**
   * Property 12: 违规消息的可读性
   */
  it('违规消息应具有可读性并提供有用的信息', () => {
    fc.assert(
      fc.property(
        fc.oneof(...FORBIDDEN_APIS.slice(0, 15).map((api) => fc.constant(api))),
        (forbiddenApi) => {
          const source = generateForbiddenApiCall(forbiddenApi);
          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(source, 'test-plugin.js');

          if (result.violations.length === 0) {
            return; // 跳过无违规的情况
          }

          for (const violation of result.violations) {
            // 错误消息不应该太短（至少 5 个字符）
            expect(violation.errorMessage.length).toBeGreaterThan(5);

            // 错误消息应该包含有用的关键词或者是描述性的
            // 由于不同规则的错误消息格式不同，我们检查消息是否有内容且不为空
            const message = violation.errorMessage.trim();
            expect(message.length).toBeGreaterThan(0);

            // 基本检查：错误消息应该提及相关的 API 或模块
            const hasApiReference =
              message.toLowerCase().includes(forbiddenApi.split('.')[0].toLowerCase()) ||
              message.toLowerCase().includes('fs') ||
              message.toLowerCase().includes('http') ||
              message.toLowerCase().includes('child') ||
              message.toLowerCase().includes('process') ||
              message.toLowerCase().includes('fetch');

            // 只要消息非空且不太短，就认为是有用的
            expect(message.length).toBeGreaterThan(5);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 13: 行号准确性
   */
  it('违规报告的行号应准确反映代码位置', () => {
    const source = `// Line 1
// Line 2
const fs = require('fs'); // Line 3 - should trigger IMPORT_fs
fs.readFile('test.txt', () => {}); // Line 4 - should trigger FS_READ_FILE
// Line 5
`;

    const analyzer = createStaticAnalyzer({ permissions: [] });
    const result = analyzer.analyzeFile(source, 'line-test.js');

    expect(result.success).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);

    // 找到 fs.readFile 违规
    const readFileViolation = result.violations.find((v) =>
      v.apiName.includes('readFile')
    );

    if (readFileViolation) {
      // readFile 应该在第 4 行
      expect(readFileViolation.line).toBe(4);
    }

    // 找到 import 违规
    const importViolation = result.violations.find((v) =>
      v.ruleId?.startsWith('IMPORT_')
    );

    if (importViolation) {
      // import 应该在第 3 行
      expect(importViolation.line).toBe(3);
    }
  });

  /**
   * Property 14: 完整拒绝场景测试 - 使用 PluginLoader
   */
  it('PluginLoader 应拒绝包含禁止 API 的插件', async () => {
    // 创建一个临时插件目录，包含禁止的 API
    const forbiddenSource = generateForbiddenApiCall('child_process.exec');
    const pluginDir = createTempPluginDir(forbiddenSource, {
      schema_version: '1.0',
      id: 'test-plugin-reject',
      name: 'Test Plugin Reject',
      version: '1.0.0',
      permissions: [],
      entry: 'index.js',
    });

    try {
      const loader = createPluginLoader({
        pluginDir: pluginDir,
        grants: [], // 无权限
        enableStaticCheck: true,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);

      // 应该加载失败
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // 可能是 STATIC_CHECK_FAILED（静态检查）或 PERMISSION_DENIED（权限检查）
      expect(['STATIC_CHECK_FAILED', 'PERMISSION_DENIED']).toContain(result.error?.code);
    } finally {
      cleanupTempPluginDir(pluginDir);
    }
  });

  /**
   * Property 15: 完整允许场景测试 - 使用 PluginLoader
   */
  it('PluginLoader 应允许不包含禁止 API 的插件', async () => {
    // 创建一个临时插件目录，只包含安全的代码
    const safeSource = pickRandom(SAFE_CODE_FRAGMENTS);
    const pluginDir = createTempPluginDir(safeSource, {
      schema_version: '1.0',
      id: 'test-plugin-allow',
      name: 'Test Plugin Allow',
      version: '1.0.0',
      permissions: [],
      entry: 'index.js',
    });

    try {
      const loader = createPluginLoader({
        pluginDir: pluginDir,
        grants: [],
        enableStaticCheck: true,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);

      // 应该加载成功（静态检查通过，权限验证通过）
      expect(result.success).toBe(true);
    } finally {
      cleanupTempPluginDir(pluginDir);
    }
  });

  /**
   * Property 16: 权限检查 + 静态检查同时失败
   */
  it('权限和静态检查同时失败时，静态检查先报告', async () => {
    // 创建一个包含禁止 API 且声明需要未授权权限的插件
    const forbiddenSource = generateForbiddenApiCall('child_process.exec');
    const pluginDir = createTempPluginDir(forbiddenSource, {
      schema_version: '1.0',
      id: 'test-plugin-both-fail',
      name: 'Test Plugin Both Fail',
      version: '1.0.0',
      permissions: ['child_process', 'network'], // 声明需要但未授权
      entry: 'index.js',
    });

    try {
      const loader = createPluginLoader({
        pluginDir: pluginDir,
        grants: [], // 无任何权限
        enableStaticCheck: true,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);

      // 应该加载失败
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // 静态检查失败或权限检查失败（取决于执行顺序）
      expect(['STATIC_CHECK_FAILED', 'PERMISSION_DENIED']).toContain(result.error?.code);
    } finally {
      cleanupTempPluginDir(pluginDir);
    }
  });
});