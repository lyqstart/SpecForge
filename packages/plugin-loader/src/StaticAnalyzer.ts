/**
 * 静态分析器 - 插件源码静态检查器
 *
 * 职责：
 *   - 整合 AST 解析器和规则匹配器
 *   - 执行完整的静态代码分析
 *   - 生成违规报告
 *   - 支持权限验证
 *
 * 实现策略：
 *   - 使用 AstParser 解析源码
 *   - 使用 RuleMatcher 匹配禁止 API
 *   - 支持按权限过滤违规
 *   - 提供详细的错误报告
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本模块不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import { AstParser, createAstParser, type AstParseResult } from './static-checker/ast-parser';
import { RuleMatcher, createRuleMatcher, type StaticCheckRule, type RuleSet } from './static-checker/rules';

/**
 * 违规报告项
 */
export interface ViolationReport {
  /** 规则 ID */
  ruleId: string;
  /** 规则名称 */
  ruleName: string;
  /** 违规描述 */
  description: string;
  /** 违规严重级别 */
  severity: 'error' | 'warning';
  /** 文件路径 */
  filePath: string;
  /** 行号（1-indexed） */
  line: number;
  /** 列号（0-indexed） */
  column: number;
  /** 违规的 API 名称 */
  apiName: string;
  /** 错误信息（已填充行号） */
  errorMessage: string;
  /** 所需权限（如果声明了该权限则允许） */
  requiredPermission?: string;
}

/**
 * 静态分析结果
 */
export interface StaticAnalysisResult {
  /** 是否分析成功 */
  success: boolean;
  /** 分析的文件路径 */
  filePath: string;
  /** 违规报告列表 */
  violations: ViolationReport[];
  /** 检测到的函数调用数量 */
  functionCallCount: number;
  /** 检测到的导入语句数量 */
  importCount: number;
  /** 检测到的变量引用数量 */
  variableRefCount: number;
  /** 错误信息（如果分析失败） */
  error?: string;
}

/**
 * 静态分析器配置
 */
export interface StaticAnalyzerConfig {
  /** AST 解析器配置 */
  astParserOptions?: any;
  /** 规则集 */
  ruleSet?: RuleSet;
  /** 当前声明的权限列表 */
  permissions?: string[];
  /** 是否启用严格模式（即使有权限也报告） */
  strictMode?: boolean;
}

/**
 * 静态分析器
 */
export class StaticAnalyzer {
  private astParser: AstParser;
  private ruleMatcher: RuleMatcher;
  private permissions: string[];
  private strictMode: boolean;

  constructor(config: StaticAnalyzerConfig = {}) {
    this.astParser = createAstParser(config.astParserOptions);
    this.ruleMatcher = createRuleMatcher(config.ruleSet);
    this.permissions = config.permissions || [];
    this.strictMode = config.strictMode || false;
  }

  /**
   * 分析单个文件
   *
   * @param source - 源码内容
   * @param filePath - 文件路径
   * @returns 分析结果
   */
  analyzeFile(source: string, filePath: string): StaticAnalysisResult {
    // 处理空源码 - 空源码是有效的，返回成功
    if (!source || source.trim() === '') {
      return {
        success: true,
        filePath,
        violations: [],
        functionCallCount: 0,
        importCount: 0,
        variableRefCount: 0,
      };
    }

    // 解析 AST
    const parseResult = this.astParser.parse(source, filePath);
    if (!parseResult.success || !parseResult.ast) {
      return {
        success: false,
        filePath,
        violations: [],
        functionCallCount: 0,
        importCount: 0,
        variableRefCount: 0,
        error: parseResult.error,
      };
    }

    // 收集违规
    const violations: ViolationReport[] = [];

    // 检查函数调用违规
    if (parseResult.functionCalls) {
      for (const call of parseResult.functionCalls) {
        const matchedRules = this.ruleMatcher.matchRules(
          call.name,
          'function_call',
          this.strictMode ? [] : this.permissions
        );
        this.addViolationsFromRules(matchedRules, call.name, filePath, call.line, call.column, violations);
      }
    }

    // 检查导入语句违规
    if (parseResult.imports) {
      for (const imp of parseResult.imports) {
        const matchedRules = this.ruleMatcher.matchRules(
          imp.moduleName,
          'import',
          this.strictMode ? [] : this.permissions
        );
        this.addViolationsFromRules(matchedRules, imp.moduleName, filePath, imp.line, 0, violations);
      }
    }

    // 检查变量引用违规
    if (parseResult.variables) {
      for (const variable of parseResult.variables) {
        const matchedRules = this.ruleMatcher.matchRules(
          variable.name,
          'variable_ref',
          this.strictMode ? [] : this.permissions
        );
        this.addViolationsFromRules(matchedRules, variable.name, filePath, variable.line, variable.column, violations);
      }
    }

    return {
      success: true,
      filePath,
      violations,
      functionCallCount: parseResult.functionCalls?.length || 0,
      importCount: parseResult.imports?.length || 0,
      variableRefCount: parseResult.variables?.length || 0,
    };
  }

