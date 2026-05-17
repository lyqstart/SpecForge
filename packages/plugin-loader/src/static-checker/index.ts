/**
 * 静态检查器 - 插件源码静态检查器
 *
 * 职责：
 *   - 检查源码中的禁止 API 调用
 *   - 检查文件系统访问路径安全性
 *   - 生成详细的违规报告
 *
 * 实现策略：
 *   - 整合 StaticAnalyzer 进行 API 检查
 *   - 整合 PathChecker 进行路径检查
 *   - 提供统一的检查接口
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本模块不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import { StaticAnalyzer, createStaticAnalyzer, type StaticAnalysisResult, type StaticAnalyzerConfig, type ViolationReport } from '../StaticAnalyzer';
import { PathChecker, createPathChecker, type PathCheckResult, type PathCheckerConfig } from './path-checker';
import { ViolationReporter, type ViolationReportData, type TextReportOptions, type JsonReportOptions } from './violation-reporter';

/**
 * 静态检查结果
 */
export interface StaticCheckResult {
  /** 是否通过检查 */
  passed: boolean;
  /** 违规详情 */
  violations?: Array<{
    line: number;
    column: number;
    api: string;
    message: string;
  }>;
  /** 路径检查结果 */
  pathChecks?: PathCheckResult[];
  /** 错误信息（如果检查失败） */
  error?: string;
}

/**
 * 静态检查器配置
 */
export interface StaticCheckerConfig {
  /** 静态分析器配置 */
  analyzerConfig?: StaticAnalyzerConfig;
  /** 路径检查器配置 */
  pathCheckerConfig?: Partial<PathCheckerConfig>;
}

/**
 * 静态检查器
 */
export class StaticChecker {
  private analyzer: StaticAnalyzer;
  private pathChecker: PathChecker;

  constructor(config: StaticCheckerConfig = {}) {
    this.analyzer = createStaticAnalyzer(config.analyzerConfig);
    this.pathChecker = createPathChecker(config.pathCheckerConfig);
  }

  /**
   * 检查源码中的禁止 API
   *
   * @param source - 源码内容
   * @param filePath - 文件路径
   * @returns 检查结果
   */
  checkSource(source: string, filePath: string): StaticCheckResult {
    // 使用静态分析器检查 API 调用
    const analysisResult = this.analyzer.analyzeFile(source, filePath);
    
    if (!analysisResult.success) {
      return {
        passed: false,
        error: analysisResult.error,
      };
    }

    // 转换违规报告格式
    const violations = analysisResult.violations.map(violation => ({
      line: violation.line,
      column: violation.column,
      api: violation.apiName,
      message: violation.errorMessage,
    }));

    return {
      passed: violations.length === 0,
      violations: violations.length > 0 ? violations : undefined,
    };
  }

  /**
   * 检查文件系统访问路径
   *
   * @param path - 要检查的路径
   * @param baseDir - 基础目录（通常是插件目录）
   * @returns true=安全, false=越界
   */
  checkFSPath(path: string, baseDir: string): boolean {
    const result = this.pathChecker.checkPath(path, baseDir);
    return result.safe;
  }

  /**
   * 检查多个文件系统访问路径
   *
   * @param paths - 要检查的路径列表
   * @param baseDir - 基础目录
   * @returns 检查结果列表
   */
  checkFSPaths(paths: string[], baseDir: string): PathCheckResult[] {
    return this.pathChecker.checkPaths(paths, baseDir);
  }

  /**
   * 批量检查源码
   *
   * @param files - 文件列表，每个元素为 [文件路径, 源码内容]
   * @returns 检查结果列表
   */
  checkSources(files: Array<[string, string]>): StaticCheckResult[] {
    return files.map(([filePath, source]) => this.checkSource(source, filePath));
  }

  /**
   * 获取当前权限列表
   */
  getPermissions(): string[] {
    return this.analyzer.getPermissions();
  }

  /**
   * 更新权限列表
   *
   * @param permissions - 新的权限列表
   */
  setPermissions(permissions: string[]): void {
    this.analyzer.setPermissions(permissions);
  }

  /**
   * 获取路径检查器配置
   */
  getPathCheckerConfig(): PathCheckerConfig {
    return this.pathChecker.getConfig();
  }

  /**
   * 更新路径检查器配置
   *
   * @param config - 新的配置
   */
  updatePathCheckerConfig(config: Partial<PathCheckerConfig>): void {
    this.pathChecker.updateConfig(config);
  }

  /**
   * 添加允许的目录
   *
   * @param dir - 目录路径
   */
  addAllowedDir(dir: string): void {
    this.pathChecker.addAllowedDir(dir);
  }

