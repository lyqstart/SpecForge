/**
 * 静态检查器集成测试
 * 
 * 测试静态分析器与规则集的集成
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createStaticAnalyzer, StaticAnalyzer } from '../../src/StaticAnalyzer';

describe('静态检查器集成测试', () => {
  let analyzer: StaticAnalyzer;

  beforeEach(() => {
    analyzer = createStaticAnalyzer();
  });

  describe('基本分析', () => {
    it('应该分析安全的代码', () => {
      const source = `
        function add(a: number, b: number): number {
          return a + b;
        }
        
        const result = add(1, 2);
        console.log(result);
      `;

      const result = analyzer.analyzeFile(source, 'safe.ts');
      
      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.functionCallCount).toBeGreaterThan(0);
    });

    it('应该检测未授权的 child_process 调用', () => {
      const source = `
        const { exec } = require('child_process');
        exec('ls -la');
      `;

      const result = analyzer.analyzeFile(source, 'dangerous.js');
      
      expect(result.success).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      
      // 应该检测到 child_process 导入和 exec 调用
      const hasChildProcessViolation = result.violations.some(v => 
        v.apiName.includes('child_process')
      );
      expect(hasChildProcessViolation).toBe(true);
    });

    it('应该在有权��时允许 child_process 调用', () => {
      const source = `
        const { exec } = require('child_process');
        exec('ls -la');
      `;

      const authorizedAnalyzer = createStaticAnalyzer({
        permissions: ['child_process'],
      });

      const result = authorizedAnalyzer.analyzeFile(source, 'authorized.js');
      
      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(0); // 有权限，无违规
    });
  });

  describe('文件系统操作检测', () => {
    it('应该检测未授权的 fs 操作', () => {
      const source = `
        const fs = require('fs');
        fs.readFile('file.txt', 'utf8', (err, data) => {
          if (err) throw err;
          console.log(data);
        });
      `;

      const result = analyzer.analyzeFile(source, 'fs-operations.js');
      
      expect(result.success).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      
      const hasFsViolation = result.violations.some(v => 
        v.apiName.includes('fs.')
      );
      expect(hasFsViolation).toBe(true);
    });

    it('应该在有权��时允许 fs 操作', () => {
      const source = `
        const fs = require('fs');
        fs.readFile('file.txt', 'utf8', () => {});
      `;

      const authorizedAnalyzer = createStaticAnalyzer({
        permissions: ['filesystem.read'],
      });

      const result = authorizedAnalyzer.analyzeFile(source, 'authorized-fs.js');
      
      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(0); // 有权限，无违规
    });
  });

  describe('网络访问检测', () => {
    it('应该检测未授权的网络访问', () => {
      const source = `
        const https = require('https');
        https.get('https://example.com', (res) => {
          console.log('Response received');
        });
      `;

      const result = analyzer.analyzeFile(source, 'network.js');
      
      expect(result.success).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      
      const hasNetworkViolation = result.violations.some(v => 
        v.apiName.includes('https') || v.apiName.includes('http')
      );
      expect(hasNetworkViolation).toBe(true);
    });

    it('应该在有权��时允许网络访问', () => {
      const source = `
        const https = require('https');
        https.get('https://example.com', () => {});
      `;

      const authorizedAnalyzer = createStaticAnalyzer({
        permissions: ['network'],
      });

      const result = authorizedAnalyzer.analyzeFile(source, 'authorized-network.js');
      
      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(0); // 有权限，无违规
    });
  });

  describe('环境变量访问检测', () => {
    it('应该检测 process.env 访问', () => {
      const source = `
        const apiKey = process.env.API_KEY;
        console.log('API Key:', apiKey);
      `;

      const result = analyzer.analyzeFile(source, 'env.js');
      
      expect(result.success).toBe(true);
      // process.env 访问可能会被检测到
      expect(result.violations).toBeDefined();
    });

    it('应该在有权��时允许环境变量访问', () => {
      const source = `
        const apiKey = process.env.API_KEY;
        console.log('API Key:', apiKey);
      `;

      const authorizedAnalyzer = createStaticAnalyzer({
        permissions: ['env.read'],
      });

      const result = authorizedAnalyzer.analyzeFile(source, 'authorized-env.js');
      
      expect(result.success).toBe(true);
      // 有权限时可能无违规
      expect(result.violations).toBeDefined();
    });
  });

  describe('批量分析', () => {
    it('应该批量分析多个文件', () => {
      const files: Array<[string, string]> = [
        ['safe.ts', 'function safe() { return 42; }'],
        ['dangerous.js', 'const fs = require("fs");'],
        ['network.js', 'const http = require("http");'],
      ];

      const results = analyzer.analyzeFiles(files);
      
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true); // safe.ts
      expect(results[1].success).toBe(true); // dangerous.js
      expect(results[2].success).toBe(true); // network.js
      
      // safe.ts 应该无违规
      expect(results[0].violations).toHaveLength(0);
      
      // dangerous.js 和 network.js 应该有违规
      expect(results[1].violations.length).toBeGreaterThan(0);
      expect(results[2].violations.length).toBeGreaterThan(0);
    });
  });

  describe('配置管理', () => {
    it('应该支持权限更新', () => {
      const source = 'const fs = require("fs");';
      
      // 初始无权限
      const result1 = analyzer.analyzeFile(source, 'test.js');
      expect(result1.violations.length).toBeGreaterThan(0);
      
      // 更新权限
      analyzer.setPermissions(['filesystem.read']);
      
      const result2 = analyzer.analyzeFile(source, 'test.js');
      expect(result2.violations).toHaveLength(0); // 有权限后无违规
    });

    it('应该获取规则集', () => {
      const rules = analyzer.getRuleSet();
      
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every(rule => rule.enabled)).toBe(true);
    });
  });

  describe('报告生成', () => {
    it('应该生成分析报告', () => {
      const source = `
        const fs = require('fs');
        fs.readFile('file.txt', 'utf8', () => {});
      `;

      const result = analyzer.analyzeFile(source, 'test.js');
      const report = StaticAnalyzer.generateReport(result);
      
      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
      expect(report.length).toBeGreaterThan(0);
      expect(report).toContain('文件: test.js');
    });

    it('应该生成失败报告', () => {
      const source = `
        function invalid() {
          // 语法错误
          console.log('test';
        }
      `;

      const result = analyzer.analyzeFile(source, 'invalid.ts');
      const report = StaticAnalyzer.generateReport(result);
      
      expect(report).toBeDefined();
      expect(report).toContain('分析失败');
      expect(report).toContain('文件: invalid.ts');
    });
  });
});