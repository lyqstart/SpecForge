/**
 * 违规报告生成器 - 结构化违规报告
 *
 * 职责：
 *   - 收集所有静态检查违规
 *   - 生成结构化报告
 *   - 支持不同格式输出（JSON, text）
 *   - 提供汇总统计信息
 *
 * 实现策略：
 *   - 整合 StaticAnalyzer 的违规数据
 *   - 提供多种输出格式
 *   - 支持汇总和过滤
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本模块为纯数据处理，无异步操作
 *   - 无资源泄漏风险
 */

import type { ViolationReport } from '../StaticAnalyzer';

/**
 * 违规类型分类
 */
export type ViolationCategory = 
  | 'child_process' 
  | 'filesystem' 
  | 'network' 
  | 'env' 
  | 'other';

/**
 * 违规严重级别
 */
export type ReportSeverity = 'error' | 'warning';

/**
 * 单个文件的违规摘要
 */
export interface FileViolationSummary {
  /** 文件路径 */
  filePath: string;
  /** 错误级别违规数 */
  errorCount: number;
  /** 警告级别违规数 */
  warningCount: number;
  /** 违规列表 */
  violations: ViolationReport[];
}

/**
 * 按权限分类的违规统计
 */
export interface PermissionViolationStats {
  /** 权限名称 */
  permission: string;
  /** 违规数 */
  count: number;
  /** 违规列表 */
  violations: ViolationReport[];
}

/**
 * 完整的违规报告
 */
export interface ViolationReportData {
  /** 报告生成时间（ISO 字符串） */
  generatedAt: string;
  /** 报告版本 */
  version: string;
  /** 汇总统计 */
  summary: {
    /** 总文件数 */
    totalFiles: number;
    /** 总违规数 */
    totalViolations: number;
    /** 错误级别违规数 */
    errorCount: number;
    /** 警告级别违规数 */
    warningCount: number;
    /** 通过的文件数（无违规） */
    passedFiles: number;
    /** 失败的文件数（有违规） */
    failedFiles: number;
  };
  /** 各文件的违规详情 */
  fileSummaries: FileViolationSummary[];
  /** 按权限分类的违规统计 */
  permissionStats: PermissionViolationStats[];
  /** 是否通过检查（无错误级别违规） */
  passed: boolean;
}

/**
 * 文本格式报告配置
 */
export interface TextReportOptions {
  /** 是否包含文件路径 */
  showFilePath?: boolean;
  /** 是否包含行号 */
  showLineNumbers?: boolean;
  /** 是否包含权限信息 */
  showPermissions?: boolean;
  /** 是否显示统计摘要 */
  showSummary?: boolean;
  /** 是否按严重级别分组 */
  groupBySeverity?: boolean;
  /** 是否按文件分组 */
  groupByFile?: boolean;
}

/**
 * JSON 格式报告配置
 */
export interface JsonReportOptions {
  /** 是否包含详细位置信息 */
  includeLocation?: boolean;
  /** 是否包含规则详情 */
  includeRuleDetails?: boolean;
  /** 是否美化输出 */
  pretty?: boolean;
  /** 缩进空格数 */
  indent?: number;
}

/**
 * 违规报告生成器
 */
export class ViolationReporter {
  /**
   * 将违规数据转换为结构化报告
   *
   * @param results - StaticAnalyzer 的分析结果数组
   * @returns 结构化报告数据
   */
  static generateReportData(results: {
    filePath: string;
    success: boolean;
    violations: ViolationReport[];
  }[]): ViolationReportData {
    const fileSummaries: FileViolationSummary[] = [];
    const permissionStatsMap = new Map<string, PermissionViolationStats>();

    let totalErrors = 0;
    let totalWarnings = 0;
    let passedFiles = 0;
    let failedFiles = 0;

    for (const result of results) {
      const errorCount = result.violations.filter(v => v.severity === 'error').length;
      const warningCount = result.violations.filter(v => v.severity === 'warning').length;

      fileSummaries.push({
        filePath: result.filePath,
        errorCount,
        warningCount,
        violations: result.violations,
      });

      if (errorCount > 0 || warningCount > 0) {
        failedFiles++;
      } else {
        passedFiles++;
      }

      totalErrors += errorCount;
      totalWarnings += warningCount;

      // 统计按权限分类的违规
      for (const violation of result.violations) {
        const permission = violation.requiredPermission || 'other';
        if (!permissionStatsMap.has(permission)) {
          permissionStatsMap.set(permission, {
            permission,
            count: 0,
            violations: [],
          });
        }
        const stats = permissionStatsMap.get(permission)!;
        stats.count++;
        stats.violations.push(violation);
      }
    }

    const permissionStats = Array.from(permissionStatsMap.values())
      .sort((a, b) => b.count - a.count);

    return {
      generatedAt: new Date().toISOString(),
      version: '1.0',
      summary: {
        totalFiles: results.length,
        totalViolations: totalErrors + totalWarnings,
        errorCount: totalErrors,
        warningCount: totalWarnings,
        passedFiles,
        failedFiles,
      },
      fileSummaries,
      permissionStats,
      passed: totalErrors === 0,
    };
  }