  /**
   * 移除允许的目录
   *
   * @param dir - 目录路径
   */
  removeAllowedDir(dir: string): void {
    this.pathChecker.removeAllowedDir(dir);
  }

  /**
   * 检查路径是否包含逃逸模式
   *
   * @param pathStr - 路径字符串
   * @returns 是否包含逃逸模式
   */
  static containsPathTraversal(pathStr: string): boolean {
    // 使用 PathChecker 的静态方法
    return PathChecker.containsPathTraversal(pathStr);
  }

  /**
   * 生成详细的检查报告
   *
   * @param result - 检查结果
   * @returns 报告字符串
   */
  static generateDetailedReport(result: StaticCheckResult): string {
    const lines: string[] = [];
    
    if (result.error) {
      lines.push(`检查失败: ${result.error}`);
      return lines.join('\n');
    }

    lines.push(`检查结果: ${result.passed ? '通过' : '未通过'}`);
    
    if (result.violations && result.violations.length > 0) {
      lines.push(`\nAPI 违规 (${result.violations.length} 条):`);
      for (const violation of result.violations) {
        lines.push(`  [行 ${violation.line}:列 ${violation.column}] ${violation.api}`);
        lines.push(`    错误: ${violation.message}`);
        lines.push('');
      }
    }

    if (result.pathChecks && result.pathChecks.length > 0) {
      const unsafePaths = result.pathChecks.filter(check => !check.safe);
      if (unsafePaths.length > 0) {
        lines.push(`\n路径检查违规 (${unsafePaths.length} 条):`);
        for (const check of unsafePaths) {
          lines.push(`  路径: ${check.path}`);
          lines.push(`    错误: ${check.error}`);
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 批量检查多个文件并生成结构化报告
   *
   * @param files - 文件列表，每个元素为 [文件路径, 源码内容]
   * @returns 结构化报告数据
   */
  checkSourcesAndGenerateReport(files: Array<[string, string]>): ViolationReportData {
    const results = this.checkSources(files);
    return ViolationReporter.generateReportData(
      results.map((result, index) => ({
        filePath: files[index][0],
        success: !result.error,
        violations: result.violations?.map(v => ({
          ruleId: v.api,
          ruleName: v.api,
          description: v.message,
          severity: 'error' as const,
          filePath: files[index][0],
          line: v.line,
          column: v.column,
          apiName: v.api,
          errorMessage: v.message,
          requiredPermission: undefined,
        })) || [],
      }))
    );
  }

  /**
   * 批量检查并生成文本格式报告
   *
   * @param files - 文件列表
   * @param options - 文本报告选项
   * @returns 文本格式报告
   */
  checkSourcesAndGenerateTextReport(files: Array<[string, string]>, options?: TextReportOptions): string {
    const reportData = this.checkSourcesAndGenerateReport(files);
    return ViolationReporter.generateTextReport(reportData, options);
  }

  /**
   * 批量检查并生成 JSON 格式报告
   *
   * @param files - 文件列表
   * @param options - JSON 报告选项
   * @returns JSON 格式报告
   */
  checkSourcesAndGenerateJsonReport(files: Array<[string, string]>, options?: JsonReportOptions): string {
    const reportData = this.checkSourcesAndGenerateReport(files);
    return ViolationReporter.generateJsonReport(reportData, options);
  }

  /**
   * 批量检查并生成 Markdown 格式报告
   *
   * @param files - 文件列表
   * @returns Markdown 格式报告
   */
  checkSourcesAndGenerateMarkdownReport(files: Array<[string, string]>): string {
    const reportData = this.checkSourcesAndGenerateReport(files);
    return ViolationReporter.generateMarkdownReport(reportData);
  }

  /**
   * 生成简洁摘要
   *
   * @param files - 文件列表
   * @returns 摘要字符串
   */
  generateSummary(files: Array<[string, string]>): string {
    const reportData = this.checkSourcesAndGenerateReport(files);
    return ViolationReporter.generateSummary(reportData);
  }
}

/**
 * 创建静态检查器实例
 */
export function createStaticChecker(config?: StaticCheckerConfig): StaticChecker {
  return new StaticChecker(config);
}

// 导出相关类型
export type { StaticAnalysisResult, ViolationReport } from '../StaticAnalyzer';
export type { PathCheckResult, PathCheckerConfig } from './path-checker';
export type { StaticCheckRule, RuleSet } from './rules';
export type { ViolationReportData, TextReportOptions, JsonReportOptions } from './violation-reporter';

// 导出 ViolationReporter 供直接使用
export { ViolationReporter };