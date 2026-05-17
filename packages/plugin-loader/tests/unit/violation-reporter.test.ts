/**
 * 违规报告生成器测试
 *
 * 测试覆盖：
 *   - 违规数据收集与汇总
 *   - JSON 格式报告生成
 *   - Text 格式报告生成
 *   - Markdown 格式报告生成
 *   - 报告过滤功能
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本测试不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ViolationReporter, 
  type ViolationReportData,
  type TextReportOptions,
  type JsonReportOptions
} from '../../src/static-checker/violation-reporter';
import { createStaticChecker } from '../../src/static-checker';

describe('ViolationReporter', () => {
  describe('generateReportData', () => {
    it('应该生成空报告当无违规', () => {
      const results = [
        { filePath: 'safe.ts', success: true, violations: [] },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      
      expect(reportData.passed).toBe(true);
      expect(reportData.summary.totalViolations).toBe(0);
      expect(reportData.summary.errorCount).toBe(0);
      expect(reportData.summary.warningCount).toBe(0);
      expect(reportData.summary.passedFiles).toBe(1);
      expect(reportData.summary.failedFiles).toBe(0);
    });

    it('应该正确统计违规', () => {
      const results = [
        { 
          filePath: 'dangerous.ts', 
          success: true, 
          violations: [
            {
              ruleId: 'CHILD_PROCESS_EXEC',
              ruleName: 'child_process.exec 调用',
              description: '禁止调用 child_process.exec',
              severity: 'error',
              filePath: 'dangerous.ts',
              line: 5,
              column: 10,
              apiName: 'child_process.exec',
              errorMessage: '禁止调用 child_process.exec（行 5）',
              requiredPermission: 'child_process',
            },
            {
              ruleId: 'FETCH_API',
              ruleName: 'fetch 调用',
              description: '禁止调用 fetch',
              severity: 'warning',
              filePath: 'dangerous.ts',
              line: 10,
              column: 5,
              apiName: 'fetch',
              errorMessage: '禁止调用 fetch（行 10）',
              requiredPermission: 'network',
            },
          ] 
        },
        { filePath: 'safe.ts', success: true, violations: [] },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      
      expect(reportData.passed).toBe(false);
      expect(reportData.summary.totalFiles).toBe(2);
      expect(reportData.summary.totalViolations).toBe(2);
      expect(reportData.summary.errorCount).toBe(1);
      expect(reportData.summary.warningCount).toBe(1);
      expect(reportData.summary.passedFiles).toBe(1);
      expect(reportData.summary.failedFiles).toBe(1);
    });

    it('应该按权限分类统计违规', () => {
      const results = [
        { 
          filePath: 'test.ts', 
          success: true, 
          violations: [
            {
              ruleId: 'CHILD_PROCESS_EXEC',
              ruleName: 'child_process.exec',
              description: '',
              severity: 'error',
              filePath: 'test.ts',
              line: 1,
              column: 0,
              apiName: 'child_process.exec',
              errorMessage: '',
              requiredPermission: 'child_process',
            },
            {
              ruleId: 'FETCH_API',
              ruleName: 'fetch',
              description: '',
              severity: 'error',
              filePath: 'test.ts',
              line: 2,
              column: 0,
              apiName: 'fetch',
              errorMessage: '',
              requiredPermission: 'network',
            },
          ] 
        },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      
      expect(reportData.permissionStats.length).toBe(2);
      expect(reportData.permissionStats[0].permission).toBe('child_process');
      expect(reportData.permissionStats[0].count).toBe(1);
      expect(reportData.permissionStats[1].permission).toBe('network');
      expect(reportData.permissionStats[1].count).toBe(1);
    });
  });

  describe('generateJsonReport', () => {
    it('应该生成有效的 JSON 报告', () => {
      const results = [
        { filePath: 'test.ts', success: true, violations: [] },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      const jsonReport = ViolationReporter.generateJsonReport(reportData);
      
      expect(() => JSON.parse(jsonReport)).not.toThrow();
      
      const parsed = JSON.parse(jsonReport);
      expect(parsed.passed).toBe(true);
      expect(parsed.summary.totalFiles).toBe(1);
    });

    it('应该支持美化输出', () => {
      const results = [
        { filePath: 'test.ts', success: true, violations: [] },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      
      const prettyJson = ViolationReporter.generateJsonReport(reportData, { pretty: true });
      const compactJson = ViolationReporter.generateJsonReport(reportData, { pretty: false });
      
      // 美化输出应该有换行和缩进
      expect(prettyJson).toContain('\n');
      expect(compactJson).not.toContain('\n');
    });
  });

  describe('generateTextReport', () => {
    it('应该生成文本格式报告', () => {
      const results = [
        { filePath: 'test.ts', success: true, violations: [] },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      const textReport = ViolationReporter.generateTextReport(reportData);
      
      expect(textReport).toContain('静态检查违规报告');
      expect(textReport).toContain('汇总统计');
    });

    it('应该包含汇总信息', () => {
      const results = [
        { filePath: 'test.ts', success: true, violations: [] },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      const textReport = ViolationReporter.generateTextReport(reportData, { showSummary: true });
      
      expect(textReport).toContain('总文件数: 1');
      expect(textReport).toContain('通过文件: 1');
    });

    it('应该显示违规详情', () => {
      const results = [
        { 
          filePath: 'dangerous.ts', 
          success: true, 
          violations: [
            {
              ruleId: 'CHILD_PROCESS_EXEC',
              ruleName: 'child_process.exec 调用',
              description: '禁止调用',
              severity: 'error',
              filePath: 'dangerous.ts',
              line: 5,
              column: 10,
              apiName: 'child_process.exec',
              errorMessage: '禁止调用 child_process.exec',
              requiredPermission: 'child_process',
            },
          ] 
        },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      const textReport = ViolationReporter.generateTextReport(reportData);
      
      expect(textReport).toContain('dangerous.ts');
      expect(textReport).toContain('child_process.exec');
    });

    it('应该支持按严重级别分组', () => {
      const results = [
        { 
          filePath: 'test.ts', 
          success: true, 
          violations: [
            {
              ruleId: 'ERR',
              ruleName: 'error',
              description: '',
              severity: 'error',
              filePath: 'test.ts',
              line: 1,
              column: 0,
              apiName: 'api',
              errorMessage: '',
            },
            {
              ruleId: 'WARN',
              ruleName: 'warning',
              description: '',
              severity: 'warning',
              filePath: 'test.ts',
              line: 2,
              column: 0,
              apiName: 'api2',
              errorMessage: '',
            },
          ] 
        },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      const textReport = ViolationReporter.generateTextReport(reportData, { 
        groupBySeverity: true,
        groupByFile: false,
      });
      
      expect(textReport).toContain('错误级别违规');
      expect(textReport).toContain('警告级别违规');
    });
  });

  describe('generateMarkdownReport', () => {
    it('应该生成 Markdown 格式报告', () => {
      const results = [
        { filePath: 'test.ts', success: true, violations: [] },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      const mdReport = ViolationReporter.generateMarkdownReport(reportData);
      
      expect(mdReport).toContain('# 静态检查违规报告');
      expect(mdReport).toContain('## 汇总统计');
      expect(mdReport).toContain('| 总文件数 |');
    });

    it('应该包含违规详情表格', () => {
      const results = [
        { 
          filePath: 'dangerous.ts', 
          success: true, 
          violations: [
            {
              ruleId: 'CHILD_PROCESS_EXEC',
              ruleName: 'child_process.exec',
              description: '',
              severity: 'error',
              filePath: 'dangerous.ts',
              line: 5,
              column: 0,
              apiName: 'child_process.exec',
              errorMessage: '禁止调用',
            },
          ] 
        },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      const mdReport = ViolationReporter.generateMarkdownReport(reportData);
      
      expect(mdReport).toContain('## 违规详情');
      expect(mdReport).toContain('### dangerous.ts');
    });
  });

  describe('generateSummary', () => {
    it('应该生成通过时的简洁摘要', () => {
      const results = [
        { filePath: 'safe.ts', success: true, violations: [] },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      const summary = ViolationReporter.generateSummary(reportData);
      
      expect(summary).toContain('✅');
      expect(summary).toContain('静态检查通过');
    });

    it('应该生成未通过时的简洁摘要', () => {
      const results = [
        { 
          filePath: 'dangerous.ts', 
          success: true, 
          violations: [
            {
              ruleId: 'ERR',
              ruleName: 'error',
              description: '',
              severity: 'error',
              filePath: 'dangerous.ts',
              line: 1,
              column: 0,
              apiName: 'api',
              errorMessage: '',
            },
          ] 
        },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      const summary = ViolationReporter.generateSummary(reportData);
      
      expect(summary).toContain('❌');
      expect(summary).toContain('1 个错误');
    });
  });

  describe('filterReport', () => {
    it('应该按严重级别过滤', () => {
      const results = [
        { 
          filePath: 'test.ts', 
          success: true, 
          violations: [
            {
              ruleId: 'ERR',
              ruleName: 'error',
              description: '',
              severity: 'error',
              filePath: 'test.ts',
              line: 1,
              column: 0,
              apiName: 'api',
              errorMessage: '',
            },
            {
              ruleId: 'WARN',
              ruleName: 'warning',
              description: '',
              severity: 'warning',
              filePath: 'test.ts',
              line: 2,
              column: 0,
              apiName: 'api2',
              errorMessage: '',
            },
          ] 
        },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      const filtered = ViolationReporter.filterReport(reportData, { severity: ['error'] });
      
      expect(filtered.summary.totalViolations).toBe(1);
      expect(filtered.summary.errorCount).toBe(1);
      expect(filtered.summary.warningCount).toBe(0);
    });

    it('应该按权限过滤', () => {
      const results = [
        { 
          filePath: 'test.ts', 
          success: true, 
          violations: [
            {
              ruleId: 'CHILD_PROCESS',
              ruleName: 'child_process',
              description: '',
              severity: 'error',
              filePath: 'test.ts',
              line: 1,
              column: 0,
              apiName: 'api',
              errorMessage: '',
              requiredPermission: 'child_process',
            },
            {
              ruleId: 'NETWORK',
              ruleName: 'network',
              description: '',
              severity: 'error',
              filePath: 'test.ts',
              line: 2,
              column: 0,
              apiName: 'api2',
              errorMessage: '',
              requiredPermission: 'network',
            },
          ] 
        },
      ];
      
      const reportData = ViolationReporter.generateReportData(results);
      const filtered = ViolationReporter.filterReport(reportData, { permission: ['child_process'] });
      
      expect(filtered.summary.totalViolations).toBe(1);
      expect(filtered.permissionStats.length).toBe(1);
      expect(filtered.permissionStats[0].permission).toBe('child_process');
    });
  });
});

describe('StaticChecker 报告生成集成', () => {
  let checker: ReturnType<typeof createStaticChecker>;

  beforeEach(() => {
    checker = createStaticChecker();
  });

  describe('checkSourcesAndGenerateReport', () => {
    it('应该生成完整的结构化报告', () => {
      const files: Array<[string, string]> = [
        ['safe.ts', 'const x = 1;'],
        ['dangerous.ts', 'const cp = require("child_process"); cp.exec("ls");'],
      ];
      
      const reportData = checker.checkSourcesAndGenerateReport(files);
      
      expect(reportData.summary.totalFiles).toBe(2);
      expect(reportData.summary.failedFiles).toBe(1);
      expect(reportData.passed).toBe(false);
    });
  });

  describe('checkSourcesAndGenerateJsonReport', () => {
    it('应该生成有效的 JSON', () => {
      const files: Array<[string, string]> = [
        ['safe.ts', 'const x = 1;'],
      ];
      
      const json = checker.checkSourcesAndGenerateJsonReport(files);
      
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.passed).toBe(true);
    });
  });

  describe('checkSourcesAndGenerateTextReport', () => {
    it('应该生成文本格式报告', () => {
      const files: Array<[string, string]> = [
        ['dangerous.ts', 'const cp = require("child_process"); cp.exec("ls");'],
      ];
      
      const text = checker.checkSourcesAndGenerateTextReport(files);
      
      expect(text).toContain('静态检查违规报告');
      expect(text).toContain('汇总统计');
      expect(text).toContain('dangerous.ts');
    });
  });

  describe('checkSourcesAndGenerateMarkdownReport', () => {
    it('应该生成 Markdown 格式报告', () => {
      const files: Array<[string, string]> = [
        ['safe.ts', 'const x = 1;'],
      ];
      
      const md = checker.checkSourcesAndGenerateMarkdownReport(files);
      
      expect(md).toContain('# 静态检查违规报告');
      expect(md).toContain('| 总文件数 |');
    });
  });

  describe('generateSummary', () => {
    it('应该生成简洁摘要', () => {
      const files: Array<[string, string]> = [
        ['safe.ts', 'const x = 1;'],
      ];
      
      const summary = checker.generateSummary(files);
      
      expect(summary).toContain('✅');
      expect(summary).toContain('通过');
    });

    it('应该显示违规数量', () => {
      const files: Array<[string, string]> = [
        ['dangerous.ts', 'const cp = require("child_process"); cp.exec("ls");'],
      ];
      
      const summary = checker.generateSummary(files);
      
      expect(summary).toContain('❌');
    });
  });
});