  /**
   * 生成文本格式报告
   *
   * @param reportData - 结构化报告数据
   * @param options - 报告选项
   * @returns 文本格式报告
   */
  static generateTextReport(
    reportData: ViolationReportData,
    options: TextReportOptions = {}
  ): string {
    const {
      showFilePath = true,
      showLineNumbers = true,
      showPermissions = true,
      showSummary = true,
      groupBySeverity = false,
      groupByFile = true,
    } = options;

    const lines: string[] = [];

    // 标题
    lines.push('='.repeat(60));
    lines.push('静态检查违规报告');
    lines.push('='.repeat(60));
    lines.push('');

    // 汇总信息
    if (showSummary) {
      lines.push('【汇总统计】');
      lines.push(`  总文件数: ${reportData.summary.totalFiles}`);
      lines.push(`  通过文件: ${reportData.summary.passedFiles}`);
      lines.push(`  失败文件: ${reportData.summary.failedFiles}`);
      lines.push(`  错误数: ${reportData.summary.errorCount}`);
      lines.push(`  警告数: ${reportData.summary.warningCount}`);
      lines.push(`  检查结果: ${reportData.passed ? '✅ 通过' : '❌ 未通过'}`);
      lines.push('');
    }

    // 按文件分组显示
    if (groupByFile) {
      for (const fileSummary of reportData.fileSummaries) {
        if (fileSummary.violations.length === 0) continue;

        const status = fileSummary.errorCount > 0 ? '❌' : '⚠️';
        lines.push(`${status} 文件: ${fileSummary.filePath}`);
        lines.push(`   错误: ${fileSummary.errorCount}, 警告: ${fileSummary.warningCount}`);
        lines.push('');

        for (const violation of fileSummary.violations) {
          const severityIcon = violation.severity === 'error' ? '🔴' : '🟡';
          lines.push(`   ${severityIcon} [${violation.severity.toUpperCase()}]`);

          if (showLineNumbers) {
            lines.push(`      位置: 行 ${violation.line}, 列 ${violation.column}`);
          }

          if (showFilePath) {
            lines.push(`      文件: ${violation.filePath}`);
          }

          lines.push(`      API: ${violation.apiName}`);
          lines.push(`      描述: ${violation.errorMessage}`);

          if (showPermissions && violation.requiredPermission) {
            lines.push(`      需要权限: ${violation.requiredPermission}`);
          }

          lines.push('');
        }
      }
    }

    // 按严重级别分组显示
    if (groupBySeverity && !groupByFile) {
      const errors = reportData.fileSummaries.flatMap(f => 
        f.violations.filter(v => v.severity === 'error')
      );
      const warnings = reportData.fileSummaries.flatMap(f => 
        f.violations.filter(v => v.severity === 'warning')
      );

      if (errors.length > 0) {
        lines.push('🔴 错误级别违规:');
        for (const v of errors) {
          lines.push(`   ${v.filePath}:${v.line} - ${v.apiName}: ${v.errorMessage}`);
        }
        lines.push('');
      }

      if (warnings.length > 0) {
        lines.push('🟡 警告级别违规:');
        for (const v of warnings) {
          lines.push(`   ${v.filePath}:${v.line} - ${v.apiName}: ${v.errorMessage}`);
        }
        lines.push('');
      }
    }

    // 按权限分类统计
    if (reportData.permissionStats.length > 0 && showPermissions) {
      lines.push('【按权限分类】');
      for (const stat of reportData.permissionStats) {
        lines.push(`  ${stat.permission}: ${stat.count} 条违规`);
      }
      lines.push('');
    }

    // 底部信息
    lines.push('-'.repeat(60));
    lines.push(`生成时间: ${reportData.generatedAt}`);
    lines.push(`报告版本: ${reportData.version}`);
    lines.push('-'.repeat(60));

    return lines.join('\n');
  }

