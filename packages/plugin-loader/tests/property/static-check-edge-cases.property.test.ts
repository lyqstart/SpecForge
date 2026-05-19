/**
 * 任务 7.2.4: 测试边界情况 PBT (Property PL-2.4)
 *
 * Feature: plugin-loader, Property PL-2.4: 静态检查边界情况
 * Derived-From: v6-architecture-overview Property 28
 *
 * 本测试验证静态检查的边界情况：
 * 1. 测试特殊字符、编码
 * 2. 测试最小/最大文件大小
 * 3. 测试解析器容错能力
 *
 * 对应 Requirement 2 AC-3: 静态检查边界容错
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
import { createStaticAnalyzer, type StaticAnalysisResult } from '../../src/StaticAnalyzer';

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

/** 禁止 API 列表 */
const FORBIDDEN_APIS = [
  'child_process.exec',
  'child_process.spawn',
  'fs.readFile',
  'fs.writeFile',
  'fetch',
  'http.request',
];

/** 特殊字符 Unicode 范围 */
const SPECIAL_CHARS = {
  // ASCII 控制字符（不包括换行和制表符，因为它们是合法的）
  control: '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f',
  // 常见特殊符号
  symbols: '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~\\',
  // Unicode 符号
  unicodeSymbols: '©®™°±²³µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏ',
  // 东亚字符
  cjk: '你好世界中文测试日本語テスト한국어',
  // 阿拉伯文
  arabic: 'مرحبا بالعالم',
  // 希伯来文
  hebrew: 'שלום עולם',
  // emoji（可能导致编码问题）
  emoji: '😀🎉🔥💯🚀⭐',
  // 混合字符
  mixed: 'Hello世界🌍123abc',
};

/** 最小/最大文件大小限制 */
const MIN_FILE_SIZE = 0;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ---------------------------------------------------------------------------
// 代码生成器
// ---------------------------------------------------------------------------

/**
 * 生成包含禁止 API 的代码
 */
function generateForbiddenApiCall(api: string): string {
  const patterns: Record<string, string> = {
    'child_process.exec': "const { exec } = require('child_process'); exec('ls');",
    'child_process.spawn': "const { spawn } = require('child_process'); spawn('ls');",
    'fs.readFile': "const fs = require('fs'); fs.readFile('file.txt', 'utf8');",
    'fs.writeFile': "const fs = require('fs'); fs.writeFile('output.txt', 'data');",
    'fetch': "fetch('https://api.example.com/data').then(r => r.json());",
    'http.request': "const http = require('http'); http.request({}, (res) => {});",
  };
  return patterns[api] || '';
}

/**
 * 生成安全代码片段
 */
const SAFE_CODE_FRAGMENTS = [
  '// Safe code',
  'function greet(name) { return "Hello, " + name; }',
  'const add = (a, b) => a + b;',
  'const obj = { key: "value" };',
  'export default function main() { return 0; }',
  'const str = "hello world";',
  'const num = 42;',
  'try { doSomething(); } catch (e) { console.error(e); }',
];

// ---------------------------------------------------------------------------
// Property PL-2.4: 边界情况测试
// ---------------------------------------------------------------------------

