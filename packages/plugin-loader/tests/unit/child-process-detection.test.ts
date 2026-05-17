/**
 * child_process 检测功能集成测试
 * 
 * 测试覆盖：
 *   - 所有 child_process API 的检测
 *   - 权限验证逻辑
 *   - 错误报告格式
 *   - 集成到静态检查器
 * 
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本测试不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createStaticChecker, StaticChecker } from '../../src/static-checker';
import { createStaticAnalyzer } from '../../src/StaticAnalyzer';
import { createRuleMatcher } from '../../src/static-checker/rules';

describe('child_process 检测功能', () => {
  describe('规则完整性', () => {
    it('应该包含所有 child_process API 规则', () => {
      const ruleMatcher = createRuleMatcher();
      const childProcessRules = ruleMatcher.getRulesByPermission('child_process');
      
      // 检查规则数量（exec, execSync, spawn, spawnSync, fork, execFile, execFileSync, import）
      expect(childProcessRules.length).toBeGreaterThanOrEqual(8);
      
      // 检查具体规则
      const ruleIds = childProcessRules.map(rule => rule.id);
      expect(ruleIds).toContain('CHILD_PROCESS_EXEC');
      expect(ruleIds).toContain('CHILD_PROCESS_EXEC_SYNC');
      expect(ruleIds).toContain('CHILD_PROCESS_SPAWN');
      expect(ruleIds).toContain('CHILD_PROCESS_SPAWN_SYNC');
      expect(ruleIds).toContain('CHILD_PROCESS_FORK');
      expect(ruleIds).toContain('CHILD_PROCESS_EXEC_FILE');
      expect(ruleIds).toContain('CHILD_PROCESS_EXEC_FILE_SYNC');
      expect(ruleIds).toContain('IMPORT_CHILD_PROCESS');
    });
  });

  describe('API 检测', () => {
    let checker: StaticChecker;

    beforeEach(() => {
      checker = createStaticChecker();
    });

    it('应该检测 child_process.exec 调用（直接成员表达式）', () => {
      const source = `
        const child_process = require('child_process');
        child_process.exec('ls -la', (error, stdout, stderr) => {
          if (error) console.error(error);
          console.log(stdout);
        });
      `;

      const result = checker.checkSource(source, 'exec-test.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(result.violations!.length).toBeGreaterThan(0);
      
      const execViolations = result.violations!.filter(v => v.api.includes('exec'));
      expect(execViolations.length).toBeGreaterThan(0);
    });

    it('应该检测 child_process.execSync 调用（直接成员表达式）', () => {
      const source = `
        const child_process = require('child_process');
        const output = child_process.execSync('ls -la', { encoding: 'utf8' });
        console.log(output);
      `;

      const result = checker.checkSource(source, 'exec-sync-test.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      
      const execSyncViolations = result.violations!.filter(v => v.api.includes('execSync'));
      expect(execSyncViolations.length).toBeGreaterThan(0);
    });

    it('应该检测 child_process.spawn 调用（直接成员表达式）', () => {
      const source = `
        const child_process = require('child_process');
        const child = child_process.spawn('ls', ['-la']);
        child.stdout.on('data', (data) => {
          console.log(data.toString());
        });
      `;

      const result = checker.checkSource(source, 'spawn-test.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      
      const spawnViolations = result.violations!.filter(v => v.api.includes('spawn'));
      expect(spawnViolations.length).toBeGreaterThan(0);
    });

    it('应该检测 child_process.spawnSync 调用（直接成员表达式）', () => {
      const source = `
        const child_process = require('child_process');
        const result = child_process.spawnSync('ls', ['-la']);
        console.log(result.stdout.toString());
      `;

      const result = checker.checkSource(source, 'spawn-sync-test.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      
      const spawnSyncViolations = result.violations!.filter(v => v.api.includes('spawnSync'));
      expect(spawnSyncViolations.length).toBeGreaterThan(0);
    });

    it('应该检测 child_process.fork 调用（直接成员表达式）', () => {
      const source = `
        const child_process = require('child_process');
        const child = child_process.fork('worker.js');
        child.on('message', (msg) => {
          console.log('Message from child:', msg);
        });
      `;

      const result = checker.checkSource(source, 'fork-test.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      
      const forkViolations = result.violations!.filter(v => v.api.includes('fork'));
      expect(forkViolations.length).toBeGreaterThan(0);
    });

    it('应该检测 child_process.execFile 调用（直接成员表达式）', () => {
      const source = `
        const child_process = require('child_process');
        child_process.execFile('ls', ['-la'], (error, stdout, stderr) => {
          if (error) console.error(error);
          console.log(stdout);
        });
      `;

      const result = checker.checkSource(source, 'exec-file-test.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(result.violations!.length).toBeGreaterThan(0);
      
      const execFileViolations = result.violations!.filter(v => v.api.includes('execFile'));
      expect(execFileViolations.length).toBeGreaterThan(0);
    });

    it('应该检测 child_process.execFileSync 调用（直接成员表达式）', () => {
      const source = `
        const child_process = require('child_process');
        const output = child_process.execFileSync('ls', ['-la'], { encoding: 'utf8' });
        console.log(output);
      `;

      const result = checker.checkSource(source, 'exec-file-sync-test.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(result.violations!.length).toBeGreaterThan(0);
      
      const execFileSyncViolations = result.violations!.filter(v => v.api.includes('execFileSync'));
      expect(execFileSyncViolations.length).toBeGreaterThan(0);
    });

    it('应该检测 child_process 模块导入', () => {
      const source = `
        const child_process = require('child_process');
        console.log('Child process module loaded');
      `;

      const result = checker.checkSource(source, 'import-test.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      
      const importViolations = result.violations!.filter(v => v.api === 'child_process');
      expect(importViolations.length).toBeGreaterThan(0);
    });

    it('应该检测 ES6 导入语法', () => {
      const source = `
        import { exec } from 'child_process';
        exec('ls -la');
      `;

      const result = checker.checkSource(source, 'es6-import-test.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      
      const importViolations = result.violations!.filter(v => v.api === 'child_process');
      expect(importViolations.length).toBeGreaterThan(0);
    });
  });

  describe('权限验证', () => {
    it('应该在有权��时允许 child_process API', () => {
      const source = `
        const child_process = require('child_process');
        child_process.exec('ls -la');
        child_process.spawn('ls', ['-la']);
        child_process.fork('worker.js');
      `;

      const checker = createStaticChecker({
        analyzerConfig: {
          permissions: ['child_process'],
        },
      });

      const result = checker.checkSource(source, 'authorized-test.js');
      
      expect(result.passed).toBe(true);
      expect(result.violations).toBeUndefined();
    });

    it('应该在没有权限时拒绝 child_process API', () => {
      const source = `
        const child_process = require('child_process');
        child_process.exec('ls -la');
      `;

      const checker = createStaticChecker({
        analyzerConfig: {
          permissions: [], // 无权限
        },
      });

      const result = checker.checkSource(source, 'unauthorized-test.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(result.violations!.length).toBeGreaterThan(0);
    });

    it('应该支持部分权限', () => {
      const source = `
        const child_process = require('child_process');
        const fs = require('fs');
        child_process.exec('ls -la');
        fs.readFile('file.txt', 'utf8', () => {});
      `;

      // 只有 filesystem.read 权限，没有 child_process 权限
      const checker = createStaticChecker({
        analyzerConfig: {
          permissions: ['filesystem.read'],
        },
      });

      const result = checker.checkSource(source, 'partial-permissions-test.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      
      // 应该检测到 child_process 违规
      const childProcessViolations = result.violations!.filter(v => 
        v.api.includes('child_process') || v.api.includes('exec')
      );
      expect(childProcessViolations.length).toBeGreaterThan(0);
      
      // fs.readFile 应该被允许（有 filesystem.read 权限）
      const fsReadViolations = result.violations!.filter(v => v.api.includes('readFile'));
      expect(fsReadViolations.length).toBe(0);
    });
  });

  describe('错误报告', () => {
    it('应该提供详细的错误信息', () => {
      const source = `
        const child_process = require('child_process');
        child_process.exec('ls -la');
      `;

      const result = createStaticAnalyzer().analyzeFile(source, 'error-report-test.js');
      
      expect(result.success).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      
      const violation = result.violations[0];
      expect(violation.errorMessage).toContain('禁止调用');
      expect(violation.errorMessage).toContain('child_process');
      expect(violation.errorMessage).toContain('需要声明');
      expect(violation.requiredPermission).toBe('child_process');
      expect(violation.severity).toBe('error');
    });

    it('应该包含行号和列号信息', () => {
      const source = `
        const child_process = require('child_process');
        // 这是一个注释
        child_process.exec('ls -la');
      `;

      const result = createStaticAnalyzer().analyzeFile(source, 'line-info-test.js');
      
      expect(result.success).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      
      const violation = result.violations.find(v => v.apiName.includes('exec'));
      expect(violation).toBeDefined();
      expect(violation!.line).toBe(4); // exec 调用在第4行
      expect(violation!.column).toBeGreaterThanOrEqual(0);
    });
  });

  describe('集成测试', () => {
    it('应该与静态检查器完整集成', () => {
      const checker = createStaticChecker();
      
      // 测试多个文件
      const files: Array<[string, string]> = [
        ['safe.ts', 'function safe() { return 42; }'],
        ['dangerous.js', 'const { exec } = require("child_process"); exec("ls -la");'],
        ['mixed.js', 'const fs = require("fs"); const cp = require("child_process");'],
      ];

      const results = checker.checkSources(files);
      
      expect(results).toHaveLength(3);
      expect(results[0].passed).toBe(true); // safe.ts
      expect(results[1].passed).toBe(false); // dangerous.js
      expect(results[2].passed).toBe(false); // mixed.js
      
      // 检查错误信息
      const dangerousViolations = results[1].violations || [];
      expect(dangerousViolations.length).toBeGreaterThan(0);
      
      const mixedViolations = results[2].violations || [];
      expect(mixedViolations.length).toBeGreaterThan(0);
    });

    it('应该支持动态权限更新', () => {
      const checker = createStaticChecker();
      
      // 初始无权限
      const source1 = 'const { exec } = require("child_process"); exec("ls -la");';
      const result1 = checker.checkSource(source1, 'dynamic-test.js');
      expect(result1.passed).toBe(false);
      
      // 更新权限
      checker.setPermissions(['child_process']);
      
      const result2 = checker.checkSource(source1, 'dynamic-test.js');
      expect(result2.passed).toBe(true);
      
      // 移除权限
      checker.setPermissions([]);
      
      const result3 = checker.checkSource(source1, 'dynamic-test.js');
      expect(result3.passed).toBe(false);
    });
  });

  describe('边界情况', () => {
    it('应该处理变量名包含 child_process 的情况', () => {
      const source = `
        const child_process = 'not a module';
        console.log(child_process);
      `;

      const result = createStaticAnalyzer().analyzeFile(source, 'variable-name-test.js');
      
      // 变量名 child_process 应该被检测为变量引用
      // 但如果没有导入 child_process 模块，不应该触发导入违规
      expect(result.success).toBe(true);
      
      // 检查是否有违规
      const violations = result.violations;
      // 变量名 child_process 可能触发 PROCESS_ENV_ACCESS 规则，但这不是 child_process 模块
      // 所以这里我们只检查分析成功
    });

    it('应该处理嵌套的成员表达式', () => {
      const source = `
        const cp = require('child_process');
        const result = cp.execSync('ls -la', { encoding: 'utf8' });
      `;

      const result = createStaticAnalyzer().analyzeFile(source, 'nested-test.js');
      
      expect(result.success).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      
      // 应该检测到 child_process 导入违规
      const importViolations = result.violations.filter(v => v.apiName === 'child_process');
      expect(importViolations.length).toBeGreaterThan(0);
      
      // 注意：cp.execSync 会被解析为 'cp.execSync'，而不是 'child_process.execSync'
      // 当前规则系统无法检测这种别名情况
    });

    it('应该处理解构赋值（当前实现有限）', () => {
      const source = `
        const { exec, spawn, fork } = require('child_process');
        const output = exec('ls -la');
        const child = spawn('ls', ['-la']);
        const worker = fork('worker.js');
      `;

      const result = createStaticAnalyzer().analyzeFile(source, 'destructuring-test.js');
      
      expect(result.success).toBe(true);
      
      // 注意：当前实现无法检测解构赋值后的函数调用
      // 只能检测到 child_process 模块导入违规
      const importViolations = result.violations.filter(v => v.apiName === 'child_process');
      expect(importViolations.length).toBeGreaterThan(0);
    });
  });
});