  /**
   * 生成 JSON 格式报告
   *
   * @param reportData - 结构化报告数据
   * @param options - JSON 报告选项
   * @returns JSON 字符串
   */
  static generateJsonReport(
    reportData: ViolationReportData,
    options: JsonReportOptions = {}
  ): string {
    const {
      includeLocation = true,
      includeRuleDetails = true,
      pretty = true,
      indent = 2,
    } = options;

    // 过滤和精简数据
    let filteredData: any = {
      generatedAt: reportData.generatedAt,
      version: reportData.version,
      passed: reportData.passed,
      summary: reportData.summary,
    };

    if (includeRuleDetails) {
      filteredData.permissionStats = reportData.permissionStats;
      filteredData.files = reportData.fileSummaries.map(summary => ({
        filePath: summary.filePath,
        errorCount: summary.errorCount,
        warningCount: summary.warningCount,
        violations: summary.violations.map(v => ({
          severity: v.severity,
          apiName: v.apiName,
          errorMessage: v.errorMessage,
          ...(includeLocation && {
            location: {
              filePath: v.filePath,
              line: v.line,
              column: v.column,
            },
          }),
          ...(includeRuleDetails && {
            rule: {
              id: v.ruleId,
              name: v.ruleName,
              description: v.description,
              requiredPermission: v.requiredPermission,
            },
          }),
        })),
      }));
    }

    if (pretty) {
      return JSON.stringify(filteredData, null, indent);
    }

    return JSON.stringify(filteredData);
  }

  /**
   * 生成简洁的摘要报告
   *
   * @param reportData - 结构化报告数据
   * @returns 摘要字符串
   */
  static generateSummary(reportData: ViolationReportData): string {
    const { summary, passed } = reportData;
    const status = passed ? '✅' : '❌';
    
    if (summary.totalViolations === 0) {
      return `${status} 静态检查通过 (${summary.totalFiles} 个文件)`;
    }

    const parts: string[] = [];
    if (summary.errorCount > 0) {
      parts.push(`${summary.errorCount} 个错误`);
    }
    if (summary.warningCount > 0) {
      parts.push(`${summary.warningCount} 个警告`);
    }

    return `${status} 静态检查未通过: ${parts.join(', ')} (${summary.totalFiles} 个文件)`;
  }

