/**
 * 静态检查器单元测试
 *
 * 测试覆盖：
 *   - 源码检查
 *   - 路径检查
 *   - 配置管理
 *   - 报告生成
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本测试不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createStaticChecker, StaticChecker, type StaticCheckResult } from '../../src/static-checker';

describe('StaticChecker', () => {
  let checker: StaticChecker;

  beforeEach(() => {
    checker = createStaticChecker();
  });

  describe('源码检查', () => {
    it('应该检查安全的代码', () => {
      const source = `
        function safeFunction() {
          const x = 1;
          const y = 2;
          return x + y;
        }
        
        safeFunction();
      `;

      const result = checker.checkSource(source, 'safe.ts');
      
      expect(result.passed).toBe(true);
      expect(result.violations).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('应该检测未授权的敏感 API', () => {
      const source = `
        const child_process = require('child_process');
        child_process.exec('ls -la');
      `;

      const result = checker.checkSource(source, 'dangerous.js');
      
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(result.violations!.length).toBeGreaterThan(0);
      
      // 应该检测到 child_process 导入违规
      const importViolations = result.violations!.filter(v => v.api === 'child_process');
      expect(importViolations.length).toBeGreaterThan(0);
      
      // 应该检测到 child_process.exec 调用违规
      const execViolations = result.violations!.filter(v => v.api === 'child_process.exec');
      expect(execViolations.length).toBeGreaterThan(0);
    });

    it('应该在有权��时允许敏感 API', () => {
      const source = `
        const { exec } = require('child_process');
        exec('ls -la');
      `;

      // 设置权限
      checker.setPermissions(['child_process']);

      const result = checker.checkSource(source, 'authorized.js');
      
      expect(result.passed).toBe(true);
      expect(result.violations).toBeUndefined();
    });

    it('应该处理语法错误', () => {
      const source = `
        function invalid() {
          // 语法错误
          console.log('test';
        }
      `;

      const result = checker.checkSource(source, 'invalid.ts');
      
      expect(result.passed).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.violations).toBeUndefined();
    });
  });

  describe('路径检查', () => {
    it('应该检查安全路径', () => {
      const baseDir = '/home/user/plugin';
      const safePaths = [
        'config.json',
        './config.json',
        'data/file.txt',
      ];

      for (const path of safePaths) {
        const isSafe = checker.checkFSPath(path, baseDir);
        expect(isSafe, `路径 "${path}" 应该安全`).toBe(true);
      }
    });

    it('应该检测不安全路径', () => {
      const baseDir = '/home/user/plugin';
      const dangerousPaths = [
        '../../etc/passwd',
        '../../../etc/passwd',
        '/etc/passwd',
      ];

      for (const path of dangerousPaths) {
        const isSafe = checker.checkFSPath(path, baseDir);
        expect(isSafe, `路径 "${path}" 应该不安全`).toBe(false);
      }
    });

    it('应该批量检查路径', () => {
      const baseDir = '/home/user/plugin';
      const paths = [
        'config.json',
        'data/file.txt',
        '../../etc/passwd',
        'subdir/config.json',
      ];

      const results = checker.checkFSPaths(paths, baseDir);
      
      expect(results).toHaveLength(4);
      expect(results[0].safe).toBe(true); // config.json
      expect(results[1].safe).toBe(true); // data/file.txt
      expect(results[2].safe).toBe(false); // ../../etc/passwd
      expect(results[3].safe).toBe(true); // subdir/config.json
      
      // 检查错误信息
      expect(results[2].error).toBeDefined();
      expect(results[2].error).toContain('路径逃逸攻击');
    });
  });

  describe('配置管理', () => {
    it('应该获取和设置权限', () => {
      const initialPermissions = checker.getPermissions();
      expect(initialPermissions).toEqual([]);

      const newPermissions = ['filesystem.read', 'network'];
      checker.setPermissions(newPermissions);

      const updatedPermissions = checker.getPermissions();
      expect(updatedPermissions).toEqual(newPermissions);
    });

    it('应该管理路径检查器配置', () => {
      const initialConfig = checker.getPathCheckerConfig();
      expect(initialConfig.allowedDirs).toEqual([]);

      // 添加允许目录
      checker.addAllowedDir('/custom/allowed');
      
      const configAfterAdd = checker.getPathCheckerConfig();
      expect(configAfterAdd.allowedDirs).toContain('/custom/allowed');

      // 移除允许目录
      checker.removeAllowedDir('/custom/allowed');
      
      const configAfterRemove = checker.getPathCheckerConfig();
      expect(configAfterRemove.allowedDirs).not.toContain('/custom/allowed');
    });

    it('应该更新路径检查器配置', () => {
      const newConfig = {
        allowedDirs: ['/new/allowed'],
        allowParentAccess: true,
      };
      
      checker.updatePathCheckerConfig(newConfig);
      
      const updatedConfig = checker.getPathCheckerConfig();
      expect(updatedConfig.allowedDirs).toEqual(['/new/allowed']);
      expect(updatedConfig.allowParentAccess).toBe(true);
    });
  });

  describe('批量检查', () => {
    it('应该批量检查多个文件', () => {
      const files: Array<[string, string]> = [
        ['file1.ts', 'console.log("File 1");'],
        ['file2.ts', 'const fs = require("fs");'],
        ['file3.ts', 'function safe() { return 42; }'],
      ];

      const results = checker.checkSources(files);
      
      expect(results).toHaveLength(3);
      expect(results[0].passed).toBe(true); // file1.ts - console.log 不在规则集中
      expect(results[1].passed).toBe(false); // file2.ts - fs 导入违规
      expect(results[2].passed).toBe(true); // file3.ts - 安全代码
    });
  });

  describe('静态方法', () => {
    it('应该检测路径逃逸模式', () => {
      const safePaths = [
        'file.txt',
        './file.txt',
        'dir/file.txt',
      ];

      const dangerousPaths = [
        '../file.txt',
        '../../file.txt',
        'dir/../../file.txt',
      ];

      for (const path of safePaths) {
        expect(StaticChecker.containsPathTraversal(path), `路径 "${path}" 不应该包含逃逸模式`).toBe(false);
      }

      for (const path of dangerousPaths) {
        expect(StaticChecker.containsPathTraversal(path), `路径 "${path}" 应该包含逃逸模式`).toBe(true);
      }
    });

    it('应该生成详细报告', () => {
      const result: StaticCheckResult = {
        passed: false,
        violations: [
          {
            line: 10,
            column: 5,
            api: 'child_process.exec',
            message: '禁止调用 child_process.exec（行 10）。需要声明 "child_process" 权限。',
          },
          {
            line: 15,
            column: 0,
            api: 'fs.readFile',
            message: '禁止调用 fs.readFile（行 15）。需要声明 "filesystem.read" 权限。',
          },
        ],
        pathChecks: [
          {
            safe: false,
            path: '../../etc/passwd',
            normalizedPath: '/etc/passwd',
            baseDir: '/home/user/plugin',
            error: '路径逃逸攻击：路径 "../../etc/passwd" 试图访问基础目录 "/home/user/plugin" 之外的位置',
          },
        ],
      };

      const report = StaticChecker.generateDetailedReport(result);
      
      expect(report).toContain('检查结果: 未通过');
      expect(report).toContain('API 违规 (2 条)');
      expect(report).toContain('[行 10:列 5] child_process.exec');
      expect(report).toContain('禁止调用 child_process.exec（行 10）');
      expect(report).toContain('路径检查违规 (1 条)');
      expect(report).toContain('路径: ../../etc/passwd');
      expect(report).toContain('路径逃逸攻击');
    });

    it('应该生成通过的报告', () => {
      const result: StaticCheckResult = {
        passed: true,
      };

      const report = StaticChecker.generateDetailedReport(result);
      
      expect(report).toContain('检查结果: 通过');
      expect(report).not.toContain('API 违规');
      expect(report).not.toContain('路径检查违规');
    });

    it('应该生成错误报告', () => {
      const result: StaticCheckResult = {
        passed: false,
        error: '语法错误：缺少右括号',
      };

      const report = StaticChecker.generateDetailedReport(result);
      
      expect(report).toContain('检查失败: 语法错误：缺少右括号');
    });
  });

  describe('集成测试', () => {
    it('应该同时检查源码和路径', () => {
      const source = `
        const fs = require('fs');
        const path = '../../etc/passwd';
        // 注意：实际代码中可能不会直接使用 path 变量
        // 这里只是演示
      `;

      // 检查源码
      const sourceResult = checker.checkSource(source, 'integrated.js');
      expect(sourceResult.passed).toBe(false);
      expect(sourceResult.violations!.length).toBeGreaterThan(0);

      // 检查路径
      const pathResult = checker.checkFSPath('../../etc/passwd', '/home/user/plugin');
      expect(pathResult).toBe(false);

      // 批量检查
      const paths = ['config.json', '../../etc/passwd', 'data/file.txt'];
      const pathResults = checker.checkFSPaths(paths, '/home/user/plugin');
      
      expect(pathResults[0].safe).toBe(true);
      expect(pathResults[1].safe).toBe(false);
      expect(pathResults[2].safe).toBe(true);
    });

    it('应该支持自定义配置', () => {
      const customChecker = createStaticChecker({
        analyzerConfig: {
          permissions: ['filesystem.read'],
        },
        pathCheckerConfig: {
          allowedDirs: ['/custom/allowed'],
        },
      });

      // 测试权限配置
      const source = `
        const fs = require('fs');
        fs.readFile('file.txt', 'utf8', () => {});
      `;

      const sourceResult = customChecker.checkSource(source, 'custom.js');
      expect(sourceResult.passed).toBe(true); // 有 filesystem.read 权限

      // 测试路径配置
      const pathResult = customChecker.checkFSPath('file.txt', '/custom/allowed');
      expect(pathResult).toBe(true);
    });
  });
});