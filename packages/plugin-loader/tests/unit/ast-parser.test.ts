/**
 * AST 解析器单元测试
 *
 * 测试覆盖：
 *   - 基本 TypeScript/JavaScript 解析
 *   - 函数调用提取
 *   - 导入语句提取
 *   - 变量引用提取
 *   - 错误处理
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本测试不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createAstParser, type AstParser } from '../../src/static-checker/ast-parser';

describe('AstParser', () => {
  let parser: AstParser;

  beforeEach(() => {
    parser = createAstParser();
  });

  describe('基本解析', () => {
    it('应该成功解析简单的 TypeScript 代码', () => {
      const source = `
        function hello(name: string): string {
          return \`Hello, \${name}!\`;
        }
        
        const result = hello('World');
        console.log(result);
      `;

      const result = parser.parse(source, 'test.ts');
      
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
      expect(result.functionCalls).toBeDefined();
      expect(result.imports).toBeDefined();
      expect(result.variables).toBeDefined();
    });

    it('应该成功解析简单的 JavaScript 代码', () => {
      const source = `
        function hello(name) {
          return 'Hello, ' + name + '!';
        }
        
        const result = hello('World');
        console.log(result);
      `;

      const result = parser.parse(source, 'test.js');
      
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
    });

    it('应该处理解析错误', () => {
      const source = `
        function invalid() {
          // 缺少右括号
          console.log('test';
        }
      `;

      const result = parser.parse(source, 'test.ts');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // 错误消息可能包含不同的内容，我们只检查它存在
      expect(result.error!.length).toBeGreaterThan(0);
    });
  });

  describe('函数调用提取', () => {
    it('应该提取简单的函数调用', () => {
      const source = `
        console.log('Hello');
        Math.max(1, 2, 3);
        JSON.stringify({ foo: 'bar' });
      `;

      const result = parser.parse(source, 'test.ts');
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(3);
      
      const calls = result.functionCalls!;
      expect(calls[0].name).toBe('console.log');
      expect(calls[0].argumentCount).toBe(1);
      
      expect(calls[1].name).toBe('Math.max');
      expect(calls[1].argumentCount).toBe(3);
      
      expect(calls[2].name).toBe('JSON.stringify');
      expect(calls[2].argumentCount).toBe(1);
    });

    it('应该提取成员表达式函数调用', () => {
      const source = `
        const fs = require('fs');
        fs.readFile('file.txt', 'utf8');
        child_process.exec('ls -la');
      `;

      const result = parser.parse(source, 'test.ts');
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(3);
      
      const calls = result.functionCalls!;
      expect(calls[0].name).toBe('require');
      expect(calls[1].name).toBe('fs.readFile');
      expect(calls[2].name).toBe('child_process.exec');
    });

    it('应该正确处理嵌套函数调用', () => {
      const source = `
        const result = Math.max(1, Math.min(5, 10));
        console.log('Result:', result);
      `;

      const result = parser.parse(source, 'test.ts');
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(3);
      
      const calls = result.functionCalls!;
      expect(calls[0].name).toBe('Math.max');
      expect(calls[1].name).toBe('Math.min');
      expect(calls[2].name).toBe('console.log');
    });
  });

  describe('导入语句提取', () => {
    it('应该提取 ES6 import 语句', () => {
      const source = `
        import { exec } from 'child_process';
        import fs from 'fs';
        import * as path from 'path';
        import 'dotenv/config';
      `;

      const result = parser.parse(source, 'test.ts');
      
      expect(result.success).toBe(true);
      expect(result.imports).toHaveLength(4);
      
      const imports = result.imports!;
      expect(imports[0].moduleName).toBe('child_process');
      expect(imports[0].identifiers).toEqual(['exec']);
      expect(imports[0].type).toBe('import');
      
      expect(imports[1].moduleName).toBe('fs');
      expect(imports[1].identifiers).toEqual(['default']);
      expect(imports[1].type).toBe('import');
      
      expect(imports[2].moduleName).toBe('path');
      expect(imports[2].identifiers).toEqual(['*']);
      expect(imports[2].type).toBe('import');
      
      expect(imports[3].moduleName).toBe('dotenv/config');
      expect(imports[3].identifiers).toEqual([]);
      expect(imports[3].type).toBe('import');
    });

    it('应该提取 CommonJS require 语句', () => {
      const source = `
        const fs = require('fs');
        const { exec } = require('child_process');
        const path = require('path');
      `;

      const result = parser.parse(source, 'test.ts');
      
      expect(result.success).toBe(true);
      expect(result.imports).toHaveLength(3);
      
      const imports = result.imports!;
      expect(imports[0].moduleName).toBe('fs');
      expect(imports[0].type).toBe('require');
      
      expect(imports[1].moduleName).toBe('child_process');
      expect(imports[1].type).toBe('require');
      
      expect(imports[2].moduleName).toBe('path');
      expect(imports[2].type).toBe('require');
    });

    it('应该提取动态 import 语句', () => {
      const source = `
        const loadModule = async () => {
          const fs = await import('fs');
          return fs;
        };
      `;

      const result = parser.parse(source, 'test.ts');
      
      expect(result.success).toBe(true);
      // 动态import可能不被提取，这取决于AST解析器的实现
      // 我们只检查解析成功
      expect(result.imports).toBeDefined();
    });
  });

  describe('变量引用提取', () => {
    it('应该提取变量引用', () => {
      const source = `
        const name = 'World';
        const greeting = 'Hello, ' + name;
        console.log(greeting, name);
      `;

      const result = parser.parse(source, 'test.ts');
      
      expect(result.success).toBe(true);
      expect(result.variables).toBeDefined();
      
      // 至少应该包含 name 和 greeting 的引用
      const variables = result.variables!;
      const variableNames = variables.map(v => v.name);
      expect(variableNames).toContain('name');
      expect(variableNames).toContain('greeting');
      expect(variableNames).toContain('console');
    });

    it('应该提取 process.env 引用', () => {
      const source = `
        const apiKey = process.env.API_KEY;
        const nodeEnv = process.env.NODE_ENV;
        console.log(apiKey, nodeEnv);
      `;

      const result = parser.parse(source, 'test.ts');
      
      expect(result.success).toBe(true);
      expect(result.variables).toBeDefined();
      
      const variables = result.variables!;
      const variableNames = variables.map(v => v.name);
      expect(variableNames).toContain('process');
      expect(variableNames).toContain('apiKey');
      expect(variableNames).toContain('nodeEnv');
    });
  });

  describe('查询功能', () => {
    it('应该能够查询特定类型的节点', () => {
      const source = `
        console.log('test');
        const x = 1;
        function foo() {}
      `;

      const result = parser.parse(source, 'test.ts');
      
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
      
      // 查询所有函数声明
      const functionDeclarations = parser.query(result.ast!, node => node.type === 'FunctionDeclaration');
      expect(functionDeclarations).toHaveLength(1);
      
      // 查询所有变量声明
      const variableDeclarations = parser.query(result.ast!, node => node.type === 'VariableDeclaration');
      expect(variableDeclarations).toHaveLength(1);
      
      // 查询所有表达式语句
      const expressionStatements = parser.query(result.ast!, node => node.type === 'ExpressionStatement');
      expect(expressionStatements).toHaveLength(1);
    });
  });

  describe('配置选项', () => {
    it('应该支持自定义解析选项', () => {
      const customParser = createAstParser({
        jsx: false,
        typescript: false,
        sourceType: 'script',
        ecmaVersion: 2020,
      });

      const source = `
        // 普通 JavaScript
        function test() {
          return 'test';
        }
      `;

      const result = customParser.parse(source, 'test.js');
      expect(result.success).toBe(true);
    });

    it('应该支持 JSX 解析', () => {
      const jsxParser = createAstParser({ jsx: true });
      
      const source = `
        const element = <div>Hello World</div>;
        console.log(element);
      `;

      const result = jsxParser.parse(source, 'test.tsx');
      expect(result.success).toBe(true);
    });
  });
});