  /**
   * 从规则创建违规报告
   *
   * @param rules - 匹配的规则列表
   * @param apiName - API 名称
   * @param filePath - 文件路径
   * @param line - 行号
   * @param column - 列号
   * @param violations - 违规报告列表（会被修改）
   */
  private addViolationsFromRules(
    rules: StaticCheckRule[],
    apiName: string,
    filePath: string,
    line: number,
    column: number,
    violations: ViolationReport[]
  ): void {
    for (const rule of rules) {
      const errorMessage = rule.errorMessage.replace('{line}', line.toString());
      
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        description: rule.description,
        severity: rule.severity,
        filePath,
        line,
        column,
        apiName,
        errorMessage,
        requiredPermission: rule.requiredPermission,
      });
    }
  }

  /**
   * 批量分析多个文件
   *
   * @param files - 文件列表，每个元素为 [文件路径, 源码内容]
   * @returns 分析结果列表
   */
  analyzeFiles(files: Array<[string, string]>): StaticAnalysisResult[] {
    return files.map(([filePath, source]) => this.analyzeFile(source, filePath));
  }

  /**
   * 获取当前配置的权限列表
   */
  getPermissions(): string[] {
    return [...this.permissions];
  }

  /**
   * 更新权限列表
   *
   * @param permissions - 新的权限列表
   */
  setPermissions(permissions: string[]): void {
    this.permissions = [...permissions];
  }

  /**
   * 获取当前规则集
   */
  getRuleSet(): StaticCheckRule[] {
    return this.ruleMatcher.getRules();
  }

  /**
   * 检查是否有任何违规
   *
   * @param result - 分析结果
   * @returns 是否有违规
   */
  static hasViolations(result: StaticAnalysisResult): boolean {
    return result.violations.length > 0;
  }

  /**
   * 获取错误级别的违规
   *
   * @param result - 分析结果
   * @returns 错误级别的违规列表
   */
  static getErrorViolations(result: StaticAnalysisResult): ViolationReport[] {
    return result.violations.filter(v => v.severity === 'error');
  }

  /**
   * 获取警告级别的违规
   *
   * @param result - 分析结果
   * @returns 警告级别的违规列表
   */
  static getWarningViolations(result: StaticAnalysisResult): ViolationReport[] {
    return result.violations.filter(v => v.severity === 'warning');
  }

  /**
   * 生成人类可读的报告
   *
   * @param result - 分析结果
   * @returns 报告字符串
   */
  static generateReport(result: StaticAnalysisResult): string {
    if (!result.success) {
      return `分析失败: ${result.error}\n文件: ${result.filePath}`;
    }

    const lines: string[] = [];
    lines.push(`文件: ${result.filePath}`);
    lines.push(`函数调用: ${result.functionCallCount}`);
    lines.push(`导入语句: ${result.importCount}`);
    lines.push(`变量引用: ${result.variableRefCount}`);
    lines.push(`违规总数: ${result.violations.length}`);

    if (result.violations.length > 0) {
      lines.push('\n违规详情:');
      for (const violation of result.violations) {
        lines.push(`  [${violation.severity.toUpperCase()}] ${violation.ruleName}`);
        lines.push(`    位置: ${violation.filePath}:${violation.line}:${violation.column}`);
        lines.push(`    API: ${violation.apiName}`);
        lines.push(`    描述: ${violation.errorMessage}`);
        if (violation.requiredPermission) {
          lines.push(`    所需权限: ${violation.requiredPermission}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

/**
 * 创建静态分析器实例
 */
export function createStaticAnalyzer(config?: StaticAnalyzerConfig): StaticAnalyzer {
  return new StaticAnalyzer(config);
}