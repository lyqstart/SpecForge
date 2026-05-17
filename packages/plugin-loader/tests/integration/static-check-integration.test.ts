/**
 * 静态检查集成测试
 *
 * 测试覆盖：
 *   - 完整的静态检查流程
 *   - API检查与路径检查的集成
 *   - 权限验证的集成
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本测试不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import { describe, it, expect } from 'vitest';
import { createStaticChecker } from '../../src/static-checker';

describe('静态检查集成测试', () => {
  it('应该完整检查插件源码', () => {
    const checker = createStaticChecker({
      analyzerConfig: {
        permissions: ['filesystem.read'],
      },
      pathCheckerConfig: {
        allowedDirs: ['/plugin/dir'],
      },
    });

    // 测试用例1：安全的插件代码
    const safeSource = `
      // 安全的插件代码
      const config = require('./config.json');
      const data = { version: '1.0.0' };
      
      function processData(input) {
        return input.toUpperCase();
      }
      
      module.exports = { processData };
    `;

    const safeResult = checker.checkSource(safeSource, '/plugin/dir/index.js');
    expect(safeResult.passed).toBe(true);

    // 测试用例2：包含未授权API的代码
    const dangerousSource = `
      // 危险的插件代码
      const child_process = require('child_process');
      const fs = require('fs');
      const path = '../../etc/passwd';
      
      child_process.exec('ls -la');
      fs.readFile('file.txt', 'utf8', () => {});
    `;

    const dangerousResult = checker.checkSource(dangerousSource, '/plugin/dir/dangerous.js');
    expect(dangerousResult.passed).toBe(false);
    expect(dangerousResult.violations).toBeDefined();
    expect(dangerousResult.violations!.length).toBeGreaterThan(0);

    // 测试用例3：路径检查
    const safePath = checker.checkFSPath('config.json', '/plugin/dir');
    expect(safePath).toBe(true);

    const dangerousPath = checker.checkFSPath('../../etc/passwd', '/plugin/dir');
    expect(dangerousPath).toBe(false);
  });

  it('应该支持批量检查', () => {
    const checker = createStaticChecker();

    const files: Array<[string, string]> = [
      ['/plugin/dir/safe.js', 'console.log("safe");'],
      ['/plugin/dir/dangerous.js', 'const fs = require("fs");'],
      ['/plugin/dir/utils.js', 'function add(a, b) { return a + b; }'],
    ];

    const results = checker.checkSources(files);
    
    expect(results).toHaveLength(3);
    expect(results[0].passed).toBe(true); // safe.js
    expect(results[1].passed).toBe(false); // dangerous.js
    expect(results[2].passed).toBe(true); // utils.js
  });

  it('应该生成详细的检查报告', () => {
    const checker = createStaticChecker();
    
    const source = `
      const fs = require('fs');
      const path = '../../etc/passwd';
      fs.readFile(path, 'utf8', () => {});
    `;

    const result = checker.checkSource(source, '/plugin/dir/test.js');
    
    // 使用静态方法生成报告
    const report = checker.constructor.generateDetailedReport(result);
    
    expect(report).toContain('检查结果: 未通过');
    expect(report).toContain('API 违规');
    expect(report).toContain('fs.readFile');
  });

  it('应该遵循最小权限原则', () => {
    // 初始状态：无权限
    const checker = createStaticChecker();
    
    const source = `
      const fs = require('fs');
      fs.readFile('file.txt', 'utf8', () => {});
    `;

    const result1 = checker.checkSource(source, '/plugin/dir/test.js');
    expect(result1.passed).toBe(false);

    // 授予读权限
    checker.setPermissions(['filesystem.read']);
    
    const result2 = checker.checkSource(source, '/plugin/dir/test.js');
    expect(result2.passed).toBe(true);

    // 测试写权限（未授予）
    const writeSource = `
      const fs = require('fs');
      fs.writeFile('output.txt', 'data', () => {});
    `;

    const result3 = checker.checkSource(writeSource, '/plugin/dir/test.js');
    expect(result3.passed).toBe(false);
  });

  it('应该检测路径逃逸模式', () => {
    const checker = createStaticChecker();
    
    // 使用静态方法检测路径逃逸
    const safePaths = ['file.txt', './file.txt', 'dir/file.txt'];
    const dangerousPaths = ['../file.txt', '../../file.txt', '/etc/passwd'];

    for (const path of safePaths) {
      expect(checker.constructor.containsPathTraversal(path)).toBe(false);
    }

    for (const path of dangerousPaths) {
      expect(checker.constructor.containsPathTraversal(path)).toBe(true);
    }
  });
});