  /**
   * 生成 Markdown 格式报告
   *
   * @param reportData - 结构化报告数据
   * @returns Markdown 格式报告
   */
  static generateMarkdownReport(reportData: ViolationReportData): string {
    const lines: string[] = [];

    // 标题
    lines.push('# 静态检查违规报告\n');
    
    // 汇总
    lines.push('## 汇总统计\n');
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 总文件数 | ${reportData.summary.totalFiles} |`);
    lines.push(`| 通过文件 | ${reportData.summary.passedFiles} |`);
    lines.push(`| 失败文件 | ${reportData.summary.failedFiles} |`);
    lines.push(`| 错误数 | ${reportData.summary.errorCount} |`);
    lines.push(`| 警告数 | ${reportData.summary.warningCount} |`);
    lines.push(`| 检查结果 | ${reportData.passed ? '✅ 通过' : '❌ 未通过'} |`);
    lines.push('');

    // 文件详情
    const failedFiles = reportData.fileSummaries.filter(f => f.violations.length > 0);
    if (failedFiles.length > 0) {
      lines.push('## 违规详情\n');
      
      for (const fileSummary of failedFiles) {
        lines.push(`### ${fileSummary.filePath}`);
        lines.push('');
        lines.push(`- 错误: ${fileSummary.errorCount}`);
        lines.push(`- 警告: ${fileSummary.warningCount}`);
        lines.push('');

        for (const violation of fileSummary.violations) {
          const icon = violation.severity === 'error' ? '🔴' : '🟡';
          lines.push(`- ${icon} \`${violation.apiName}\`: ${violation.errorMessage} (行 ${violation.line})`);
        }
        lines.push('');
      }
    }

    // 权限统计
    if (reportData.permissionStats.length > 0) {
      lines.push('## 按权限分类\n');
      lines.push('| 权限 | 违规数 |');
      lines.push('|------|--------|');
      for (const stat of reportData.permissionStats) {
        lines.push(`| ${stat.permission} | ${stat.count} |`);
      }
      lines.push('');
    }

    // 元信息
    lines.push('---\n');
    lines.push(`*生成时间: ${reportData.generatedAt}*`);

    return lines.join('\n');
  }

  /**
   * 获取违规的类型分类
   *
   * @param violation - 违规报告
   * @returns 违规类型
   */
  static categorizeViolation(violation: ViolationReport): ViolationCategory {
    const apiName = violation.apiName.toLowerCase();
    const requiredPermission = violation.requiredPermission?.toLowerCase() || '';

    if (apiName.includes('child_process') || requiredPermission === 'child_process') {
      return 'child_process';
    }
    if (apiName.includes('fs.') || requiredPermission?.includes('filesystem')) {
      return 'filesystem';
    }
    if (apiName.includes('http') || apiName.includes('fetch') || requiredPermission === 'network') {
      return 'network';
    }
    if (apiName.includes('env') || apiName.includes('process.env') || requiredPermission === 'env.read') {
      return 'env';
    }

    return 'other';
  }

  /**
   * 过滤报告中的违规
   *
   * @param reportData - 原始报告数据
   * @param filter - 过滤条件
   * @returns 过滤后的报告数据
   */
  static filterReport(
    reportData: ViolationReportData,
    filter: {
      severity?: ReportSeverity[];
      permission?: string[];
      minErrors?: number;
    }
  ): ViolationReportData {
    const { severity, permission, minErrors } = filter;

    // 先按文件过滤
    let fileSummaries = reportData.fileSummaries;

    // 按严重级别过滤 - 保留符合严重级别的违规
    if (severity && severity.length > 0) {
      fileSummaries = fileSummaries.map(summary => ({
        filePath: summary.filePath,
        errorCount: summary.violations.filter(v => severity.includes(v.severity) && v.severity === 'error').length,
        warningCount: summary.violations.filter(v => severity.includes(v.severity) && v.severity === 'warning').length,
        violations: summary.violations.filter(v => severity.includes(v.severity)),
      }));
    }

    // 按权限过滤 - 保留符合权限要求的违规
    if (permission && permission.length > 0) {
      fileSummaries = fileSummaries.map(summary => ({
        filePath: summary.filePath,
        errorCount: summary.violations.filter(v => 
          v.requiredPermission && permission.includes(v.requiredPermission) && v.severity === 'error'
        ).length,
        warningCount: summary.violations.filter(v => 
          v.requiredPermission && permission.includes(v.requiredPermission) && v.severity === 'warning'
        ).length,
        violations: summary.violations.filter(v => 
          v.requiredPermission && permission.includes(v.requiredPermission)
        ),
      }));
    }

    // 过滤掉没有违规的文件
    fileSummaries = fileSummaries.filter(summary => summary.violations.length > 0);

    // 按最小错误数过滤
    if (minErrors !== undefined) {
      fileSummaries = fileSummaries.filter(summary => 
        summary.errorCount >= minErrors
      );
    }

    // 重新计算汇总 - 从过滤后的违规重新计算错误/警告数量
    const totalErrors = fileSummaries.reduce((sum, f) => 
      sum + f.violations.filter(v => v.severity === 'error').length, 0);
    const totalWarnings = fileSummaries.reduce((sum, f) => 
      sum + f.violations.filter(v => v.severity === 'warning').length, 0);
    
    // 重新计算权限统计
    const permissionStatsMap = new Map<string, PermissionViolationStats>();
    for (const summary of fileSummaries) {
      for (const violation of summary.violations) {
        const perm = violation.requiredPermission || 'other';
        if (!permissionStatsMap.has(perm)) {
          permissionStatsMap.set(perm, { permission: perm, count: 0, violations: [] });
        }
        const stats = permissionStatsMap.get(perm)!;
        stats.count++;
        stats.violations.push(violation);
      }
    }
    const permissionStats = Array.from(permissionStatsMap.values())
      .sort((a, b) => b.count - a.count);

    const passedFiles = reportData.summary.totalFiles - fileSummaries.length;

    return {
      ...reportData,
      summary: {
        ...reportData.summary,
        totalFiles: reportData.summary.totalFiles,
        totalViolations: totalErrors + totalWarnings,
        errorCount: totalErrors,
        warningCount: totalWarnings,
        passedFiles,
        failedFiles: fileSummaries.length,
      },
      fileSummaries,
      permissionStats,
      passed: totalErrors === 0,
    };
  }
}

/**
 * 创建 ViolationReporter 实例（用于需要保存状态的场景）
 */
export function createViolationReporter(): typeof ViolationReporter {
  return ViolationReporter;
}

// 导出类型
export type { ViolationReport } from '../StaticAnalyzer';