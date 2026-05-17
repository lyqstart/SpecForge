/**
 * 静态分析器集成测试
 *
 * 测试覆盖：
 *   - 完整的静态分析工作流程
 *   - 实际插件代码分析
 *   - 权限验证集成
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本测试不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import { describe, it, expect } from 'vitest';
import { createStaticAnalyzer } from '../../src/StaticAnalyzer';

describe('StaticAnalyzer 集成测试', () => {
  it('应该分析安全的插件代码', () => {
    const analyzer = createStaticAnalyzer({
      permissions: ['filesystem.read', 'network'],
    });

    const source = `
      // 安全的插件代码示例
      import { EventEmitter } from 'events';
      
      export class SafePlugin {
        private emitter = new EventEmitter();
        
        async processData(data: any) {
          // 安全的操作
          const result = JSON.stringify(data);
          this.emitter.emit('processed', result);
          return result;
        }
        
        addListener(event: string, callback: Function) {
          this.emitter.on(event, callback);
        }
      }
    `;

    const result = analyzer.analyzeFile(source, 'safe-plugin.ts');
    
    expect(result.success).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.importCount).toBe(1); // 导入 events 模块
    expect(result.functionCallCount).toBeGreaterThan(0);
  });

  it('应该检测并报告危险的插件代码', () => {
    const analyzer = createStaticAnalyzer({
      permissions: [], // 无权限
    });

    const source = `
      // 危险的插件代码示例
      const fs = require('fs');
      const { exec } = require('child_process');
      const https = require('https');
      
      function dangerousPlugin() {
        // 未授权的文件系统访问
        const config = fs.readFileSync('config.json', 'utf8');
        
        // 未授权的进程执行
        require('child_process').exec('rm -rf /tmp/*');
        
        // 未授权的网络访问
        https.get('https://malicious.com', () => {
          console.log('Connected to malicious site');
        });
        
        // 环境变量访问
        const apiKey = process.env.API_KEY;
        
        return { config, apiKey };
      }
      
      module.exports = dangerousPlugin;
    `;

    const result = analyzer.analyzeFile(source, 'dangerous-plugin.js');
    
    expect(result.success).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
    
    // 检查违规类型 - 至少应该有违规
    expect(result.violations.length).toBeGreaterThan(0);
    
    // 应该检测到导入违规
    const importViolations = result.violations.filter(v => 
      v.apiName === 'fs' || v.apiName === 'child_process' || v.apiName === 'https'
    );
    expect(importViolations.length).toBeGreaterThan(0);
  });

  it('应该在有权��时允许敏感操作', () => {
    const analyzer = createStaticAnalyzer({
      permissions: ['child_process', 'filesystem.read', 'network', 'env.read'],
    });

    const source = `
      // 有权限的插件代码
      const fs = require('fs');
      const { exec } = require('child_process');
      const https = require('https');
      
      function authorizedPlugin() {
        // 有权限的文件系统访问
        const config = fs.readFileSync('config.json', 'utf8');
        
        // 有权限的进程执行
        exec('ls -la', (error, stdout) => {
          console.log(stdout);
        });
        
        // 有权限的网络访问
        https.get('https://api.example.com', (res) => {
          console.log('API response received');
        });
        
        // 有权限的环境变量访问
        const apiKey = process.env.API_KEY;
        
        return { config, apiKey };
      }
      
      module.exports = authorizedPlugin;
    `;

    const result = analyzer.analyzeFile(source, 'authorized-plugin.js');
    
    expect(result.success).toBe(true);
    expect(result.violations).toHaveLength(0); // 有权限，无违规
  });

  it('应该生成可读的违规报告', () => {
    const analyzer = createStaticAnalyzer();

    const source = `
      const fs = require('fs');
      fs.readFile('test.txt', 'utf8', () => {});
    `;

    const result = analyzer.analyzeFile(source, 'test-plugin.js');
    
    expect(result.success).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
    
    // 生成报告
    const report = analyzer.constructor.generateReport(result);
    
    expect(report).toContain('文件: test-plugin.js');
    expect(report).toContain('违规总数:');
    expect(report).toContain('fs.readFile');
    expect(report).toContain('需要声明 "filesystem.read" 权限');
  });

  it('应该批量分析多个插件文件', () => {
    const analyzer = createStaticAnalyzer();

    const files: Array<[string, string]> = [
      ['plugin1.js', 'const fs = require("fs"); fs.readFile("file1.txt", () => {});'],
      ['plugin2.js', 'function safe() { return 42; }'],
      ['plugin3.js', 'const { exec } = require("child_process"); exec("ls");'],
    ];

    const results = analyzer.analyzeFiles(files);
    
    expect(results).toHaveLength(3);
    
    // plugin1 应该有违规（fs 操作）
    expect(results[0].violations.length).toBeGreaterThan(0);
    
    // plugin2 应该无违规
    expect(results[1].violations).toHaveLength(0);
    
    // plugin3 应该有违规（child_process 操作）
    expect(results[2].violations.length).toBeGreaterThan(0);
  });

  it('应该支持 TypeScript 插件代码分析', () => {
    const analyzer = createStaticAnalyzer();

    const source = `
      import * as fs from 'fs';
      import { exec } from 'child_process';
      
      export class TypeScriptPlugin {
        private configPath: string;
        
        constructor(configPath: string) {
          this.configPath = configPath;
        }
        
        loadConfig(): string {
          // 未授权的操作
          return fs.readFileSync(this.configPath, 'utf8');
        }
        
        executeCommand(cmd: string): void {
          // 未授权的操作
          exec(cmd, (error, stdout) => {
            if (error) {
              console.error('Command failed:', error);
            } else {
              console.log('Output:', stdout);
            }
          });
        }
      }
    `;

    const result = analyzer.analyzeFile(source, 'typescript-plugin.ts');
    
    expect(result.success).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
    
    // 应该检测到 TypeScript 导入
    const importViolations = result.violations.filter(v => v.apiName === 'fs' || v.apiName === 'child_process');
    expect(importViolations.length).toBeGreaterThan(0);
  });
});