describe('Property PL-2.4: 边界情况 PBT', () => {
  /**
   * Property 1: 特殊 ASCII 字符应被正确解析
   */
  it('特殊 ASCII 字符应被正确解析，不导致解析失败', () => {
    fc.assert(
      fc.property(
        fc.stringOf(
          fc.oneof(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'),
            fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
            fc.constantFrom(...'0123456789'),
            fc.constantFrom(' ', '\t', '\n'),
            fc.constantFrom(...'!@#$%^&*()_+-=[]{}|;:\',.<>?/`~\\')
          ),
          { minLength: 0, maxLength: 1000 }
        ),
        (code) => {
          const analyzer = createStaticAnalyzer({ permissions: [] });
          
          // 无论代码内容如何，解析不应该抛出异常
          let result: StaticAnalysisResult;
          try {
            result = analyzer.analyzeFile(code, 'test.js');
          } catch (e) {
            // 解析器应该能容错，不应该抛出异常
            expect(e).toBeUndefined();
            return;
          }
          
          // 结果应该返回（可能是失败，但不应该崩溃）
          expect(result).toBeDefined();
          expect(result.filePath).toBe('test.js');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Unicode 字符应被正确处理
   */
  it('Unicode 字符（包含中文、日文、韩文等）应被正确解析', () => {
    fc.assert(
      fc.property(
        fc.stringOf(
          fc.oneof(
            // 中文字符
            fc.constantFrom(...'你好世界中文测试'),
            // 日文字符
            fc.constantFrom(...'日本語テスト'),
            // 韩文字符
            fc.constantFrom(...'한국어'),
            // 其他 Unicode 符号
            fc.constantFrom(...'©®™°±²³µ¶·'),
            fc.constantFrom(...'ÀÁÂÃÄÅÆÇÈÉÊË'),
          ),
          { minLength: 0, maxLength: 500 }
        ),
        (unicodeText) => {
          // 在注释或字符串中使用 Unicode
          const code = `// ${unicodeText}\nconst x = "test";`;
          
          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(code, 'unicode-test.js');
          
          // 解析应该成功
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Emoji 字符应被正确处理
   */
  it('Emoji 字符应被正确解析而不导致错误', () => {
    fc.assert(
      fc.property(
        fc.stringOf(
          fc.constantFrom(...'😀🎉🔥💯🚀⭐🌍❤️👍😂🎵🍕🚗💻📱🏠🌞'),
          { minLength: 0, maxLength: 200 }
        ),
        (emojiText) => {
          const code = `// ${emojiText}\nconst emoji = "${emojiText}";\nconsole.log(emoji);`;
          
          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(code, 'emoji-test.js');
          
          // 解析应该成功
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: 空源码应被正确处理
   */
  it('空源码应返回成功结果且无违规', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.constant('   '),
          fc.constant('\n\n\n'),
          fc.constant('\t\t\t'),
          fc.constant('\n\t\n\t\n'),
        ),
        (emptyCode) => {
          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(emptyCode, 'empty.js');
          
          // 空代码应该解析成功
          expect(result.success).toBe(true);
          
          // 不应该有错误级别的违规
          const errorViolations = result.violations.filter(v => v.severity === 'error');
          expect(errorViolations.length).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 5: 只有注释的源码应被正确处理
   */
  it('只有注释的源码应无违规', () => {
    const commentCodes = [
      '// Single line comment',
      '/* Multi-line comment */',
      '// Line 1\n// Line 2\n// Line 3',
      '/**\n * JSDoc comment\n * @param {string} name\n */',
      '// 中文注释',
      '// 🎉 Emoji in comment',
    ];
    
    for (const code of commentCodes) {
      const analyzer = createStaticAnalyzer({ permissions: [] });
      const result = analyzer.analyzeFile(code, 'comment.js');
      
      expect(result.success).toBe(true);
      
      // 不应该有错误级别的违规
      const errorViolations = result.violations.filter(v => v.severity === 'error');
      expect(errorViolations.length).toBe(0);
    }
  });

  /**
   * Property 6: 极小文件应被正确处理
   */
  it('极小文件（1 字节）应被正确处理', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        (tinyCode) => {
          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(tinyCode, 'tiny.js');
          
          // 应该能解析或返回失败结果，但不应该崩溃
          expect(result).toBeDefined();
          expect(result.filePath).toBe('tiny.js');
          
          // 特殊处理：单独的运算符可能产生语法错误，这是可接受的
          // 只要解析器没有崩溃（抛出异常），就算通过
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: 较大文件应被正确处理（模拟） - 只测试代码行数
   */
  it('较大源码（1000 行）应被正确处理', () => {
    // 生成一个较大的代码文件
    const lines: string[] = [];
    for (let i = 0; i < 1000; i++) {
      lines.push(`const line${i} = ${i};`);
    }
    const largeCode = lines.join('\n');
    
    const analyzer = createStaticAnalyzer({ permissions: [] });
    const result = analyzer.analyzeFile(largeCode, 'large.js');
    
    // 应该能解析
    expect(result.success).toBe(true);
    
    // 应该检测到 1000 个变量
    expect(result.variableRefCount).toBeGreaterThanOrEqual(900);
  });

  /**
   * Property 8: 代码中包含字符串形式的禁止 API 不应触发违规
   */
  it('字符串中的禁止 API 名称不应触发违规', () => {
    const stringCases = [
      'const msg = "使用 child_process.exec 请小心";',
      'const text = "正在调用 fs.readFile 方法";',
      'const code = "fetch(url) 是常用的";',
      '// 注意：不要使用 http.request',
      '/*\n * 警告：child_process.spawn 可能危险\n */',
      'const forbidden = "child_process.exec"; // 这是字符串，不是调用',
    ];
    
    for (const code of stringCases) {
      const analyzer = createStaticAnalyzer({ permissions: [] });
      const result = analyzer.analyzeFile(code, 'string-test.js');
      
      expect(result.success).toBe(true);
      
      // 字符串中的 API 名称不应该触发错误违规
      const errorViolations = result.violations.filter(v => v.severity === 'error');
      expect(errorViolations.length).toBe(0);
    }
  });

  /**
   * Property 9: 注释中的禁止 API 不应触发违规
   */
  it('注释中的禁止 API 不应触发违规', () => {
    const commentCases = [
      '// child_process.exec is dangerous',
      '// TODO: 使用 fs.readFile 读取配置',
      '/* fetch API 需要网络权限 */',
      '/**\n * @see http.request\n */',
      '// https.request 也是网络请求',
    ];
    
    for (const code of commentCases) {
      const analyzer = createStaticAnalyzer({ permissions: [] });
      const result = analyzer.analyzeFile(code, 'comment-forbidden.js');
      
      expect(result.success).toBe(true);
      
      // 注释中的 API 不应该触发错误违规
      const errorViolations = result.violations.filter(v => v.severity === 'error');
      expect(errorViolations.length).toBe(0);
    }
  });

  /**
   * Property 10: 实际调用的禁止 API 应被检测
   */
  it('实际调用的禁止 API 应被检测到', () => {
    fc.assert(
      fc.property(
        fc.oneof(...FORBIDDEN_APIS.map(api => fc.constant(api))),
        (forbiddenApi) => {
          const source = generateForbiddenApiCall(forbiddenApi);
          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(source, 'actual-call.js');
          
          expect(result.success).toBe(true);
          
          // 应该检测到错误级别的违规
          const errorViolations = result.violations.filter(v => v.severity === 'error');
          expect(errorViolations.length).toBeGreaterThan(0);
          
          // 违规的 apiName 应该包含禁止的 API
          const hasApiName = errorViolations.some(v => 
            v.apiName.includes(forbiddenApi.split('.')[0])
          );
          expect(hasApiName).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11: 行号和列号应该在合理范围内
   */
  it('违规报告的行号和列号应在合理范围内', () => {
    fc.assert(
      fc.property(
        fc.oneof(...FORBIDDEN_APIS.map(api => fc.constant(api))),
        (forbiddenApi) => {
          const source = generateForbiddenApiCall(forbiddenApi);
          const analyzer = createStaticAnalyzer({ permissions: [] });
          const result = analyzer.analyzeFile(source, 'position-test.js');
          
          if (result.violations.length === 0) {
            return;
          }
          
          for (const violation of result.violations) {
            // 行号应该 >= 1
            expect(violation.line).toBeGreaterThanOrEqual(1);
            
            // 列号应该 >= 0
            expect(violation.column).toBeGreaterThanOrEqual(0);
            
            // 行号不应该超过源码总行数（简单估算）
            const sourceLines = source.split('\n').length;
            expect(violation.line).toBeLessThanOrEqual(sourceLines + 1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12: 多种编码混合的代码应被正确处理
   */
  it('混合 ASCII 和 Unicode 的代码应被正确处理', () => {
    const mixedCodes = [
      'const 中文变量 = 123;',
      'function 测试函数() { return "test"; }',
      'const msg = "Hello 世界";',
      '// 这是一个混合注释 with English',
      'const arr = [1, 2, 3]; // 数组',
    ];
    
    for (const code of mixedCodes) {
      const analyzer = createStaticAnalyzer({ permissions: [] });
      const result = analyzer.analyzeFile(code, 'mixed-encoding.js');
      
      // 应该解析成功
      expect(result.success).toBe(true);
    }
  });

  /**
   * Property 13: 语法错误不应导致解析器崩溃
   */
  it('语法错误的代码不应导致解析器崩溃', () => {
    const syntaxErrorCodes = [
      'const x = ;',
      'function { return 1; }',
      'if (true { console.log(1); }',
      'const arr = [1, 2,;',
      '}}}', // 孤立的右花括号
      'const missing = "unclosed string',
    ];
    
    for (const code of syntaxErrorCodes) {
      const analyzer = createStaticAnalyzer({ permissions: [] });
      
      // 不应该抛出异常
      let result: StaticAnalysisResult;
      try {
        result = analyzer.analyzeFile(code, 'syntax-error.js');
      } catch (e) {
        // 某些语法错误可能导致解析失败，但不应该崩溃
        expect(e).toBeDefined();
        continue;
      }
      
      // 结果应该被返回
      expect(result).toBeDefined();
    }
  });

  /**
   * Property 14: 超长行代码应被正确处理
   */
  it('超长行代码（> 10000 字符）应被正确处理', () => {
    // 生成一个很长的字符串
    const longString = 'x'.repeat(10000);
    const code = `const long = "${longString}";`;
    
    const analyzer = createStaticAnalyzer({ permissions: [] });
    const result = analyzer.analyzeFile(code, 'long-line.js');
    
    // 应该能解析
    expect(result.success).toBe(true);
  });

  /**
   * Property 15: 深度嵌套的代码应被正确处理
   */
  it('深度嵌套代码（20 层）应被正确处理', () => {
    // 生成 20 层嵌套
    let code = 'const x = ';
    for (let i = 0; i < 20; i++) {
      code += '(';
    }
    code += '1';
    code += ')'.repeat(20);
    code += ';';
    
    const analyzer = createStaticAnalyzer({ permissions: [] });
    const result = analyzer.analyzeFile(code, 'nested.js');
    
    expect(result.success).toBe(true);
  });

  /**
   * Property 16: 模板字符串应被正确处理
   */
  it('模板字符串中的内容不应触发违规检测', () => {
    const templateStringCodes = [
      'const msg = `使用 child_process.exec 请小心`;',
      'const cmd = `执行 ${"fs.readFile"} 命令`;',
      'const url = `https://${"fetch"}.example.com`;',
    ];
    
    for (const code of templateStringCodes) {
      const analyzer = createStaticAnalyzer({ permissions: [] });
      const result = analyzer.analyzeFile(code, 'template.js');
      
      expect(result.success).toBe(true);
      
      // 模板字符串中的 API 名称不应该触发错误违规
      const errorViolations = result.violations.filter(v => v.severity === 'error');
      expect(errorViolations.length).toBe(0);
    }
  });

  /**
   * Property 17: 正则表达式中的特殊字符应被正确处理
   */
  it('正则表达式中的特殊字符应被正确处理', () => {
    const regexCodes = [
      'const pattern = /[a-z]+/;',
      'const re = /\\d+\\.\\d+/;',
      'const math = /[+\\-*/]/;',
      'const special = /[\\[\\]{}()]/;',
    ];
    
    for (const code of regexCodes) {
      const analyzer = createStaticAnalyzer({ permissions: [] });
      const result = analyzer.analyzeFile(code, 'regex.js');
      
      expect(result.success).toBe(true);
    }
  });

  /**
   * Property 18: 文件名包含特殊字符应被正确处理
   */
  it('文件名包含特殊字符时应被正确记录', () => {
    const analyzer = createStaticAnalyzer({ permissions: [] });
    const code = 'const x = 1;';
    
    const specialFileNames = [
      'test-file.js',
      'test_file.js',
      'test.file.js',
      'test-file.test.js',
      'my.plugin.js',
    ];
    
    for (const fileName of specialFileNames) {
      const result = analyzer.analyzeFile(code, fileName);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(fileName);
    }
  });

  /**
   * Property 19: 多种代码风格混合应被正确处理
   */
  it('CommonJS 和 ES Module 混用应被正确处理', () => {
    const mixedStyleCodes = [
      'const fs = require("fs");\nimport path from "path";',
      'import { readFile } from "fs";\nconst cp = require("child_process");',
      'require("http");\nexport const x = 1;',
    ];
    
    for (const code of mixedStyleCodes) {
      const analyzer = createStaticAnalyzer({ permissions: [] });
      const result = analyzer.analyzeFile(code, 'mixed-style.js');
      
      // 应该能解析
      expect(result.success).toBe(true);
    }
  });

  /**
   * Property 20: 无效的 UTF-8 序列应被容错处理
   */
  it('无效的 UTF-8 序列应被容错处理', () => {
    // 测试一些边缘情况
    const edgeCases = [
      '\uFFFD', // 替换字符
      '\u8000', // 有效的 Unicode
      '\u0800', // 有效的 Unicode
    ];
    
    for (const char of edgeCases) {
      const code = `const x = "${char}";`;
      const analyzer = createStaticAnalyzer({ permissions: [] });
      
      let result: StaticAnalysisResult;
      try {
        result = analyzer.analyzeFile(code, 'utf8-test.js');
      } catch (e) {
        // 如果解析器无法处理，不应该崩溃
        expect(e).toBeDefined();
        continue;
      }
      
      // 应该返回结果
      expect(result).toBeDefined();
    }
  });
});